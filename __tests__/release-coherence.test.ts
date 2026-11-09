// Release-coherence scenarios. All data here is synthetic.
//
// The "Diwali patakhe" context (scenario D) is a SYNTHETIC reconstruction written
// for this file. The original test text was not available when these tests were
// written. If your own version differs, add it here as another case.

import type { AnalysisResult, Job } from "@/lib/types";
import {
  addFieldFromAmbiguity,
  addSpecField,
  confirmField,
  correctSourceText,
  deliveryOverview,
  fieldState,
  findDuplicateReport,
  findingStatus,
  isCorrected,
  markClarified,
  markUnresolved,
  mergeSuggestedFields,
  proposeRevision,
  recordAnswer,
  recordDelivery,
  reopenAmbiguity,
  respondToRevision,
} from "@/lib/spec/workflow";

const T0 = "2026-11-08T09:00:00.000Z";
const T1 = "2026-11-08T09:05:00.000Z";
const T2 = "2026-11-08T09:10:00.000Z";
const T3 = "2026-11-08T09:15:00.000Z";
const T4 = "2026-11-08T09:20:00.000Z";

function baseJob(over: Partial<Job> = {}): Job {
  return {
    id: "job_release1",
    title: "Test job",
    jobType: "other",
    status: "samajh",
    customerName: "Asha",
    makerName: "Ravi",
    createdAt: T0,
    updatedAt: T0,
    isDemo: false,
    sources: [],
    quotes: [],
    ambiguities: [],
    kaamNaksha: { version: 1, createdAt: T0, lastUpdatedAt: T0, completeness: 0, confirmations: [], fields: [] },
    revisions: [],
    outcomefindings: [],
    ...over,
  };
}

function gap(job: Job, key = "finish"): Job {
  return {
    ...job,
    ambiguities: [
      ...job.ambiguities,
      {
        id: `amb_${key}`,
        fieldKey: key,
        fieldLabel: "Finish",
        interpretationA: "Natural walnut veneer",
        interpretationB: "Walnut-look laminate",
        consequence: "Price and durability differ.",
        materialImpact: "high",
        clarificationQuestion: "Is it real walnut veneer or walnut-look laminate?",
        sourceIds: [],
        resolved: false,
      },
    ],
  };
}

const analysis = (fields: AnalysisResult["suggestedSpecFields"]): AnalysisResult => ({
  providerUsed: "openai-compatible",
  analysisVersion: "test",
  summary: "s",
  ambiguities: [],
  suggestedSpecFields: fields,
});

// ── D. Money is money ─────────────────────────────────────────────────────────

describe("D. monetary interpretation (synthetic Diwali patakhe context)", () => {
  const sources = [
    { id: "s1", kind: "manual_note" as const, label: "Customer", excerpt: "Diwali ke liye patakhe chahiye, paanch hazaar rupaye ka maal.", capturedAt: T0, party: "customer" as const },
    { id: "s2", kind: "manual_note" as const, label: "Maker", excerpt: "Theek hai, 5000 rupaye mein ho jayega, Diwali se pehle.", capturedAt: T0, party: "maker" as const },
  ];
  const job = baseJob({ description: "Diwali patakhe order", sources });

  it("keeps 5000 as an amount of money and flags a model that called it a number of fireworks", () => {
    const out = mergeSuggestedFields(
      job,
      analysis([{ key: "number_of_fireworks", label: "Number of fireworks", value: "5000", status: "proposed" }]),
      new Set(["s1", "s2"]),
      T1
    );
    const f = out.kaamNaksha.fields.find((x) => x.key === "number_of_fireworks")!;
    expect(f.valueKind).toBe("currency");
    expect(f.status).toBe("unclear");
    expect(f.notes).toMatch(/refers to money, not a count/);
    expect(fieldState(f)).not.toBe("confirmed");
  });

  it("does not invent a price per item that nobody stated", () => {
    const withAnalysis: Job = { ...job, lastAnalysis: { at: T1, providerUsed: "openai-compatible", gapsFound: 0 } };
    const out = mergeSuggestedFields(
      withAnalysis,
      analysis([{ key: "rate_per_firework", label: "Rate per firework", value: "2", status: "proposed" }]),
      new Set(["s1", "s2"]),
      T1
    );
    expect(out.kaamNaksha.fields).toHaveLength(0);
    expect(out.lastAnalysis?.skipped?.[0].reason).toMatch(/price per item/);
  });

  it("does not turn 'lowest price wins' into a detail of the work", () => {
    const withAnalysis: Job = { ...job, lastAnalysis: { at: T1, providerUsed: "openai-compatible", gapsFound: 0 } };
    const out = mergeSuggestedFields(
      withAnalysis,
      analysis([{ key: "material", label: "Material", value: "lowest price wins", status: "proposed" }]),
      new Set(["s1"]),
      T1
    );
    expect(out.kaamNaksha.fields).toHaveLength(0);
    expect(out.lastAnalysis?.skipped?.[0].reason).toMatch(/rule for choosing between quotes/);
    expect(() => addSpecField(job, { label: "Quantity", value: "lowest price wins" }, T1)).toThrow(/rule for choosing/);
  });

  it("a typed amount is stored as an amount, not a count", () => {
    const out = addSpecField(job, { label: "Budget", value: "Rs 5,000" }, T1);
    expect(out.kaamNaksha.fields[0].valueKind).toBe("currency");
    expect(out.kaamNaksha.fields[0].origin).toBe("entered");
  });
});

// ── E. Confirmation and version history ──────────────────────────────────────

describe("E. confirmation", () => {
  it("is proposed, marked by each role separately, and does not change the version", () => {
    let job = addSpecField(baseJob(), { label: "Drawers", value: "4" }, T1);
    expect(job.kaamNaksha.version).toBe(1);
    expect(job.kaamNaksha.history).toHaveLength(1);
    expect(job.kaamNaksha.history?.[0].kind).toBe("field_added");

    job = confirmField(job, "drawers", "customer", T2);
    expect(fieldState(job.kaamNaksha.fields[0])).toBe("awaiting_maker");
    expect(job.kaamNaksha.version).toBe(1);

    job = confirmField(job, "drawers", "maker", T3);
    expect(fieldState(job.kaamNaksha.fields[0])).toBe("confirmed");
    expect(job.kaamNaksha.version).toBe(1);
    expect(job.kaamNaksha.history).toHaveLength(1);
    expect(job.kaamNaksha.fields[0].roleConfirmations?.customer?.at).toBe(T2);
    expect(job.kaamNaksha.fields[0].roleConfirmations?.maker?.at).toBe(T3);
  });

  it("a content change is a new version, and confirmation must be repeated", () => {
    let job = addSpecField(baseJob(), { label: "Drawers", value: "4" }, T1);
    job = confirmField(confirmField(job, "drawers", "customer", T2), "drawers", "maker", T2);
    job = proposeRevision(job, "drawers", { newValue: "3", reason: "Space", proposedBy: "customer" }, T3);
    const rev = job.revisions[0];
    job = respondToRevision(job, rev.id, "maker", "accept", T4);
    expect(job.kaamNaksha.version).toBe(2);
    expect(job.kaamNaksha.history?.map((h) => h.kind)).toEqual(["field_added", "change_accepted"]);
    expect(fieldState(job.kaamNaksha.fields[0])).not.toBe("confirmed");
    expect(job.kaamNaksha.fields[0].roleConfirmations).toBeUndefined();
  });

  it("refuses to confirm a point that still has an open question", () => {
    let job = gap(baseJob(), "finish");
    job = addSpecField(job, { label: "Finish", value: "walnut finish" }, T1);
    expect(() => confirmField(job, "finish", "customer", T2)).toThrow(/open question/);
  });

  it("the same role cannot be marked twice to make a field confirmed", () => {
    let job = addSpecField(baseJob(), { label: "Drawers", value: "4" }, T1);
    job = confirmField(job, "drawers", "customer", T2);
    expect(() => confirmField(job, "drawers", "customer", T3)).toThrow(/already marked/);
    expect(fieldState(job.kaamNaksha.fields[0])).toBe("awaiting_maker");
  });
});

// ── F. Delivery comparison ───────────────────────────────────────────────────

describe("F. delivery", () => {
  function confirmedAmount(): Job {
    let job = addSpecField(baseJob(), { label: "Agreed price", value: "INR 4,400" }, T1);
    job = confirmField(confirmField(job, "agreed_price", "customer", T2), "agreed_price", "maker", T2);
    return job;
  }

  it("an agreed amount against 'yes' cannot be compared and is not called a difference", () => {
    const job = recordDelivery(confirmedAmount(), { fieldKey: "agreed_price", reportedValue: "yes", reportedBy: "customer" }, T3);
    const f = job.outcomefindings[0];
    expect(f.outcome).toBe("cannot_compare");
    expect(f.severity).toBe("low");
    expect(f.discrepancy).toMatch(/cannot be compared/);
    expect(deliveryOverview(job)[0].state).toBe("cannot_compare");
  });

  it("the same amount written differently is a match", () => {
    const job = recordDelivery(confirmedAmount(), { fieldKey: "agreed_price", reportedValue: "Rs 4400", reportedBy: "maker" }, T3);
    expect(job.outcomefindings[0].outcome).toBe("match");
  });

  it("a different amount is a reported difference", () => {
    const job = recordDelivery(confirmedAmount(), { fieldKey: "agreed_price", reportedValue: "₹4,900", reportedBy: "maker" }, T3);
    expect(job.outcomefindings[0].outcome).toBe("difference");
    expect(job.outcomefindings[0].status).toBe("open");
  });

  it("a report is tied to the specification version it was read against", () => {
    const job = recordDelivery(confirmedAmount(), { fieldKey: "agreed_price", reportedValue: "₹4,900", reportedBy: "maker" }, T3);
    expect(job.outcomefindings[0].specVersion).toBe(1);
  });
});

// ── G. Duplicate delivery report ─────────────────────────────────────────────

describe("G. duplicate report", () => {
  function ready(): Job {
    let job = addSpecField(baseJob(), { label: "Drawers", value: "4" }, T1);
    job = confirmField(confirmField(job, "drawers", "customer", T2), "drawers", "maker", T2);
    return recordDelivery(job, { fieldKey: "drawers", reportedValue: "3", reportedBy: "customer" }, T3);
  }

  it("is detected and refused with a plain sentence", () => {
    const job = ready();
    expect(findDuplicateReport(job, "drawers", "three", "customer")).toBeDefined();
    expect(() => recordDelivery(job, { fieldKey: "drawers", reportedValue: "3", reportedBy: "customer" }, T4)).toThrow(/already reported/);
    expect(job.outcomefindings).toHaveLength(1);
  });

  it("a different reporter is not a duplicate", () => {
    const job = recordDelivery(ready(), { fieldKey: "drawers", reportedValue: "3", reportedBy: "maker" }, T4);
    expect(job.outcomefindings).toHaveLength(2);
  });

  it("can be recorded again on purpose", () => {
    const job = recordDelivery(ready(), { fieldKey: "drawers", reportedValue: "3", reportedBy: "customer", allowDuplicate: true }, T4);
    expect(job.outcomefindings).toHaveLength(2);
  });
});

// ── SAMAJH answers ───────────────────────────────────────────────────────────

describe("SAMAJH: answer, clarify, unresolved", () => {
  it("an answer alone is not a clarification", () => {
    let job = gap(baseJob());
    expect(findingStatus(job.ambiguities[0])).toBe("open");
    job = recordAnswer(job, "amb_finish", "Real veneer, 0.6 mm walnut.", "customer", T1);
    expect(findingStatus(job.ambiguities[0])).toBe("answered");
    expect(job.ambiguities[0].resolved).toBe(false);
  });

  it("cannot be marked clarified without an answer", () => {
    expect(() => markClarified(gap(baseJob()), "amb_finish", "customer", T1)).toThrow(/Record the answer first/);
  });

  it("is clarified by a person, then adds only a PROPOSED field", () => {
    let job = recordAnswer(gap(baseJob()), "amb_finish", "Real veneer", "customer", T1);
    job = markClarified(job, "amb_finish", "maker", T2);
    expect(findingStatus(job.ambiguities[0])).toBe("clarified");
    expect(job.ambiguities[0].resolvedBy).toBe("maker");
    job = addFieldFromAmbiguity(job, "amb_finish", "Natural walnut veneer", T3);
    const f = job.kaamNaksha.fields[0];
    expect(fieldState(f)).toBe("proposed");
    expect(f.origin).toBe("from_answer");
    expect(job.kaamNaksha.history?.[0].kind).toBe("field_added");
  });

  it("can stay unresolved on purpose, with a reason, and be reopened", () => {
    let job = gap(baseJob());
    expect(() => markUnresolved(job, "amb_finish", "  ", T1)).toThrow(/Say why/);
    job = markUnresolved(job, "amb_finish", "Maker will check samples on Monday.", T1);
    expect(findingStatus(job.ambiguities[0])).toBe("unresolved");
    job = recordAnswer(job, "amb_finish", "Samples show laminate.", "maker", T2);
    expect(findingStatus(job.ambiguities[0])).toBe("answered");
    job = markClarified(job, "amb_finish", "customer", T3);
    job = reopenAmbiguity(job, "amb_finish", T4);
    expect(findingStatus(job.ambiguities[0])).toBe("answered");
  });
});

// ── Source text: correction keeps the original ───────────────────────────────

describe("correcting a transcript", () => {
  const job = baseJob({
    sources: [
      { id: "v1", kind: "transcript", label: "Customer, spoken", excerpt: "mujhe teen darwaze chahiye", capturedAt: T0, party: "customer", inputMethod: "voice", originalText: "mujhe teen darwaze chahiye" },
    ],
  });

  it("keeps the original words and marks the source corrected", () => {
    const out = correctSourceText(job, "v1", "mujhe chaar darwaze chahiye", T1);
    const s = out.sources[0];
    expect(s.excerpt).toBe("mujhe chaar darwaze chahiye");
    expect(s.originalText).toBe("mujhe teen darwaze chahiye");
    expect(isCorrected(s)).toBe(true);
  });

  it("putting the original back removes the correction mark", () => {
    const edited = correctSourceText(job, "v1", "mujhe chaar darwaze chahiye", T1);
    const back = correctSourceText(edited, "v1", "mujhe teen darwaze chahiye", T2);
    expect(isCorrected(back.sources[0])).toBe(false);
    expect(back.sources[0].originalText).toBe("mujhe teen darwaze chahiye");
  });

  it("a typed source also keeps its first text", () => {
    const typed = baseJob({
      sources: [{ id: "t1", kind: "manual_note", label: "Maker", excerpt: "walnut finish", capturedAt: T0, party: "maker" }],
    });
    const out = correctSourceText(typed, "t1", "walnut laminate finish", T1);
    expect(out.sources[0].originalText).toBe("walnut finish");
    expect(isCorrected(out.sources[0])).toBe(true);
  });
});

// ── Old jobs keep loading ────────────────────────────────────────────────────

describe("backward compatibility", () => {
  it("a field saved before valueKind, origin and history existed still works", () => {
    const job = baseJob({
      kaamNaksha: {
        version: 3,
        createdAt: T0,
        lastUpdatedAt: T0,
        completeness: 0,
        confirmations: [],
        fields: [{ key: "drawers", label: "Drawers", value: "4", status: "proposed", sourceIds: [], confirmationBy: ["customer", "maker"] }],
      },
    });
    const out = confirmField(confirmField(job, "drawers", "customer", T1), "drawers", "maker", T2);
    expect(fieldState(out.kaamNaksha.fields[0])).toBe("confirmed");
    expect(out.kaamNaksha.version).toBe(3);
    const edited = addSpecField(out, { label: "Handles", value: "Brass" }, T3);
    expect(edited.kaamNaksha.version).toBe(4);
    expect(edited.kaamNaksha.history?.[0].version).toBe(4);
  });
});