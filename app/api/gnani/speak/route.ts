// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Gnani TTS API Route
// Converts text to speech using Gnani Timbre v3.0.
//
// Gnani Timbre v3.0 endpoint:  POST https://api.vachana.ai/api/v1/tts/inference
// Auth:                         X-API-Key-ID header (plain value, NOT Bearer)
// Response:                     Raw binary audio (wav/mp3/ogg), NOT JSON
// Key stays server-side, NEVER forwarded to browser.
// Falls back gracefully when key is not configured.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { loadGnaniConfig, GNANI_TTS_MODEL, GNANI_TTS_DEFAULT_VOICE } from "@/lib/gnani/client";
import { z } from "zod";

const RequestSchema = z.object({
  text: z.string().min(1).max(500),
  language: z.string().default("hi-IN"),
  /** Gnani voice name from the timbre-v3.0 catalog, e.g. "Avinash", "Shivani" */
  voiceId: z.string().optional(),
  /**
   * Speaking speed. Gnani Timbre v3.0 supports 0.85 to 1.15.
   * Values outside this range are clamped server-side before the API call.
   */
  speed: z.number().min(0.5).max(2.0).default(1.0),
});

export async function POST(req: NextRequest) {
  const gnani = loadGnaniConfig();

  if (!gnani) {
    return NextResponse.json(
      { error: "Gnani TTS not configured. Set GNANI_API_KEY in .env.local." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { text, language, voiceId, speed } = parsed.data;

    // Gnani Timbre v3.0 only supports speed 0.85 to 1.15; clamp to that range.
    const clampedSpeed = Math.min(1.15, Math.max(0.85, speed));

    const gnaniRes = await fetch(gnani.ttsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Auth: X-API-Key-ID (plain value, NOT Authorization: Bearer)
        "X-API-Key-ID": gnani.apiKey,
      },
      body: JSON.stringify({
        text,
        model: GNANI_TTS_MODEL,
        // `voice` is the Gnani field name (NOT voice_id)
        voice: voiceId ?? GNANI_TTS_DEFAULT_VOICE,
        language,
        speed: clampedSpeed,
        // audio_config is required by the Timbre v3.0 API.
        // For MP3 container: do NOT pass `encoding` (it is only for PCM/ogg),
        // and bitrate must be a string like "64k" (NOT a number).
        audio_config: {
          sample_rate: 24000,
          num_channels: 1,
          sample_width: 2,
          container: "mp3",
          bitrate: "64k",
        },
      }),
    });

    if (!gnaniRes.ok) {
      const errText = await gnaniRes.text().catch(() => "");
      console.error(`[Gnani TTS] Error ${gnaniRes.status}: ${errText}`);
      return NextResponse.json(
        { error: `Gnani TTS error: ${gnaniRes.status}` },
        { status: 502 }
      );
    }

    // Gnani TTS returns raw binary audio, NOT a JSON body.
    // Convert the binary buffer to base64 so the browser can play it.
    const audioBuffer = await gnaniRes.arrayBuffer();

    if (audioBuffer.byteLength === 0) {
      console.error("[Gnani TTS] Empty audio response");
      return NextResponse.json(
        { error: "Gnani TTS returned empty audio" },
        { status: 502 }
      );
    }

    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({
      audioBase64,
      // audio/mpeg is the correct MIME type for MP3
      mimeType: "audio/mpeg",
    });
  } catch (err) {
    console.error("[Gnani TTS] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal TTS error" },
      { status: 500 }
    );
  }
}