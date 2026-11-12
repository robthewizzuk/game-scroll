import Foundation
import AVFoundation
import Capacitor

/// The phone's own text-to-speech writes a line to sound instead of speaking it, so the game can
/// play it through its own mixer (src/kit/sound.js): a treatment for each character, the room's
/// echo, the same loudness on every phone.
///
///   render({ text, lang, voiceURI?, rate, pitch }) ->
///       { ok: true, rate: samples a second, pcm: base64 of 16-bit little-endian mono samples,
///         marks: [character index, seconds, ...] where each word starts (iOS 16 and later; else none) }
///       or { ok: false, reason }
///   cancel() -> stops whatever is being written
///
/// voiceURI is AVSpeechSynthesisVoice.identifier, which is what the Text to Speech plugin lists.
/// Nothing here plays a sound or uses the network.
@objc(SpeechAudioPlugin)
public class SpeechAudioPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "SpeechAudioPlugin"
    public let jsName = "SpeechAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "render", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    private static let maxBytes = 12 * 1024 * 1024   // about two minutes of speech: far more than a line

    private final class Job {
        let call: CAPPluginCall
        let utterance: AVSpeechUtterance
        var pcm = Data()
        var rate: Double = 0
        var bytesPerFrame: Double = 2
        var marks: [(at: Int, bytes: Int)] = []   // where each word starts in the text, and how far into the sound
        var last = Date()   // when its latest piece of sound came
        var done = false
        init(call: CAPPluginCall, utterance: AVSpeechUtterance) { self.call = call; self.utterance = utterance }
    }

    private let work = DispatchQueue(label: "com.gamescroll.speechaudio")   // every job is touched on this queue only
    private var jobs: [Job] = []
    private lazy var synth: AVSpeechSynthesizer = {
        let s = AVSpeechSynthesizer()
        s.delegate = self
        return s
    }()

    private static func fail(_ call: CAPPluginCall, _ why: String) {
        call.resolve(["ok": false, "reason": why])
    }

    // the Text to Speech plugin's pace, so a rendered line runs as fast as a spoken one
    private static func pace(_ rate: Float) -> Float {
        let base = AVSpeechUtteranceDefaultSpeechRate
        let r = rate >= 1 ? 0.1 * rate + (base - 0.1) : rate * base
        return max(AVSpeechUtteranceMinimumSpeechRate, min(AVSpeechUtteranceMaximumSpeechRate, r))
    }

    @objc func render(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { SpeechAudioPlugin.fail(call, "no text"); return }
        let utterance = AVSpeechUtterance(string: String(text.prefix(4000)))
        var voice: AVSpeechSynthesisVoice?
        if let uri = call.getString("voiceURI"), !uri.isEmpty { voice = AVSpeechSynthesisVoice(identifier: uri) }
        if voice == nil { voice = AVSpeechSynthesisVoice(language: call.getString("lang") ?? "en-GB") }
        utterance.voice = voice
        utterance.rate = SpeechAudioPlugin.pace(call.getFloat("rate") ?? 1)
        utterance.pitchMultiplier = max(0.5, min(2, call.getFloat("pitch") ?? 1))
        utterance.volume = 1
        let job = Job(call: call, utterance: utterance)
        work.async {
            self.jobs.append(job)
            let buffers: AVSpeechSynthesizer.BufferCallback = { [weak self] buffer in
                self?.work.async { self?.take(buffer, job) }
            }
            if #available(iOS 16.0, *) {
                self.synth.write(utterance, toBufferCallback: buffers, toMarkerCallback: { [weak self] markers in
                    self?.work.async {
                        for m in markers where m.mark == .word && job.marks.count < 400 {
                            job.marks.append((at: m.textRange.location, bytes: Int(m.byteSampleOffset)))
                        }
                    }
                })
            } else {
                self.synth.write(utterance, toBufferCallback: buffers)
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        work.async {
            self.synth.stopSpeaking(at: .immediate)
            for job in self.jobs where !job.done { job.done = true; SpeechAudioPlugin.fail(job.call, "stopped") }
            self.jobs.removeAll()
            call.resolve()
        }
    }

    /// One piece of the line's sound, added to the job as 16-bit mono. A piece with no sound in it is the end.
    private func take(_ buffer: AVAudioBuffer, _ job: Job) {
        if job.done { return }
        guard let b = buffer as? AVAudioPCMBuffer else { return }
        let frames = Int(b.frameLength)
        if frames == 0 { finish(job); return }
        job.last = Date()
        let format = b.format
        if job.rate == 0 {
            job.rate = format.sampleRate
            job.bytesPerFrame = Double(max(1, format.streamDescription.pointee.mBytesPerFrame))
        }
        let channels = Int(format.channelCount)
        let step = b.stride                                    // 1 when each channel has its own run of samples
        let together = format.isInterleaved
        var out = [Int16](repeating: 0, count: frames)
        if let f = b.floatChannelData {
            for i in 0..<frames {
                var sum: Float = 0
                for c in 0..<channels { sum += together ? f[0][i * step + c] : f[c][i * step] }
                let v = sum / Float(channels)
                out[i] = v.isFinite ? Int16(max(-1, min(1, v)) * 32767) : 0
            }
        } else if let s = b.int16ChannelData {
            for i in 0..<frames {
                var sum: Int = 0
                for c in 0..<channels { sum += Int(together ? s[0][i * step + c] : s[c][i * step]) }
                out[i] = Int16(sum / channels)
            }
        } else if let l = b.int32ChannelData {
            for i in 0..<frames {
                var sum: Int64 = 0
                for c in 0..<channels { sum += Int64(together ? l[0][i * step + c] : l[c][i * step]) }
                out[i] = Int16(truncatingIfNeeded: (sum / Int64(channels)) >> 16)
            }
        } else {
            end(job, "the voice wrote sound in a form this can't read")
            return
        }
        out.withUnsafeBufferPointer { job.pcm.append($0) }   // (iPhones are little-endian)
        if job.pcm.count > SpeechAudioPlugin.maxBytes { synth.stopSpeaking(at: .immediate); end(job, "the line is too long") }
    }

    private func end(_ job: Job, _ why: String) {
        if job.done { return }
        job.done = true
        jobs.removeAll { $0 === job }
        SpeechAudioPlugin.fail(job.call, why)
    }

    private func finish(_ job: Job) {
        if job.done { return }
        if job.pcm.isEmpty || job.rate < 4000 { end(job, "the voice wrote no sound"); return }
        job.done = true
        jobs.removeAll { $0 === job }
        var marks: [Double] = []
        for m in job.marks {
            marks.append(Double(m.at))
            marks.append(Double(m.bytes) / job.bytesPerFrame / job.rate)
        }
        job.call.resolve(["ok": true, "rate": Int(job.rate), "pcm": job.pcm.base64EncodedString(), "marks": marks])
    }

    // some versions of iOS end a written line here and never send the empty last piece: finish once no
    // more sound has come for a moment
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        work.async {
            if let job = self.jobs.first(where: { $0.utterance === utterance }) { self.settle(job) }
        }
    }

    private func settle(_ job: Job) {
        work.asyncAfter(deadline: .now() + 0.3) {
            if job.done { return }
            if Date().timeIntervalSince(job.last) < 0.25 { self.settle(job) } else { self.finish(job) }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        work.async {
            if let job = self.jobs.first(where: { $0.utterance === utterance }) { self.end(job, "stopped") }
        }
    }
}
