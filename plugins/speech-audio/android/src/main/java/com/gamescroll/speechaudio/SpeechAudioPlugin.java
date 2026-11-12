package com.gamescroll.speechaudio;

import android.media.AudioFormat;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The phone's own text-to-speech engine writes a line to sound instead of speaking it, so the game
 * can play it through its own mixer (src/kit/sound.js): a treatment for each character, the room's
 * echo, the same loudness on every phone.
 *
 *   render({ text, lang, voiceURI?, rate, pitch }) ->
 *       { ok: true, rate: samples a second, pcm: base64 of 16-bit little-endian mono samples,
 *         marks: [character index, seconds, ...] where the engine says each word starts (often none) }
 *       or { ok: false, reason }
 *   cancel() -> stops whatever is being written
 *
 * voiceURI is android.speech.tts.Voice.getName(), which is what the Text to Speech plugin lists.
 * Nothing here plays a sound or uses the network; the engine may, for a voice that needs it.
 */
@CapacitorPlugin(name = "SpeechAudio")
public class SpeechAudioPlugin extends Plugin {
    private static final int MAX_BYTES = 12 * 1024 * 1024;   // about two minutes of speech: far more than a line

    private static final class Job {
        final PluginCall call;
        final File file;
        final ArrayList<Double> marks = new ArrayList<>();
        int rate = 0, format = AudioFormat.ENCODING_PCM_16BIT, channels = 1;
        Job(PluginCall call, File file) { this.call = call; this.file = file; }
    }

    private final Object lock = new Object();
    private final Map<String, Job> jobs = new ConcurrentHashMap<>();
    private final ArrayList<Runnable> waiting = new ArrayList<>();
    private final Map<String, Voice> voices = new HashMap<>();   // the engine's voices by name (asking for the list each line is slow); under `lock`
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private TextToSpeech tts;
    private int state = 0;   // 0 not started, 1 starting, 2 ready, -1 no engine
    private final AtomicInteger seq = new AtomicInteger();

    /** Runs `then` once the engine is ready (true) or can't be had (false). */
    private void engine(final java.util.function.Consumer<Boolean> then) {
        synchronized (lock) {
            if (state == 2) { then.accept(true); return; }
            if (state == -1) { then.accept(false); return; }
            waiting.add(() -> then.accept(state == 2));
            if (state == 1) return;
            state = 1;
        }
        try {
            tts = new TextToSpeech(getContext().getApplicationContext(), status -> {
                ArrayList<Runnable> run;
                synchronized (lock) {
                    state = status == TextToSpeech.SUCCESS ? 2 : -1;
                    if (state == 2) tts.setOnUtteranceProgressListener(listener);
                    run = new ArrayList<>(waiting);
                    waiting.clear();
                }
                for (Runnable r : run) r.run();
            });
        } catch (Exception e) {
            ArrayList<Runnable> run;
            synchronized (lock) { state = -1; run = new ArrayList<>(waiting); waiting.clear(); }
            for (Runnable r : run) r.run();
        }
    }

    private static void fail(PluginCall call, String why) {
        JSObject o = new JSObject();
        o.put("ok", false);
        o.put("reason", why);
        call.resolve(o);
    }

    @PluginMethod
    public void render(final PluginCall call) {
        final String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) { fail(call, "no text"); return; }
        engine(ok -> {
            if (!ok) { fail(call, "no speech engine"); return; }
            File file = null;
            try {
                file = File.createTempFile("say", ".wav", getContext().getCacheDir());
                final String id = "gs-say-" + seq.incrementAndGet();
                final Job job = new Job(call, file);
                int res;
                synchronized (lock) {
                    // the voice, pace and pitch are read by the engine when the line is queued, so set and queue together
                    String uri = call.getString("voiceURI", "");
                    Voice voice = null;
                    if (uri != null && !uri.isEmpty()) {
                        voice = voices.get(uri);
                        if (voice == null) {
                            Set<Voice> all = tts.getVoices();
                            if (all != null) for (Voice v : all) voices.put(v.getName(), v);
                            voice = voices.get(uri);
                        }
                    }
                    if (voice != null) tts.setVoice(voice);
                    else {
                        String lang = call.getString("lang", "en-GB");
                        tts.setLanguage(Locale.forLanguageTag(lang == null ? "en-GB" : lang));
                    }
                    tts.setSpeechRate(clamp(call.getFloat("rate", 1f), .25f, 4f));
                    tts.setPitch(clamp(call.getFloat("pitch", 1f), .25f, 4f));
                    String say = text.length() > TextToSpeech.getMaxSpeechInputLength() ? text.substring(0, TextToSpeech.getMaxSpeechInputLength()) : text;
                    jobs.put(id, job);
                    res = tts.synthesizeToFile(say, new Bundle(), file, id);
                }
                if (res != TextToSpeech.SUCCESS) { jobs.remove(id); file.delete(); fail(call, "the engine would not take the line"); }
            } catch (Exception e) {
                if (file != null) file.delete();
                fail(call, String.valueOf(e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        synchronized (lock) { if (state == 2) try { tts.stop(); } catch (Exception e) { /* nothing was running */ } }
        for (String id : new ArrayList<>(jobs.keySet())) end(id, "stopped");
        call.resolve();
    }

    private static float clamp(Float v, float lo, float hi) { return v == null || v.isNaN() ? 1f : Math.max(lo, Math.min(hi, v)); }

    /** Ends a job that produced nothing. */
    private void end(String id, String why) {
        Job job = jobs.remove(id);
        if (job == null) return;
        job.file.delete();
        fail(job.call, why);
    }

    private final UtteranceProgressListener listener = new UtteranceProgressListener() {
        @Override public void onStart(String id) { }

        @Override public void onBeginSynthesis(String id, int sampleRateInHz, int audioFormat, int channelCount) {
            Job job = jobs.get(id);
            if (job != null) { job.rate = sampleRateInHz; job.format = audioFormat; job.channels = Math.max(1, channelCount); }
        }

        @Override public void onRangeStart(String id, int start, int end, int frame) {
            Job job = jobs.get(id);
            if (job != null && job.rate > 0 && job.marks.size() < 800) { job.marks.add((double) start); job.marks.add(frame / (double) job.rate); }
        }

        @Override public void onDone(final String id) {
            final Job job = jobs.remove(id);
            if (job == null) return;
            io.execute(() -> {
                try {
                    JSObject o = read(job);
                    job.call.resolve(o);
                } catch (Exception e) {
                    fail(job.call, String.valueOf(e.getMessage()));
                } finally {
                    job.file.delete();
                }
            });
        }

        @Override public void onError(String id) { end(id, "the engine could not say it"); }

        @Override public void onError(String id, int errorCode) { end(id, "the engine could not say it (" + errorCode + ")"); }

        @Override public void onStop(String id, boolean interrupted) { end(id, "stopped"); }
    };

    /** The written file as { ok, rate, pcm, marks }: its sound as 16-bit mono, whatever the engine wrote. */
    private static JSObject read(Job job) throws Exception {
        long size = job.file.length();
        if (size <= 44 || size > MAX_BYTES) throw new Exception(size <= 44 ? "the engine wrote no sound" : "the line is too long");
        byte[] b = new byte[(int) size];
        try (InputStream in = new FileInputStream(job.file)) {
            int at = 0;
            while (at < b.length) { int n = in.read(b, at, b.length - at); if (n < 0) break; at += n; }
        }
        ByteBuffer bb = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN);
        // a WAV file: "RIFF" size "WAVE", then chunks; "fmt " says what the samples are and "data" holds them
        int rate = job.rate, channels = job.channels, bits = job.format == AudioFormat.ENCODING_PCM_8BIT ? 8 : job.format == AudioFormat.ENCODING_PCM_FLOAT ? 32 : 16;
        boolean isFloat = job.format == AudioFormat.ENCODING_PCM_FLOAT;
        int from = 44, len = b.length - 44;
        if (b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F') {
            int p = 12;
            while (p + 8 <= b.length) {
                int chunk = bb.getInt(p + 4);
                boolean fmt = b[p] == 'f' && b[p + 1] == 'm' && b[p + 2] == 't' && b[p + 3] == ' ';
                boolean data = b[p] == 'd' && b[p + 1] == 'a' && b[p + 2] == 't' && b[p + 3] == 'a';
                if (fmt && p + 24 <= b.length) {
                    int tag = bb.getShort(p + 8) & 0xffff;
                    channels = Math.max(1, bb.getShort(p + 10) & 0xffff);
                    rate = bb.getInt(p + 12);
                    bits = bb.getShort(p + 22) & 0xffff;
                    isFloat = tag == 3;
                } else if (data) {
                    from = p + 8;
                    len = chunk <= 0 || from + chunk > b.length ? b.length - from : chunk;   // (a size the engine never went back to fill in: the rest of the file)
                    break;
                }
                if (chunk < 0) break;
                p += 8 + chunk + (chunk & 1);
            }
        }
        if (rate < 4000 || rate > 192000) throw new Exception("an odd sample rate: " + rate);
        int bytesPer = Math.max(1, bits / 8), frames = len / (bytesPer * channels);
        if (frames < 1) throw new Exception("the engine wrote no sound");
        ByteArrayOutputStream out = new ByteArrayOutputStream(frames * 2);
        for (int i = 0; i < frames; i++) {
            float sum = 0;
            for (int c = 0; c < channels; c++) {
                int at = from + (i * channels + c) * bytesPer;
                float v;
                if (isFloat && bytesPer == 4) v = bb.getFloat(at);
                else if (bytesPer == 1) v = ((b[at] & 0xff) - 128) / 128f;
                else if (bytesPer == 2) v = bb.getShort(at) / 32768f;
                else if (bytesPer == 3) v = ((b[at] & 0xff) | ((b[at + 1] & 0xff) << 8) | (b[at + 2] << 16)) / 8388608f;
                else v = bb.getInt(at) / 2147483648f;
                sum += v;
            }
            int s = Math.round(Math.max(-1f, Math.min(1f, sum / channels)) * 32767f);
            out.write(s & 0xff);
            out.write((s >> 8) & 0xff);
        }
        JSObject o = new JSObject();
        o.put("ok", true);
        o.put("rate", rate);
        o.put("pcm", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
        JSArray marks = new JSArray();
        for (Double m : job.marks) marks.put(m);
        o.put("marks", marks);
        return o;
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) {
            if (tts != null) try { tts.stop(); tts.shutdown(); } catch (Exception e) { /* already gone */ }
            tts = null;
            state = 0;
            voices.clear();
        }
        io.shutdown();
    }
}
