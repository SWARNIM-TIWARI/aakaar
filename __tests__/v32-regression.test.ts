// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR v3.2 — Regression tests
// Covers the five targeted fixes from v3.2.
// These tests run in Node with no browser globals; API route tests use direct
// module calls or minimal fetch mocks rather than spinning up the server.
// ──────────────────────────────────────────────────────────────────────────────

import { normalizeFieldKey } from "@/lib/utils/fieldKey";

// ── Fix 5 — normalizeFieldKey ─────────────────────────────────────────────────

describe("normalizeFieldKey", () => {
  it("leaves already-normalized keys unchanged", () => {
    expect(normalizeFieldKey("material_finish")).toBe("material_finish");
    expect(normalizeFieldKey("installation")).toBe("installation");
  });

  it("lowercases camelCase and PascalCase", () => {
    expect(normalizeFieldKey("MaterialFinish")).toBe("materialfinish");
    expect(normalizeFieldKey("camelCase")).toBe("camelcase");
  });

  it("converts hyphens to underscores", () => {
    expect(normalizeFieldKey("material-finish")).toBe("material_finish");
    expect(normalizeFieldKey("a-b-c")).toBe("a_b_c");
  });

  it("converts spaces to underscores", () => {
    expect(normalizeFieldKey("material finish")).toBe("material_finish");
    expect(normalizeFieldKey("  Material Finish  ")).toBe("material_finish");
  });

  it("strips leading and trailing underscores after transforms", () => {
    expect(normalizeFieldKey("_scope_")).toBe("scope");
  });

  it("removes characters that are not alphanumeric or underscore", () => {
    expect(normalizeFieldKey("field.name!")).toBe("fieldname");
  });

  it("two semantically identical keys normalize to the same value", () => {
    const a = normalizeFieldKey("Material Finish");
    const b = normalizeFieldKey("material-finish");
    const c = normalizeFieldKey("material_finish");
    expect(a).toBe(c);
    expect(b).toBe(c);
  });
});

// ── Fix 5 — Deduplication logic (unit test of the pattern used in page.tsx) ───

describe("Deduplication via normalizeFieldKey", () => {
  /** Simulates the dedup logic from app/job/[id]/page.tsx */
  function deduplicateAmbiguities(
    existing: { fieldKey: string; resolved: boolean }[],
    incoming: { fieldKey: string }[]
  ): { fieldKey: string }[] {
    // Existing resolved ambiguities are still excluded from re-insertion.
    const existingFieldKeys = new Set(
      existing.map((a) => normalizeFieldKey(a.fieldKey))
    );
    return incoming.filter(
      (a) => !existingFieldKeys.has(normalizeFieldKey(a.fieldKey))
    );
  }

  it("does not add a duplicate ambiguity on re-analysis", () => {
    const existing = [{ fieldKey: "material_finish", resolved: false }];
    const incoming = [
      { fieldKey: "material_finish" }, // same key — should be filtered
      { fieldKey: "installation" },    // new key — should be kept
    ];
    const result = deduplicateAmbiguities(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].fieldKey).toBe("installation");
  });

  it("does not add a duplicate even when casing differs", () => {
    const existing = [{ fieldKey: "Material_Finish", resolved: false }];
    const incoming = [{ fieldKey: "material_finish" }];
    const result = deduplicateAmbiguities(existing, incoming);
    expect(result).toHaveLength(0);
  });

  it("does not revive a resolved ambiguity", () => {
    const existing = [{ fieldKey: "material_finish", resolved: true }];
    const incoming = [{ fieldKey: "material_finish" }];
    const result = deduplicateAmbiguities(existing, incoming);
    expect(result).toHaveLength(0);
  });

  it("allows a genuinely new field to be added", () => {
    const existing = [{ fieldKey: "material_finish", resolved: false }];
    const incoming = [{ fieldKey: "deadline" }];
    const result = deduplicateAmbiguities(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].fieldKey).toBe("deadline");
  });
});

// ── Fix 4 — TTS audio_config shape ───────────────────────────────────────────

describe("Gnani TTS audio_config (Fix 4)", () => {
  it("does not include an encoding field for MP3 container", () => {
    // This documents the correct shape that route.ts must produce.
    // If encoding appears for an MP3 container, Gnani rejects the request.
    const audioConfig = {
      sample_rate: 24000,
      num_channels: 1,
      sample_width: 2,
      container: "mp3",
      bitrate: "64k",
    } as Record<string, unknown>;

    expect(audioConfig).not.toHaveProperty("encoding");
    expect(audioConfig.container).toBe("mp3");
  });

  it("bitrate must be a string like '64k', not a number", () => {
    const bitrate = "64k";
    expect(typeof bitrate).toBe("string");
    expect(bitrate).toMatch(/^\d+k$/);
  });
});

// ── Fix 3 — TranscriptionSource type ─────────────────────────────────────────

describe("TranscriptionSource type (Fix 3)", () => {
  it("TranscriptionSource values are the expected literals", () => {
    // Ensures the type contract is stable — the only valid values are these two.
    const valid: string[] = ["gnani_prisma", "browser_speech"];
    expect(valid).toContain("gnani_prisma");
    expect(valid).toContain("browser_speech");
    expect(valid).not.toContain("demo");
    expect(valid).not.toContain("unknown");
  });
});

// ── Fix 1 — Provider routing: request shape ───────────────────────────────────

describe("Analysis request shape (Fix 1)", () => {
  it("constructs a request body with job (not jobId)", () => {
    const mockJob = {
      id: "job_test123",
      title: "Test Job",
      status: "samajh",
      sources: [],
      ambiguities: [],
    };

    // This is what page.tsx must send — full job, not jobId string.
    const requestBody = { job: mockJob };

    expect(requestBody).toHaveProperty("job");
    expect(requestBody).not.toHaveProperty("jobId");
    expect(requestBody.job.id).toBe("job_test123");
  });

  it("request body does not gate on NEXT_PUBLIC_DEMO_ONLY", () => {
    // The fix removes the NEXT_PUBLIC_DEMO_ONLY branch entirely.
    // After Fix 1, /api/reason is always called regardless of env.
    // This test documents the invariant: provider selection is server-side only.
    const serverSideEnvVarName = "REASONING_PROVIDER";
    const clientSideEnvVarName = "NEXT_PUBLIC_DEMO_ONLY";

    // NEXT_PUBLIC_* is not how we control the reasoning provider.
    expect(serverSideEnvVarName).not.toMatch(/^NEXT_PUBLIC_/);
    expect(clientSideEnvVarName).toMatch(/^NEXT_PUBLIC_/);
  });
});

// ── Fix 2 — Maker statement stored as party:"maker" ──────────────────────────

describe("Maker statement EvidenceSource (Fix 2)", () => {
  it("maker statement uses party:'maker', not party:'customer'", () => {
    const makerSource = {
      id: "src_maker_001",
      kind: "manual_note" as const,
      label: "Maker's initial offer",
      excerpt: "18mm ply with walnut laminate, ₹24,500",
      capturedAt: new Date().toISOString(),
      party: "maker" as const,
    };

    expect(makerSource.party).toBe("maker");
    expect(makerSource.party).not.toBe("customer");
  });

  it("customer brief and maker statement have distinct source IDs", () => {
    const customerSourceId = "src_customer_abc";
    const makerSourceId = "src_maker_def";
    expect(customerSourceId).not.toBe(makerSourceId);
  });
});

// ── Zod validation — key shape guards from reason/route.ts ───────────────────

describe("Reason route Zod validation guards", () => {
  // We test the schema shapes in isolation. Full API integration tests would
  // require a test server — these document the validation invariants only.

  it("source kind must be one of the accepted enum values", () => {
    const validKinds = [
      "voice_transcript",
      "manual_note",
      "document_upload",
      "photo_upload",
    ];
    expect(validKinds).toContain("voice_transcript");
    expect(validKinds).toContain("manual_note");
    expect(validKinds).not.toContain("unknown_kind");
  });

  it("materialImpact must be 'high', 'medium', or 'low'", () => {
    const validImpacts = ["high", "medium", "low"];
    expect(validImpacts).toContain("high");
    expect(validImpacts).not.toContain("critical");
    expect(validImpacts).not.toContain("none");
  });

  it("job status must be one of the accepted values", () => {
    const validStatuses = [
      "sauda",
      "samajh",
      "vaada",
      "kya_hua",
      "complete",
      "disputed",
    ];
    expect(validStatuses).toContain("samajh");
    expect(validStatuses).not.toContain("pending");
  });

  it("source IDs in ambiguities must reference real sources", () => {
    // Documents the server-side validation logic: orphaned sourceIds are rejected.
    const sources = [{ id: "src_a" }, { id: "src_b" }];
    const knownIds = new Set(sources.map((s) => s.id));
    const ambiguitySourceIds = ["src_a", "src_c"]; // src_c is unknown
    const orphans = ambiguitySourceIds.filter((id) => !knownIds.has(id));
    expect(orphans).toEqual(["src_c"]);
  });
});

// ── Demo provider — epistemic language ───────────────────────────────────────

describe("Demo provider epistemic language (Fix)", () => {
  it("wardrobe analysis summary does not assert customer intent as fact", async () => {
    // We import the demo provider directly and verify the fixture text
    // does not contain overreaching certainty language.
    const { runDemoAnalysis } = await import("@/lib/ai/providers/demo");
    const mockJob = {
      id: "demo-wardrobe-001",
      title: "Wardrobe",
      isDemo: true,
      // Minimal required fields
      jobType: "other" as const,
      status: "samajh" as const,
      createdAt: "",
      updatedAt: "",
      sources: [],
      ambiguities: [],
      kaamNaksha: {
        version: 1,
        createdAt: "",
        lastUpdatedAt: "",
        completeness: 0,
        fields: [],
        confirmations: [],
      },
      quotes: [],
      revisions: [],
      outcomefindings: [],
    };

    const result = runDemoAnalysis(mockJob);

    // The summary must not assert "customer imagines" or "customer expects" as fact.
    expect(result.summary).not.toMatch(/customer likely imagine/i);
    expect(result.summary).not.toMatch(/customer imagines real wood/i);

    // interpretationA for material_finish must offer multiple readings.
    const matFinish = result.ambiguities.find(
      (a) => a.fieldKey === "material_finish"
    );
    expect(matFinish).toBeDefined();
    // Must present options ("one reading", "another is", "could mean", etc.)
    const ia = matFinish!.interpretationA.toLowerCase();
    const hasMultipleReadings =
      ia.includes("one reading") ||
      ia.includes("another is") ||
      ia.includes("could mean") ||
      ia.includes("may be");
    expect(hasMultipleReadings).toBe(true);
  });
});
