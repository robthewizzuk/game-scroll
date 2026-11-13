import Foundation
import UIKit
import Capacitor

/// How warm the phone is, whether it's saving power and whether it has warned about memory, for frame
/// generation's power saving (src/kit/power.js) and the memory guard (src/kit/memory.js):
/// get() -> { platform: 'ios', thermal, headroom: -1, saver, mem: { total, warnAt } }.
///
/// thermal: ProcessInfo's thermal state: 0 nominal, 1 fair, 2 serious, 3 critical. saver: Low Power Mode is on.
/// mem.total: the phone's memory in bytes. mem.warnAt: when the last memory warning came (ms since 1970; 0 if
/// none yet). A memory warning also sends a 'memory' event, so the app hears at once.
@objc(PowerStatePlugin)
public class PowerStatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PowerStatePlugin"
    public let jsName = "PowerState"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]
    private var warnAt: Double = 0

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(warned),
            name: UIApplication.didReceiveMemoryWarningNotification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func warned() {
        warnAt = Date().timeIntervalSince1970 * 1000
        notifyListeners("memory", data: ["warnAt": warnAt])
    }

    @objc func get(_ call: CAPPluginCall) {
        let p = ProcessInfo.processInfo
        let thermal: Int
        switch p.thermalState {
        case .nominal: thermal = 0
        case .fair: thermal = 1
        case .serious: thermal = 2
        case .critical: thermal = 3
        @unknown default: thermal = 0
        }
        let mem: [String: Any] = ["total": Double(p.physicalMemory), "warnAt": warnAt]
        call.resolve(["platform": "ios", "thermal": thermal, "headroom": -1, "saver": p.isLowPowerModeEnabled, "mem": mem])
    }
}
