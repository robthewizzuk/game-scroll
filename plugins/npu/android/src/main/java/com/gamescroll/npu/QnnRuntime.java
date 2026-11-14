package com.gamescroll.npu;

import android.content.Context;
import android.net.ConnectivityManager;
import android.os.Build;
import com.getcapacitor.Logger;
import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.SequenceInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.Inflater;
import java.util.zip.InflaterInputStream;
import org.json.JSONObject;

/**
 * Qualcomm's NPU libraries (QNN, Qualcomm's AI Engine runtime): where they are on this phone, and in
 * the APKs we hand out ourselves, getting them.
 *
 * Store (release) builds carry them inside the app, because Google Play doesn't let an app download
 * code. Our own APKs (debug builds) leave them out, which saves about 57 MB. On a phone whose chip is in
 * assets/qnn-runtime.json, the app downloads just the five files that phone needs (about 40 MB). They
 * come from Qualcomm's own release on Maven Central, once, on Wi-Fi, in the background. The app reads
 * only those files out of the release with range requests, unpacks them, and keeps each one only if its
 * SHA-256 is the one pinned in that JSON (scripts/qnn-pin.mjs). Any other file is thrown away and never
 * loaded. Until they're in, the models run on the CPU.
 *
 * All the files sit in one folder: ONNX Runtime loads libQnnHtp.so from there (backend_path) and
 * libQnnSystem.so next to it, QNN finds its other libraries through their own $ORIGIN run path, and the
 * NPU loads its half (the "skel") through ADSP_LIBRARY_PATH.
 */
final class QnnRuntime {

    private static final String HOST = "repo1.maven.org";
    private final Context ctx;
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private JSONObject pin;
    private volatile File dir;           // the folder holding QNN, once known
    private volatile String state = "";  // see state()
    private boolean busy, gaveUp;

    QnnRuntime(Context c) { ctx = c.getApplicationContext(); }

    /** A Snapdragon phone. */
    static boolean snapdragon() {
        String soc = Build.VERSION.SDK_INT >= 31 ? Build.SOC_MANUFACTURER : "";
        return "QTI".equalsIgnoreCase(soc) || "Qualcomm".equalsIgnoreCase(soc) || Build.HARDWARE.toLowerCase(Locale.ROOT).startsWith("qcom");
    }

    /** The folder holding QNN (the app's own libraries, or the finished download), or null: use the CPU. */
    File dir() {
        if (dir != null) return dir;
        if (!snapdragon()) { state = "none"; return null; }
        File own = new File(ctx.getApplicationInfo().nativeLibraryDir);
        if (new File(own, "libQnnHtp.so").exists()) { state = "bundled"; return dir = own; }
        if (!BuildConfig.QNN_DOWNLOAD || arch() == 0) { state = "none"; return null; }
        File d = folder();
        if (d != null && ready(d)) { state = "ready"; return dir = d; }
        if (state.isEmpty() || "none".equals(state)) state = "missing";
        return null;
    }

    /**
     * Where QNN stands, for available(): "bundled" (in the app), "ready" (downloaded), "downloading",
     * "wifi" (waiting for Wi-Fi), "space" (phone too full), "failed" (tries again the next time the app
     * starts and a game asks for a model), "missing" (not fetched yet: no game has asked for one), "none" (no supported Qualcomm NPU: the CPU).
     */
    String state() { dir(); return state; }

    /** The folders the NPU may load its half of QNN from: ours first, then the phone's own. */
    String adspPath() {
        File d = BuildConfig.QNN_DOWNLOAD && arch() != 0 ? folder() : null;
        return (d != null ? d.getAbsolutePath() + ";" : "") + ctx.getApplicationInfo().nativeLibraryDir
            + ";/vendor/lib/rfsa/adsp;/vendor/lib64/rfs/dsp/snap;/vendor/dsp/cdsp;/vendor/dsp;/system/lib/rfsa/adsp;/system/vendor/lib/rfsa/adsp;/dsp";
    }

    /** In our own APKs on a supported phone: fetch QNN in the background (after delayMs) if it isn't here yet. Called only when a game asks for a model (NPUPlugin.loadModel). */
    synchronized void fetchSoon(long delayMs) {
        if (busy || gaveUp || dir() != null || !BuildConfig.QNN_DOWNLOAD || arch() == 0) return;
        busy = true;
        bg.execute(() -> {
            try {
                if (delayMs > 0) Thread.sleep(delayMs);
                fetch();
            } catch (InterruptedException e) {
                return;   // the app is closing
            } catch (Exception e) {
                state = "failed";
                Logger.warn("NPU", "QNN download: " + e.getMessage());
                synchronized (this) { gaveUp = true; }   // tries again after the next start, not on every model
            } finally { synchronized (this) { busy = false; } }
        });
    }

    void close() { bg.shutdownNow(); }

    // ------------------------------------------------------------------ the download

    private JSONObject pin() {
        if (pin == null) {
            try (InputStream i = ctx.getAssets().open("qnn-runtime.json")) {
                pin = new JSONObject(new String(readAll(i), StandardCharsets.UTF_8));
            } catch (Exception e) {
                Logger.warn("NPU", "qnn-runtime.json: " + e.getMessage());
                pin = new JSONObject();
            }
        }
        return pin;
    }

    // The NPU generation of this phone's chip (73 for V73...) if the pin file lists it, else 0
    private int arch() {
        if (Build.VERSION.SDK_INT < 31 || !snapdragon()) return 0;
        Matcher m = Pattern.compile("^SM\\d{4}").matcher(Build.SOC_MODEL.toUpperCase(Locale.ROOT));
        JSONObject socs = pin().optJSONObject("socs");
        return m.find() && socs != null ? socs.optInt(m.group(), 0) : 0;
    }

    private String[] need() {
        int a = arch();
        return new String[] { "libQnnHtp.so", "libQnnSystem.so", "libQnnHtpV" + a + "Stub.so", "libQnnHtpV" + a + "Skel.so", "libQnnHtpPrepare.so" };
    }

    // noBackup: 100 MB of libraries has no place in the phone's cloud backup
    private File folder() {
        String v = pin().optString("qnn", "");
        return v.matches("[0-9.]+") ? new File(ctx.getNoBackupFilesDir(), "qnn/" + v + "-v" + arch()) : null;
    }

    private boolean ready(File d) {
        File done = new File(d, "ready");
        try (InputStream i = new java.io.FileInputStream(done)) {
            return mark().equals(new String(readAll(i), StandardCharsets.UTF_8));
        } catch (Exception e) { return false; }
    }
    private String mark() { return pin().optString("qnn") + " v" + arch() + " " + pin().optString("sha256"); }

    private void fetch() throws Exception {
        if (dir() != null) return;
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null || cm.getActiveNetwork() == null || cm.isActiveNetworkMetered()) { state = "wifi"; return; }   // tries again next start
        URL url = new URL(pin().getString("url"));
        if (!"https".equals(url.getProtocol()) || !HOST.equals(url.getHost())) throw new Exception("not Maven Central: " + url);
        JSONObject files = pin().getJSONObject("files");
        File d = folder();
        if (d == null || (!d.isDirectory() && !d.mkdirs())) throw new Exception("no folder");
        long total = 0;
        for (String n : need()) total += files.getJSONObject(n).getLong("size");
        if (d.getUsableSpace() < total + 200_000_000L) { state = "space"; return; }
        state = "downloading";
        for (String n : need()) {
            JSONObject f = files.getJSONObject(n);
            File out = new File(d, n);
            if (out.length() == f.getLong("size")) continue;   // kept from a try that was cut short (each file is checked before it's kept)
            get(url, n, f, out);
        }
        try (OutputStream o = new FileOutputStream(new File(d, "ready"))) { o.write(mark().getBytes(StandardCharsets.UTF_8)); }
        File[] all = d.getParentFile().listFiles();   // an older QNN from before an app update
        if (all != null) for (File old : all) if (!old.equals(d)) wipe(old);
        dir = d; state = "ready";
        Logger.info("NPU", "QNN " + pin().optString("qnn") + " for V" + arch() + " downloaded");
    }

    // One file out of Qualcomm's release: just its bytes (a range request), unpacked and checked as they come
    private static void get(URL url, String name, JSONObject f, File out) throws Exception {
        long at = f.getLong("at"), packed = f.getLong("packed"), size = f.getLong("size");
        File tmp = new File(out.getPath() + ".part");
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(30000);
        c.setRequestProperty("Range", "bytes=" + at + "-" + (at + packed - 1));
        Inflater inf = new Inflater(true);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try {
            if (c.getResponseCode() != 206) throw new Exception(name + ": Maven Central answered " + c.getResponseCode());
            InputStream raw = new BufferedInputStream(c.getInputStream(), 1 << 16);
            // a raw deflate stream wants one spare byte after it (java.util.zip.Inflater)
            InputStream in = f.optBoolean("deflate", true) ? new InflaterInputStream(new SequenceInputStream(raw, new ByteArrayInputStream(new byte[1])), inf, 1 << 16) : raw;
            try (InputStream i = in; OutputStream o = new FileOutputStream(tmp)) {
                byte[] b = new byte[1 << 16]; long n = 0; int k;
                while ((k = i.read(b)) > 0) {
                    n += k;
                    if (n > size) throw new Exception(name + " is bigger than the app expects");
                    md.update(b, 0, k); o.write(b, 0, k);
                }
                if (n != size) throw new Exception(name + " came out the wrong size");
            }
            if (!hex(md.digest()).equals(f.getString("sha256"))) throw new Exception(name + " is not the file the app expects");
            if (!tmp.renameTo(out)) throw new Exception("could not keep " + name);
            out.setWritable(false, false);   // loaded code stays read-only
        } finally {
            inf.end(); c.disconnect(); tmp.delete();
        }
    }

    private static void wipe(File f) {
        File[] in = f.listFiles();
        if (in != null) for (File x : in) wipe(x);
        f.delete();
    }
    private static byte[] readAll(InputStream i) throws Exception {
        java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
        byte[] b = new byte[8192]; int n;
        while ((n = i.read(b)) > 0) o.write(b, 0, n);
        return o.toByteArray();
    }
    private static String hex(byte[] d) {
        StringBuilder sb = new StringBuilder();
        for (byte x : d) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
