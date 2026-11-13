package com.gamescroll.apphealth;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

/**
 * How the app last ended, for crash reports (src/exits.js). The web page can only tell that it was
 * not closed tidily; Android itself keeps the reason.
 *
 * get({ since }) -> {
 *   platform: 'android',
 *   robot:  '' or why this looks like a test robot ('test lab': Firebase Test Lab, which also runs
 *           Google Play's pre-launch tests; 'monkey'; 'test harness'),
 *   known:  the phone keeps exit reasons (Android 11 and later),
 *   exits:  [{ at, reason, status, importance, what }] newest first, only this app's main process and
 *           only those after `since` (milliseconds since 1970). reason is ApplicationExitInfo's:
 *           1 exited itself, 2 killed by a signal, 3 low memory, 4 crash, 5 native crash, 6 not
 *           responding, 7 failed to start, 8 permission change, 9 used too much, 10 the user closed
 *           it, 11 user stopped, 12 something it depends on died, 13 other, 14 frozen, 15 package
 *           change, 16 updated. status: the signal or exit code. importance: how visible the app
 *           was (100 on screen ... 400 kept in the background). what: the system's own short note.
 *   web:    { at, crashed } when the web view's own process died after `since`: crashed is false when
 *           the system killed it, which is nearly always for memory. (Nothing here keeps the app
 *           alive after that: it closes as before, and this says why.)
 * }
 */
@CapacitorPlugin(name = "AppHealth")
public class AppHealthPlugin extends Plugin {
    private static final String PREFS = "gs_app_health", WEB_AT = "web_at", WEB_CRASHED = "web_crashed";
    private static final int MAX = 16;

    @Override
    public void load() {
        // The web view draws the games in a process of its own. When that dies the app is closed, and
        // the exit reason only says "killed", so note which it was on the way down. commit(), not
        // apply(): the app has moments left.
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                try {
                    prefs().edit().putLong(WEB_AT, System.currentTimeMillis()).putBoolean(WEB_CRASHED, Build.VERSION.SDK_INT >= 26 && detail != null && detail.didCrash()).commit();
                } catch (Exception ignored) { /* nothing to be done about it now */ }
                return false;   // not handled: what happens next is unchanged
            }
        });
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String robot() {
        try {
            if ("true".equals(Settings.System.getString(getContext().getContentResolver(), "firebase.test.lab"))) return "test lab";
        } catch (Exception ignored) { /* not readable here */ }
        try {
            if (ActivityManager.isUserAMonkey()) return "monkey";
            if (Build.VERSION.SDK_INT >= 29 ? ActivityManager.isRunningInUserTestHarness() : ActivityManager.isRunningInTestHarness()) return "test harness";
        } catch (Exception ignored) { /* not known */ }
        return "";
    }

    @PluginMethod
    public void get(PluginCall call) {
        // A time in milliseconds arrives as a Long, which call.getDouble() and call.getInt() both pass
        // over (they would give the fallback), so it is read as whatever kind of number it is.
        long since = 0;
        try {
            since = (long) call.getData().optDouble("since", 0);
        } catch (Exception ignored) { /* everything the phone still has */ }
        JSObject o = new JSObject();
        o.put("platform", "android");
        o.put("robot", robot());
        JSArray exits = new JSArray();
        boolean known = false;
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
                String me = getContext().getPackageName();
                List<ApplicationExitInfo> list = am.getHistoricalProcessExitReasons(null, 0, MAX);
                for (ApplicationExitInfo e : list) {
                    if (e.getTimestamp() <= since || !me.equals(e.getProcessName())) continue;
                    JSObject x = new JSObject();
                    x.put("at", e.getTimestamp());
                    x.put("reason", e.getReason());
                    x.put("status", e.getStatus());
                    x.put("importance", e.getImportance());
                    x.put("what", e.getDescription() == null ? "" : e.getDescription());
                    exits.put(x);
                }
                known = true;
            } catch (Exception ignored) { /* the phone would not say */ }
        }
        o.put("known", known);
        o.put("exits", exits);
        try {
            SharedPreferences p = prefs();
            long at = p.getLong(WEB_AT, 0);
            if (at > since) {
                JSObject w = new JSObject();
                w.put("at", at);
                w.put("crashed", p.getBoolean(WEB_CRASHED, false));
                o.put("web", w);
            }
        } catch (Exception ignored) { /* no note kept */ }
        call.resolve(o);
    }
}
