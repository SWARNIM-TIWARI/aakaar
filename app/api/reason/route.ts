// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Reasoning API Route
// Reads job from request body, runs analysis via the configured provider,
// returns structured AnalysisResult.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { analyzeJob, ProviderError } from "@/lib/ai/reasoner";
import type { Job } from "@/lib/types";
import { RequestSchema } from "@/lib/ai/requestSchema";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      // Name the failing fields (never their values) so a mismatch is easy to find.
      const where = Array.from(
        new Set(parsed.error.issues.slice(0, 4).map((i) => i.path.slice(0, 4).join(".")))
      ).join(", ");
      return NextResponse.json(
        { error: `Invalid request: job object required${where ? ` (problem at: ${where})` : ""}` },
        { status: 400 }
      );
    }

    const job = parsed.data.job as unknown as Job;

    // Source IDs in ambiguities must reference real sources in the job.
    // We validate this to prevent phantom sourceIds being rendered in the UI.
    const knownSourceIds = new Set(job.sources.map((s) => s.id));
    for (const amb of job.ambiguities) {
      const bad = amb.sourceIds.filter((sid) => !knownSourceIds.has(sid));
      if (bad.length > 0) {
        return NextResponse.json(
          {
            error: `Ambiguity "${amb.fieldKey}" references unknown source IDs: ${bad.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    const result = await analyzeJob(job);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Reason API] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Analysis failed",
        providerUsed: process.env.REASONING_PROVIDER ?? "demo",
      },
      // 502 when the provider itself refused or failed, 500 for anything inside this app.
      { status: err instanceof ProviderError ? 502 : 500 }
    );
  }
}