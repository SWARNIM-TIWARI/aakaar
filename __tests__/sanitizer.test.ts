// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR — Sanitizer + Provider-safety regression tests
// ──────────────────────────────────────────────────────────────────────────────

import { sanitizeAnalysisResult } from "@/lib/ai/sanitizer";
import { analyzeJob } from "@/lib/ai/reasoner";
import type { AnalysisResult, SpecField, Job } from "@/lib/types";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeField(
  key: string,
  status: SpecField["status"]
): SpecField {
  return {
    key,
    label: key,
    status,
    sourceIds: [],
    confirmationBy: [],
  };
}

function makeResult(suggestedKeys: string[], ambiguitySourceIds: string[][]): AnalysisResult {
  return {
    providerUsed: "test",
    analysisVersion: "test-v1",
    summary: "test",
    ambiguities: ambiguitySourceIds.map((sourceIds, i) => ({
      fieldKey: `field_${i}`,
      fieldLabel: `Field ${i}`,
      interpretationA: "A",
      interpretationB: "B",
      consequence: "c",
      materialImpact: "low" as const,
      clarificationQuestion: "?",
      sourceIds,
    })),
    suggestedSpecFields: suggestedKeys.map((key) => ({
      key,
      label: key,
      status: "proposed" as const,
    })),
  };
}

// ── sanitizeAnalysisResult — protected field guard ────────────────────────────

describe("sanitizeAnalysisResult — protected field guard", () => {
  it("passes through suggestions for unprotected fields untouched", () => {
    const existing = [makeField("dimensions", "proposed")];
    const result = makeResult(["dimensions"], []);
    const out = sanitizeAnalysisResult(result, existing);
    expect(out.suggestedSpecFields).toHaveLength(1);
  });

  it("drops a suggestion that would overwrite a CONFIRMED field", () => {
    const existing = [makeField("material_finish", "confirmed")];
    const result = makeResult(["material_finish", "deadline"], []);
    const out = sanitizeAnalysisResult(result, existing);
    // Only deadline survives; material_finish is protected
    expect(out.suggestedSpecFields.map((f) => f.key)).toEqual(["deadline"]);
  });

  it("drops a suggestion that would overwrite a CHANGED field", () => {
    const existing = [makeField("drawers", "changed")];
    const result = makeResult(["drawers"], []);
    const out = sanitizeAnalysisResult(result, existing);
    expect(out.suggestedSpecFields).toHaveLength(0);
  });

  it("drops a suggestion that would overwrite a DISPUTED field", () => {
    const existing = [makeField("drawers", "disputed")];
    const result = makeResult(["drawers", "finish"], []);
    const out = sanitizeAnalysisResult(result, existing);
    expect(out.suggestedSpecFields.map((f) => f.key)).toEqual(["finish"]);
  });

  it("allows overwriting a PROPOSED field (not protected)", () => {
    const existing = [makeField("scope", "proposed")];
    const result = makeResult(["scope"], []);
    const out = sanitizeAnalysisResult(result, existing);
    expect(out.suggestedSpecFields).toHaveLength(1);
  });

  it("allows overwriting an UNCLEAR field (not protected)", () => {
    const existing = [makeField("scope", "unclear")];
    const result = makeResult(["scope"], []);
    const out = sanitizeAnalysisResult(result, existing);
    expect(out.suggestedSpecFields).toHaveLength(1);
  });

  it("strips invalid sourceIds from ambiguities when validSourceIds supplied", () => {
    const validSourceIds = new Set(["src_real_1", "src_real_2"]);
    const result = makeResult([], [["src_real_1", "src_fake_99"]]);
    const out = sanitizeAnalysisResult(result, [], validSourceIds);
    expect(out.ambiguities[0].sourceIds).toEqual(["src_real_1"]);
  });

  it("keeps all sourceIds when no validSourceIds set is provided", () => {
    const result = makeResult([], [["src_anything", "src_unverified"]]);
    const out = sanitizeAnalysisResult(result, []);
    expect(out.ambiguities[0].sourceIds).toEqual(["src_anything", "src_unverified"]);
  });

  it("does not mutate the original result object", () => {
    const existing = [makeField("material_finish", "confirmed")];
    const result = makeResult(["material_finish"], []);
    const originalLength = result.suggestedSpecFields.length;
    sanitizeAnalysisResult(result, existing);
    // Original must be unchanged
    expect(result.suggestedSpecFields).toHaveLength(originalLength);
  });
});

// ── Unknown reasoning provider fails loudly ────────────────────────────────────

describe("analyzeJob — unknown provider", () => {
  const minimalJob: Job = {
    id: "test_job_001",
    title: "Test job",
    jobType: "other",
    status: "sauda",
    isDemo: false,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    sources: [],
    quotes: [],
    ambiguities: [],
    kaamNaksha: {
      version: 1,
      createdAt: "2026-10-01T00:00:00Z",
      lastUpdatedAt: "2026-10-01T00:00:00Z",
      completeness: 0,
      confirmations: [],
      fields: [],
    },
    revisions: [],
    outcomefindings: [],
  };

  it("throws for an unrecognised REASONING_PROVIDER instead of silently falling back to demo", async () => {
    const saved = process.env.REASONING_PROVIDER;
    process.env.REASONING_PROVIDER = "my-made-up-provider";
    try {
      await expect(analyzeJob(minimalJob)).rejects.toThrow(
        /Unknown REASONING_PROVIDER "my-made-up-provider"/
      );
    } finally {
      if (saved === undefined) delete process.env.REASONING_PROVIDER;
      else process.env.REASONING_PROVIDER = saved;
    }
  });

  it("does NOT throw for the 'demo' provider (it returns the generic demo result)", async () => {
    const saved = process.env.REASONING_PROVIDER;
    process.env.REASONING_PROVIDER = "demo";
    try {
      const result = await analyzeJob(minimalJob);
      expect(result.providerUsed).toBe("demo");
    } finally {
      if (saved === undefined) delete process.env.REASONING_PROVIDER;
      else process.env.REASONING_PROVIDER = saved;
    }
  });
});
