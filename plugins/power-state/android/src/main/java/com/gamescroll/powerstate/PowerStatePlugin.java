package com.gamescroll.powerstate;

import android.app.ActivityManager;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.res.Configuration;
import android.os.Build;
import android.os.PowerManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * How warm the phone is, whether it's saving power and how much memory it has left, for frame
 * generation's power saving (src/kit/power.js) and the memory guard (src/kit/memory.js):
 * get() -> { platform: 'android', thermal, headroom, saver, mem: { total, avail, threshold, low, trim, trimAt } }.
 *
 * thermal: PowerManager's thermal status (Android 10+): 0 none, 1 light, 2 moderate, 3 severe,
 * 4 critical, 5 emergency, 6 shutdown; 0 on older phones. headroom: how close the phone is to slowing
 * itself down in the next 10 s (Android 11+; 1 = it will), -1 where it isn't known. saver: battery saver is on.
 *
 * mem: ActivityManager's memory info in bytes: total, avail (free for apps), threshold (when avail falls
 * to it the phone starts closing apps), low (it has). trim / trimAt: the last onTrimMemory level and when
 * (ms since 1970; 0 if none yet). Android 14 and later only send the background levels (20 and up), so the
 * memory guard mostly reads avail against threshold. A trim warning or onLowMemory also sends a
 * 'memory' event, so the app hears at once rather than at its next reading.
 */
@CapacitorPlugin(name = "PowerState")
public class PowerStatePlugin extends Plugin {
    private int trim = 0;
    private long trimAt = 0;
    private ComponentCallbacks2 callbacks;

    @Override
    public void load() {
        callbacks = new ComponentCallbacks2() {
            @Override public void onTrimMemory(int level) { warned(level); }
            @Override public void onLowMemory() { warned(15); }
            @Override public void onConfigurationChanged(Configuration c) { }
        };
        try { getContext().getApplicationContext().registerComponentCallbacks(callbacks); } catch (Exception e) { callbacks = null; }
    }

    @Override
    protected void handleOnDestroy() {
        if (callbacks != null) try { getContext().getApplicationContext().unregisterComponentCallbacks(callbacks); } catch (Exception e) { }
        callbacks = null;
    }

    private void warned(int level) {
        trim = level; trimAt = System.currentTimeMillis();
        JSObject o = new JSObject();
        o.put("trim", level);
        o.put("trimAt", trimAt);
        notifyListeners("memory", o);
    }

    @PluginMethod
    public void get(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject o = new JSObject();
        o.put("platform", "android");
        int thermal = 0;
        double headroom = -1;
        boolean saver = false;
        if (pm != null) {
            if (Build.VERSION.SDK_INT >= 29) thermal = pm.getCurrentThermalStatus();
            if (Build.VERSION.SDK_INT >= 30) {
                float h = pm.getThermalHeadroom(10);
                if (!Float.isNaN(h)) headroom = h;
            }
            saver = pm.isPowerSaveMode();
        }
        o.put("thermal", thermal);
        o.put("headroom", headroom);
        o.put("saver", saver);
        JSObject mem = new JSObject();
        try {
            ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                mem.put("total", mi.totalMem);
                mem.put("avail", mi.availMem);
                mem.put("threshold", mi.threshold);
                mem.put("low", mi.lowMemory);
            }
        } catch (Exception e) { /* memory unknown */ }
        mem.put("trim", trim);
        mem.put("trimAt", trimAt);
        o.put("mem", mem);
        call.resolve(o);
    }
}
