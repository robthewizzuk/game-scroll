package com.gamescroll.npu;

import android.Manifest;
import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.util.Base64;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import android.util.Size;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The phone's AI chip for Game Scroll (src/kit/npu.js): face and hand tracking and sound recognition
 * run here, in ONNX Runtime, on Qualcomm's Hexagon NPU through the QNN execution provider where the
 * phone has one, else on the CPU. The front camera and the mic are read here too, so pictures and sound
 * never go through the web view: JavaScript asks for a crop of the newest picture to be run through a
 * model and gets the model's numbers back (base64 little-endian float32s).
 *
 *   available() -> { available, backend ('qnn' | 'cpu'), chip, qnn }   (qnn: where Qualcomm's NPU libraries stand, see QnnRuntime.state())
 *   loadModel({ name, version, url, sha256 }) -> { loaded, backend, reason? }   (downloads once, from our games host only)
 *   cameraStart({ width, height }) -> { started, w, h, reason? }; cameraStop()
 *   frame({ after }) -> { id, w, h }   holds the newest upright picture (id -1 if none yet)
 *   runImage({ model, frame, rect: { cx, cy, w, h, a }, size, lo, hi }) -> { outputs: [base64] }
 *   runTensor({ model, data }) -> { outputs }
 *   micStart({ rate }) -> { started }; micStop(); runMic({ model, samples }) -> { outputs }
 *
 * Pictures are upright and NOT mirrored (as the camera sees), like the web camera's frames.
 */
@CapacitorPlugin(name = "NPU", permissions = {
    @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
    @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic")
})
public class NPUPlugin extends Plugin {

    private static final String[] HOSTS = { "assets.game-scroll.com" };
    private final ExecutorService work = Executors.newSingleThreadExecutor();     // the models, one at a time
    private final ExecutorService camWork = Executors.newSingleThreadExecutor();  // camera pictures
    private OrtEnvironment env;
    private final Map<String, OrtSession> sessions = new HashMap<>();
    private final Map<String, String> backends = new HashMap<>();

    // ------------------------------------------------------------------ models

    // Qualcomm's QNN libraries: Play's on-demand module (store builds), or downloaded (our own APKs), on a supported Snapdragon
    private QnnRuntime qnn;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", true);
        r.put("backend", qnn.dir() != null ? "qnn" : "cpu");
        r.put("chip", Build.VERSION.SDK_INT >= 31 ? Build.SOC_MODEL : Build.HARDWARE);
        r.put("qnn", qnn.state());
        call.resolve(r);
    }

    @PluginMethod
    public void loadModel(PluginCall call) {
        String name = call.getString("name", ""), version = call.getString("version", ""), url = call.getString("url", ""), sha = call.getString("sha256", "");
        if (!name.matches("[a-z0-9-]+") || !version.matches("[a-z0-9.-]+") || !sha.matches("[0-9a-f]{64}")) { call.reject("bad name"); return; }
        qnn.want();   // a game wants the AI chip: get Qualcomm's libraries now if they're missing (the next game, or the next start, gets the NPU); the only place they're fetched
        work.execute(() -> {
            JSObject r = new JSObject();
            try {
                if (!sessions.containsKey(name)) {
                    File f = fetch(name, version, url, sha);
                    open(name, f);
                }
                r.put("loaded", true); r.put("backend", backends.get(name));
            } catch (Exception e) {
                Logger.error("NPU", "load " + name, e);
                r.put("loaded", false); r.put("reason", String.valueOf(e.getMessage()));
            }
            call.resolve(r);
        });
    }

    // The model file: from the app's own files (dev builds) or downloaded once from our games host.
    // Either way it must have the SHA-256 the app was built with (src/kit/npu-files.js), so a changed
    // file on the host is never run.
    private File fetch(String name, String version, String url, String sha) throws Exception {
        File dir = new File(getContext().getFilesDir(), "npu/" + version);
        File f = new File(dir, name + ".onnx");
        if (f.exists() && sha.equals(sha256(f))) return f;
        dir.mkdirs();
        URL u = new URL(url);
        InputStream in;
        HttpURLConnection c = null;
        if ("https".equals(u.getProtocol()) && allowed(u.getHost())) {
            c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(15000); c.setReadTimeout(30000);
            if (c.getResponseCode() != 200) throw new Exception("download " + c.getResponseCode());
            in = c.getInputStream();
        } else if (u.getPath().startsWith("/ml/")) {
            in = getContext().getAssets().open("public" + u.getPath());   // served with the app (no games host)
        } else throw new Exception("not our host: " + u.getHost());
        File tmp = new File(dir, name + ".part");
        try (InputStream i = in; OutputStream o = new FileOutputStream(tmp)) {
            byte[] b = new byte[1 << 16]; int n;
            while ((n = i.read(b)) > 0) o.write(b, 0, n);
        } finally { if (c != null) c.disconnect(); }
        if (!sha.equals(sha256(tmp))) { tmp.delete(); throw new Exception(name + " is not the file the app expects"); }
        if (!tmp.renameTo(f)) throw new Exception("could not keep " + name);
        return f;
    }
    private static String sha256(File f) throws Exception {
        java.security.MessageDigest d = java.security.MessageDigest.getInstance("SHA-256");
        try (InputStream i = new java.io.FileInputStream(f)) { byte[] b = new byte[1 << 16]; int n; while ((n = i.read(b)) > 0) d.update(b, 0, n); }
        StringBuilder sb = new StringBuilder(); for (byte x : d.digest()) sb.append(String.format("%02x", x));
        return sb.toString();
    }
    private static boolean allowed(String host) {
        for (String h : HOSTS) if (h.equalsIgnoreCase(host)) return true;
        return host.endsWith(".r2.dev");
    }

    // The NPU's half of QNN (the "skel" libraries) runs on the Hexagon DSP, which loads it from files on
    // disk: the downloaded QNN folder, our own native library folder (the app keeps its libraries
    // unpacked, see android/app/build.gradle) and the phone's DSP folders. QNN reads this path once, the
    // first time it loads, so it is set when the plugin starts, before any model. QNN is fetched only when
    // a game first asks for a model (loadModel: face, hand or sound tracking), on a supported Snapdragon and
    // on Wi-Fi: our own APKs download it (that game runs on the CPU, the ones after it on the NPU), store
    // builds ask Play for its on-demand module and unpack it (the NPU once it's in). (Our own APKs used to fetch it
    // a little after every start, and store builds carried it: ~40-57 MB whether a game wanted it or not.
    // Rob, 2026-11-14.)
    @Override
    public void load() {
        qnn = new QnnRuntime(getContext());
        if (!QnnRuntime.snapdragon()) return;
        try {
            android.system.Os.setenv("ADSP_LIBRARY_PATH", qnn.adspPath(), true);
        } catch (Exception e) { Logger.warn("NPU", "ADSP_LIBRARY_PATH: " + e.getMessage()); }
        qnn.unpackSoon();   // store builds: a Play module put in during the last run, not unpacked yet
    }

    // On Snapdragon: the HTP (NPU) backend, float16 maths and burst speed. The first start compiles the
    // model for this phone's NPU and keeps the result (an "EP context" model) next to it, so later starts
    // load that instead and skip compiling. If any of it fails (or another chip): the CPU.
    private void open(String name, File f) throws Exception {
        if (env == null) env = OrtEnvironment.getEnvironment();
        File lib = qnn.dir();
        if (lib != null) {
            File ctx = new File(f.getParentFile(), name + ".qnn-" + installed() + ".onnx");   // compiled again after each app update
            for (int attempt = 0; attempt < 2; attempt++) {
                boolean cached = ctx.exists() && ctx.length() > 0;
                try {
                    OrtSession.SessionOptions o = qnnOptions(lib);
                    if (!cached) {   // compile, and write the compiled model (ONNX Runtime refuses to overwrite one)
                        o.addConfigEntry("ep.context_enable", "1");
                        o.addConfigEntry("ep.context_embed_mode", "1");
                        o.addConfigEntry("ep.context_file_path", ctx.getAbsolutePath());
                    }
                    sessions.put(name, env.createSession((cached ? ctx : f).getAbsolutePath(), o));
                    backends.put(name, "qnn");
                    return;
                } catch (Exception e) {
                    Logger.warn("NPU", "QNN did not take " + name + (cached ? " (compiled copy, compiling again)" : "") + ": " + e.getMessage());
                    ctx.delete();          // a stale or half-written compiled copy (a new QNN after an app update)
                    if (!cached) break;
                }
            }
        }
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setIntraOpNumThreads(Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() / 2)));
        try { o.addXnnpack(new HashMap<>()); } catch (Exception ignored) { }
        sessions.put(name, env.createSession(f.getAbsolutePath(), o));
        backends.put(name, "cpu");
    }
    private long installed() {
        try { return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).lastUpdateTime; } catch (Exception e) { return 0; }
    }
    private static OrtSession.SessionOptions qnnOptions(File lib) throws Exception {
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        Map<String, String> q = new HashMap<>();
        q.put("backend_path", new File(lib, "libQnnHtp.so").getAbsolutePath());   // the HTP (NPU) backend; libQnnSystem.so is read from beside it
        q.put("htp_performance_mode", "burst");
        q.put("enable_htp_fp16_precision", "1");
        o.addQnn(q);
        o.addConfigEntry("session.disable_cpu_ep_fallback", "0");   // a step the NPU can't do runs on the CPU
        return o;
    }

    private JSObject run(String model, FloatBuffer data, long[] shape) throws Exception {
        OrtSession s = sessions.get(model);
        if (s == null) throw new Exception("not loaded: " + model);
        try (OnnxTensor t = OnnxTensor.createTensor(env, data, shape); OrtSession.Result res = s.run(java.util.Collections.singletonMap("input", t))) {
            JSArray outs = new JSArray();
            Iterator<Map.Entry<String, ai.onnxruntime.OnnxValue>> it = res.iterator();
            // out0, out1... in order
            Map<String, String> byName = new HashMap<>();
            while (it.hasNext()) {
                Map.Entry<String, ai.onnxruntime.OnnxValue> e = it.next();
                FloatBuffer fb = ((OnnxTensor) e.getValue()).getFloatBuffer();
                ByteBuffer bb = ByteBuffer.allocate(fb.remaining() * 4).order(ByteOrder.LITTLE_ENDIAN);
                bb.asFloatBuffer().put(fb);
                byName.put(e.getKey(), Base64.encodeToString(bb.array(), Base64.NO_WRAP));
            }
            for (int i = 0; byName.containsKey("out" + i); i++) outs.put(byName.get("out" + i));
            JSObject r = new JSObject(); r.put("outputs", outs);
            return r;
        }
    }
    private long[] inputShape(String model) throws Exception {
        OrtSession s = sessions.get(model);
        if (s == null) throw new Exception("not loaded: " + model);
        return ((ai.onnxruntime.TensorInfo) s.getInputInfo().get("input").getInfo()).getShape();
    }

    @PluginMethod
    public void runTensor(PluginCall call) {
        String model = call.getString("model", ""), b64 = call.getString("data", "");
        work.execute(() -> {
            try {
                byte[] b = Base64.decode(b64, Base64.DEFAULT);
                FloatBuffer fb = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer();
                call.resolve(run(model, fb, inputShape(model)));
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    // ------------------------------------------------------------------ camera

    private ProcessCameraProvider provider;
    private final Object frameLock = new Object();
    private int[] latest, held;          // upright ARGB pictures
    private int latestW, latestH, latestId = -1, heldW, heldH, heldId = -1, nextId = 0;
    private volatile boolean camOn = false;

    @PluginMethod
    public void cameraStart(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) { requestPermissionForAlias("camera", call, "cameraPermission"); return; }
        beginCamera(call);
    }
    @PermissionCallback
    private void cameraPermission(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) { JSObject r = new JSObject(); r.put("started", false); r.put("reason", "permission"); call.resolve(r); return; }
        beginCamera(call);
    }

    private void beginCamera(PluginCall call) {
        int w = call.getInt("width", 640), h = call.getInt("height", 480);
        ListenableFuture<ProcessCameraProvider> f = ProcessCameraProvider.getInstance(getContext());
        f.addListener(() -> {
            try {
                provider = f.get();
                ImageAnalysis a = new ImageAnalysis.Builder()
                    .setResolutionSelector(new ResolutionSelector.Builder().setResolutionStrategy(new ResolutionStrategy(new Size(w, h), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)).build())
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                    .build();
                a.setAnalyzer(camWork, this::picture);
                provider.unbindAll();
                provider.bindToLifecycle(getActivity(), CameraSelector.DEFAULT_FRONT_CAMERA, a);
                camOn = true;
                // the first picture tells the upright size
                long until = System.currentTimeMillis() + 3000;
                new Thread(() -> {
                    while (System.currentTimeMillis() < until) {
                        synchronized (frameLock) { if (latest != null) break; }
                        try { Thread.sleep(20); } catch (InterruptedException ignored) { }
                    }
                    JSObject r = new JSObject();
                    synchronized (frameLock) {
                        r.put("started", latest != null); r.put("w", latestW); r.put("h", latestH);
                        if (latest == null) r.put("reason", "no pictures");
                    }
                    call.resolve(r);
                }).start();
            } catch (Exception e) {
                Logger.error("NPU", "camera", e);
                JSObject r = new JSObject(); r.put("started", false); r.put("reason", String.valueOf(e.getMessage())); call.resolve(r);
            }
        }, androidx.core.content.ContextCompat.getMainExecutor(getContext()));
    }

    private void picture(ImageProxy img) {
        try {
            if (!camOn) return;
            Bitmap b = img.toBitmap();
            int rot = img.getImageInfo().getRotationDegrees();
            if (rot != 0) { Matrix m = new Matrix(); m.postRotate(rot); b = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true); }
            int bw = b.getWidth(), bh = b.getHeight();
            int[] px = new int[bw * bh];
            b.getPixels(px, 0, bw, 0, 0, bw, bh);
            synchronized (frameLock) { latest = px; latestW = bw; latestH = bh; latestId = nextId++; }
        } catch (Exception e) {
            Logger.warn("NPU", "picture: " + e.getMessage());
        } finally { img.close(); }
    }

    @PluginMethod
    public void cameraStop(PluginCall call) {
        camOn = false;
        getActivity().runOnUiThread(() -> { if (provider != null) provider.unbindAll(); });
        synchronized (frameLock) { latest = held = null; latestId = heldId = -1; }
        call.resolve();
    }

    @PluginMethod
    public void frame(PluginCall call) {
        int after = call.getInt("after", -1);
        JSObject r = new JSObject();
        synchronized (frameLock) {
            if (latest != null && latestId > after) { held = latest; heldW = latestW; heldH = latestH; heldId = latestId; }
            r.put("id", latestId > after ? heldId : -1); r.put("w", heldW); r.put("h", heldH);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void runImage(PluginCall call) {
        String model = call.getString("model", "");
        JSObject rect = call.getObject("rect", new JSObject());
        int size = call.getInt("size", 128);
        float lo = call.getFloat("lo", 0f), hi = call.getFloat("hi", 1f);
        final int[] px; final int W, H;
        synchronized (frameLock) { px = held; W = heldW; H = heldH; }
        if (px == null) { call.reject("no picture"); return; }
        double cx = rect.optDouble("cx", W / 2.0), cy = rect.optDouble("cy", H / 2.0), rw = rect.optDouble("w", W), rh = rect.optDouble("h", H), a = rect.optDouble("a", 0);
        work.execute(() -> {
            try {
                call.resolve(run(model, crop(px, W, H, cx, cy, rw, rh, a, size, lo, hi), new long[] { 1, size, size, 3 }));
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    // The same crop as src/kit/vision-npu.js cropToTensor: the rect's square, sampled bilinearly, black outside.
    static FloatBuffer crop(int[] px, int W, int H, double cx, double cy, double rw, double rh, double a, int size, float lo, float hi) {
        FloatBuffer out = ByteBuffer.allocateDirect(size * size * 3 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        double c = Math.cos(a), s = Math.sin(a); float k = (hi - lo) / 255f;
        for (int v = 0; v < size; v++) for (int u = 0; u < size; u++) {
            double x0 = ((u + .5) / size - .5) * rw, y0 = ((v + .5) / size - .5) * rh;
            double x = cx + x0 * c - y0 * s - .5, y = cy + x0 * s + y0 * c - .5;
            int ix = (int) Math.floor(x), iy = (int) Math.floor(y); double fx = x - ix, fy = y - iy;
            int p00 = at(px, W, H, ix, iy), p10 = at(px, W, H, ix + 1, iy), p01 = at(px, W, H, ix, iy + 1), p11 = at(px, W, H, ix + 1, iy + 1);
            for (int sh = 16; sh >= 0; sh -= 8) {   // R, G, B
                double val = ((p00 >> sh) & 255) * (1 - fx) * (1 - fy) + ((p10 >> sh) & 255) * fx * (1 - fy) + ((p01 >> sh) & 255) * (1 - fx) * fy + ((p11 >> sh) & 255) * fx * fy;
                out.put((float) (lo + val * k));
            }
        }
        out.rewind();
        return out;
    }
    private static int at(int[] px, int W, int H, int x, int y) { return (x < 0 || y < 0 || x >= W || y >= H) ? 0 : px[y * W + x]; }

    // ------------------------------------------------------------------ mic

    private AudioRecord rec;
    private Thread recThread;
    private final float[] ring = new float[16000 * 2];
    private int ringAt = 0;
    private volatile boolean micOn = false;

    @PluginMethod
    public void micStart(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { requestPermissionForAlias("mic", call, "micPermission"); return; }
        beginMic(call);
    }
    @PermissionCallback
    private void micPermission(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { JSObject r = new JSObject(); r.put("started", false); call.resolve(r); return; }
        beginMic(call);
    }
    @SuppressLint("MissingPermission")
    private void beginMic(PluginCall call) {
        JSObject r = new JSObject();
        if (micOn) { r.put("started", true); call.resolve(r); return; }
        if (recThread != null) { try { recThread.join(500); } catch (InterruptedException ignored) { } }   // the last one letting go
        try {
            int rate = 16000, min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT);
            rec = new AudioRecord(MediaRecorder.AudioSource.UNPROCESSED, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT, Math.max(min, rate));
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) {   // some phones have no unprocessed source
                rec.release();
                rec = new AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT, Math.max(min, rate));
            }
            final AudioRecord ar = rec;
            ar.startRecording(); micOn = true;
            // the reading thread owns the recorder and lets it go when the mic is turned off
            recThread = new Thread(() -> {
                float[] buf = new float[1600];
                while (micOn) {
                    int n = ar.read(buf, 0, buf.length, AudioRecord.READ_BLOCKING);
                    if (n <= 0) continue;
                    synchronized (ring) { for (int i = 0; i < n; i++) { ring[ringAt] = buf[i]; ringAt = (ringAt + 1) % ring.length; } }
                }
                try { ar.stop(); } catch (Exception ignored) { }
                ar.release();
            });
            recThread.start();
            r.put("started", true);
        } catch (Exception e) {
            Logger.error("NPU", "mic", e);
            r.put("started", false);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void micStop(PluginCall call) {
        micOn = false; rec = null;
        call.resolve();
    }

    @PluginMethod
    public void runMic(PluginCall call) {
        String model = call.getString("model", "yamnet");
        int n = Math.min(call.getInt("samples", 15600), ring.length);
        if (!micOn) { call.reject("mic is off"); return; }
        FloatBuffer fb = ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        synchronized (ring) { for (int i = 0; i < n; i++) fb.put(ring[(ringAt - n + i + ring.length) % ring.length]); }
        fb.rewind();
        work.execute(() -> {
            try { call.resolve(run(model, fb, new long[] { n })); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    @Override
    protected void handleOnDestroy() {
        camOn = false; micOn = false;
        for (OrtSession s : sessions.values()) { try { s.close(); } catch (Exception ignored) { } }
        sessions.clear();
        work.shutdown(); camWork.shutdown();
        if (qnn != null) qnn.close();
    }
}
