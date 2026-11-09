// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Gnani STT API Route
// Receives audio from the browser, forwards to Gnani Prisma v2.5 STT.
//
// Gnani Prisma v2.5 endpoint:  POST https://api.vachana.ai/stt/v3
// Auth:                         X-API-Key-ID header (plain value, NOT Bearer)
// Key stays server-side, NEVER forwarded to browser.
// Falls back gracefully when key is not configured.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { loadGnaniConfig } from "@/lib/gnani/client";
import { TranscriptionResultSchema } from "@/lib/ai/schemas";

export async function POST(req: NextRequest) {
  // Gnani config (null = not configured)
  const gnani = loadGnaniConfig();

  if (!gnani) {
    // Key not configured, return a clear signal so VoiceRecorder falls back
    return NextResponse.json(
      { error: "Gnani STT not configured. Set GNANI_API_KEY in .env.local." },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const language = (formData.get("language") as string) || "hi-IN";

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Validate audio size (max 10MB)
    if (audioFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file too large (max 10MB)" }, { status: 413 });
    }

    // Forward to Gnani Prisma v2.5 STT.
    // Field names are Gnani-specific: audio_file, language_code.
    // Auth: X-API-Key-ID header (plain value, NOT Authorization: Bearer).
    // No `model` field, Prisma v2.5 is the only model on /stt/v3.
    // format=transcribe enables inverse text normalization (digits as words, etc.)
    const gnaniForm = new FormData();
    gnaniForm.append("audio_file", audioFile);
    gnaniForm.append("language_code", language);
    gnaniForm.append("format", "transcribe");

    const gnaniRes = await fetch(gnani.sttUrl, {
      method: "POST",
      headers: {
        "X-API-Key-ID": gnani.apiKey,
        // Do NOT set Content-Type, let fetch set multipart boundary automatically
      },
      body: gnaniForm,
    });

    if (!gnaniRes.ok) {
      const errText = await gnaniRes.text().catch(() => "");
      console.error(`[Gnani STT] Error ${gnaniRes.status}: ${errText}`);
      return NextResponse.json(
        { error: `Gnani STT error: ${gnaniRes.status}` },
        { status: 502 }
      );
    }

    const gnaniData = await gnaniRes.json();

    // Validate and normalize Gnani response
    const result = TranscriptionResultSchema.parse({
      transcript: gnaniData.transcript ?? gnaniData.text ?? "",
      confidence: gnaniData.confidence,
      language: gnaniData.language ?? language,
      durationSeconds: gnaniData.duration,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Gnani STT] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal transcription error" },
      { status: 500 }
    );
  }
}