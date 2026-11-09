"use client";

// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, VoiceRecorder  (v3.2)
//
// Fix 3 changes:
//  • Explicit consent required before audio is sent to Gnani (no background upload)
//  • Mode is chosen BEFORE recording: "Gnani Prisma STT" vs "Browser mic"
//  • Recorded audio is converted to WAV PCM 16-bit mono before upload
//    (Gnani STT endpoint supports WAV, MP3, OGG, FLAC, AAC, M4A, not WebM)
//  • 60-second hard cap on recording length
//  • Browser SpeechRecognition runs during live speech, never applied to an
//    already-recorded blob
//  • Transcription source is passed back to caller via onTranscript
//  • Error states are explicit; no silent swallowing of Gnani failures
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Loader2, X } from "lucide-react";

// ── Browser Speech Recognition type shims ────────────────────────────────────
// @types/dom-speech-recognition is not installed; declare the minimal surface
// we use so TypeScript is happy. At runtime, the API is in window.

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionStatic {
  new (): SpeechRecognitionInstance;
}

/** Who performed the transcription. Passed to onTranscript so callers can
 *  choose whether to store it as a transcript vs. a manual note. */
export type TranscriptionSource = "gnani_prisma" | "browser_speech";

interface Props {
  onTranscript: (text: string, source: TranscriptionSource) => void;
  language?: string;
  disabled?: boolean;
}

type RecordMode = "gnani" | "browser";
type RecordState =
  | "idle"
  | "mode_select"   // choosing Gnani vs browser mic
  | "recording"     // MediaRecorder running (gnani mode)
  | "browser_live"  // SpeechRecognition active (browser mode)
  | "processing"    // converting WAV + uploading
  | "error";

// Gnani STT (Prisma) accepts at most 30 seconds of audio per request.
// Auto-stop at 30s so a long brief is never silently truncated.
const MAX_DURATION_SEC = 30;

export default function VoiceRecorder({
  onTranscript,
  language = "hi-IN",
  disabled = false,
}: Props) {
  const [state, setState] = useState<RecordState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0); // seconds recorded

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  // ── Mode select ─────────────────────────────────────────────────────────────

  function openModeSelect() {
    setError(null);
    setState("mode_select");
  }

  function cancelModeSelect() {
    setState("idle");
  }

  // ── Gnani mode (record → WAV → upload) ──────────────────────────────────────

  const startGnaniRecording = useCallback(async () => {
    setState("recording");
    setElapsed(0);
    setError(null);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Could not access microphone. Check browser permissions.");
      setState("idle");
      return;
    }

    const mr = new MediaRecorder(stream);
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      setState("processing");

      const rawBlob = new Blob(chunksRef.current);
      if (rawBlob.size === 0) {
        setError("No audio captured. Try again.");
        setState("idle");
        return;
      }

      // Convert to WAV PCM (Gnani does not list WebM in its supported formats)
      let wavBlob: Blob;
      try {
        wavBlob = await convertBlobToWav(rawBlob);
      } catch (convErr) {
        console.error("[VoiceRecorder] WAV conversion failed:", convErr);
        setError("Audio conversion failed. Please type your input.");
        setState("idle");
        return;
      }

      // File-size guard (~10 MB, Gnani's documented limit)
      if (wavBlob.size > 10 * 1024 * 1024) {
        setError("Recording too long, please keep it under 30 seconds.");
        setState("idle");
        return;
      }

      // Upload to Gnani via server-side proxy
      const form = new FormData();
      form.append("audio", wavBlob, "recording.wav");
      form.append("language", language);

      try {
        const res = await fetch("/api/gnani/transcribe", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
          const msg = typeof errBody.error === "string" ? errBody.error : `Gnani STT error ${res.status}`;
          setError(`${msg}. Please type your input.`);
          setState("error");
          return;
        }

        const data = (await res.json()) as { transcript?: string };
        const transcript = data.transcript?.trim();

        if (!transcript) {
          setError("Gnani returned an empty transcript. Please try again or type.");
          setState("error");
          return;
        }

        onTranscript(transcript, "gnani_prisma");
        setState("idle");
      } catch (fetchErr) {
        console.error("[VoiceRecorder] Gnani upload error:", fetchErr);
        setError("Could not reach transcription service. Please type your input.");
        setState("error");
      }
    };

    mr.start(250); // collect chunks every 250ms

    // Elapsed timer + 30s auto-stop (Gnani STT limit)
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (next >= MAX_DURATION_SEC) {
          mr.stop();
        }
        return next;
      });
    }, 1000);
  }, [language, onTranscript]);

  function stopGnaniRecording() {
    mediaRecorderRef.current?.stop();
  }

  // ── Browser speech recognition mode ─────────────────────────────────────────

  const startBrowserRecording = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionStatic;
      webkitSpeechRecognition?: SpeechRecognitionStatic;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!Ctor) {
      setError("This browser has no speech recognition. Use the Gnani option or type your input.");
      setState("idle");
      return;
    }

    setState("browser_live");
    setError(null);

    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      if (text) {
        onTranscript(text, "browser_speech");
      }
      setState("idle");
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError("This browser could not run speech recognition (Brave blocks it). Use the Gnani option, try Chrome or Edge, or type your input.");
        setState("error");
      } else {
        setState("idle");
      }
    };

    recognition.onend = () => {
      if (state === "browser_live") setState("idle");
    };

    recognition.start();
  }, [language, onTranscript, state]);

  function stopBrowserRecording() {
    recognitionRef.current?.stop();
  }

  // ── Choose mode ──────────────────────────────────────────────────────────────

  function chooseMode(mode: RecordMode) {
    if (mode === "gnani") {
      startGnaniRecording();
    } else {
      startBrowserRecording();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (state === "mode_select") {
    return (
      <div className="sheet w-full max-w-xl" role="group" aria-label="Choose how to capture your voice">
        <div className="rule-b px-4 py-3">
          <p className="font-bold">How should we capture your voice?</p>
          <p className="t-support">Nothing is recorded until you choose one of these.</p>
        </div>
        <button
          type="button"
          onClick={() => chooseMode("gnani")}
          className="w-full text-left px-4 py-3 rule-b hover:bg-[var(--color-canvas)]"
        >
          <span className="block font-bold" style={{ color: "var(--color-indigo)" }}>Record and send to Gnani Prisma</span>
          <span className="block t-support">
            Up to 30 seconds. Your recording is uploaded to Gnani for transcription and is not stored by AAKAAR.
            Press only if you agree. Use invented or non private speech for demos.
          </span>
        </button>
        <button
          type="button"
          onClick={() => chooseMode("browser")}
          className="w-full text-left px-4 py-3 rule-b hover:bg-[var(--color-canvas)]"
        >
          <span className="block font-bold">Use this browser&rsquo;s speech recognition</span>
          <span className="block t-support">
            Handled by your browser (works in Chrome and Edge, not in Brave). Nothing is sent to Gnani.
          </span>
        </button>
        <div className="px-4 py-2">
          <button type="button" onClick={cancelModeSelect} className="btn btn-text" style={{ paddingLeft: 0 }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const isActive = state === "recording" || state === "browser_live";
  const isProcessing = state === "processing";

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || isProcessing}
          onClick={
            state === "recording"
              ? stopGnaniRecording
              : state === "browser_live"
              ? stopBrowserRecording
              : openModeSelect
          }
          className={[
            "w-12 h-12 rounded-full flex items-center justify-center border-2",
            isActive
              ? "bg-[var(--color-sindoor)] border-[var(--color-sindoor)] text-white recording-pulse"
              : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-indigo)]",
            disabled || isProcessing ? "opacity-50" : "",
          ].join(" ")}
          aria-label={isActive ? "Stop recording" : "Start voice input"}
        >
          {isProcessing ? (
            <Loader2 size={20} className="animate-spin" aria-hidden={true} />
          ) : isActive ? (
            <Square size={18} fill="white" aria-hidden={true} />
          ) : (
            <Mic size={20} aria-hidden={true} />
          )}
        </button>

        <span className="t-body" role="status" aria-live="polite">
          {state === "idle" && "Tap to speak"}
          {state === "recording" && <>Recording, {elapsed}s of {MAX_DURATION_SEC}s. Tap to stop.</>}
          {state === "browser_live" && "Listening. Speak now, then tap to stop."}
          {state === "processing" && "Sending to Gnani Prisma for transcription"}
        </span>
      </div>

      {(state === "error" || error) && error && (
        <div
          className="flex items-start gap-3 px-3 py-2 max-w-xl t-body"
          role="alert"
          style={{
            borderLeft: "3px solid var(--color-sindoor)",
            background: "color-mix(in srgb, var(--color-sindoor) 7%, var(--color-surface))",
          }}
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => { setError(null); setState("idle"); }}
            className="btn btn-text"
            aria-label="Dismiss error"
          >
            <X size={14} aria-hidden={true} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── WAV conversion ────────────────────────────────────────────────────────────

/**
 * Decode any browser-recorded audio blob (WebM/Opus, MP4, etc.) and
 * re-encode as 16-bit mono WAV PCM at the original sample rate.
 *
 * Supported by all modern browsers via the Web Audio API.
 */
async function convertBlobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const mono = mixToMono(decoded);
    const wavBuffer = encodeWavPcm(mono, decoded.sampleRate);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    await audioCtx.close();
  }
}

/** Mix all channels down to mono. */
function mixToMono(buf: AudioBuffer): Float32Array {
  const n = buf.length;
  const nc = buf.numberOfChannels;
  const out = new Float32Array(n);
  for (let ch = 0; ch < nc; ch++) {
    const channel = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) out[i] += channel[i] / nc;
  }
  return out;
}

/** Encode Float32 samples as a 16-bit PCM WAV file (RIFF/WAVE). */
function encodeWavPcm(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  function writeStr(offset: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM = 1
  view.setUint16(22, 1, true);           // 1 channel (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, Math.round(clamped * 0x7fff), true);
    offset += 2;
  }

  return buffer;
}