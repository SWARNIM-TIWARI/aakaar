// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Gnani API Client Constants & Types
// Real Gnani STT/TTS calls happen in API routes (server-side only).
// Keys MUST stay server-side, never NEXT_PUBLIC_*.
// ──────────────────────────────────────────────────────────────────────────────

// ── Gnani model identifiers ───────────────────────────────────────────────────

/**
 * Gnani Prisma v2.5, Speech-to-Text model identifier.
 * NOTE: The STT v3 endpoint does NOT accept a `model` body field;
 * this constant is kept for documentation/display purposes only.
 */
export const GNANI_STT_MODEL = "prisma-v2.5";

/** Gnani Timbre v3.0, Text-to-Speech */
export const GNANI_TTS_MODEL = "timbre-v3.0";

/**
 * Default TTS voice for Hindi (timbre-v3.0 catalog).
 * Override via voiceId in GnaniTTSRequest.
 */
export const GNANI_TTS_DEFAULT_VOICE = "Avinash";

// ── Supported languages ───────────────────────────────────────────────────────

// Language codes use BCP-47 region subtags as documented by the Gnani STT REST API.
// "hi" and "ta" (without region) are NOT accepted, use "hi-IN" and "ta-IN".
export const GNANI_SUPPORTED_LANGUAGES = [
  { code: "hi-IN", label: "Hindi", labelNative: "हिन्दी" },
  { code: "en-IN", label: "Indian English", labelNative: "English (India)" },
  { code: "ta-IN", label: "Tamil", labelNative: "தமிழ்" },
  { code: "te-IN", label: "Telugu", labelNative: "తెలుగు" },
  { code: "kn-IN", label: "Kannada", labelNative: "ಕನ್ನಡ" },
  { code: "mr-IN", label: "Marathi", labelNative: "मराठी" },
  { code: "bn-IN", label: "Bengali", labelNative: "বাংলা" },
  { code: "gu-IN", label: "Gujarati", labelNative: "ગુજરાતી" },
  { code: "pa-IN", label: "Punjabi", labelNative: "ਪੰਜਾਬੀ" },
  { code: "ml-IN", label: "Malayalam", labelNative: "മലയാളം" },
] as const;

export type GnaniLanguageCode =
  (typeof GNANI_SUPPORTED_LANGUAGES)[number]["code"];

// ── Request / Response types ──────────────────────────────────────────────────

export interface GnaniSTTRequest {
  audioData: Buffer | ArrayBuffer;
  language: GnaniLanguageCode;
  /** Mime type of audio, e.g. "audio/webm;codecs=opus" */
  mimeType: string;
  /** Enable code-switching detection (Hindi+English, etc.) */
  detectCodeSwitch?: boolean;
}

export interface GnaniSTTResponse {
  transcript: string;
  confidence: number;
  language: string;
  durationSeconds?: number;
  words?: { word: string; start: number; end: number; confidence: number }[];
}

export interface GnaniTTSRequest {
  text: string;
  language: GnaniLanguageCode;
  /** Voice identifier, Gnani-specific */
  voiceId?: string;
  /** Speaking rate: 0.5 to 2.0 */
  rate?: number;
}

export interface GnaniTTSResponse {
  /** Base64-encoded MP3 audio */
  audioBase64: string;
  durationSeconds?: number;
  mimeType: string;
}

// ── Config helper ─────────────────────────────────────────────────────────────

export interface GnaniConfig {
  apiKey: string;
  sttUrl: string;
  ttsUrl: string;
}

/**
 * Load Gnani config from environment variables.
 * Call only on the server side.
 * Returns null if keys are not configured (browser fallback will be used).
 */
export function loadGnaniConfig(): GnaniConfig | null {
  // Tolerate stray spaces or quotes pasted around the key.
  const apiKey = process.env.GNANI_API_KEY?.trim().replace(/^["']|["']$/g, "").trim();
  const sttUrl =
    process.env.GNANI_STT_URL ?? "https://api.vachana.ai/stt/v3";
  const ttsUrl =
    process.env.GNANI_TTS_URL ?? "https://api.vachana.ai/api/v1/tts/inference";

  if (!apiKey) return null;
  return { apiKey, sttUrl, ttsUrl };
}