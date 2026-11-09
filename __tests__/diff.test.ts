import { applyRevision, assertRevisionIntegrity, diffKaamNaksha, computeCompleteness } from "@/lib/spec/diff";
import type { KaamNaksha, Revision } from "@/lib/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseNaksha: KaamNaksha = {
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  lastUpdatedAt: "2026-10-01T00:00:00Z",
  completeness: 50,
  confirmations: [],
  fields: [
    {
      key: "dimensions",
      label: "Dimensions",
      value: "6ft",
      agreedValue: "6ft",
      status: "confirmed",
      sourceIds: [],
      confirmationBy: ["both"],
    },
    {
      key: "drawers",
      label: "Drawers",
      value: 3,
      agreedValue: 3,
      status: "confirmed",
      sourceIds: [],
      confirmationBy: ["both"],
    },
    {
      key: "finish",
      label: "Finish",
      value: "walnut",
      status: "possible_mismatch",
      sourceIds: [],
      confirmationBy: ["customer", "maker"],
    },
    {
      key: "deadline",
      label: "Deadline",
      status: "unclear",
      sourceIds: [],
      confirmationBy: ["maker"],
    },
  ],
};

const drawerRevision: Revision = {
  id: "rev_001",
  proposedAt: "2026-10-05T00:00:00Z",
  proposedBy: "customer",
  fieldKey: "drawers",
  fieldLabel: "Drawers",
  previousValue: 3,
  newValue: 4,
  reason: "Customer wants extra drawer",
  costImpactRs: 1500,
  timeImpactDays: 1,
  status: "accepted",
};

// ── computeCompleteness ───────────────────────────────────────────────────────

describe("computeCompleteness", () => {
  it("returns correct percentage of confirmed fields", () => {
    // 2 out of 4 are confirmed
    expect(computeCompleteness(baseNaksha.fields)).toBe(50);
  });

  it("returns 0 for empty fields", () => {
    expect(computeCompleteness([])).toBe(0);
  });

  it("returns 100 when all confirmed", () => {
    const allConfirmed = baseNaksha.fields.map((f) => ({
      ...f,
      status: "confirmed" as const,
    }));
    expect(computeCompleteness(allConfirmed)).toBe(100);
  });
});

// ── applyRevision ─────────────────────────────────────────────────────────────

describe("applyRevision", () => {
  it("increments version", () => {
    const updated = applyRevision(baseNaksha, drawerRevision);
    expect(updated.version).toBe(2);
  });

  it("updates the target field value", () => {
    const updated = applyRevision(baseNaksha, drawerRevision);
    const drawersField = updated.fields.find((f) => f.key === "drawers");
    expect(drawersField?.value).toBe(4);
  });

  it("marks a previously confirmed field as 'changed'", () => {
    const updated = applyRevision(baseNaksha, drawerRevision);
    const drawersField = updated.fields.find((f) => f.key === "drawers");
    expect(drawersField?.status).toBe("changed");
  });

  it("clears agreedValue after revision (requires re-confirmation)", () => {
    const updated = applyRevision(baseNaksha, drawerRevision);
    const drawersField = updated.fields.find((f) => f.key === "drawers");
    expect(drawersField?.agreedValue).toBeUndefined();
  });

  it("does not modify other fields", () => {
    const updated = applyRevision(baseNaksha, drawerRevision);
    const dimensionsField = updated.fields.find((f) => f.key === "dimensions");
    expect(dimensionsField?.value).toBe("6ft");
    expect(dimensionsField?.status).toBe("confirmed");
  });

  it("throws when revision is not accepted", () => {
    const pendingRevision: Revision = {
      ...drawerRevision,
      status: "proposed",
    };
    expect(() => applyRevision(baseNaksha, pendingRevision)).toThrow();
  });

  it("does not mutate the original naksha", () => {
    const originalVersion = baseNaksha.version;
    applyRevision(baseNaksha, drawerRevision);
    expect(baseNaksha.version).toBe(originalVersion);
  });
});

// ── diffKaamNaksha ────────────────────────────────────────────────────────────

describe("diffKaamNaksha", () => {
  it("detects value changes", () => {
    const updated = applyRevision(baseNaksha, drawerRevision);
    const changes = diffKaamNaksha(baseNaksha, updated);
    const drawerChange = changes.find((c) => c.key === "drawers");
    expect(drawerChange).toBeDefined();
    expect(drawerChange?.previousValue).toBe(3);
    expect(drawerChange?.newValue).toBe(4);
  });

  it("detects status changes", () => {
    const updated = applyRevision(baseNaksha, drawerRevision);
    const changes = diffKaamNaksha(baseNaksha, updated);
    const drawerChange = changes.find((c) => c.key === "drawers");
    expect(drawerChange?.statusChanged).toBe(true);
    expect(drawerChange?.previousStatus).toBe("confirmed");
    expect(drawerChange?.newStatus).toBe("changed");
  });

  it("returns empty array for identical nakshas", () => {
    const changes = diffKaamNaksha(baseNaksha, baseNaksha);
    expect(changes).toHaveLength(0);
  });

  it("detects new fields", () => {
    const withNewField: KaamNaksha = {
      ...baseNaksha,
      fields: [
        ...baseNaksha.fields,
        {
          key: "handles",
          label: "Handles",
          value: "chrome",
          status: "proposed",
          sourceIds: [],
          confirmationBy: ["both"],
        },
      ],
    };
    const changes = diffKaamNaksha(baseNaksha, withNewField);
    const handleChange = changes.find((c) => c.key === "handles");
    expect(handleChange).toBeDefined();
  });
});

// ── assertRevisionIntegrity ───────────────────────────────────────────────────

describe("assertRevisionIntegrity", () => {
  it("returns no violations when revisions account for all changes", () => {
    const updated = applyRevision(baseNaksha, drawerRevision);
    const violations = assertRevisionIntegrity(baseNaksha, updated, [
      drawerRevision,
    ]);
    expect(violations).toHaveLength(0);
  });

  it("detects a violation when agreedValue changed without a revision record", () => {
    // Manually tamper with the naksha — changing an agreed value without a revision
    const tamperedNaksha: KaamNaksha = {
      ...baseNaksha,
      fields: baseNaksha.fields.map((f) =>
        f.key === "dimensions"
          ? { ...f, agreedValue: "8ft" } // Changed without revision!
          : f
      ),
    };

    const violations = assertRevisionIntegrity(baseNaksha, tamperedNaksha, []);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].fieldKey).toBe("dimensions");
  });

  it("no violation if the changed field has a matching revision", () => {
    const tamperedNaksha: KaamNaksha = {
      ...baseNaksha,
      fields: baseNaksha.fields.map((f) =>
        f.key === "dimensions"
          ? { ...f, agreedValue: "8ft", status: "changed" as const }
          : f
      ),
    };

    const dimensionsRevision: Revision = {
      id: "r_dim",
      proposedAt: "2026-10-06T00:00:00Z",
      proposedBy: "customer",
      fieldKey: "dimensions",
      fieldLabel: "Dimensions",
      previousValue: "6ft",
      newValue: "8ft",
      reason: "Customer wants taller wardrobe",
      status: "accepted",
    };

    const violations = assertRevisionIntegrity(baseNaksha, tamperedNaksha, [
      dimensionsRevision,
    ]);
    expect(violations).toHaveLength(0);
  });
});
