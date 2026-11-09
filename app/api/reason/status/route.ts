// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, reasoning provider check
// Open /api/reason/status in the browser to see whether the configured provider
// accepts the key. It makes one small request that lists models (no analysis, no
// job data) and reports only yes/no facts. The key itself is never returned.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { cleanEnvValue } from "@/lib/ai/reasoner";

export const dynamic = "force-dynamic";

function describeKeyShape(raw: string | undefined, base: string): string[] {
  const notes: string[] = [];
  if (!raw) return ["No key is set"];
  const trimmed = raw.trim();
  if (trimmed !== raw) notes.push("The key has spaces around it (they are removed automatically)");
  if (/^(['"`]).*\1$/.test(trimmed)) notes.push("The key is wrapped in quotes (removed automatically)");
  if (/^bearer\s/i.test(trimmed)) notes.push('The key starts with "Bearer" (removed automatically)');
  const key = cleanEnvValue(raw);
  if (/your_key|your-key|changeme|example|xxxx/i.test(key)) notes.push("The key still looks like the placeholder from .env.example");
  if (base.includes("groq.com") && !key.startsWith("gsk_")) notes.push('A Groq key normally starts with "gsk_"');
  if (/\s/.test(key)) notes.push("The key contains a space or line break in the middle");
  return notes;
}

export async function GET() {
  const provider = process.env.REASONING_PROVIDER ?? "demo";
  if (provider !== "openai-compatible") {
    return NextResponse.json({
      provider,
      message:
        provider === "demo"
          ? "The demo provider is active. It returns a fixed checklist and does not read the conversation."
          : `Provider "${provider}" is active. This check only covers openai-compatible.`,
    });
  }

  const rawKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  const base = cleanEnvValue(process.env.OPENAI_COMPATIBLE_BASE_URL);
  const key = cleanEnvValue(rawKey);
  const model = cleanEnvValue(process.env.OPENAI_COMPATIBLE_MODEL);
  const notes = describeKeyShape(rawKey, base);

  const out: Record<string, unknown> = {
    provider,
    host: base ? new URL(base).host : null,
    model: model || null,
    keyPresent: Boolean(key),
    keyLength: key.length,
    notes,
  };

  if (!base || !key) {
    out.message = "The base URL or the key is missing in .env.local.";
    return NextResponse.json(out, { status: 200 });
  }

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    out.providerStatus = res.status;
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { data?: { id: string }[] };
      const ids = (data.data ?? []).map((m) => m.id);
      out.keyAccepted = true;
      out.modelAvailable = model ? ids.includes(model) : null;
      out.message = out.modelAvailable === false
        ? `The key works, but "${model}" is not in the provider's list. Check OPENAI_COMPATIBLE_MODEL.`
        : "The key works and the model is available.";
    } else {
      out.keyAccepted = false;
      out.message =
        res.status === 401 || res.status === 403
          ? "The provider rejected this key. Create a new key in the provider console, paste only the key into .env.local, and restart the server."
          : `The provider answered with error ${res.status}.`;
    }
  } catch {
    out.message = "Could not reach the provider from this computer. Check the internet connection and the base URL.";
  }
  return NextResponse.json(out);
}