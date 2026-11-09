import type { AnalysisResult, Job, SpecField } from "@/lib/types";
import { DEMO_JOB } from "@/lib/data/demo-scenario";
import { RequestSchema } from "@/lib/ai/requestSchema";
import {
  addFieldFromAmbiguity,
  addSpecField,
  compareValues,
  confirmField,
  deliveryOverview,
  editProposedField,
  fieldState,
  isStaleFinding,
  mergeSuggestedFields,
  normalizeValue,
  proposeRevision,
  recordDelivery,
  respondToRevision,
  settleFinding,
} from "@/lib/spec/workflow";
import { nextAction, stageInfo, stageNext } from "@/lib/utils/jobStage";
import { extractJson } from "@/lib/ai/reasoner";

const T0 = "2026-11-07T10:00:00.000Z";
const T1 = "2026-11-07T10:05:00.000Z";
const T2 = "2026-11-07T10:10:00.000Z";
const T3 = "2026-11-07T10:15:00.000Z";

/** A job exactly as the new job form creates it. */
function freshJob(): Job {
  return {
    id: "job_testfresh1",
    title: "Wardrobe",
    jobType: "other",
    status: "sauda",
    customerName: "Asha",
    makerName: "Ravi",
    description: "Natural walnut veneer, four drawers, installation included.",
    createdAt: T0,
    updatedAt: T0,
    isDemo: false,
    sources: [
      { id: "src_c", kind: "manual_note", label: "Customer brief", excerpt: "Natural walnut veneer, four drawers, installation included.", capturedAt: T0, party: "customer" },
      { id: "src_m", kind: "manual_note", label: "Maker's initial offer", excerpt: "Walnut-colour laminate on 18 mm BWP plywood, three drawers, installation extra.", capturedAt: T0, party: "maker" },
    ],
    quotes: [],
    ambiguities: [],
    kaamNaksha: { version: 1, createdAt: T0, lastUpdatedAt: T0, completeness: 0, confirmations: [], fields: [] },
    revisions: [],
    outcomefindings: [],
  };
}

function withResolvedGap(job: Job, key = "finish", note = "Customer accepts laminate"): Job {
  return {
    ...job,
    ambiguities: [
      ...job.ambiguities,
      {
        id: `amb_${key}`,
        fieldKey: key,
        fieldLabel: "Finish",
        interpretationA: "Natural veneer",
        interpretationB: "Laminate",
        consequence: "Price and look differ",
        materialImpact: "high",
        clarificationQuestion: "Is it real walnut veneer or walnut-colour laminate?",
        sourceIds: ["src_c", "src_m"],
        resolved: true,
        resolvedAt: T1,
        resolvedBy: "both",
        resolutionNote: note,
      },
    ],
  };
}

/** Walk one field to "confirmed by both". */
function confirmed(job: Job, key: string): Job {
  return confirmField(confirmField(job, key, "customer", T1), key, "maker", T2);
}

const field = (job: Job, key: string): SpecField => job.kaamNaksha.fields.find((f) => f.key === key)!;

// ── Task 1: route schema uses the canonical types ─────────────────────────────

describe("analysis request schema", () => {
  it("accepts the synthetic demo job (Analyze and Re-analyze must not fail)", () => {
    expect(RequestSchema.safeParse({ job: DEMO_JOB }).success).toBe(true);
  });

  it("accepts a job created through the interface, including sources the new workflow adds", () => {
    let job = freshJob();
    job = addSpecField(job, { label: "Drawers", value: "4" }, T1);
    job = confirmed(job, "drawers");
    job = recordDelivery(job, { fieldKey: "drawers", reportedValue: "3", reportedBy: "inspection" }, T3);
    expect(job.sources.some((s) => s.party === "inspection")).toBe(true);
    expect(job.sources.some((s) => s.party === "entered")).toBe(true);
    expect(RequestSchema.safeParse({ job }).success).toBe(true);
  });

  it("still rejects an unknown source kind or party", () => {
    const bad = { ...freshJob(), sources: [{ id: "x", kind: "carrier_pigeon", label: "x", capturedAt: T0, party: "customer" }] };
    expect(RequestSchema.safeParse({ job: bad }).success).toBe(false);
    const bad2 = { ...freshJob(), sources: [{ id: "x", kind: "manual_note", label: "x", capturedAt: T0, party: "stranger" }] };
    expect(RequestSchema.safeParse({ job: bad2 }).success).toBe(false);
  });
});

describe("saving suggested spec fields", () => {
  const result = (over: Partial<AnalysisResult> = {}): AnalysisResult => ({
    providerUsed: "openai-compatible",
    analysisVersion: "test",
    summary: "s",
    ambiguities: [
      { fieldKey: "finish", fieldLabel: "Finish", interpretationA: "a", interpretationB: "b", consequence: "c", materialImpact: "high", clarificationQuestion: "q", sourceIds: ["src_c", "nope"] },
    ],
    suggestedSpecFields: [
      { key: "finish", label: "Finish", status: "possible_mismatch", value: "walnut", customerMeaning: "veneer", makerMeaning: "laminate" },
      { key: "drawers", label: "Drawers", status: "confirmed", value: 4, agreedValue: 4 },
    ],
    ...over,
  });
  const valid = new Set(["src_c", "src_m"]);

  it("saves valid suggestions as unreviewed fields and never as confirmed", () => {
    const job = mergeSuggestedFields(freshJob(), result(), valid, T1);
    expect(job.kaamNaksha.fields).toHaveLength(2);
    const drawers = field(job, "drawers");
    expect(drawers.status).toBe("proposed");
    expect(drawers.agreedValue).toBeUndefined();
    expect(drawers.notes).toMatch(/Not yet reviewed/);
    expect(field(job, "finish").sourceIds).toEqual(["src_c"]);
  });

  it("does not overwrite a field that already exists", () => {
    const base = addSpecField(freshJob(), { label: "Finish", value: "Laminate" }, T0);
    const job = mergeSuggestedFields(base, result(), valid, T1);
    expect(field(job, "finish").value).toBe("Laminate");
    expect(job.kaamNaksha.fields.map((f) => f.key).sort()).toEqual(["drawers", "finish"]);
  });

  it("does not save the demo starter checklist on a real job", () => {
    const job = mergeSuggestedFields(freshJob(), result({ providerUsed: "demo" }), valid, T1);
    expect(job.kaamNaksha.fields).toHaveLength(0);
  });

  it("ignores malformed suggestions", () => {
    const job = mergeSuggestedFields(
      freshJob(),
      result({ suggestedSpecFields: [{ key: "", label: "x", status: "proposed" }, { key: "k", label: "", status: "proposed" }] as never }),
      valid,
      T1
    );
    expect(job.kaamNaksha.fields).toHaveLength(0);
  });
});

// ── Task 2: clarified answer becomes a PROPOSED field ─────────────────────────

describe("adding a clarified answer to KAAM-NAKSHA", () => {
  it("requires the clarification to be answered first", () => {
    const job = { ...withResolvedGap(freshJob()) };
    job.ambiguities = job.ambiguities.map((a) => ({ ...a, resolved: false }));
    expect(() => addFieldFromAmbiguity(job, "amb_finish", "Laminate", T2)).toThrow(/mark it resolved/);
  });

  it("creates a PROPOSED field with its source. An answer is not a confirmation", () => {
    const job = addFieldFromAmbiguity(withResolvedGap(freshJob()), "amb_finish", "Walnut-colour laminate", T2);
    const f = field(job, "finish");
    expect(f.status).toBe("proposed");
    expect(f.value).toBe("Walnut-colour laminate");
    expect(f.agreedValue).toBeUndefined();
    expect(f.roleConfirmations).toBeUndefined();
    expect(fieldState(f)).toBe("proposed");
    expect(f.sourceIds).toEqual(expect.arrayContaining(["src_c", "src_m"]));
    expect(f.sourceIds.length).toBe(3);
    expect(job.ambiguities[0].specFieldKey).toBe("finish");
    expect(job.kaamNaksha.confirmations).toHaveLength(0);
  });

  it("cannot be added twice, and cannot overwrite a confirmed field", () => {
    const once = addFieldFromAmbiguity(withResolvedGap(freshJob()), "amb_finish", "Laminate", T2);
    expect(() => addFieldFromAmbiguity(once, "amb_finish", "Veneer", T3)).toThrow(/already in KAAM-NAKSHA/);

    const done = confirmed(once, "finish");
    const again = withResolvedGap({ ...done, ambiguities: [] }, "finish", "Different answer");
    expect(() => addFieldFromAmbiguity(again, "amb_finish", "Veneer", T3)).toThrow(/already in KAAM-NAKSHA as confirmed/);
  });

  it("refreshes an unreviewed model suggestion with the recorded answer", () => {
    const suggested = mergeSuggestedFields(
      withResolvedGap(freshJob()),
      {
        providerUsed: "openai-compatible",
        analysisVersion: "t",
        summary: "",
        ambiguities: [],
        suggestedSpecFields: [{ key: "finish", label: "Finish", status: "possible_mismatch", value: "walnut", customerMeaning: "veneer", makerMeaning: "laminate" }],
      },
      new Set(["src_c", "src_m"]),
      T1
    );
    expect(field(suggested, "finish").status).toBe("possible_mismatch");
    const job = addFieldFromAmbiguity(suggested, "amb_finish", "Laminate", T2);
    expect(job.kaamNaksha.fields).toHaveLength(1);
    expect(field(job, "finish").status).toBe("proposed");
    expect(field(job, "finish").value).toBe("Laminate");
    expect(field(job, "finish").customerMeaning).toBe("veneer");
  });
});

// ── Task 3: VAADA ─────────────────────────────────────────────────────────────

describe("specification fields", () => {
  it("adds a field by hand as proposed, with a source", () => {
    const job = addSpecField(freshJob(), { label: "Number of drawers", value: "4" }, T1);
    const f = field(job, "number_of_drawers");
    expect(f.status).toBe("proposed");
    expect(f.sourceIds).toHaveLength(1);
    expect(job.sources.find((s) => s.id === f.sourceIds[0])?.party).toBe("entered");
    expect(() => addSpecField(job, { label: "", value: "x" }, T2)).toThrow();
    expect(() => addSpecField(job, { label: "x", value: " " }, T2)).toThrow();
  });

  it("keeps keys unique", () => {
    let job = addSpecField(freshJob(), { label: "Drawers", value: "4" }, T1);
    job = addSpecField(job, { label: "Drawers", value: "3" }, T2);
    expect(job.kaamNaksha.fields.map((f) => f.key)).toEqual(["drawers", "drawers_2"]);
  });

  it("edits a proposed field directly", () => {
    let job = addSpecField(freshJob(), { label: "Drawers", value: "4" }, T1);
    job = editProposedField(job, "drawers", { value: "5", notes: "per sketch" }, T2);
    expect(field(job, "drawers").value).toBe("5");
    expect(field(job, "drawers").notes).toBe("per sketch");
  });

  it("will not edit a field that already has a confirmation. It needs a proposed change", () => {
    let job = addSpecField(freshJob(), { label: "Drawers", value: "4" }, T1);
    job = confirmField(job, "drawers", "customer", T2);
    expect(() => editProposedField(job, "drawers", { value: "3" }, T3)).toThrow(/Propose a change/);
  });
});

describe("confirming as customer and as maker", () => {
  const base = () => addSpecField(freshJob(), { label: "Drawers", value: "4" }, T0);

  it("records which role marked it and when, and waits for the other role", () => {
    const job = confirmField(base(), "drawers", "customer", T1);
    const f = field(job, "drawers");
    expect(fieldState(f)).toBe("awaiting_maker");
    expect(f.status).toBe("proposed");
    expect(f.agreedValue).toBeUndefined();
    expect(f.roleConfirmations?.customer).toEqual({ at: T1, value: "4", specVersion: 1 });
    expect(f.roleConfirmations?.maker).toBeUndefined();
    expect(job.kaamNaksha.confirmations).toHaveLength(1);
    expect(job.kaamNaksha.confirmations[0]).toMatchObject({ party: "customer", confirmedAt: T1 });
    expect(job.kaamNaksha.confirmations[0].statement).toMatch(/Marked as confirmed for the customer in AAKAAR/);
  });

  it("is confirmed only after both roles have marked, then fixes the agreed value", () => {
    const job = confirmed(base(), "drawers");
    const f = field(job, "drawers");
    expect(fieldState(f)).toBe("confirmed");
    expect(f.status).toBe("confirmed");
    expect(f.agreedValue).toBe("4");
    expect(job.kaamNaksha.version).toBe(1);
    expect(job.kaamNaksha.confirmations).toHaveLength(2);
    expect(job.kaamNaksha.completeness).toBe(100);
  });

  it("works in either order", () => {
    const job = confirmField(confirmField(base(), "drawers", "maker", T1), "drawers", "customer", T2);
    expect(field(job, "drawers").status).toBe("confirmed");
  });

  it("refuses the same role twice, empty fields, and unclear fields", () => {
    const once = confirmField(base(), "drawers", "customer", T1);
    expect(() => confirmField(once, "drawers", "customer", T2)).toThrow(/already marked/);
    const unclear = mergeSuggestedFields(
      freshJob(),
      { providerUsed: "x", analysisVersion: "", summary: "", ambiguities: [], suggestedSpecFields: [{ key: "k", label: "K", status: "possible_mismatch" }] },
      new Set(),
      T1
    );
    expect(() => confirmField(unclear, "k", "customer", T2)).toThrow();
  });
});

describe("changing a confirmed field", () => {
  const confirmedDrawers = () => confirmed(addSpecField(freshJob(), { label: "Drawers", value: "3" }, T0), "drawers");

  it("a proposed change leaves the confirmed specification untouched", () => {
    const job = proposeRevision(confirmedDrawers(), "drawers", { newValue: "4", reason: "Customer wants four", proposedBy: "customer" }, T3);
    const f = field(job, "drawers");
    expect(f.status).toBe("confirmed");
    expect(f.agreedValue).toBe("3");
    expect(job.revisions).toHaveLength(1);
    expect(job.revisions[0]).toMatchObject({ status: "proposed", previousValue: "3", newValue: "4", proposedBy: "customer" });
  });

  it("rejects a no-op change, a missing reason, and a second change while one is waiting", () => {
    const job = confirmedDrawers();
    expect(() => proposeRevision(job, "drawers", { newValue: "three", reason: "x", proposedBy: "maker" }, T3)).toThrow(/same/);
    expect(() => proposeRevision(job, "drawers", { newValue: "4", reason: " ", proposedBy: "maker" }, T3)).toThrow(/why/i);
    const one = proposeRevision(job, "drawers", { newValue: "4", reason: "r", proposedBy: "maker" }, T3);
    expect(() => proposeRevision(one, "drawers", { newValue: "5", reason: "r", proposedBy: "maker" }, T3)).toThrow(/already waiting/);
  });

  it("must be accepted by the other role, then needs confirming again by both", () => {
    let job = proposeRevision(confirmedDrawers(), "drawers", { newValue: "4", reason: "Customer wants four", proposedBy: "customer" }, T3);
    const revId = job.revisions[0].id;
    expect(() => respondToRevision(job, revId, "customer", "accept", T3)).toThrow(/other role/);

    job = respondToRevision(job, revId, "maker", "accept", T3);
    let f = field(job, "drawers");
    expect(job.revisions[0]).toMatchObject({ status: "accepted", acceptedBy: "maker", previousValue: "3" });
    expect(f.status).toBe("changed");
    expect(f.value).toBe("4");
    expect(f.agreedValue).toBeUndefined();
    expect(f.roleConfirmations).toBeUndefined();
    expect(fieldState(f)).toBe("proposed");
    expect(deliveryOverview(job)).toHaveLength(0);

    // the earlier confirmations stay in the log
    expect(job.kaamNaksha.confirmations).toHaveLength(2);

    job = confirmField(job, "drawers", "customer", T3);
    expect(fieldState(field(job, "drawers"))).toBe("awaiting_maker");
    job = confirmField(job, "drawers", "maker", T3);
    f = field(job, "drawers");
    expect(f.status).toBe("confirmed");
    expect(f.agreedValue).toBe("4");
    expect(deliveryOverview(job)).toHaveLength(1);
  });

  it("a waiting change blocks confirming until it is answered", () => {
    const job = proposeRevision(addSpecField(freshJob(), { label: "Drawers", value: "3" }, T0), "drawers", { newValue: "4", reason: "r", proposedBy: "customer" }, T1);
    expect(() => confirmField(job, "drawers", "maker", T2)).toThrow(/proposed change is waiting/);
  });

  it("a rejected change leaves the value as it was", () => {
    let job = proposeRevision(confirmedDrawers(), "drawers", { newValue: "4", reason: "r", proposedBy: "customer" }, T3);
    job = respondToRevision(job, job.revisions[0].id, "maker", "reject", T3);
    expect(job.revisions[0]).toMatchObject({ status: "rejected", rejectedBy: "maker" });
    expect(field(job, "drawers")).toMatchObject({ status: "confirmed", agreedValue: "3" });
    expect(() => respondToRevision(job, job.revisions[0].id, "maker", "accept", T3)).toThrow(/already been answered/);
  });
});

// ── Task 4: KYA HUA? ──────────────────────────────────────────────────────────

describe("comparing a reported value with the agreed value", () => {
  it("treats number words and digits, and rupee formats, as the same", () => {
    expect(normalizeValue("Three drawers")).toBe("3 drawers");
    expect(compareValues("3 drawers", "three drawers")).toBe(true);
    expect(compareValues("₹29,200", "Rs 29200")).toBe(true);
    expect(compareValues("4", "3")).toBe(false);
    expect(compareValues("4 drawers", "3 drawers")).toBe(false);
    expect(compareValues("", "")).toBe(false);
  });
});

describe("recording delivery", () => {
  const ready = () => {
    let job = addSpecField(freshJob(), { label: "Drawers", value: "4" }, T0);
    job = addSpecField(job, { label: "Finish", value: "Laminate" }, T0);
    job = addSpecField(job, { label: "Handles", value: "Brass" }, T0);
    job = confirmed(job, "drawers");
    job = confirmed(job, "finish");
    return job; // handles stays unconfirmed
  };

  it("only a field confirmed by both can be checked", () => {
    expect(() => recordDelivery(ready(), { fieldKey: "handles", reportedValue: "Brass", reportedBy: "customer" }, T3)).toThrow(/confirmed by both/);
    expect(() => recordDelivery(ready(), { fieldKey: "drawers", reportedValue: " ", reportedBy: "customer" }, T3)).toThrow();
  });

  it("shows a reported difference and keeps the confirmed specification", () => {
    const job = recordDelivery(ready(), { fieldKey: "drawers", reportedValue: "3", reportedBy: "customer", note: "Counted on delivery" }, T3);
    const f = job.outcomefindings[0];
    expect(f).toMatchObject({ outcome: "difference", status: "open", agreedValue: "4", observedValue: "3", reportedBy: "customer" });
    expect(f.discrepancy).toMatch(/customer reports "3"/);
    expect(field(job, "drawers")).toMatchObject({ status: "confirmed", agreedValue: "4" });
    const src = job.sources.find((s) => s.id === f.evidenceSourceIds[0])!;
    expect(src.label).toMatch(/typed, reported by customer/);
  });

  it("shows a match", () => {
    const job = recordDelivery(ready(), { fieldKey: "finish", reportedValue: "laminate", reportedBy: "inspection" }, T3);
    expect(job.outcomefindings[0]).toMatchObject({ outcome: "match", status: "resolved" });
    expect(job.sources.find((s) => s.id === job.outcomefindings[0].evidenceSourceIds[0])?.party).toBe("inspection");
  });

  it("lists matches, differences and fields not checked", () => {
    let job = recordDelivery(ready(), { fieldKey: "drawers", reportedValue: "3", reportedBy: "customer" }, T3);
    expect(deliveryOverview(job).map((r) => [r.field.key, r.state])).toEqual([
      ["drawers", "difference"],
      ["finish", "not_checked"],
    ]);
    job = recordDelivery(job, { fieldKey: "finish", reportedValue: "Laminate", reportedBy: "maker" }, T3);
    expect(deliveryOverview(job).map((r) => r.state)).toEqual(["difference", "match"]);
  });

  it("the latest report for a field decides, and a difference can be settled with a note", () => {
    let job = recordDelivery(ready(), { fieldKey: "drawers", reportedValue: "3", reportedBy: "customer" }, T2);
    job = recordDelivery(job, { fieldKey: "drawers", reportedValue: "4", reportedBy: "inspection" }, T3);
    expect(deliveryOverview(job)[0].state).toBe("match");
    const open = job.outcomefindings.find((f) => f.status === "open")!;
    expect(() => settleFinding(job, open.id, " ", T3)).toThrow();
    job = settleFinding(job, open.id, "Fourth drawer delivered next day", T3);
    expect(job.outcomefindings.find((f) => f.id === open.id)).toMatchObject({ status: "resolved", resolutionNote: "Fourth drawer delivered next day" });
  });
});

describe("a revised specification is never compared with an obsolete report", () => {
  const withReport = () => {
    let job = addSpecField(freshJob(), { label: "Drawers", value: "3" }, T0);
    job = confirmed(job, "drawers");
    return recordDelivery(job, { fieldKey: "drawers", reportedValue: "4", reportedBy: "customer" }, T1);
  };

  it("a report against the current value counts", () => {
    const job = withReport();
    expect(isStaleFinding(job, job.outcomefindings[0])).toBe(false);
    expect(deliveryOverview(job)[0].state).toBe("difference");
  });

  it("after a change is accepted and reconfirmed, the earlier report is kept but not compared with the new value", () => {
    let job = withReport();
    job = proposeRevision(job, "drawers", { newValue: "4", reason: "Customer wants four", proposedBy: "customer" }, T2);
    job = respondToRevision(job, job.revisions[0].id, "maker", "accept", T2);
    job = confirmField(job, "drawers", "customer", T3);
    job = confirmField(job, "drawers", "maker", T3);

    const [row] = deliveryOverview(job);
    expect(job.outcomefindings).toHaveLength(1); // nothing is deleted
    expect(isStaleFinding(job, job.outcomefindings[0])).toBe(true);
    expect(row.state).toBe("not_checked");
    expect(row.finding).toBeUndefined();
    expect(row.earlier?.id).toBe(job.outcomefindings[0].id);
    // The old difference is not an open problem against the current agreement.
    expect(stageInfo(job).find((s) => s.id === "kya_hua")?.state).not.toBe("needs_decision");
  });

  it("a new report after the change is compared with the new value", () => {
    let job = withReport();
    job = proposeRevision(job, "drawers", { newValue: "4", reason: "Customer wants four", proposedBy: "customer" }, T2);
    job = respondToRevision(job, job.revisions[0].id, "maker", "accept", T2);
    job = confirmField(job, "drawers", "customer", T3);
    job = confirmField(job, "drawers", "maker", T3);
    job = recordDelivery(job, { fieldKey: "drawers", reportedValue: "4", reportedBy: "customer" }, "2026-11-07T11:00:00.000Z");
    expect(deliveryOverview(job)[0].state).toBe("match");
  });

  it("seeded findings without a typed report are left alone", () => {
    const demo = DEMO_JOB;
    for (const f of demo.outcomefindings) expect(isStaleFinding(demo, f)).toBe(false);
  });
});

// ── Task 5: honest stages and next steps ──────────────────────────────────────

describe("stage state and next step follow the real job", () => {
  const states = (job: Job) => Object.fromEntries(stageInfo(job).map((s) => [s.id, s.state]));

  it("a fresh job has nothing started, and opening a stage changes nothing", () => {
    const job = freshJob();
    expect(states(job)).toEqual({ sauda: "not_started", samajh: "not_started", vaada: "not_started", kya_hua: "not_started" });
    expect(nextAction(job)).toBe("Add the quotes you received");
    expect(stageNext(job, "sauda")).toMatch(/first quote/);
  });

  it("walks the next step through the journey", () => {
    let job: Job = { ...freshJob(), quotes: [{ id: "q", makerName: "R", submittedAt: T0, lines: [], unknownItems: [], nonEquivalentItems: [], knownTotalRs: 0, status: "received", sourceIds: [] }] };
    expect(nextAction(job)).toBe("Run the check for gaps");

    job = { ...job, ambiguities: [{ ...withResolvedGap(freshJob()).ambiguities[0], resolved: false }] };
    expect(nextAction(job)).toBe("Ask 1 open question");
    expect(states(job).samajh).toBe("needs_decision");

    job = withResolvedGap({ ...job, ambiguities: [] });
    expect(nextAction(job)).toBe("Add 1 answer to the specification");
    expect(states(job).samajh).toBe("answered");

    job = addFieldFromAmbiguity(job, "amb_finish", "Laminate", T2);
    expect(nextAction(job)).toBe("Confirm 1 field as customer and maker");
    expect(states(job).vaada).toBe("in_progress");

    job = confirmed(job, "finish");
    expect(states(job).vaada).toBe("confirmed");
    expect(nextAction(job)).toBe("Record what was delivered");
    expect(states(job).kya_hua).toBe("not_started");

    job = recordDelivery(job, { fieldKey: "finish", reportedValue: "Veneer", reportedBy: "customer" }, T3);
    expect(states(job).kya_hua).toBe("needs_decision");
    expect(nextAction(job)).toBe("Review 1 reported difference");

    job = settleFinding(job, job.outcomefindings[0].id, "Redone in laminate", T3);
    expect(states(job).kya_hua).toBe("outcome_recorded");
    expect(nextAction(job)).toBe("Nothing waiting");
  });

  it("delivery is not called checked while a confirmed field has no report", () => {
    let job = confirmed(addSpecField(addSpecField(freshJob(), { label: "A", value: "1" }, T0), { label: "B", value: "2" }, T0), "a");
    job = confirmed(job, "b");
    job = recordDelivery(job, { fieldKey: "a", reportedValue: "1", reportedBy: "maker" }, T3);
    expect(states(job).kya_hua).toBe("in_progress");
    expect(nextAction(job)).toBe("Record what was delivered");
  });

  it("a proposed change makes VAADA need a decision", () => {
    const job = proposeRevision(confirmed(addSpecField(freshJob(), { label: "Drawers", value: "3" }, T0), "drawers"), "drawers", { newValue: "4", reason: "r", proposedBy: "customer" }, T3);
    expect(states(job).vaada).toBe("needs_decision");
    expect(nextAction(job)).toBe("Answer 1 proposed change");
  });
});

// ── Task 6: older saved jobs and the demo keep working ───────────────────────

describe("backward compatibility", () => {
  it("a field confirmed before per-role marks existed still counts as confirmed", () => {
    const legacy: SpecField = { key: "dimensions", label: "Dimensions", value: "6ft", agreedValue: "6ft", status: "confirmed", sourceIds: [], confirmationBy: ["customer", "maker"] };
    expect(fieldState(legacy)).toBe("confirmed");
    const job: Job = { ...freshJob(), kaamNaksha: { ...freshJob().kaamNaksha, fields: [legacy] } };
    expect(deliveryOverview(job)).toHaveLength(1);
    const after = recordDelivery(job, { fieldKey: "dimensions", reportedValue: "5ft", reportedBy: "customer" }, T3);
    expect(after.outcomefindings[0].outcome).toBe("difference");
  });

  it("the synthetic demo job still produces stage states and a next step", () => {
    const info = stageInfo(DEMO_JOB);
    expect(info).toHaveLength(4);
    expect(typeof nextAction(DEMO_JOB)).toBe("string");
    expect(DEMO_JOB.isDemo).toBe(true);
    // the old reported difference (4 agreed, 3 reported) is still a difference
    const k = DEMO_JOB.outcomefindings[0];
    expect(compareValues(k.agreedValue, k.observedValue)).toBe(false);
  });

  it("a job without any of the new optional fields can go through the whole workflow", () => {
    const old = JSON.parse(JSON.stringify(freshJob())) as Job;
    delete (old as Partial<Job>).customerName;
    const job = confirmed(addSpecField(old, { label: "Drawers", value: "4" }, T0), "drawers");
    expect(field(job, "drawers").status).toBe("confirmed");
  });
});

// ── The whole journey on one fresh job ───────────────────────────────────────

describe("complete journey on a new job", () => {
  it("new job, two quotes, clarification, spec, confirmation, delivery, reported difference", () => {
    let job = freshJob();

    // SAMAJH: the analysis found the veneer/laminate gap, the user asked and wrote the answer
    job = withResolvedGap(job, "finish", "Customer accepts walnut-colour laminate");
    job = addFieldFromAmbiguity(job, "amb_finish", "Walnut-colour laminate", T1);

    // Drawers and installation added by hand in VAADA
    job = addSpecField(job, { label: "Number of drawers", value: "4" }, T1);
    job = addSpecField(job, { label: "Installation", value: "Included" }, T1);

    // Confirmation, each role separately
    job = confirmed(job, "finish");
    job = confirmed(job, "number_of_drawers");
    expect(field(job, "installation").status).toBe("proposed");

    // Changed field: installation becomes extra, then both must confirm again
    job = confirmField(job, "installation", "customer", T2);
    job = proposeRevision(job, "installation", { newValue: "Extra", reason: "Maker quote", proposedBy: "maker" }, T2) as Job;
    expect(deliveryOverview(job).map((r) => r.field.key)).toEqual(["finish", "number_of_drawers"]);

    // KYA HUA?
    job = recordDelivery(job, { fieldKey: "number_of_drawers", reportedValue: "three drawers delivered", reportedBy: "customer" }, T3);
    const rows = Object.fromEntries(deliveryOverview(job).map((r) => [r.field.key, r.state]));
    expect(rows).toEqual({ finish: "not_checked", number_of_drawers: "difference" });
    expect(field(job, "number_of_drawers").agreedValue).toBe("4");
    expect(RequestSchema.safeParse({ job }).success).toBe(true);
  });
});

// ── Gap check results: no gaps is an answer, not "never run" ─────────────────

describe("a check that finds no gaps", () => {
  it("is not shown as not started, and does not tell the user to run it again", () => {
    const job: Job = { ...freshJob(), quotes: [{ id: "q", makerName: "R", submittedAt: T0, lines: [], unknownItems: [], nonEquivalentItems: [], knownTotalRs: 0, status: "received", sourceIds: [] }] };
    expect(nextAction(job)).toBe("Run the check for gaps");
    const checked: Job = { ...job, lastAnalysis: { at: T1, providerUsed: "openai-compatible:test", gapsFound: 0 } };
    expect(stageInfo(checked).find((s) => s.id === "samajh")?.state).toBe("no_gaps");
    expect(nextAction(checked)).toBe("Add the agreed points to KAAM-NAKSHA");
    expect(stageNext(checked, "samajh")).toMatch(/no gaps/);
  });
});

describe("reading a model reply", () => {
  it("accepts plain JSON, fenced JSON, and JSON with text around it", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n{"a":{"b":2}}\nHope that helps')).toEqual({ a: { b: 2 } });
  });
  it("fails loudly when there is no JSON", () => {
    expect(() => extractJson("I cannot help with that")).toThrow(/did not return JSON/);
  });
});