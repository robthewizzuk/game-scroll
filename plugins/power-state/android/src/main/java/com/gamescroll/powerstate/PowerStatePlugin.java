package com.gamescroll.powerstate;

import android.app.ActivityManager;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PerformanceHintManager;
import android.os.PowerManager;
import android.os.Process;
import android.os.SystemClock;
import android.os.WorkDuration;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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
 *
 * thresholds (Android 15+): the headroom at which each thermal status starts, { "2": .9, "3": 1, ... }, so the
 * app's heat model (src/kit/heat.js) knows where this phone draws its lines; absent where it isn't known.
 *
 * battery() -> { current, charge, energy, voltage, temp, charging, at }: what the battery says now, for the frame
 * lab's power reading (joules a frame) and the heat model. current: BatteryManager's CURRENT_NOW as the phone
 * gives it (microamps on most, milliamps on some; negative or positive while it drains, by maker: the app sorts
 * that out); charge: the charge counter (microamp hours); energy: the energy counter (nanowatt hours, rarely
 * there); voltage (millivolts), temp (degrees C) and charging from the battery's last broadcast; at: when (ms of
 * uptime). Each is left out where the phone doesn't say. get() carries the same as battery.
 *
 * Performance hint sessions (Android 12+, PerformanceHintManager: the ADPF hints games use): the app says how
 * long each frame should take and how long it really took, and the phone sets its CPU clocks to just what the
 * frames need, rather than guessing from how busy the cores look (the guess runs hot: high clocks for work that
 * would fit at lower ones). Only threads of this app's own process may join a session, so it holds the WebView's
 * GPU and compositor threads (by name, from /proc/self/task), which put each frame on the screen; the page's own
 * script runs in WebView's sandboxed renderer, another process, and can't. hintStart({ ms }) -> { ok, threads,
 * rate, why }; hintTarget({ ms }); hintReport({ cpu: [ms...], gpu: [ms or -1...] }) each frame's work (sent in
 * small batches); hintEfficient({ on }) asks for efficiency over speed (Android 15+, while saving power); hintStop().
 */
@CapacitorPlugin(name = "PowerState")
public class PowerStatePlugin extends Plugin {
    private int trim = 0;
    private long trimAt = 0;
    private ComponentCallbacks2 callbacks;
    private PerformanceHintManager.Session hint;
    private long hintTarget = 0;
    // the WebView's threads that draw each frame in this app's process (names cut to 15 letters, as /proc has them)
    private static final String[] HINT_THREADS = { "CrGpuMain", "Chrome_InProcGp", "VizCompositorTh", "RenderThread", "CrRendererMain", "Chrome_InProcRe" };

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
        closeHint();
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
        if (pm != null && Build.VERSION.SDK_INT >= 35) {
            try {
                Map<Integer, Float> th = pm.getThermalHeadroomThresholds();
                JSObject t = new JSObject();
                for (Map.Entry<Integer, Float> e : th.entrySet()) if (e.getValue() != null && !Float.isNaN(e.getValue())) t.put(String.valueOf(e.getKey()), (double) e.getValue());
                o.put("thresholds", t);
            } catch (Exception e) { /* not known here */ }
        }
        o.put("battery", batteryNow());
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

    @PluginMethod
    public void battery(PluginCall call) { call.resolve(batteryNow()); }

    private JSObject batteryNow() {
        JSObject b = new JSObject();
        Context ctx = getContext();
        try {
            BatteryManager bm = (BatteryManager) ctx.getSystemService(Context.BATTERY_SERVICE);
            if (bm != null) {
                int cur = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW);
                if (cur != Integer.MIN_VALUE && cur != 0) b.put("current", cur);
                int charge = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER);
                if (charge != Integer.MIN_VALUE && charge > 0) b.put("charge", charge);
                long energy = bm.getLongProperty(BatteryManager.BATTERY_PROPERTY_ENERGY_COUNTER);
                if (energy != Long.MIN_VALUE && energy > 0) b.put("energy", energy);
            }
        } catch (Exception e) { /* no battery properties here */ }
        try {
            Intent i = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (i != null) {
                int v = i.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1);
                if (v > 0) b.put("voltage", v);
                int t = i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
                if (t != Integer.MIN_VALUE) b.put("temp", t / 10.0);
                int status = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1), plugged = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                b.put("charging", plugged != 0 || status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
            }
        } catch (Exception e) { /* no battery broadcast here */ }
        b.put("at", SystemClock.elapsedRealtime());
        return b;
    }

    // the threads of this process the WebView draws frames with, and their names
    private int[] hintThreads(List<String> names) {
        List<Integer> tids = new ArrayList<>();
        File[] tasks = new File("/proc/self/task").listFiles();
        if (tasks != null) for (File t : tasks) {
            String name = "";
            try (BufferedReader r = new BufferedReader(new FileReader(new File(t, "comm")))) { String l = r.readLine(); if (l != null) name = l.trim(); } catch (Exception e) { continue; }
            for (String want : HINT_THREADS) if (name.startsWith(want)) {
                try { tids.add(Integer.parseInt(t.getName())); names.add(name); } catch (NumberFormatException e) { }
                break;
            }
        }
        // (none found, as in a WebView that draws on another thread name: the app's main thread, which hands the frames on)
        if (tids.isEmpty()) { tids.add(Process.myPid()); names.add("main"); }
        int[] out = new int[tids.size()];
        for (int k = 0; k < out.length; k++) out[k] = tids.get(k);
        return out;
    }

    private static long nanos(double ms) { return Math.max(1000L, (long) (ms * 1e6)); }

    @PluginMethod
    public void hintStart(PluginCall call) {
        JSObject o = new JSObject();
        if (Build.VERSION.SDK_INT < 31) { o.put("ok", false); o.put("why", "Android 12 or later"); call.resolve(o); return; }
        try {
            closeHint();
            PerformanceHintManager m = (PerformanceHintManager) getContext().getSystemService(Context.PERFORMANCE_HINT_SERVICE);
            if (m == null || m.getPreferredUpdateRateNanos() < 0) { o.put("ok", false); o.put("why", "this phone doesn't offer them"); call.resolve(o); return; }
            List<String> names = new ArrayList<>();
            int[] tids = hintThreads(names);
            long target = nanos(call.getDouble("ms", 1000.0 / 60));
            hint = m.createHintSession(tids, target);
            if (hint == null) { o.put("ok", false); o.put("why", "the phone turned the session down"); call.resolve(o); return; }
            hintTarget = target;
            o.put("ok", true);
            o.put("threads", new JSArray(names));
            o.put("rate", m.getPreferredUpdateRateNanos() / 1e6);
        } catch (Exception e) { hint = null; o.put("ok", false); o.put("why", String.valueOf(e.getMessage())); }
        call.resolve(o);
    }

    @PluginMethod
    public void hintTarget(PluginCall call) {
        try { long t = nanos(call.getDouble("ms", 1000.0 / 60)); if (hint != null && t != hintTarget) { hint.updateTargetWorkDuration(t); hintTarget = t; } } catch (Exception e) { }
        call.resolve();
    }

    @PluginMethod
    public void hintReport(PluginCall call) {
        int n = 0;
        try {
            JSArray cpu = call.getArray("cpu"), gpu = call.getArray("gpu");
            if (hint != null && cpu != null) for (int i = 0; i < cpu.length(); i++) {
                double c = cpu.optDouble(i, -1), g = gpu != null ? gpu.optDouble(i, -1) : -1;
                if (!(c >= 0)) continue;
                if (Build.VERSION.SDK_INT >= 35 && g >= 0) {
                    // (the frame's whole time is the longer of the two: the chip draws while the next frame's script runs)
                    long cn = nanos(c), gn = nanos(g), total = Math.max(cn, gn);
                    WorkDuration d = new WorkDuration();
                    d.setWorkPeriodStartTimestampNanos(System.nanoTime() - total); d.setActualTotalDurationNanos(total);
                    d.setActualCpuDurationNanos(cn); d.setActualGpuDurationNanos(gn);
                    hint.reportActualWorkDuration(d);
                } else hint.reportActualWorkDuration(nanos(c));
                n++;
            }
        } catch (Exception e) { /* a bad number, or the session went: the next batch tries again */ }
        JSObject o = new JSObject(); o.put("n", n); call.resolve(o);
    }

    @PluginMethod
    public void hintEfficient(PluginCall call) {
        try { if (hint != null && Build.VERSION.SDK_INT >= 35) hint.setPreferPowerEfficiency(call.getBoolean("on", false)); } catch (Exception e) { }
        call.resolve();
    }

    @PluginMethod
    public void hintStop(PluginCall call) { closeHint(); call.resolve(); }

    private void closeHint() {
        if (hint != null) try { hint.close(); } catch (Exception e) { }
        hint = null; hintTarget = 0;
    }
}
