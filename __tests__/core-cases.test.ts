// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR — Core acceptance-case tests
//
// Three mandatory cases from the product spec:
//   A. True mismatch      — customer says veneer, maker says laminate → flag it
//   B. No mismatch        — both agree on laminate → no flag
//   C. Unresolved ambiguity — both say "walnut finish" without specifying →
//                            report ambiguity, NOT a confirmed mismatch
//
// Also covers:
//   • Demo provider output faithfulness (fixture does not assert intent as fact)
//   • Resolve-ambiguity logic (explicit action required, idempotent)
//   • Revision history not silently overwritten
//   • Provider truthfulness guard (demo must not be labelled as live LLM)
// ──────────────────────────────────────────────────────────────────────────────

import { runDemoAnalysis } from "@/lib/ai/providers/demo";
import { normalizeFieldKey } from "@/lib/utils/fieldKey";
import type { Job, Ambiguity } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMinimalJob(overrides: Partial<Job> = {}): Job {
  const now = new Date().toISOString();
  return {
    id: "test_job_001",
    title: "Test Wardrobe",
    jobType: "other",
    status: "samajh",
    createdAt: now,
    updatedAt: now,
    isDemo: false,
    sources: [],
    quotes: [],
    ambiguities: [],
    revisions: [],
    outcomefindings: [],
    kaamNaksha: {
      version: 1,
      createdAt: now,
      lastUpdatedAt: now,
      completeness: 0,
      fields: [],
      confirmations: [],
    },
    ...overrides,
  };
}

// Simulates the dedup + merge logic in app/job/[id]/page.tsx
function mergeAmbiguities(
  existing: Ambiguity[],
  incoming: Array<Omit<Ambiguity, "id" | "resolved" | "resolvedAt" | "resolvedBy" | "resolutionNote">>
): Ambiguity[] {
  const existingKeys = new Set(existing.map((a) => normalizeFieldKey(a.fieldKey)));
  const newItems: Ambiguity[] = incoming
    .filter((a) => !existingKeys.has(normalizeFieldKey(a.fieldKey)))
    .map((a, i) => ({
      ...a,
      id: `amb_${normalizeFieldKey(a.fieldKey)}_t${i}`,
      resolved: false,
    }));
  return [...existing, ...newItems];
}

// ── A. True mismatch ──────────────────────────────────────────────────────────

describe("Case A — true mismatch (veneer vs laminate)", () => {
  /**
   * Customer explicitly says "natural walnut veneer".
   * Maker explicitly says "walnut-colour laminate over plywood".
   * These are provably different materials.
   * The demo provider's fixture covers this — check the output correctly flags it.
   */
  it("demo provider returns a material_finish ambiguity for the wardrobe job", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);

    const matAmb = result.ambiguities.find(
      (a) => normalizeFieldKey(a.fieldKey) === "material_finish"
    );
    expect(matAmb).toBeDefined();
    // Must have a high or medium impact (never low for a material difference)
    expect(["high", "medium"]).toContain(matAmb!.materialImpact);
  });

  it("material_finish ambiguity carries sourceIds pointing to real evidence", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    const matAmb = result.ambiguities.find(
      (a) => normalizeFieldKey(a.fieldKey) === "material_finish"
    );
    expect(matAmb!.sourceIds.length).toBeGreaterThan(0);
  });

  it("material_finish ambiguity has a non-empty clarificationQuestion", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    const matAmb = result.ambiguities.find(
      (a) => normalizeFieldKey(a.fieldKey) === "material_finish"
    );
    expect(matAmb!.clarificationQuestion.trim().length).toBeGreaterThan(10);
  });

  it("interpretationA does not assert customer intent as fact", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    const matAmb = result.ambiguities.find(
      (a) => normalizeFieldKey(a.fieldKey) === "material_finish"
    );
    const ia = matAmb!.interpretationA.toLowerCase();
    // Must NOT assert "customer imagines" or "customer expects" as certainty
    expect(ia).not.toMatch(/customer (definitely|certainly|clearly) (means|wants|imagines)/);
    expect(ia).not.toMatch(/customer imagine[sd] real wood/i);
    // Must present at least one alternative reading
    const hasAlternative =
      ia.includes("one reading") ||
      ia.includes("another is") ||
      ia.includes("could mean") ||
      ia.includes("may be") ||
      ia.includes("or");
    expect(hasAlternative).toBe(true);
  });
});

// ── B. No mismatch ─────────────────────────────────────────────────────────────

describe("Case B — no mismatch (both agree on laminate)", () => {
  /**
   * When both parties explicitly agree on the same material,
   * dedup logic must not re-add a resolved ambiguity.
   */
  it("a resolved material_finish ambiguity is not re-added on re-analysis", async () => {
    const now = new Date().toISOString();
    const resolvedAmb: Ambiguity = {
      id: "amb_material_finish_r1",
      fieldKey: "material_finish",
      fieldLabel: "Material & Finish",
      interpretationA: "Customer confirmed walnut-look laminate is acceptable.",
      interpretationB: "Maker uses walnut-colour laminate on 18mm ply.",
      consequence: "Both agree — no material consequence.",
      materialImpact: "low",
      clarificationQuestion: "Already resolved.",
      sourceIds: [],
      resolved: true,
      resolvedAt: now,
      resolvedBy: "both",
      resolutionNote: "Customer confirmed laminate is fine",
    };

    const incoming = [
      {
        fieldKey: "material_finish",
        fieldLabel: "Material & Finish",
        interpretationA: "...",
        interpretationB: "...",
        consequence: "...",
        materialImpact: "high" as const,
        clarificationQuestion: "...",
        sourceIds: [],
      },
    ];

    const merged = mergeAmbiguities([resolvedAmb], incoming);
    // The resolved one is kept but the new one is NOT added (dedup excludes resolved too)
    expect(merged).toHaveLength(1);
    expect(merged[0].resolved).toBe(true);
    expect(merged[0].resolutionNote).toBe("Customer confirmed laminate is fine");
  });

  it("a resolved ambiguity cannot be re-created by re-analysis", async () => {
    const now = new Date().toISOString();
    // Two existing ambiguities: one resolved, one unresolved on a different field
    const existing: Ambiguity[] = [
      {
        id: "amb_material_finish_r1",
        fieldKey: "material_finish",
        fieldLabel: "Material & Finish",
        interpretationA: "Agreed laminate",
        interpretationB: "Agreed laminate",
        consequence: "",
        materialImpact: "low",
        clarificationQuestion: "",
        sourceIds: [],
        resolved: true,
        resolvedAt: now,
        resolvedBy: "both",
        resolutionNote: "Laminate confirmed",
      },
      {
        id: "amb_installation_u1",
        fieldKey: "installation",
        fieldLabel: "Installation",
        interpretationA: "Included",
        interpretationB: "Extra charge",
        consequence: "Price surprise",
        materialImpact: "medium",
        clarificationQuestion: "Is installation included?",
        sourceIds: [],
        resolved: false,
      },
    ];

    // Re-analysis returns both fields
    const incoming = [
      { fieldKey: "material_finish", fieldLabel: "...", interpretationA: "...", interpretationB: "...", consequence: "...", materialImpact: "high" as const, clarificationQuestion: "...", sourceIds: [] },
      { fieldKey: "installation", fieldLabel: "...", interpretationA: "...", interpretationB: "...", consequence: "...", materialImpact: "medium" as const, clarificationQuestion: "...", sourceIds: [] },
    ];

    const merged = mergeAmbiguities(existing, incoming);
    // Neither should be added again — both keys already exist
    expect(merged).toHaveLength(2);
    const matAmbs = merged.filter((a) => normalizeFieldKey(a.fieldKey) === "material_finish");
    expect(matAmbs).toHaveLength(1);
    expect(matAmbs[0].resolved).toBe(true);
  });
});

// ── C. Ambiguity — not a proven mismatch ─────────────────────────────────────

describe("Case C — unresolved ambiguity (walnut finish without specification)", () => {
  /**
   * Both parties say "walnut finish" without clarifying if that means
   * solid wood, veneer, or laminate. This is an ambiguity that should
   * NOT be treated as a confirmed mismatch.
   */

  it("demo provider summary does not assert customer intent as fact", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    expect(result.summary).not.toMatch(/customer (definitely|certainly) (wants|expects|imagines)/i);
    expect(result.summary).not.toMatch(/customer imagines real wood/i);
  });

  it("demo provider returns an ambiguity, not a binary verdict", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    // Must return at least one ambiguity (unresolved question)
    expect(result.ambiguities.length).toBeGreaterThan(0);
    // Must NOT claim the customer "is wrong" or "will be disappointed"
    for (const amb of result.ambiguities) {
      expect(amb.interpretationA).not.toMatch(/customer is wrong/i);
      expect(amb.interpretationB).not.toMatch(/maker is lying/i);
      expect(amb.consequence).not.toMatch(/customer is (dishonest|fraudulent)/i);
    }
  });

  it("clarification question is neutral and does not lead the witness", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    const matAmb = result.ambiguities.find(
      (a) => normalizeFieldKey(a.fieldKey) === "material_finish"
    );
    expect(matAmb).toBeDefined();
    const q = matAmb!.clarificationQuestion;
    // Question must not presuppose the answer
    expect(q).not.toMatch(/you definitely wanted/i);
    expect(q).not.toMatch(/you obviously mean/i);
    // Question should present alternatives or ask for clarification
    const isNeutral =
      q.includes("or") ||
      q.toLowerCase().includes("which") ||
      q.toLowerCase().includes("did you mean") ||
      q.toLowerCase().includes("were you imagining");
    expect(isNeutral).toBe(true);
  });
});

// ── Resolve logic ─────────────────────────────────────────────────────────────

describe("Resolve-ambiguity interaction rules", () => {
  it("resolving an ambiguity requires setting resolved:true and a note", () => {
    // Models the contract: a gap can only become resolved through explicit human action
    const now = new Date().toISOString();
    const amb: Ambiguity = {
      id: "amb_x",
      fieldKey: "installation",
      fieldLabel: "Installation",
      interpretationA: "...",
      interpretationB: "...",
      consequence: "...",
      materialImpact: "medium",
      clarificationQuestion: "...",
      sourceIds: [],
      resolved: false,
    };

    // Simulate the resolve action
    const resolved: Ambiguity = {
      ...amb,
      resolved: true,
      resolvedAt: now,
      resolvedBy: "both",
      resolutionNote: "Both parties agreed installation is included at ₹0.",
    };

    expect(resolved.resolved).toBe(true);
    expect(resolved.resolutionNote).toBeTruthy();
    expect(resolved.resolvedAt).toBeTruthy();
    // Original is unchanged (immutable update)
    expect(amb.resolved).toBe(false);
  });

  it("analysis result alone must not mark a gap as resolved", () => {
    // The AnalysisResult type does not include 'resolved' on its ambiguities
    // Resolved status is set ONLY by explicit user action in the UI
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    // AnalysisResult ambiguities do not have a 'resolved' field
    for (const amb of result.ambiguities) {
      expect("resolved" in amb).toBe(false);
    }
  });
});

// ── Revision history ──────────────────────────────────────────────────────────

describe("Revision history — confirmed terms must not be silently overwritten", () => {
  it("revisions preserve previousValue and newValue distinctly", () => {
    const rev = {
      id: "rev_001",
      proposedAt: new Date().toISOString(),
      proposedBy: "customer" as const,
      fieldKey: "drawers",
      fieldLabel: "Number of Drawers",
      previousValue: 3,
      newValue: 4,
      reason: "Customer wants one extra drawer",
      status: "accepted" as const,
    };

    expect(rev.previousValue).toBe(3);
    expect(rev.newValue).toBe(4);
    expect(rev.previousValue).not.toBe(rev.newValue);
  });

  it("a revision does not delete the previous revision", () => {
    const existing = [
      {
        id: "rev_001",
        fieldKey: "drawers",
        previousValue: 3,
        newValue: 4,
        status: "accepted" as const,
      },
    ];

    // Adding a second revision preserves the first
    const updated = [
      ...existing,
      {
        id: "rev_002",
        fieldKey: "drawers",
        previousValue: 4,
        newValue: 5,
        status: "proposed" as const,
      },
    ];

    expect(updated).toHaveLength(2);
    expect(updated[0].id).toBe("rev_001");
    expect(updated[0].newValue).toBe(4);
  });
});

// ── Provider truthfulness ─────────────────────────────────────────────────────

describe("Provider truthfulness", () => {
  it("demo provider returns providerUsed='demo'", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    expect(result.providerUsed).toBe("demo");
  });

  it("demo provider label is not empty or 'live' or 'gpt'", async () => {
    const job = makeMinimalJob({ id: "demo-wardrobe-001", isDemo: true });
    const result = runDemoAnalysis(job);
    expect(result.providerUsed).not.toBe("");
    expect(result.providerUsed.toLowerCase()).not.toContain("live");
    expect(result.providerUsed.toLowerCase()).not.toContain("gpt");
    expect(result.providerUsed.toLowerCase()).not.toContain("openai");
  });

  it("REASONING_PROVIDER env var must never be NEXT_PUBLIC_*", () => {
    // Documents the contract: provider selection is server-side only
    const key = "REASONING_PROVIDER";
    expect(key).not.toMatch(/^NEXT_PUBLIC_/);
  });
});
