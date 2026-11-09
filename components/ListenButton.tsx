"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";

type TtsState = "idle" | "loading" | "playing" | "error";

interface Props {
  /** Text to read aloud. Sent to Gnani Timbre through our server route. */
  text: string;
  /** Gnani language code, or "auto". Use "hi-IN" for Hindi text. */
  language?: string;
  /** Visible label, e.g. "Listen" or "सुनो". */
  label?: string;
}

const MAX_CHARS = 500; // matches /api/gnani/speak

function clip(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const cut = text.slice(0, MAX_CHARS);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("।"));
  return stop > 120 ? cut.slice(0, stop + 1) : cut;
}

/**
 * Reads text aloud with Gnani Timbre. Audio is only generated when the person
 * presses the button; nothing plays automatically. The API key stays on the server.
 */
export default function ListenButton({ text, language = "auto", label = "Listen" }: Props) {
  const [state, setState] = useState<TtsState>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  async function toggle() {
    if (state === "playing" || state === "loading") {
      audioRef.current?.pause();
      audioRef.current = null;
      setState("idle");
      return;
    }
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/gnani/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clip(text), language }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setError(typeof body.error === "string" ? body.error : `Voice error ${res.status}`);
        setState("error");
        return;
      }
      const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
      if (!data.audioBase64) {
        setError("No audio came back.");
        setState("error");
        return;
      }
      const audio = new Audio(`data:${data.mimeType ?? "audio/mpeg"};base64,${data.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => {
        setError("Playback failed.");
        setState("error");
      };
      await audio.play();
      setState("playing");
    } catch {
      setError("Could not reach the voice service.");
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        className="btn btn-quiet"
        style={{ minHeight: "2.25rem", padding: "0.25rem 0.75rem" }}
        aria-label={state === "playing" ? "Stop audio" : `${label}, read aloud`}
      >
        {state === "loading" ? (
          <Loader2 size={15} className="animate-spin" aria-hidden={true} />
        ) : state === "playing" ? (
          <Square size={14} aria-hidden={true} />
        ) : (
          <Volume2 size={15} aria-hidden={true} />
        )}
        <span className="font-devanagari">{state === "playing" ? "Stop" : label}</span>
      </button>
      {state === "error" && error && (
        <span className="t-meta" style={{ color: "var(--color-sindoor)" }} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}