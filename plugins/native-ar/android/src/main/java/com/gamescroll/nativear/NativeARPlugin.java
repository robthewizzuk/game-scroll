package com.gamescroll.nativear;

import android.Manifest;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.media.Image;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
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
import com.google.ar.core.Anchor;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.AugmentedImage;
import com.google.ar.core.AugmentedImageDatabase;
import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Frame;
import com.google.ar.core.HitResult;
import com.google.ar.core.LightEstimate;
import com.google.ar.core.Plane;
import com.google.ar.core.Point;
import com.google.ar.core.PointCloud;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.Trackable;
import com.google.ar.core.TrackingState;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native AR for the AR · 3D games (src/kit/ar3d.js), using ARCore.
 *
 * The camera picture is drawn by a GLSurfaceView placed BEHIND the (transparent) WebView, and every
 * frame the phone's pose, the projection and the light estimate go to JavaScript as a "frame" event,
 * where three.js draws the game on top. Detected horizontal surfaces go out as a "planes" event a few
 * times a second (with the feature points ARCore is tracking, while the game asks for them with
 * points({ on })), and hitTest() finds where a screen point meets a real surface.
 *
 * JS: start() -> { started, reason? }, stop(), hitTest({ x, y }) (CSS pixels) -> { hits: [{ pose, kind }] }
 * (nearest first), points({ on }), available() -> { supported, installed, status }. Matrices are 16
 * floats, column-major, in metres. A frame's "why" says why tracking is poor (ARCore's
 * TrackingFailureReason: NONE, INSUFFICIENT_LIGHT, EXCESSIVE_MOTION, INSUFFICIENT_FEATURES...).
 *
 * AR phase 2, each part only when the game asks start() for it (the same shape as the iPhone plugin):
 *   start({ depth, walls, light: 'real' }) -> { started, depth, walls, light }: what this phone gave.
 *   depth  a "depth" event about ten times a second: { w, h, d, pose, proj }. d is base64 of w x h
 *          distances from the camera's plane, 16-bit millimetres, low byte first (0: not known), rows
 *          from the top of the view; pose and proj are the camera's for that picture.
 *   walls  vertical surfaces join "planes" with kind "wall" (the pose's y axis stands out of the wall),
 *          and a hit on one has surface "wall".
 *   light  frames carry light.dir (towards the room's main light), and an "env" event every couple
 *          of seconds carries the room as a small cube map: { size, max, px } (px: base64 of six
 *          faces, +x -x +y -y +z -z, three bytes a dot, each the square root of the colour's share of max).
 *   anchor({ id, p, q }) -> { ok }, removeAnchor({ id }): a pose ARCore keeps fixed to the room as it
 *          corrects its map; "planes" events then carry anchors: [{ id, pose, tracked }]. stop() lets
 *          them all go.
 *   images({ images: [{ name, png, width }] }) -> { added, rejected }: pictures to look for; frames
 *          that see one carry images: [{ name, pose, w, tracked }] (the pose's y axis stands out of
 *          the picture). The set stays until images() is called again.
 */
@CapacitorPlugin(name = "NativeAR", permissions = { @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera") })
public class NativeARPlugin extends Plugin implements GLSurfaceView.Renderer {

    private Session session;
    private GLSurfaceView glView;
    private final BackgroundRenderer background = new BackgroundRenderer();
    private volatile boolean running = false;
    private boolean installRequested = false;
    private boolean textureSet = false;
    private int frameNo = 0;
    private long lastStamp = -1;
    private volatile boolean wantPoints = false;
    private static final int MAX_POINTS = 240;
    private static final int MAX_HITS = 4;
    private final List<PluginCall> pendingHits = new ArrayList<>();

    // AR phase 2: what this round was given
    private volatile boolean onDepth = false, onWalls = false, onLight = false;
    private int camNo = 0;                                 // camera frames this round (GL thread)
    private int viewW = 0, viewH = 0;                      // the camera view in pixels (GL thread)
    private float[] depthIn, depthOut;                     // the depth grid: view places, and where each is in the depth picture
    private byte[] depthBytes;
    private int depthW = 0, depthH = 0;
    private float camLum = 0.45f;                          // the camera picture's own brightness and colour (real light)
    private final float[] camTint = { 1f, 1f, 1f };
    private static final int MAX_ANCHORS = 16;
    private final Map<String, Anchor> anchors = new LinkedHashMap<>();   // GL thread only
    private final List<PluginCall> pendingAnchors = new ArrayList<>();
    private volatile boolean dropAnchors = false;
    private volatile AugmentedImageDatabase imageDb = null;
    private volatile boolean reconfigure = false;
    private volatile int imageAsk = 0;

    @PluginMethod
    public void available(PluginCall call) {
        ArCoreApk.Availability a = ArCoreApk.getInstance().checkAvailability(getContext());
        JSObject r = new JSObject();
        r.put("supported", a.isSupported() || a.isTransient());
        r.put("installed", a == ArCoreApk.Availability.SUPPORTED_INSTALLED);
        r.put("status", a.name());
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermission");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void cameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) begin(call);
        else notStarted(call, "camera");
    }

    private void notStarted(PluginCall call, String reason) {
        JSObject r = new JSObject();
        r.put("started", false);
        r.put("reason", reason);
        call.resolve(r);
    }

    private void begin(PluginCall call) {
        final boolean wantDepth = Boolean.TRUE.equals(call.getBoolean("depth", false));
        final boolean wantWalls = Boolean.TRUE.equals(call.getBoolean("walls", false));
        final boolean wantLight = "real".equals(call.getString("light", "ambient"));
        getActivity().runOnUiThread(() -> {
            try {
                if (session == null) {
                    // First use: ARCore (Google Play Services for AR) may need installing from the Play Store.
                    ArCoreApk.InstallStatus st = ArCoreApk.getInstance().requestInstall(getActivity(), !installRequested);
                    if (st == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                        installRequested = true;
                        notStarted(call, "installing");
                        return;
                    }
                    session = new Session(getContext());
                }
                // Set again for every round: each game asks for the parts it wants.
                onDepth = wantDepth && session.isDepthModeSupported(Config.DepthMode.AUTOMATIC);
                onWalls = wantWalls;
                onLight = wantLight;
                try {
                    session.configure(makeConfig());
                } catch (Exception e) {
                    // this phone can't do one of them: the plain session every phone can
                    Logger.error("NativeAR", "configure failed, starting without the extras", e);
                    onDepth = false;
                    onWalls = false;
                    onLight = false;
                    imageDb = null;
                    session.configure(makeConfig());
                }
                if (glView == null) {
                    glView = new GLSurfaceView(getContext());
                    glView.setPreserveEGLContextOnPause(true);
                    glView.setEGLContextClientVersion(2);
                    glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
                    glView.setRenderer(this);
                    glView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
                }
                WebView web = getBridge().getWebView();
                ViewGroup parent = (ViewGroup) web.getParent();
                if (glView.getParent() == null) {
                    // behind the WebView, exactly its size and place (the page is made see-through while
                    // an AR game plays, and the game lines its 3D up with the WebView's area)
                    parent.addView(glView, parent.indexOfChild(web), new ViewGroup.LayoutParams(Math.max(1, web.getWidth()), Math.max(1, web.getHeight())));
                    matchWebView(web);
                    if (!layoutHooked) {
                        layoutHooked = true;
                        web.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> { if (glView != null && glView.getParent() != null) matchWebView(web); });
                    }
                }
                web.setBackgroundColor(Color.TRANSPARENT);
                reconfigure = false;
                dropAnchors = true;   // (none are held yet: the first frame clears whatever a round left behind)
                session.resume();
                glView.onResume();
                running = true;
                frameNo = 0;
                lastStamp = -1;
                wantPoints = false;
                JSObject r = new JSObject();
                r.put("started", true);
                r.put("depth", onDepth);
                r.put("walls", onWalls);
                r.put("light", onLight ? "real" : "ambient");
                call.resolve(r);
            } catch (Exception e) {
                Logger.error("NativeAR", "start failed", e);
                teardown();
                notStarted(call, e.getClass().getSimpleName());
            }
        });
    }

    /** The session's settings for this round: the usual ones, and the AR phase 2 parts that are on. */
    private Config makeConfig() {
        Config cfg = new Config(session);
        cfg.setPlaneFindingMode(onWalls ? Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL : Config.PlaneFindingMode.HORIZONTAL);
        cfg.setLightEstimationMode(onLight ? Config.LightEstimationMode.ENVIRONMENTAL_HDR : Config.LightEstimationMode.AMBIENT_INTENSITY);
        cfg.setDepthMode(onDepth ? Config.DepthMode.AUTOMATIC : Config.DepthMode.DISABLED);
        cfg.setFocusMode(Config.FocusMode.AUTO);
        cfg.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
        AugmentedImageDatabase db = imageDb;
        if (db != null && db.getNumImages() > 0) cfg.setAugmentedImageDatabase(db);
        return cfg;
    }

    private boolean layoutHooked = false;

    private void matchWebView(WebView web) {
        ViewGroup.LayoutParams lp = glView.getLayoutParams();
        if (lp.width != web.getWidth() || lp.height != web.getHeight()) {
            lp.width = Math.max(1, web.getWidth());
            lp.height = Math.max(1, web.getHeight());
            glView.setLayoutParams(lp);
        }
        glView.setX(web.getX());
        glView.setY(web.getY());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            teardown();
            call.resolve();
        });
    }

    private static final int APP_BACKGROUND = Color.parseColor("#0c0e12");

    private void teardown() {
        running = false;
        wantPoints = false;
        dropAnchors = true;   // the round's anchors are let go on the next frame there is
        if (session != null) session.pause();
        if (glView != null) {
            glView.onPause();
            if (glView.getParent() != null) ((ViewGroup) glView.getParent()).removeView(glView);
        }
        // start() made the page see-through so the camera shows behind it: make it solid again
        // (the app's background colour, capacitor.config.json backgroundColor).
        WebView web = getBridge().getWebView();
        if (web != null) web.setBackgroundColor(APP_BACKGROUND);
        textureSet = false;
        synchronized (pendingHits) {
            for (PluginCall c : pendingHits) c.resolve(noHits());
            pendingHits.clear();
        }
        synchronized (pendingAnchors) {
            for (PluginCall c : pendingAnchors) c.resolve(ok(false));
            pendingAnchors.clear();
        }
    }

    /**
     * Send the feature points ARCore is tracking with each "planes" event ({ on: true }), or stop.
     * The game's floor search uses them, and turns them off once the floor is settled.
     */
    @PluginMethod
    public void points(PluginCall call) {
        wantPoints = Boolean.TRUE.equals(call.getBoolean("on", false));
        call.resolve();
    }

    /** Where a point on the screen (CSS pixels) meets a real surface. Answered on the next frame. */
    @PluginMethod
    public void hitTest(PluginCall call) {
        if (!running) {
            call.resolve(noHits());
            return;
        }
        synchronized (pendingHits) {
            pendingHits.add(call);
        }
    }

    private static JSObject noHits() {
        JSObject r = new JSObject();
        r.put("hits", new JSArray());
        return r;
    }

    private static JSObject ok(boolean ok) {
        JSObject r = new JSObject();
        r.put("ok", ok);
        return r;
    }

    /**
     * Hold a pose ({ id, p: [x, y, z], q: [x, y, z, w] }, in the session's own space) fixed to the room.
     * Answered on the next frame with { ok }: false while tracking is poor, or with sixteen held already.
     */
    @PluginMethod
    public void anchor(PluginCall call) {
        if (!running) {
            call.resolve(ok(false));
            return;
        }
        synchronized (pendingAnchors) {
            pendingAnchors.add(call);
        }
    }

    /** Let one anchor go ({ id }). */
    @PluginMethod
    public void removeAnchor(PluginCall call) {
        if (!running) {
            call.resolve(ok(true));   // (stop() has let them all go)
            return;
        }
        synchronized (pendingAnchors) {
            pendingAnchors.add(call);
        }
    }

    /**
     * The pictures to look for in the room: { images: [{ name, png (base64), width (metres; 0: not known) }] }.
     * Each call replaces the set. Resolves { added, rejected }: ARCore turns down a picture with too
     * little detail to find. Working a picture out takes a moment, so it is done off the main thread.
     */
    @PluginMethod
    public void images(PluginCall call) {
        final Session s = session;
        final JSArray list = call.getArray("images");
        if (s == null) {
            call.reject("not started");
            return;
        }
        final int mine = ++imageAsk;
        new Thread(() -> {
            JSArray added = new JSArray(), rejected = new JSArray();
            AugmentedImageDatabase db;
            try {
                db = new AugmentedImageDatabase(s);
            } catch (Exception e) {
                call.reject("no pictures on this phone");
                return;
            }
            for (int i = 0; list != null && i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o == null) continue;
                String name = o.optString("name", "");
                try {
                    byte[] png = Base64.decode(o.optString("png", ""), Base64.DEFAULT);
                    Bitmap bmp = BitmapFactory.decodeByteArray(png, 0, png.length);
                    if (bmp == null || name.isEmpty()) throw new IllegalArgumentException("not a picture");
                    if (bmp.getConfig() != Bitmap.Config.ARGB_8888) bmp = bmp.copy(Bitmap.Config.ARGB_8888, false);
                    double width = o.optDouble("width", 0);
                    if (width > 0) db.addImage(name, bmp, (float) width);
                    else db.addImage(name, bmp);
                    added.put(name);
                } catch (Exception e) {
                    rejected.put(name);   // (ImageInsufficientQualityException: nothing in it for the phone to find)
                }
            }
            if (mine == imageAsk) {   // (a newer set hasn't been asked for meanwhile)
                imageDb = db.getNumImages() > 0 ? db : null;
                reconfigure = true;   // taken up by the next frame, or by the next start()
            }
            JSObject r = new JSObject();
            r.put("added", added);
            r.put("rejected", rejected);
            call.resolve(r);
        }, "NativeAR-images").start();
    }

    @Override
    protected void handleOnPause() {
        if (running && session != null) {
            session.pause();
            if (glView != null) glView.onPause();
        }
    }

    @Override
    protected void handleOnResume() {
        if (running && session != null) {
            try {
                session.resume();
                if (glView != null) glView.onResume();
            } catch (Exception e) {
                Logger.error("NativeAR", "resume failed", e);
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (session != null) session.close();
        session = null;
    }

    /* ---------- GL thread ---------- */

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        background.create();
        textureSet = false;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onSurfaceChanged(GL10 gl, int width, int height) {
        GLES20.glViewport(0, 0, width, height);
        viewW = width;
        viewH = height;
        WindowManager wm = getActivity().getWindowManager();
        int rotation = wm.getDefaultDisplay().getRotation();
        if (session != null) session.setDisplayGeometry(rotation, width, height);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (!running || session == null) return;
        try {
            if (!textureSet) {
                session.setCameraTextureName(background.textureId());
                textureSet = true;
            }
            if (reconfigure) {   // a new set of pictures to look for
                reconfigure = false;
                try {
                    session.configure(makeConfig());
                } catch (Exception e) {
                    Logger.error("NativeAR", "pictures not taken up", e);
                }
            }
            Frame frame = session.update();
            background.draw(frame);
            Camera cam = frame.getCamera();
            boolean tracking = cam.getTrackingState() == TrackingState.TRACKING;
            if (dropAnchors) {
                dropAnchors = false;
                camNo = 0;
                for (Anchor a : anchors.values()) a.detach();
                anchors.clear();
            }

            // The screen can refresh faster than the camera (120 Hz against 30 or 60), and then update()
            // hands back the same camera frame again: the pose hasn't changed, so don't send it twice.
            long stamp = frame.getTimestamp();
            if (stamp != lastStamp) {
                lastStamp = stamp;
                camNo++;
                JSObject d = new JSObject();
                float[] pose = new float[16];
                float[] proj = new float[16];
                cam.getDisplayOrientedPose().toMatrix(pose, 0);
                cam.getProjectionMatrix(proj, 0, 0.05f, 100f);
                d.put("t", stamp / 1e6);
                d.put("tracking", cam.getTrackingState().name());
                d.put("why", cam.getTrackingFailureReason().name());
                d.put("pose", JSArray.from(pose));
                d.put("proj", JSArray.from(proj));
                LightEstimate le = frame.getLightEstimate();
                if (onLight) {
                    // With the room's real light on, ARCore's own brightness reading is not given: the
                    // camera picture's average stands in for it, and ARCore says where the main light is.
                    if (camNo % 6 == 1) cameraLight(frame);
                    JSObject light = new JSObject();
                    light.put("intensity", camLum);
                    light.put("color", JSArray.from(new float[] { camTint[0], camTint[1], camTint[2] }));
                    if (le.getState() == LightEstimate.State.VALID) {
                        float[] dir = le.getEnvironmentalHdrMainLightDirection();
                        if (dir != null && dir.length >= 3) light.put("dir", JSArray.from(new float[] { dir[0], dir[1], dir[2] }));
                    }
                    d.put("light", light);
                } else if (le.getState() == LightEstimate.State.VALID) {
                    float[] cc = new float[4];
                    le.getColorCorrection(cc, 0);
                    JSObject light = new JSObject();
                    light.put("intensity", le.getPixelIntensity());
                    light.put("color", JSArray.from(new float[] { cc[0], cc[1], cc[2] }));
                    d.put("light", light);
                }
                if (tracking && imageDb != null) {
                    JSArray seen = seenImages();
                    if (seen.length() > 0) d.put("images", seen);
                }
                getActivity().runOnUiThread(() -> notifyListeners("frame", d));

                if (onDepth && tracking && camNo % 3 == 0) sendDepth(frame, pose, proj);
                if (onLight && camNo % 60 == 10 && le.getState() == LightEstimate.State.VALID) sendEnv(le);
            }

            if (frameNo++ % 15 == 0) sendPlanes(frame);
            answerHits(frame);
            answerAnchors(cam);
        } catch (Exception e) {
            Logger.error("NativeAR", "frame failed", e);
        }
    }

    private void sendPlanes(Frame frame) {
        JSArray list = new JSArray();
        for (Plane p : session.getAllTrackables(Plane.class)) {
            if (p.getTrackingState() != TrackingState.TRACKING || p.getSubsumedBy() != null) continue;
            boolean wall = p.getType() == Plane.Type.VERTICAL;
            if (wall ? !onWalls : p.getType() != Plane.Type.HORIZONTAL_UPWARD_FACING) continue;
            float[] m = new float[16];
            p.getCenterPose().toMatrix(m, 0);
            JSObject o = new JSObject();
            o.put("id", String.valueOf(p.hashCode()));
            o.put("pose", JSArray.from(m));
            o.put("w", p.getExtentX());
            o.put("d", p.getExtentZ());
            if (wall) o.put("kind", "wall");
            list.put(o);
        }
        JSObject d = new JSObject();
        d.put("planes", list);
        if (wantPoints && frame.getCamera().getTrackingState() == TrackingState.TRACKING) {
            JSArray pts = featurePoints(frame);
            if (pts != null) d.put("points", pts);
        }
        if (!anchors.isEmpty()) {
            // where ARCore holds each anchor now (they move a little whenever it corrects its map)
            JSArray held = new JSArray();
            for (Map.Entry<String, Anchor> e : anchors.entrySet()) {
                Anchor a = e.getValue();
                if (a.getTrackingState() == TrackingState.STOPPED) continue;
                float[] m = new float[16];
                a.getPose().toMatrix(m, 0);
                JSObject o = new JSObject();
                o.put("id", e.getKey());
                o.put("pose", JSArray.from(m));
                o.put("tracked", a.getTrackingState() == TrackingState.TRACKING);
                held.put(o);
            }
            d.put("anchors", held);
        }
        getActivity().runOnUiThread(() -> notifyListeners("planes", d));
    }

    /** Up to MAX_POINTS of the feature points ARCore is tracking, as x, y, z, x, y, z... in millimetres. */
    private JSArray featurePoints(Frame frame) {
        PointCloud cloud = frame.acquirePointCloud();
        try {
            FloatBuffer b = cloud.getPoints();
            int at = b.position(), n = b.remaining() / 4, step = Math.max(1, (n + MAX_POINTS - 1) / MAX_POINTS), m = 0;
            int[] out = new int[(n / step + 1) * 3];
            for (int i = 0; i < n; i += step) {
                int k = at + i * 4;
                float x = b.get(k), y = b.get(k + 1), z = b.get(k + 2), sure = b.get(k + 3);
                if (sure < 0.2f || Float.isNaN(x) || Float.isNaN(y) || Float.isNaN(z)) continue; // too unsure to count
                out[m++] = Math.round(x * 1000f);
                out[m++] = Math.round(y * 1000f);
                out[m++] = Math.round(z * 1000f);
            }
            return JSArray.from(Arrays.copyOf(out, m));
        } finally {
            cloud.release();
        }
    }

    private void answerHits(Frame frame) {
        List<PluginCall> calls;
        synchronized (pendingHits) {
            if (pendingHits.isEmpty()) return;
            calls = new ArrayList<>(pendingHits);
            pendingHits.clear();
        }
        float density = getContext().getResources().getDisplayMetrics().density;
        for (PluginCall call : calls) {
            float x = call.getFloat("x", 0f) * density, y = call.getFloat("y", 0f) * density;
            JSArray hits = new JSArray();
            for (HitResult h : frame.hitTest(x, y)) {
                Trackable t = h.getTrackable();
                boolean plane = false, wall = false;
                if (t instanceof Plane && ((Plane) t).isPoseInPolygon(h.getHitPose())) {
                    Plane.Type type = ((Plane) t).getType();
                    wall = onWalls && type == Plane.Type.VERTICAL;
                    plane = wall || type == Plane.Type.HORIZONTAL_UPWARD_FACING;
                }
                // (with depth on ARCore also offers DepthPoints: they are left out, so the floor search is as before)
                boolean point = t instanceof Point;
                if (!plane && !point) continue;
                float[] m = new float[16];
                h.getHitPose().toMatrix(m, 0);
                JSObject o = new JSObject();
                o.put("pose", JSArray.from(m));
                o.put("kind", plane ? "plane" : "point");
                if (wall) o.put("surface", "wall");
                hits.put(o);
                // nearest first; a few, so the floor search can look past a table top or a stray point
                if (hits.length() >= MAX_HITS) break;
            }
            JSObject r = new JSObject();
            r.put("hits", hits);
            call.resolve(r);
        }
    }

    /* ---------- AR phase 2 (GL thread) ---------- */

    private void answerAnchors(Camera cam) {
        List<PluginCall> calls;
        synchronized (pendingAnchors) {
            if (pendingAnchors.isEmpty()) return;
            calls = new ArrayList<>(pendingAnchors);
            pendingAnchors.clear();
        }
        for (PluginCall call : calls) {
            boolean done = false;
            try {
                String id = call.getString("id", "");
                if ("removeAnchor".equals(call.getMethodName())) {
                    Anchor a = anchors.remove(id);
                    if (a != null) a.detach();
                    done = true;
                } else if (id != null && !id.isEmpty() && cam.getTrackingState() == TrackingState.TRACKING && (anchors.size() < MAX_ANCHORS || anchors.containsKey(id))) {
                    float[] p = floats(call.getArray("p"), 3), q = floats(call.getArray("q"), 4);
                    if (p != null && q != null) {
                        Anchor old = anchors.remove(id);
                        if (old != null) old.detach();
                        anchors.put(id, session.createAnchor(new Pose(p, q)));
                        done = true;
                    }
                }
            } catch (Exception e) {
                Logger.error("NativeAR", "anchor failed", e);
            }
            call.resolve(ok(done));
        }
    }

    private static float[] floats(JSONArray a, int n) {
        if (a == null || a.length() < n) return null;
        float[] out = new float[n];
        for (int i = 0; i < n; i++) {
            double v = a.optDouble(i, Double.NaN);
            if (Double.isNaN(v) || Double.isInfinite(v)) return null;
            out[i] = (float) v;
        }
        return out;
    }

    /** The registered pictures ARCore can place now: in sight (tracked), or where each was last seen. */
    private JSArray seenImages() {
        JSArray out = new JSArray();
        for (AugmentedImage im : session.getAllTrackables(AugmentedImage.class)) {
            if (im.getTrackingState() != TrackingState.TRACKING) continue;
            float[] m = new float[16];
            im.getCenterPose().toMatrix(m, 0);
            JSObject o = new JSObject();
            o.put("name", im.getName());
            o.put("pose", JSArray.from(m));
            o.put("w", im.getExtentX());
            o.put("tracked", im.getTrackingMethod() == AugmentedImage.TrackingMethod.FULL_TRACKING);
            out.put(o);
        }
        return out;
    }

    /**
     * ARCore's depth picture, sampled on a grid over the view (40 spots across its short side, up to
     * 96 along the other) and sent as 16-bit millimetres. The picture lies the way the camera sensor
     * does, so each view spot is looked up where ARCore says the camera picture shows it.
     */
    private void sendDepth(Frame frame, float[] pose, float[] proj) {
        if (viewW < 2 || viewH < 2) return;
        Image img = null;
        try {
            img = frame.acquireDepthImage16Bits();
            int gw = viewW <= viewH ? 40 : Math.min(96, Math.round(40f * viewW / viewH));
            int gh = viewW <= viewH ? Math.min(96, Math.round(40f * viewH / viewW)) : 40;
            int n = gw * gh;
            if (depthIn == null || depthW != gw || depthH != gh) {
                depthW = gw;
                depthH = gh;
                depthIn = new float[n * 2];
                depthOut = new float[n * 2];
                depthBytes = new byte[n * 2];
                for (int j = 0, k = 0; j < gh; j++) {
                    for (int i = 0; i < gw; i++) {
                        depthIn[k++] = i / (float) (gw - 1);
                        depthIn[k++] = j / (float) (gh - 1);
                    }
                }
            }
            frame.transformCoordinates2d(Coordinates2d.VIEW_NORMALIZED, depthIn, Coordinates2d.TEXTURE_NORMALIZED, depthOut);
            Image.Plane pl = img.getPlanes()[0];
            ByteBuffer b = pl.getBuffer().order(ByteOrder.nativeOrder());
            int iw = img.getWidth(), ih = img.getHeight();
            int row = pl.getRowStride() > 0 ? pl.getRowStride() : iw * 2, px = pl.getPixelStride() > 0 ? pl.getPixelStride() : 2, last = b.limit() - 2;
            for (int k = 0; k < n; k++) {
                int x = Math.min(iw - 1, Math.max(0, (int) (depthOut[k * 2] * iw))), y = Math.min(ih - 1, Math.max(0, (int) (depthOut[k * 2 + 1] * ih)));
                int at = y * row + x * px, mm = at <= last ? b.getShort(at) & 0xffff : 0;
                depthBytes[k * 2] = (byte) mm;
                depthBytes[k * 2 + 1] = (byte) (mm >> 8);
            }
            JSObject d = new JSObject();
            d.put("w", gw);
            d.put("h", gh);
            d.put("d", Base64.encodeToString(depthBytes, Base64.NO_WRAP));
            d.put("pose", JSArray.from(pose));
            d.put("proj", JSArray.from(proj));
            getActivity().runOnUiThread(() -> notifyListeners("depth", d));
        } catch (Exception e) {
            // NotYetAvailableException: ARCore has no depth picture yet (it needs the phone to move a little first)
        } finally {
            if (img != null) img.close();
        }
    }

    /**
     * The room's light as ARCore pictures it: a small cube map of real (not capped at white) colours,
     * packed three bytes a dot. Each byte is the square root of the colour's share of `max`.
     */
    private void sendEnv(LightEstimate le) {
        Image[] cube = null;
        try {
            cube = le.acquireEnvironmentalHdrCubeMap();
            if (cube == null || cube.length < 6) return;
            int size = cube[0].getWidth(), n = size * size;
            float[] rgb = new float[6 * n * 3];
            double sum = 0;
            float top = 0;
            for (int f = 0; f < 6; f++) {
                // one face: red, green, blue and a spare, each a 16-bit float, rows from the top
                Image.Plane pl = cube[f].getPlanes()[0];
                ByteBuffer b = pl.getBuffer().order(ByteOrder.nativeOrder());
                int row = pl.getRowStride() > 0 ? pl.getRowStride() : size * 8, px = pl.getPixelStride() > 0 ? pl.getPixelStride() : 8, last = b.limit() - 6;
                for (int y = 0; y < size; y++) {
                    for (int x = 0; x < size; x++) {
                        int at = y * row + x * px, o = ((f * size + y) * size + x) * 3;
                        if (at > last) continue;
                        for (int c = 0; c < 3; c++) {
                            float v = half(b.getShort(at + c * 2) & 0xffff);
                            if (!(v > 0)) v = 0;   // (also for "not a number")
                            else if (v > 1e6f) v = 1e6f;
                            rgb[o + c] = v;
                            sum += v;
                            if (v > top) top = v;
                        }
                    }
                }
            }
            float max = (float) Math.max(1e-6, Math.min(top, 32 * sum / rgb.length));
            byte[] out = new byte[rgb.length];
            for (int i = 0; i < rgb.length; i++) out[i] = (byte) Math.round(255 * Math.sqrt(Math.min(1f, rgb[i] / max)));
            JSObject d = new JSObject();
            d.put("size", size);
            d.put("max", max);
            d.put("px", Base64.encodeToString(out, Base64.NO_WRAP));
            getActivity().runOnUiThread(() -> notifyListeners("env", d));
        } catch (Exception e) {
            Logger.error("NativeAR", "room light failed", e);
        } finally {
            if (cube != null) for (Image i : cube) if (i != null) i.close();
        }
    }

    private static final float[] HALF_POW = new float[32];

    static {
        for (int e = 0; e < 32; e++) HALF_POW[e] = (float) Math.pow(2, e - 15);
    }

    /** A 16-bit float's value (android.util.Half needs a newer Android than the oldest this app runs on). */
    private static float half(int h) {
        int e = (h >> 10) & 31, m = h & 0x3ff;
        float v = e == 0 ? m * (1f / 16777216f) : e == 31 ? (m == 0 ? Float.POSITIVE_INFINITY : Float.NaN) : (1f + m / 1024f) * HALF_POW[e];
        return (h & 0x8000) != 0 ? -v : v;
    }

    /**
     * The camera picture's average brightness (0 to 1, as shown) and colour (red and blue against
     * green, pulled half-way to white), read from a few hundred spots of the picture.
     */
    private void cameraLight(Frame frame) {
        Image img = null;
        try {
            img = frame.acquireCameraImage();
            Image.Plane[] pl = img.getPlanes();
            if (pl.length < 3) return;
            int w = img.getWidth(), h = img.getHeight();
            ByteBuffer yb = pl[0].getBuffer(), ub = pl[1].getBuffer(), vb = pl[2].getBuffer();
            int ys = pl[0].getRowStride(), yp = pl[0].getPixelStride(), us = pl[1].getRowStride(), up = pl[1].getPixelStride(), vs = pl[2].getRowStride(), vp = pl[2].getPixelStride();
            long sy = 0, su = 0, sv = 0;
            int n = 0;
            for (int y = 8; y < h; y += 16) {
                for (int x = 8; x < w; x += 16) {
                    int ya = y * ys + x * yp, ua = (y >> 1) * us + (x >> 1) * up, va = (y >> 1) * vs + (x >> 1) * vp;
                    if (ya >= yb.limit() || ua >= ub.limit() || va >= vb.limit()) continue;
                    sy += yb.get(ya) & 0xff;
                    su += ub.get(ua) & 0xff;
                    sv += vb.get(va) & 0xff;
                    n++;
                }
            }
            if (n == 0) return;
            float Y = sy / (float) n, U = su / (float) n - 128f, V = sv / (float) n - 128f;
            float r = Y + 1.402f * V, g = Y - 0.344f * U - 0.714f * V, b = Y + 1.772f * U;
            camLum = Math.max(0f, Math.min(1f, Y / 255f));
            if (g > 8f) {
                camTint[0] = Math.max(0.6f, Math.min(1.4f, 1f + (r / g - 1f) * 0.5f));
                camTint[2] = Math.max(0.6f, Math.min(1.4f, 1f + (b / g - 1f) * 0.5f));
            }
        } catch (Exception e) {
            // the picture isn't ready: the last reading stands
        } finally {
            if (img != null) img.close();
        }
    }
}
