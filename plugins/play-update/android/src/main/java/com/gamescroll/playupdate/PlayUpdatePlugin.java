package com.gamescroll.playupdate;

import android.app.Activity;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Updates from Google Play inside the app, with Google's in-app updates (src/update.js decides when).
 * Play only offers them to a copy of the app that Play installed (the internal testing track counts),
 * so for anything else (an APK from GitHub, another store) check() says play: false and never asks Play.
 *
 * check() -> {
 *   play:        installed by Google Play
 *   installer:   the package that installed the app ('com.android.vending' is Play), or '' if not known
 *   versionCode, versionName: this copy's
 *   (only when play, and Play answered:)
 *   available:   'yes' an update is waiting, 'resume' a full-screen update was started and cut off
 *                (finish it before anything else), 'none'
 *   availableVersionCode, priority (0..5, given when the release was uploaded), staleDays (days since
 *   Play first had it on this phone, or -1), immediate / flexible (which kinds Play allows now),
 *   status:      where a background download is: 'none', 'pending', 'downloading', 'downloaded' (ready:
 *                complete() restarts into it), 'installing', 'installed', 'failed', 'canceled'
 *   bytes, total: the download so far
 *   error:       Play's message when it couldn't answer (no Play Store, offline...)
 * }
 * start({ type: 'flexible' | 'immediate' }) -> { result } once Play's own screen answers: 'accepted',
 *   'declined' (the player said no, or backed out), 'failed', or before that 'not-ready' (check() first:
 *   each answer from Play starts one update at most) and 'not-allowed'. Flexible: Play asks, then
 *   downloads in the background; 'state' events follow. Immediate: Play's full screen update, which
 *   restarts the app into the new version.
 * complete() -> restarts into a downloaded flexible update.
 * 'state' event: { status, bytes, total, error } as a background download moves on.
 */
@CapacitorPlugin(name = "PlayUpdate")
public class PlayUpdatePlugin extends Plugin {
    private static final String TAG = "PlayUpdate";
    private static final int RESULT_FAILED = com.google.android.play.core.install.model.ActivityResult.RESULT_IN_APP_UPDATE_FAILED;

    private AppUpdateManager manager;
    private AppUpdateInfo info;   // Play's last answer; it can start one update only
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall waiting;   // the start() call waiting for Play's screen to answer
    private InstallStateUpdatedListener listener;
    private boolean fromPlay;

    @Override
    public void load() {
        // Registered now: a result launcher can only be made while the activity is being created.
        launcher = bridge.registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::answered);
        fromPlay = isPlay(installer());
        if (!fromPlay) return;
        try {
            manager = AppUpdateManagerFactory.create(getContext());
            listener = state -> {
                JSObject s = new JSObject();
                s.put("status", status(state.installStatus()));
                s.put("bytes", state.bytesDownloaded());
                s.put("total", state.totalBytesToDownload());
                s.put("error", state.installErrorCode());
                // kept until the page listens, so a download that finishes early isn't missed
                notifyListeners("state", s, state.installStatus() == InstallStatus.DOWNLOADED);
            };
            manager.registerListener(listener);
        } catch (Exception e) {
            Logger.error(TAG, "Play's update service isn't here", e);
            manager = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (manager != null && listener != null) manager.unregisterListener(listener);
    }

    @SuppressWarnings("deprecation")
    private String installer() {
        try {
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            String who = Build.VERSION.SDK_INT >= 30 ? pm.getInstallSourceInfo(pkg).getInstallingPackageName() : pm.getInstallerPackageName(pkg);
            return who == null ? "" : who;
        } catch (Exception e) {
            return "";
        }
    }

    // The Play Store app; very old phones named Play's installer after its feedback service.
    private static boolean isPlay(String who) {
        return "com.android.vending".equals(who) || "com.google.android.feedback".equals(who);
    }

    @SuppressWarnings("deprecation")
    private void putVersion(JSObject ret) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            ret.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
            ret.put("versionName", pi.versionName);
        } catch (Exception e) {
            ret.put("versionCode", 0);
            ret.put("versionName", "");
        }
    }

    private static String status(int s) {
        switch (s) {
            case InstallStatus.PENDING: return "pending";
            case InstallStatus.DOWNLOADING: return "downloading";
            case InstallStatus.DOWNLOADED: return "downloaded";
            case InstallStatus.INSTALLING: return "installing";
            case InstallStatus.INSTALLED: return "installed";
            case InstallStatus.FAILED: return "failed";
            case InstallStatus.CANCELED: return "canceled";
            default: return "none";
        }
    }

    @PluginMethod
    public void check(PluginCall call) {
        JSObject ret = new JSObject();
        String who = installer();
        ret.put("installer", who);
        ret.put("play", fromPlay);
        putVersion(ret);
        if (!fromPlay || manager == null) {
            call.resolve(ret);
            return;
        }
        try {
            manager.getAppUpdateInfo()
                .addOnSuccessListener(i -> {
                    info = i;
                    int a = i.updateAvailability();
                    ret.put("available", a == UpdateAvailability.UPDATE_AVAILABLE ? "yes" : a == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS ? "resume" : "none");
                    ret.put("availableVersionCode", i.availableVersionCode());
                    ret.put("priority", i.updatePriority());
                    Integer stale = i.clientVersionStalenessDays();
                    ret.put("staleDays", stale == null ? -1 : stale);
                    ret.put("immediate", i.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
                    ret.put("flexible", i.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
                    ret.put("status", status(i.installStatus()));
                    ret.put("bytes", i.bytesDownloaded());
                    ret.put("total", i.totalBytesToDownload());
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> {
                    // No Play Store, signed out, offline, or Play doesn't know this copy: nothing to offer.
                    ret.put("available", "none");
                    ret.put("error", String.valueOf(e.getMessage()));
                    call.resolve(ret);
                });
        } catch (Exception e) {
            ret.put("available", "none");
            ret.put("error", String.valueOf(e.getMessage()));
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        int type = "immediate".equals(call.getString("type")) ? AppUpdateType.IMMEDIATE : AppUpdateType.FLEXIBLE;
        AppUpdateInfo i = info;
        if (manager == null || i == null) {
            call.resolve(result("not-ready"));
            return;
        }
        int a = i.updateAvailability();
        boolean ok = a == UpdateAvailability.UPDATE_AVAILABLE || (type == AppUpdateType.IMMEDIATE && a == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS);
        if (!ok || !i.isUpdateTypeAllowed(type)) {
            call.resolve(result(ok ? "not-allowed" : "not-ready"));
            return;
        }
        if (waiting != null) waiting.resolve(result("declined"));   // an older ask that never came back
        info = null;   // used up
        waiting = call;
        bridge.executeOnMainThread(() -> {
            try {
                if (!manager.startUpdateFlowForResult(i, launcher, AppUpdateOptions.newBuilder(type).build())) finish("not-ready");
            } catch (Exception e) {
                Logger.error(TAG, "Couldn't open Play's update screen", e);
                finish("failed");
            }
        });
    }

    private void answered(ActivityResult r) {
        int code = r.getResultCode();
        finish(code == Activity.RESULT_OK ? "accepted" : code == RESULT_FAILED ? "failed" : "declined");
    }

    private void finish(String what) {
        PluginCall c = waiting;
        waiting = null;
        if (c != null) c.resolve(result(what));
    }

    private static JSObject result(String what) {
        JSObject ret = new JSObject();
        ret.put("result", what);
        return ret;
    }

    @PluginMethod
    public void complete(PluginCall call) {
        if (manager == null) {
            call.reject("Not installed from Google Play");
            return;
        }
        try {
            // Play shows its own install screen and opens the app again once the new version is in.
            manager.completeUpdate().addOnSuccessListener(v -> call.resolve()).addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage())));
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
