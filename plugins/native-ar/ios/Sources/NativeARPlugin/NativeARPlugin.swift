import Foundation
import Capacitor
import ARKit
import AVFoundation
import Metal

/// Native AR for the AR · 3D games (src/kit/ar3d.js), using ARKit world tracking.
///
/// An ARSCNView draws the camera picture BEHIND the (see-through) WebView, and every frame the phone's
/// pose, the projection and the light estimate go to JavaScript as a "frame" event, where three.js draws
/// the game on top. Horizontal surfaces go out as a "planes" event a few times a second (with the
/// feature points ARKit is tracking, while the game asks for them with points({ on })), and hitTest()
/// finds where a screen point meets a real surface.
///
/// Same JS shape as the Android plugin: start() -> { started, reason? }, stop(), hitTest({ x, y }) (CSS
/// pixels, which are iOS points) -> { hits: [{ pose, kind, surface? }] } (nearest first), points({ on }),
/// available() -> { supported, installed, status }. Matrices are 16 floats, column-major, in metres.
/// Where the phone can tell what a surface is, planes carry "kind" and hits "surface": floor, table,
/// seat or other. A frame's "why" says why tracking is poor, in ARCore's words.
///
/// AR phase 2, each part only when the game asks start() for it (the same shape as the Android plugin):
///   start({ depth, walls, light: 'real' }) -> { started, depth, walls, light }: what this phone gave.
///   depth  (phones with a LiDAR scanner) a "depth" event about ten times a second: { w, h, d, pose, proj }.
///          d is base64 of w x h distances from the camera's plane, 16-bit millimetres, low byte first
///          (0: not known), rows from the top of the view; pose and proj are the camera's for that picture.
///   walls  vertical surfaces join "planes" with kind "wall" (the pose's y axis stands out of the wall),
///          and a hit on one has surface "wall".
///   light  an "env" event every couple of seconds carries the room as a small cube map: { size, max, px }
///          (px: base64 of six faces, +x -x +y -y +z -z, three bytes a dot, each the square root of the
///          colour's share of max). ARKit doesn't say where the main light is: the game finds it in that picture.
///   anchor({ id, p, q }) -> { ok }, removeAnchor({ id }): a pose ARKit keeps fixed to the room as it
///          corrects its map; "planes" events then carry anchors: [{ id, pose, tracked }]. stop() lets them all go.
///   images({ images: [{ name, png, width }] }) -> { added, rejected }: pictures to look for; frames that
///          have found one carry images: [{ name, pose, w, tracked }] (the pose's y axis stands out of the
///          picture). The set stays until images() is called again.
@objc(NativeARPlugin)
public class NativeARPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "NativeARPlugin"
    public let jsName = "NativeAR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hitTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "points", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "anchor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeAnchor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "images", returnType: CAPPluginReturnPromise)
    ]

    private var arView: ARSCNView?
    private var running = false
    private var frameNo = 0
    private var wantPoints = false
    private static let maxPoints = 240
    private static let maxHits = 4
    private var savedOpaque = true
    private var savedBackground: UIColor?
    private var savedScrollBackground: UIColor?

    // AR phase 2: what this round was given
    private var onDepth = false
    private var onWalls = false
    private var onLight = false
    private static let maxAnchors = 16
    private var held: [String: ARAnchor] = [:]
    private var refImages = Set<ARReferenceImage>()
    private var imageAsk = 0
    private var envQueue: MTLCommandQueue?
    private var envBusy = false

    @objc func available(_ call: CAPPluginCall) {
        let ok = ARWorldTrackingConfiguration.isSupported
        call.resolve(["supported": ok, "installed": ok, "status": ok ? "SUPPORTED_INSTALLED" : "UNSUPPORTED"])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.resolve(["started": false, "reason": "unsupported"])
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            begin(call)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in
                if ok { self.begin(call) } else { call.resolve(["started": false, "reason": "camera"]) }
            }
        default:
            call.resolve(["started": false, "reason": "camera"])
        }
    }

    private func begin(_ call: CAPPluginCall) {
        let wantDepth = call.getBool("depth") ?? false
        let wantWalls = call.getBool("walls") ?? false
        let wantLight = call.getString("light") == "real"
        DispatchQueue.main.async {
            guard let web = self.bridge?.webView, let parent = web.superview else {
                call.resolve(["started": false, "reason": "no-view"])
                return
            }
            let view = self.arView ?? ARSCNView(frame: web.frame)
            if self.arView == nil {
                view.automaticallyUpdatesLighting = false
                view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                view.session.delegate = self
                self.arView = view
            }
            if view.superview == nil {
                view.frame = web.frame
                parent.insertSubview(view, belowSubview: web) // behind the page, which goes see-through
                self.savedOpaque = web.isOpaque
                self.savedBackground = web.backgroundColor
                self.savedScrollBackground = web.scrollView.backgroundColor
            }
            web.isOpaque = false
            web.backgroundColor = .clear
            web.scrollView.backgroundColor = .clear

            // set again for every round: each game asks for the parts it wants
            self.onDepth = wantDepth && ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth)
            self.onWalls = wantWalls
            self.onLight = wantLight
            self.dropAnchors(view)
            view.session.run(self.config())   // keeps the room map between rounds, so the floor is found at once
            self.running = true
            self.frameNo = 0
            self.wantPoints = false
            call.resolve(["started": true, "depth": self.onDepth, "walls": self.onWalls, "light": self.onLight ? "real" : "ambient"])
        }
    }

    /// The session's settings for this round: the usual ones, and the AR phase 2 parts that are on.
    private func config() -> ARWorldTrackingConfiguration {
        let cfg = ARWorldTrackingConfiguration()
        cfg.planeDetection = onWalls ? [.horizontal, .vertical] : [.horizontal]
        cfg.isLightEstimationEnabled = true
        cfg.worldAlignment = .gravity
        if onDepth { cfg.frameSemantics.insert(.smoothedSceneDepth) }
        if onLight { cfg.environmentTexturing = .automatic }
        if !refImages.isEmpty {
            cfg.detectionImages = refImages
            cfg.maximumNumberOfTrackedImages = min(4, refImages.count)
            cfg.automaticImageScaleEstimationEnabled = true   // a picture's real width needn't be known
        }
        return cfg
    }

    private func dropAnchors(_ view: ARSCNView) {
        for a in held.values { view.session.remove(anchor: a) }
        held.removeAll()
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.running = false
            self.wantPoints = false
            if let view = self.arView {
                self.dropAnchors(view)   // the round's anchors are let go
                view.session.pause()
                view.removeFromSuperview()
            }
            if let web = self.bridge?.webView {
                web.isOpaque = self.savedOpaque
                web.backgroundColor = self.savedBackground
                web.scrollView.backgroundColor = self.savedScrollBackground
            }
            call.resolve()
        }
    }

    /// Send the feature points ARKit is tracking with each "planes" event ({ on: true }), or stop.
    /// The game's floor search uses them, and turns them off once the floor is settled.
    @objc func points(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            self.wantPoints = on
            call.resolve()
        }
    }

    /// Hold a pose ({ id, p: [x, y, z], q: [x, y, z, w] }, in the session's own space) fixed to the room.
    /// Resolves { ok }: false while tracking is poor, or with sixteen held already.
    @objc func anchor(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let p = Self.numbers(call.getArray("p")), q = Self.numbers(call.getArray("q"))
        DispatchQueue.main.async {
            guard self.running, let view = self.arView, !id.isEmpty, p.count >= 3, q.count >= 4,
                  self.held.count < Self.maxAnchors || self.held[id] != nil,
                  let frame = view.session.currentFrame, case .normal = frame.camera.trackingState else {
                call.resolve(["ok": false])
                return
            }
            if let old = self.held[id] { view.session.remove(anchor: old) }
            var m = simd_float4x4(simd_quatf(ix: Float(q[0]), iy: Float(q[1]), iz: Float(q[2]), r: Float(q[3])).normalized)
            m.columns.3 = SIMD4<Float>(Float(p[0]), Float(p[1]), Float(p[2]), 1)
            let a = ARAnchor(name: "gs-" + id, transform: m)
            view.session.add(anchor: a)
            self.held[id] = a
            call.resolve(["ok": true])
        }
    }

    /// Let one anchor go ({ id }).
    @objc func removeAnchor(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            if let a = self.held.removeValue(forKey: id), let view = self.arView { view.session.remove(anchor: a) }
            call.resolve(["ok": true])
        }
    }

    /// The pictures to look for in the room: { images: [{ name, png (base64), width (metres; 0: not known) }] }.
    /// Each call replaces the set. Resolves { added, rejected }: ARKit turns down a picture with too
    /// little detail to find.
    @objc func images(_ call: CAPPluginCall) {
        let list = (call.getArray("images") ?? []).compactMap { $0 as? JSObject }
        DispatchQueue.main.async {
            self.imageAsk += 1
            let mine = self.imageAsk
            let sorted = Sorted()
            let group = DispatchGroup()
            for o in list {
                let name = o["name"] as? String ?? ""
                guard !name.isEmpty, let text = o["png"] as? String, let data = Data(base64Encoded: text, options: .ignoreUnknownCharacters),
                      let picture = UIImage(data: data)?.cgImage else {
                    sorted.rejected.append(name)
                    continue
                }
                // (with no width given the phone works the size out as it looks: 10 cm is only where it starts)
                let width = (o["width"] as? NSNumber)?.doubleValue ?? 0
                let ref = ARReferenceImage(picture, orientation: .up, physicalWidth: CGFloat(width > 0 ? width : 0.1))
                ref.name = name
                group.enter()
                ref.validate { problem in
                    sorted.lock.lock()
                    if problem == nil { sorted.refs.insert(ref); sorted.added.append(name) } else { sorted.rejected.append(name) }
                    sorted.lock.unlock()
                    group.leave()
                }
            }
            group.notify(queue: .main) {
                if mine == self.imageAsk {   // (a newer set hasn't been asked for meanwhile)
                    self.refImages = sorted.refs
                    if self.running, let view = self.arView { view.session.run(self.config()) }   // (the map and the anchors stay)
                }
                call.resolve(["added": sorted.added, "rejected": sorted.rejected])
            }
        }
    }

    /// What images() sorts a set of pictures into (filled from whichever queue ARKit answers on).
    private final class Sorted {
        let lock = NSLock()
        var refs = Set<ARReferenceImage>()
        var added: [String] = []
        var rejected: [String] = []
    }

    private static func numbers(_ a: JSArray?) -> [Double] {
        return (a ?? []).compactMap { ($0 as? NSNumber)?.doubleValue }
    }

    /// Where a point on the screen (CSS pixels = points) meets a real surface.
    @objc func hitTest(_ call: CAPPluginCall) {
        let x = call.getDouble("x") ?? 0, y = call.getDouble("y") ?? 0
        DispatchQueue.main.async {
            guard self.running, let view = self.arView else { call.resolve(["hits": [] as [Any]]); return }
            let pt = CGPoint(x: x, y: y)
            var hits: [[String: Any]] = [], far: [Float] = []
            let eye = view.session.currentFrame?.camera.transform.columns.3 ?? SIMD4<Float>(0, 0, 0, 1)
            func away(_ m: simd_float4x4) -> Float { let c = m.columns.3; return simd_length(SIMD3<Float>(c.x - eye.x, c.y - eye.y, c.z - eye.z)) }
            // mapped surfaces first: nearest first, and a few, so the floor search can look past a table top
            if let q = view.raycastQuery(from: pt, allowing: .existingPlaneGeometry, alignment: .horizontal) {
                for r in view.session.raycast(q).prefix(Self.maxHits) {
                    var h: [String: Any] = ["pose": Self.flat(r.worldTransform), "kind": "plane"]
                    if let a = r.anchor as? ARPlaneAnchor, let what = Self.surface(a) { h["surface"] = what }
                    hits.append(h)
                    far.append(away(r.worldTransform))
                }
            }
            // walls, when the game maps them, go in among the others by how far each is from the phone
            if self.onWalls, let q = view.raycastQuery(from: pt, allowing: .existingPlaneGeometry, alignment: .vertical) {
                for r in view.session.raycast(q).prefix(Self.maxHits) {
                    guard let a = r.anchor as? ARPlaneAnchor else { continue }
                    // the wall's own turn (its y axis stands out of it), at the spot that was hit
                    var m = a.transform
                    m.columns.3 = r.worldTransform.columns.3
                    hits.append(["pose": Self.flat(m), "kind": "plane", "surface": "wall"])
                    far.append(away(m))
                }
                let found = hits
                hits = found.indices.sorted { far[$0] < far[$1] }.prefix(Self.maxHits).map { found[$0] }
            }
            // nothing mapped there yet: ARKit's own estimate of a flat surface at that spot
            if hits.isEmpty, let q = view.raycastQuery(from: pt, allowing: .estimatedPlane, alignment: .horizontal),
               let r = view.session.raycast(q).first {
                hits.append(["pose": Self.flat(r.worldTransform), "kind": "point"])
            }
            call.resolve(["hits": hits])
        }
    }

    // MARK: ARSessionDelegate (main queue)

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard running, let view = arView else { return }
        let orient = view.window?.windowScene?.interfaceOrientation ?? .portrait
        let cam = frame.camera
        let pose = cam.viewMatrix(for: orient).inverse
        let proj = cam.projectionMatrix(for: orient, viewportSize: view.bounds.size, zNear: 0.05, zFar: 100)
        var why = Self.why(cam.trackingState)
        // ARKit has no "too dark" reason of its own: a dim picture with nothing to hold on to is that
        if why == "INSUFFICIENT_FEATURES", let le = frame.lightEstimate, le.ambientIntensity < 150 { why = "INSUFFICIENT_LIGHT" }
        var d: [String: Any] = [
            "t": frame.timestamp * 1000,
            "tracking": Self.tracking(cam.trackingState),
            "why": why,
            "pose": Self.flat(pose),
            "proj": Self.flat(proj)
        ]
        if let le = frame.lightEstimate {
            // ~1000 lumens is a normally lit room; the kit expects about 0.5 for that, as on Android.
            d["light"] = ["intensity": Double(le.ambientIntensity) / 2000, "color": Self.kelvin(Double(le.ambientColorTemperature))] as [String: Any]
        }
        if !refImages.isEmpty {
            // the registered pictures ARKit has found: in sight (tracked), or where each was last seen
            var seen: [[String: Any]] = []
            for case let im as ARImageAnchor in frame.anchors {
                guard let name = im.referenceImage.name else { continue }
                seen.append(["name": name, "pose": Self.flat(im.transform), "w": Double(im.referenceImage.physicalSize.width * im.estimatedScaleFactor), "tracked": im.isTracked])
            }
            if !seen.isEmpty { d["images"] = seen }
        }
        notifyListeners("frame", data: d)
        frameNo += 1
        if frameNo % 20 == 1 { sendPlanes(frame) }
        if onDepth, frameNo % 6 == 3, case .normal = cam.trackingState { sendDepth(frame, orient: orient, size: view.bounds.size, pose: pose, proj: proj) }
        if onLight, frameNo % 120 == 30 { sendEnv(frame) }
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        notifyListeners("frame", data: ["tracking": "STOPPED", "error": error.localizedDescription])
    }

    private func sendPlanes(_ frame: ARFrame) {
        var list: [[String: Any]] = []
        for case let p as ARPlaneAnchor in frame.anchors {
            let wall = p.alignment == .vertical
            if wall && !onWalls { continue }
            if !wall && ARPlaneAnchor.isClassificationSupported && p.classification == .ceiling { continue }
            var m = p.transform
            let c = p.center
            m = simd_mul(m, simd_float4x4(columns: (SIMD4(1, 0, 0, 0), SIMD4(0, 1, 0, 0), SIMD4(0, 0, 1, 0), SIMD4(c.x, c.y, c.z, 1))))
            var o: [String: Any] = ["id": p.identifier.uuidString, "pose": Self.flat(m), "w": p.extent.x, "d": p.extent.z]
            if wall { o["kind"] = "wall" } else if let what = Self.surface(p) { o["kind"] = what }
            list.append(o)
        }
        var d: [String: Any] = ["planes": list]
        if wantPoints, case .normal = frame.camera.trackingState, let cloud = frame.rawFeaturePoints {
            // up to maxPoints of the feature points ARKit is tracking, as x, y, z, x, y, z... in millimetres
            let pts = cloud.points
            let step = max(1, (pts.count + Self.maxPoints - 1) / Self.maxPoints)
            var out: [Int] = []
            out.reserveCapacity((pts.count / step + 1) * 3)
            var i = 0
            while i < pts.count {
                let q = pts[i]
                if abs(q.x) < 100 && abs(q.y) < 100 && abs(q.z) < 100 {   // (also false for NaN and infinity)
                    out.append(Int((q.x * 1000).rounded()))
                    out.append(Int((q.y * 1000).rounded()))
                    out.append(Int((q.z * 1000).rounded()))
                }
                i += step
            }
            d["points"] = out
        }
        if !held.isEmpty {
            // where ARKit holds each anchor now (they move a little whenever it corrects its map)
            var names: [UUID: String] = [:]
            for (id, a) in held { names[a.identifier] = id }
            var tracked = false
            if case .normal = frame.camera.trackingState { tracked = true }
            var now: [[String: Any]] = []
            for a in frame.anchors {
                if let id = names[a.identifier] { now.append(["id": id, "pose": Self.flat(a.transform), "tracked": tracked]) }
            }
            d["anchors"] = now
        }
        notifyListeners("planes", data: d)
    }

    // MARK: AR phase 2

    /// The LiDAR scanner's depth picture, sampled on a grid over the view (40 spots across its short
    /// side, up to 96 along the other) and sent as 16-bit millimetres. The picture lies the way the
    /// camera sensor does, so each view spot is looked up where ARKit says the camera picture shows it.
    private func sendDepth(_ frame: ARFrame, orient: UIInterfaceOrientation, size: CGSize, pose: simd_float4x4, proj: simd_float4x4) {
        guard let map = frame.smoothedSceneDepth?.depthMap, size.width > 1, size.height > 1,
              CVPixelBufferGetPixelFormatType(map) == kCVPixelFormatType_DepthFloat32 else { return }
        let tall = size.width <= size.height
        let gw = tall ? 40 : min(96, Int((40 * size.width / size.height).rounded()))
        let gh = tall ? min(96, Int((40 * size.height / size.width).rounded())) : 40
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return }
        let w = CVPixelBufferGetWidth(map), h = CVPixelBufferGetHeight(map), row = CVPixelBufferGetBytesPerRow(map)
        let toPicture = frame.displayTransform(for: orient, viewportSize: size).inverted()
        var out = [UInt8](repeating: 0, count: gw * gh * 2)
        var k = 0
        for j in 0..<gh {
            let v = CGFloat(j) / CGFloat(gh - 1)
            for i in 0..<gw {
                let p = CGPoint(x: CGFloat(i) / CGFloat(gw - 1), y: v).applying(toPicture)
                // (the nearest dot of the depth picture, kept inside it whatever the numbers)
                let px: Double = min(Double(w - 1), Double(p.x) * Double(w))
                let py: Double = min(Double(h - 1), Double(p.y) * Double(h))
                let x = Int(max(0, px)), y = Int(max(0, py))
                let m = base.load(fromByteOffset: y * row + x * 4, as: Float32.self)
                var mm: UInt16 = 0
                if m.isFinite && m > 0 { mm = UInt16(min(65535, (m * 1000).rounded())) }
                out[k] = UInt8(mm & 0xff)
                out[k + 1] = UInt8(mm >> 8)
                k += 2
            }
        }
        notifyListeners("depth", data: ["w": gw, "h": gh, "d": Data(out).base64EncodedString(), "pose": Self.flat(pose), "proj": Self.flat(proj)])
    }

    /// The room's light as ARKit pictures it: the nearest of its pictures of the surroundings (a cube
    /// map), read back from the graphics chip at a small size and packed three bytes a dot.
    private func sendEnv(_ frame: ARFrame) {
        if envBusy { return }
        let eye = frame.camera.transform.columns.3
        var best: MTLTexture?
        var bestFar = Float.greatestFiniteMagnitude
        for case let probe as AREnvironmentProbeAnchor in frame.anchors {
            guard let t = probe.environmentTexture, t.textureType == .typeCube else { continue }
            let c = probe.transform.columns.3, far = simd_length(SIMD3<Float>(c.x - eye.x, c.y - eye.y, c.z - eye.z))
            if far < bestFar { bestFar = far; best = t }
        }
        guard let tex = best else { return }
        let format = tex.pixelFormat
        let bytesEach: Int
        switch format {
        case .rgba16Float: bytesEach = 8
        case .bgra8Unorm, .bgra8Unorm_srgb, .rgba8Unorm, .rgba8Unorm_srgb: bytesEach = 4
        default: return
        }
        // the smallest level of the picture that still has 16 dots a side
        var level = 0
        while level + 1 < tex.mipmapLevelCount && (tex.width >> (level + 1)) >= 16 { level += 1 }
        let size = max(1, tex.width >> level), rowBytes = size * bytesEach, faceBytes = rowBytes * size
        if envQueue == nil || envQueue?.device !== tex.device { envQueue = tex.device.makeCommandQueue() }
        guard size <= 512, let queue = envQueue, let buf = tex.device.makeBuffer(length: faceBytes * 6, options: .storageModeShared),
              let cmd = queue.makeCommandBuffer(), let blit = cmd.makeBlitCommandEncoder() else { return }
        for f in 0..<6 {
            blit.copy(from: tex, sourceSlice: f, sourceLevel: level, sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0),
                      sourceSize: MTLSize(width: size, height: size, depth: 1),
                      to: buf, destinationOffset: f * faceBytes, destinationBytesPerRow: rowBytes, destinationBytesPerImage: faceBytes)
        }
        blit.endEncoding()
        envBusy = true
        cmd.addCompletedHandler { [weak self] done in
            let packed: [String: Any]? = done.status == .completed ? NativeARPlugin.packEnv(buf.contents(), size: size, bytesEach: bytesEach, format: format) : nil
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.envBusy = false
                if self.running, self.onLight, let d = packed { self.notifyListeners("env", data: d) }
            }
        }
        cmd.commit()
    }

    /// Six faces of `size` dots a side to { size, max, px }: at most 16 dots a side (averaged down), each
    /// colour as one byte, the square root of its share of `max`.
    private static func packEnv(_ p: UnsafeMutableRawPointer, size: Int, bytesEach: Int, format: MTLPixelFormat) -> [String: Any] {
        let side = min(size, 16), step = max(1, size / side)
        let blueFirst = format == .bgra8Unorm || format == .bgra8Unorm_srgb
        var rgb = [Float](repeating: 0, count: 6 * side * side * 3)
        var sum: Float = 0, top: Float = 0
        for f in 0..<6 {
            for y in 0..<side {
                for x in 0..<side {
                    var c: (Float, Float, Float) = (0, 0, 0)
                    for yy in 0..<step {
                        for xx in 0..<step {
                            let at = ((f * size + y * step + yy) * size + x * step + xx) * bytesEach
                            if bytesEach == 8 {
                                c.0 += half(p.load(fromByteOffset: at, as: UInt16.self))
                                c.1 += half(p.load(fromByteOffset: at + 2, as: UInt16.self))
                                c.2 += half(p.load(fromByteOffset: at + 4, as: UInt16.self))
                            } else {
                                let a = shown(p.load(fromByteOffset: at, as: UInt8.self)), g = shown(p.load(fromByteOffset: at + 1, as: UInt8.self)), b = shown(p.load(fromByteOffset: at + 2, as: UInt8.self))
                                c.0 += blueFirst ? b : a
                                c.1 += g
                                c.2 += blueFirst ? a : b
                            }
                        }
                    }
                    let o = ((f * side + y) * side + x) * 3, n = Float(step * step)
                    let mixed: [Float] = [c.0 / n, c.1 / n, c.2 / n]
                    for i in 0..<3 {
                        var u: Float = 0
                        if mixed[i].isFinite && mixed[i] > 0 { u = min(mixed[i], 1e6) }
                        rgb[o + i] = u
                        sum += u
                        top = max(top, u)
                    }
                }
            }
        }
        let mean: Float = sum / Float(rgb.count)
        let most: Float = max(1e-6, min(top, 32 * mean))
        var px = [UInt8](repeating: 0, count: rgb.count)
        for i in 0..<rgb.count {
            let share: Float = min(1, rgb[i] / most)
            px[i] = UInt8((255 * share.squareRoot()).rounded())
        }
        return ["size": side, "max": Double(most), "px": Data(px).base64EncodedString()]
    }

    /// A 16-bit float's value.
    private static func half(_ h: UInt16) -> Float {
        let e = Int((h >> 10) & 31)
        let m = Float(h & 0x3ff)
        var v: Float
        if e == 0 {
            v = m / 16777216
        } else if e == 31 {
            v = m == 0 ? Float.infinity : Float.nan
        } else {
            v = (1 + m / 1024) * Float(sign: .plus, exponent: e - 15, significand: 1)
        }
        if h & 0x8000 != 0 { v = -v }
        return v
    }

    /// A stored 8-bit colour as the amount of light it stands for.
    private static func shown(_ b: UInt8) -> Float {
        return pow(Float(b) / 255, 2.2)
    }

    /// What ARKit takes a horizontal surface for, on phones that can tell; nil when it can't or doesn't know.
    private static func surface(_ p: ARPlaneAnchor) -> String? {
        guard ARPlaneAnchor.isClassificationSupported else { return nil }
        switch p.classification {
        case .floor: return "floor"
        case .table: return "table"
        case .seat: return "seat"
        case .none: return nil
        default: return "other"
        }
    }

    /// Why tracking is poor, in ARCore's words, so the game shows the same help on both kinds of phone.
    private static func why(_ s: ARCamera.TrackingState) -> String {
        guard case .limited(let reason) = s else { return "NONE" }
        switch reason {
        case .excessiveMotion: return "EXCESSIVE_MOTION"
        case .insufficientFeatures: return "INSUFFICIENT_FEATURES"
        case .initializing: return "INITIALIZING"
        case .relocalizing: return "RELOCALIZING"
        @unknown default: return "NONE"
        }
    }

    private static func tracking(_ s: ARCamera.TrackingState) -> String {
        switch s {
        case .normal: return "TRACKING"
        case .limited: return "LIMITED"
        case .notAvailable: return "PAUSED"
        }
    }

    private static func flat(_ m: simd_float4x4) -> [Float] {
        let c = [m.columns.0, m.columns.1, m.columns.2, m.columns.3]
        return c.flatMap { [$0.x, $0.y, $0.z, $0.w] }
    }

    /// A rough colour for a light temperature (6500 K = white), scaled so green is 1 like ARCore's.
    private static func kelvin(_ k: Double) -> [Double] {
        let t = max(1000, min(40000, k)) / 100
        let r = t <= 66 ? 255 : 329.7 * pow(t - 60, -0.1332)
        let g = t <= 66 ? 99.47 * log(t) - 161.12 : 288.12 * pow(t - 60, -0.0755)
        let b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.52 * log(t - 10) - 305.04)
        let gg = max(1, g)
        return [min(255, r) / gg, 1, max(0, min(255, b)) / gg]
    }
}
