// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Job workflow transitions
//
// Pure functions. Each takes a Job and returns a NEW Job (or throws an Error
// with a plain sentence the UI can show). No network, no storage, no AI.
//
// What these functions guarantee:
//  - A clarification answer is not a confirmation. Adding it to KAAM-NAKSHA
//    creates a PROPOSED field only.
//  - A field becomes "confirmed" only after the customer role AND the maker
//    role have each marked the same current value. A mark is a record that a
//    button was pressed for that role. It is not a signature.
//  - Changing an agreed value goes through a revision. The old value stays on
//    record, and the field must be confirmed again by both roles.
//  - Delivery reports are typed statements. They are compared with the agreed
//    value by the app, and a report that cannot be compared (a "yes" against an
//    agreed price) is never called a difference. Nothing here claims anything
//    was inspected.
//  - The KAAM-NAKSHA version counts changes to its CONTENT: a field added, a
//    value edited, a change accepted. Recording a confirmation does not bump it.
//  - A rule for choosing between quotes ("lowest price wins") is never saved as
//    a detail of the work.
// ──────────────────────────────────────────────────────────────────────────────

import type {
  Ambiguity,
  AnalysisResult,
  EvidenceSource,
  FieldStatus,
  Job,
  KaamNaksha,
  OutcomeFinding,
  PartyConfirmation,
  Revision,
  SpecField,
  VersionEntry,
} from "@/lib/types";
import {
  compareReport,
  inferValueKind,
  isDecisionRule,
  looksLikeInventedRate,
  mentionedAsMoney,
  parseNumeric,
  type ValueKind,
} from "@/lib/spec/values";
import { applyRevision, computeCompleteness } from "@/lib/spec/diff";
import { normalizeFieldKey } from "@/lib/utils/fieldKey";

export type Role = "customer" | "maker";
export type Reporter = "customer" | "maker" | "inspection";

const ROLES: Role[] = ["customer", "maker"];

// ── Small helpers ─────────────────────────────────────────────────────────────

let counter = 0;
function makeId(prefix: string, now: string): string {
  counter += 1;
  return `${prefix}_${new Date(now).getTime().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** The text of a field's current value ("" when none). */
export function valueText(field: Pick<SpecField, "value" | "agreedValue">): string {
  const v = field.value ?? field.agreedValue;
  return v === undefined || v === null ? "" : String(v).trim();
}

/** The agreed value as text. Legacy confirmed fields without agreedValue fall back to value. */
export function agreedText(field: SpecField): string {
  const v = field.agreedValue ?? field.value;
  return v === undefined || v === null ? "" : String(v).trim();
}

function findField(job: Job, key: string): SpecField {
  const f = job.kaamNaksha.fields.find((x) => x.key === key);
  if (!f) throw new Error("That specification field was not found.");
  return f;
}

function withNaksha(job: Job, patch: Partial<KaamNaksha>, now: string): Job {
  return {
    ...job,
    kaamNaksha: { ...job.kaamNaksha, ...patch, lastUpdatedAt: now },
    updatedAt: now,
  };
}

/**
 * A change to the CONTENT of the specification. The first content creates version 1;
 * every later change creates the next version and says what changed.
 */
function contentChange(
  job: Job,
  entry: Omit<VersionEntry, "version" | "at">,
  now: string
): { version: number; history: VersionEntry[] } {
  const first = job.kaamNaksha.fields.length === 0 && (job.kaamNaksha.history ?? []).length === 0;
  const version = first ? Math.max(job.kaamNaksha.version, 1) : job.kaamNaksha.version + 1;
  return {
    version,
    history: [...(job.kaamNaksha.history ?? []), { ...entry, version, at: now }],
  };
}

/** A gap in SAMAJH about this field that nobody has resolved yet. */
export function openGapFor(job: Job, fieldKey: string): Ambiguity | undefined {
  const k = normalizeFieldKey(fieldKey);
  return job.ambiguities.find((a) => !a.resolved && (normalizeFieldKey(a.fieldKey) === k || a.specFieldKey === fieldKey));
}

/** Where a field came from: suggested by analysis, entered by a person, or from a recorded answer. */
export function fieldOrigin(field: SpecField): "suggested" | "entered" | "from_answer" {
  if (field.origin) return field.origin;
  if (field.fromAmbiguityId) return "from_answer";
  if (/Suggested by analysis/i.test(field.notes ?? "")) return "suggested";
  return "entered";
}

function replaceField(fields: SpecField[], next: SpecField): SpecField[] {
  return fields.map((f) => (f.key === next.key ? next : f));
}

function newSource(
  label: string,
  excerpt: string,
  party: EvidenceSource["party"],
  now: string
): EvidenceSource {
  return {
    id: makeId("src", now),
    kind: "manual_note",
    label,
    excerpt,
    capturedAt: now,
    party,
  };
}

function uniqueKey(base: string, fields: SpecField[]): string {
  const root = normalizeFieldKey(base) || "field";
  const taken = new Set(fields.map((f) => f.key));
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}_${n}`)) n += 1;
  return `${root}_${n}`;
}

// ── Field state, derived from what has actually been recorded ────────────────

export type FieldState =
  | "needs_decision"
  | "unclear"
  | "proposed"
  | "awaiting_customer"
  | "awaiting_maker"
  | "confirmed";

export const FIELD_STATE_LABEL: Record<FieldState, string> = {
  needs_decision: "Needs decision",
  unclear: "Unclear",
  proposed: "Proposed for agreement",
  awaiting_customer: "Awaiting customer confirmation",
  awaiting_maker: "Awaiting maker confirmation",
  confirmed: "Confirmed by both",
};

/** A mark only counts while it refers to the value the field has right now. */
function validMark(field: SpecField, role: Role): boolean {
  const mark = field.roleConfirmations?.[role];
  return !!mark && mark.value === valueText(field);
}

export function fieldState(field: SpecField): FieldState {
  // Fields saved before per-role marks existed are "confirmed" by their status alone.
  if (field.status === "confirmed") return "confirmed";
  if (field.status === "possible_mismatch" || field.status === "disputed" || field.status === "rejected") {
    return "needs_decision";
  }
  if (valueText(field) === "") return "unclear";
  const c = validMark(field, "customer");
  const m = validMark(field, "maker");
  if (c && m) return "confirmed";
  if (c) return "awaiting_maker";
  if (m) return "awaiting_customer";
  if (field.status === "unclear" || field.status === "unverified") return "unclear";
  return "proposed";
}

export function isRevised(field: SpecField): boolean {
  return field.status === "changed";
}

/** The role that still has to confirm, or null when none/both. */
export function awaitedRoles(field: SpecField): Role[] {
  const state = fieldState(field);
  if (state === "awaiting_maker") return ["maker"];
  if (state === "awaiting_customer") return ["customer"];
  if (state === "proposed") return ["customer", "maker"];
  return [];
}

export function pendingRevisionFor(job: Job, key: string): Revision | undefined {
  return job.revisions.find((r) => r.fieldKey === key && r.status === "proposed");
}

export function pendingRevisions(job: Job): Revision[] {
  return job.revisions.filter((r) => r.status === "proposed");
}

/** Fields that are agreed by both roles and can be checked at delivery. */
export function confirmedFields(job: Job): SpecField[] {
  return job.kaamNaksha.fields.filter((f) => f.status === "confirmed");
}

// ── Task 1: saving model suggestions safely ──────────────────────────────────

const SUGGESTION_STATUSES: FieldStatus[] = ["proposed", "unclear", "possible_mismatch"];

function cap(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Save valid suggested spec fields from an analysis as UNREVIEWED fields.
 *
 * - The model can never create a confirmed or agreed field. "confirmed" is
 *   downgraded to "proposed" and any agreed value is dropped.
 * - A field that already exists (any status) is never overwritten.
 * - The starter checklist from the demo provider is not saved on real jobs,
 *   because it is not drawn from what the parties said.
 */
export function mergeSuggestedFields(
  job: Job,
  result: AnalysisResult,
  validSourceIds: Set<string>,
  now: string
): Job {
  if (result.providerUsed === "demo" && !job.isDemo) return job;

  const existing = new Set(job.kaamNaksha.fields.map((f) => normalizeFieldKey(f.key)));
  const added: SpecField[] = [];
  const skipped: { label: string; reason: string }[] = [];
  const sourceTexts = [job.description ?? "", ...job.sources.map((s) => s.excerpt ?? "")].filter(Boolean);

  for (const s of result.suggestedSpecFields ?? []) {
    if (!s || typeof s.key !== "string" || typeof s.label !== "string") continue;
    const key = normalizeFieldKey(s.key);
    const label = s.label.trim();
    if (!key || !label || existing.has(key)) continue;

    const rawValue = s.value;
    const value =
      typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean"
        ? cap(String(rawValue).trim(), 500)
        : undefined;

    // A rule for choosing between quotes is not a detail of the work.
    if (isDecisionRule(label, value)) {
      skipped.push({
        label: cap(label, 80),
        reason: "It reads like a rule for choosing between quotes, not a detail of the work, so it was not added to KAAM-NAKSHA.",
      });
      continue;
    }
    // A per-item rate that no one stated is invented, not read.
    if (looksLikeInventedRate(label, value, sourceTexts)) {
      skipped.push({
        label: cap(label, 80),
        reason: "It looks like a price per item, but nobody stated one in the sources, so it was not added.",
      });
      continue;
    }

    let status: FieldStatus = SUGGESTION_STATUSES.includes(s.status) ? s.status : "proposed";
    let kind: ValueKind = inferValueKind(label, value);
    let extraNote = "";

    // Numbers that were spoken as money stay money. If the model called one a quantity, say so.
    const parsed = value ? parseNumeric(value) : null;
    if (parsed && parsed.dimension !== "money" && mentionedAsMoney(parsed.base, sourceTexts)) {
      if (kind === "quantity" || kind === "text") {
        kind = "currency";
        if (/\b(number|count|qty|quantity|pieces|units|nos)\b/i.test(label)) {
          status = "unclear";
          extraNote = `In what was said, ${parsed.base.toLocaleString("en-IN")} refers to money, not a count. Check what it means before using it. `;
        }
      }
    }

    const related = (result.ambiguities ?? []).find((a) => normalizeFieldKey(a.fieldKey) === key);
    const sourceIds = (related?.sourceIds ?? []).filter((id) => validSourceIds.has(id));

    existing.add(key);
    added.push({
      key,
      label: cap(label, 120),
      labelHindi: typeof s.labelHindi === "string" ? cap(s.labelHindi, 120) : undefined,
      value: value === "" ? undefined : value,
      customerMeaning: typeof s.customerMeaning === "string" ? cap(s.customerMeaning, 500) : undefined,
      makerMeaning: typeof s.makerMeaning === "string" ? cap(s.makerMeaning, 500) : undefined,
      status,
      sourceIds,
      confirmationBy: ["customer", "maker"],
      lastChangedAt: now,
      valueKind: kind,
      origin: "suggested",
      notes: cap(
        (typeof s.notes === "string" && s.notes.trim() ? `${s.notes.trim()} ` : "") + extraNote + "Suggested by analysis. Not yet reviewed by either party.",
        600
      ),
    });
  }

  const withSkips =
    skipped.length > 0 && job.lastAnalysis
      ? { ...job, lastAnalysis: { ...job.lastAnalysis, skipped: [...(job.lastAnalysis.skipped ?? []), ...skipped] } }
      : job;
  if (added.length === 0) return withSkips;
  const change = contentChange(
    withSkips,
    { kind: "suggestions_added", summary: `${added.length} suggested ${added.length === 1 ? "field" : "fields"} added, not yet reviewed` },
    now
  );
  return withNaksha(withSkips, { fields: [...withSkips.kaamNaksha.fields, ...added], ...change }, now);
}

// ── Task 2: clarified answer becomes a PROPOSED field ────────────────────────

/**
 * Add a clarified answer to KAAM-NAKSHA. Creates (or refreshes an unreviewed
 * suggestion into) a PROPOSED field. It is never confirmed by this action.
 */
export function addFieldFromAmbiguity(
  job: Job,
  ambiguityId: string,
  value: string,
  now: string
): Job {
  const amb = job.ambiguities.find((a) => a.id === ambiguityId);
  if (!amb) throw new Error("That clarification was not found.");
  if (!amb.resolved) throw new Error("Record the answer and mark it resolved before adding it to KAAM-NAKSHA.");
  if (amb.specFieldKey) throw new Error("This clarification is already in KAAM-NAKSHA.");
  const text = value.trim();
  if (!text) throw new Error("Write the agreed value before adding it.");
  if (isDecisionRule(amb.fieldLabel, text)) {
    throw new Error("That reads like a rule for choosing between quotes, not a detail of the work. Keep it in the job notes, not in KAAM-NAKSHA.");
  }

  const key = normalizeFieldKey(amb.fieldKey) || "field";
  const label = amb.fieldLabel.replace(/\s*\(starter question\)\s*$/i, "").trim() || amb.fieldLabel;
  const src = newSource(
    `Answer recorded for ${label}`,
    `Question: ${amb.clarificationQuestion}\nAnswer: ${amb.resolutionNote ?? text}`,
    "entered",
    now
  );

  const existing = job.kaamNaksha.fields.find((f) => normalizeFieldKey(f.key) === key);
  let fields: SpecField[];
  let fieldKey: string;

  if (existing) {
    if (["confirmed", "changed", "disputed"].includes(existing.status)) {
      throw new Error(
        `"${existing.label}" is already in KAAM-NAKSHA as ${existing.status === "confirmed" ? "confirmed" : existing.status}. Propose a change there instead.`
      );
    }
    fieldKey = existing.key;
    fields = replaceField(job.kaamNaksha.fields, {
      ...existing,
      value: text,
      status: "proposed",
      roleConfirmations: undefined,
      sourceIds: [...new Set([...existing.sourceIds, ...amb.sourceIds, src.id])],
      lastChangedAt: now,
      fromAmbiguityId: amb.id,
      origin: "from_answer",
      valueKind: existing.valueKind ?? inferValueKind(existing.label, text),
      notes: `From clarification: "${amb.clarificationQuestion}"`,
    });
  } else {
    fieldKey = uniqueKey(key, job.kaamNaksha.fields);
    fields = [
      ...job.kaamNaksha.fields,
      {
        key: fieldKey,
        label,
        value: text,
        status: "proposed",
        sourceIds: [...new Set([...amb.sourceIds, src.id])],
        confirmationBy: ["customer", "maker"],
        lastChangedAt: now,
        fromAmbiguityId: amb.id,
        origin: "from_answer",
        valueKind: inferValueKind(label, text),
        notes: `From clarification: "${amb.clarificationQuestion}"`,
      },
    ];
  }

  const base = { ...job, sources: [...job.sources, src] };
  const change = contentChange(
    base,
    { kind: existing ? "value_edited" : "field_added", fieldKey, summary: `${label} added from an answered question: ${text}` },
    now
  );
  const next = withNaksha(base, { fields, completeness: computeCompleteness(fields), ...change }, now);
  return {
    ...next,
    ambiguities: next.ambiguities.map((a) => (a.id === amb.id ? { ...a, specFieldKey: fieldKey } : a)),
  };
}

// ── Task 3: VAADA actions ────────────────────────────────────────────────────

export interface NewFieldInput {
  label: string;
  value: string;
  notes?: string;
  /** Leave out to let AAKAAR work it out from the name and value. A person can always choose. */
  valueKind?: ValueKind;
}

/** Add a field by hand. It starts as PROPOSED with no confirmations. */
export function addSpecField(job: Job, input: NewFieldInput, now: string): Job {
  const label = input.label.trim();
  const value = input.value.trim();
  if (!label) throw new Error("Give the field a name, for example \"Number of drawers\".");
  if (!value) throw new Error("Write the value, for example \"4\".");
  if (isDecisionRule(label, value)) {
    throw new Error("That reads like a rule for choosing between quotes, not a detail of the work. Keep it in the job notes, not in KAAM-NAKSHA.");
  }

  const key = uniqueKey(label, job.kaamNaksha.fields);
  const src = newSource(
    `Field entered: ${label}`,
    `${label}: ${value}${input.notes?.trim() ? `\n${input.notes.trim()}` : ""}`,
    "entered",
    now
  );
  const fields: SpecField[] = [
    ...job.kaamNaksha.fields,
    {
      key,
      label,
      value,
      status: "proposed",
      sourceIds: [src.id],
      confirmationBy: ["customer", "maker"],
      lastChangedAt: now,
      notes: input.notes?.trim() || undefined,
      valueKind: input.valueKind ?? inferValueKind(label, value),
      origin: "entered",
    },
  ];
  const base = { ...job, sources: [...job.sources, src] };
  const change = contentChange(base, { kind: "field_added", fieldKey: key, summary: `${label} added: ${value}` }, now);
  return withNaksha(base, { fields, completeness: computeCompleteness(fields), ...change }, now);
}

/**
 * Edit a field that nobody has confirmed yet. Anything already marked,
 * confirmed or revised must go through a proposed change instead.
 */
export function editProposedField(
  job: Job,
  key: string,
  edits: { label?: string; value: string; notes?: string; valueKind?: ValueKind },
  now: string
): Job {
  const field = findField(job, key);
  const state = fieldState(field);
  const hasMarks = !!(field.roleConfirmations?.customer || field.roleConfirmations?.maker);
  if (state === "confirmed" || field.status === "changed" || hasMarks) {
    throw new Error("This field already has a confirmation or a change on record. Propose a change instead, so the earlier value stays visible.");
  }
  const value = edits.value.trim();
  if (!value) throw new Error("Write the value before saving.");
  const label = (edits.label ?? field.label).trim() || field.label;

  const valueChanged = value !== valueText(field);
  const next: SpecField = {
    ...field,
    label,
    value,
    status: "proposed",
    lastChangedAt: now,
    valueKind: edits.valueKind ?? field.valueKind ?? inferValueKind(label, value),
    notes: edits.notes !== undefined ? edits.notes.trim() || undefined : field.notes,
  };
  const fields = replaceField(job.kaamNaksha.fields, next);
  // Only a new value is a new version of the specification. Fixing a label or a note is not.
  const change = valueChanged
    ? contentChange(job, { kind: "value_edited", fieldKey: key, summary: `${label} changed from ${valueText(field) || "empty"} to ${value}` }, now)
    : {};
  return withNaksha(job, { fields, completeness: computeCompleteness(fields), ...change }, now);
}

/**
 * Record that someone marked the CURRENT value as confirmed for one role.
 * Not a signature. Becomes "confirmed" only when both roles have marked the
 * same value.
 */
export function confirmField(job: Job, key: string, role: Role, now: string): Job {
  if (!ROLES.includes(role)) throw new Error("Choose customer or maker.");
  const field = findField(job, key);
  const state = fieldState(field);

  if (state === "confirmed") throw new Error("Both roles have already marked this field as confirmed.");
  if (state === "needs_decision") throw new Error("This field needs a decision first. Edit it to a clear value.");
  if (valueText(field) === "") throw new Error("Add a value before confirming.");
  if (pendingRevisionFor(job, key)) throw new Error("A proposed change is waiting. Accept or reject it before confirming.");
  if (openGapFor(job, key)) {
    throw new Error("This point still has an open question in SAMAJH. A value was entered, but the two sides may not mean the same thing yet. Clear the question first.");
  }
  if (validMark(field, role)) throw new Error(`The ${role} has already marked this value as confirmed.`);

  const text = valueText(field);
  const roleConfirmations = {
    ...(field.roleConfirmations ?? {}),
    [role]: { at: now, value: text, specVersion: job.kaamNaksha.version },
  };

  let next: SpecField = { ...field, roleConfirmations, lastChangedAt: now };
  const bothMarked = ROLES.every((r) => {
    const m = roleConfirmations[r];
    return !!m && m.value === text;
  });

  const entry: PartyConfirmation = {
    id: makeId("conf", now),
    party: role,
    confirmedAt: now,
    specVersion: job.kaamNaksha.version,
    statement: `Marked as confirmed for the ${role} in AAKAAR: ${field.label} = ${text}`,
    fieldKeysConfirmed: [key],
  };

  // Confirming records who pressed what. It does not change the content, so the version stays put.
  const version = job.kaamNaksha.version;
  if (bothMarked) {
    next = { ...next, status: "confirmed", agreedValue: text, value: text };
  }

  const fields = replaceField(job.kaamNaksha.fields, next);
  return withNaksha(
    job,
    {
      fields,
      version,
      confirmations: [...job.kaamNaksha.confirmations, entry],
      completeness: computeCompleteness(fields),
    },
    now
  );
}

export interface RevisionInput {
  newValue: string;
  reason: string;
  proposedBy: Role;
  costImpactRs?: number;
  timeImpactDays?: number;
}

/** Propose a change. The field and its current value are NOT touched. */
export function proposeRevision(job: Job, key: string, input: RevisionInput, now: string): Job {
  const field = findField(job, key);
  const newValue = input.newValue.trim();
  const reason = input.reason.trim();
  const current = agreedText(field);
  if (!newValue) throw new Error("Write the new value.");
  if (!reason) throw new Error("Say why the value should change.");
  if (!ROLES.includes(input.proposedBy)) throw new Error("Choose who is proposing the change.");
  if (compareValues(current, newValue)) throw new Error("The new value is the same as the current value.");
  if (pendingRevisionFor(job, key)) throw new Error("A change is already waiting on this field.");

  const revision: Revision = {
    id: makeId("rev", now),
    proposedAt: now,
    proposedBy: input.proposedBy,
    fieldKey: key,
    fieldLabel: field.label,
    previousValue: current,
    newValue,
    reason,
    costImpactRs: input.costImpactRs,
    timeImpactDays: input.timeImpactDays,
    status: "proposed",
  };
  return { ...job, revisions: [...job.revisions, revision], updatedAt: now };
}

/**
 * Accept or reject a proposed change. Acceptance must come from the OTHER role
 * than the one that proposed it. After acceptance the field is "changed" and
 * both roles must confirm the new value again.
 */
export function respondToRevision(
  job: Job,
  revisionId: string,
  role: Role,
  decision: "accept" | "reject",
  now: string
): Job {
  const rev = job.revisions.find((r) => r.id === revisionId);
  if (!rev) throw new Error("That change was not found.");
  if (rev.status !== "proposed") throw new Error("That change has already been answered.");

  if (decision === "reject") {
    return {
      ...job,
      revisions: job.revisions.map((r) =>
        r.id === revisionId ? { ...r, status: "rejected", rejectedBy: role, rejectedAt: now } : r
      ),
      updatedAt: now,
    };
  }

  if (rev.proposedBy === role) {
    throw new Error(`The ${role} proposed this change. The other role has to accept it.`);
  }

  const accepted: Revision = { ...rev, status: "accepted", acceptedBy: role, acceptedAt: now };
  // applyRevision keeps the old value on the revision record and marks a confirmed field "changed".
  const applied = applyRevision(job.kaamNaksha, accepted);
  const before = job.kaamNaksha.fields.find((f) => f.key === rev.fieldKey);
  const when = new Date(now).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const fields = applied.fields.map((f) =>
    f.key === rev.fieldKey
      ? {
          ...f,
          status: f.status === "confirmed" ? ("changed" as const) : f.status,
          roleConfirmations: undefined,
          agreedValue: undefined,
          // applyRevision stamps a raw timestamp into the notes. Keep a readable line instead.
          notes: `${before?.notes ? `${before.notes}\n` : ""}Changed ${when}: ${rev.reason}`,
        }
      : f
  );
  const change = contentChange(
    job,
    {
      kind: "change_accepted",
      fieldKey: rev.fieldKey,
      summary: `${rev.fieldLabel} changed from ${String(rev.previousValue ?? "")} to ${String(rev.newValue ?? "")}. Reason: ${rev.reason}`,
    },
    now
  );
  return {
    ...job,
    revisions: job.revisions.map((r) => (r.id === revisionId ? accepted : r)),
    kaamNaksha: { ...applied, fields, completeness: computeCompleteness(fields), ...change },
    updatedAt: now,
  };
}

// ── Task 4: KYA HUA? ─────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
  ek: "1", teen: "3", chaar: "4", paanch: "5", panch: "5", chhe: "6", saat: "7", aath: "8",
};

/** Normalise a value for a plain comparison. Words for small numbers become digits. */
export function normalizeValue(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/₹|\brs\.?(?=\s|\d)|\binr\b/g, " ")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(" ")
    .trim();
}

/** True when the agreed and reported values say the same thing. Deterministic, no AI. */
export function compareValues(agreed: unknown, reported: unknown): boolean {
  const a = normalizeValue(agreed);
  const r = normalizeValue(reported);
  return a !== "" && a === r;
}

export interface DeliveryInput {
  fieldKey: string;
  reportedValue: string;
  reportedBy: Reporter;
  note?: string;
  /** Record a second report even though an identical one already exists. */
  allowDuplicate?: boolean;
}

/**
 * The report already on record for this field that says the same thing, from the
 * same reporter, against the current agreed value. Used to stop a double click or
 * a repeated submission from looking like two independent reports.
 */
export function findDuplicateReport(
  job: Job,
  fieldKey: string,
  reportedValue: string,
  reportedBy: Reporter
): OutcomeFinding | undefined {
  const want = normalizeValue(reportedValue);
  if (!want) return undefined;
  return job.outcomefindings.find(
    (f) =>
      f.fieldKey === fieldKey &&
      f.reportedBy === reportedBy &&
      !isStaleFinding(job, f) &&
      normalizeValue(f.observedValue) === want
  );
}

/**
 * Record what was reported as delivered for one confirmed field, and compare it
 * with the agreed value. The confirmed specification is not changed.
 *
 * Three honest outcomes: the report says the same as the agreement (match), it
 * says something different of the same kind (difference), or it is not the same
 * kind of thing as the agreement, so no comparison is possible (cannot_compare).
 * The last one is never shown as a difference.
 */
export function recordDelivery(job: Job, input: DeliveryInput, now: string): Job {
  const field = findField(job, input.fieldKey);
  if (field.status !== "confirmed") {
    throw new Error("Only a field confirmed by both customer and maker can be checked against delivery.");
  }
  const reported = input.reportedValue.trim();
  if (!reported) throw new Error("Write what was reported as delivered.");
  if (!["customer", "maker", "inspection"].includes(input.reportedBy)) {
    throw new Error("Choose who reported this.");
  }

  const agreed = agreedText(field);
  const who = input.reportedBy;

  const dup = findDuplicateReport(job, field.key, reported, who);
  if (dup && !input.allowDuplicate) {
    throw new Error(
      `The ${who} already reported "${reported}" for ${field.label}. Record it again only if this is a separate report.`
    );
  }

  // A plain equality check first (it knows "Four" and "4", "Rs 29,200" and "₹29200"), then the typed comparison.
  const cmp = compareValues(agreed, reported) ? { result: "match" as const, reason: undefined } : compareReport(agreed, reported);
  const outcome = cmp.result;

  const src = newSource(
    `Delivery report for ${field.label} (typed, reported by ${who})`,
    `Reported as delivered: ${reported}${input.note?.trim() ? `\nNote: ${input.note.trim()}` : ""}`,
    who === "inspection" ? "inspection" : who,
    now
  );

  const finding: OutcomeFinding = {
    id: makeId("kh", now),
    fieldKey: field.key,
    fieldLabel: field.label,
    agreedValue: agreed,
    observedValue: reported,
    discrepancy:
      outcome === "match"
        ? ""
        : outcome === "cannot_compare"
          ? cmp.reason ?? "These two cannot be compared."
          : `The ${who} reports "${reported}". The agreed value in the spec is "${agreed}".`,
    severity: outcome === "difference" ? "medium" : "low",
    evidenceSourceIds: [src.id],
    discoveredAt: now,
    status: outcome === "match" ? "resolved" : "open",
    resolutionNote: outcome === "match" ? "The reported value matches the agreed value." : undefined,
    reportedBy: who,
    outcome,
    note: input.note?.trim() || undefined,
    specVersion: job.kaamNaksha.version,
  };

  return {
    ...job,
    sources: [...job.sources, src],
    outcomefindings: [...job.outcomefindings, finding],
    updatedAt: now,
  };
}

/** Close a reported difference with a note on how the parties settled it. */
export function settleFinding(job: Job, findingId: string, note: string, now: string): Job {
  const f = job.outcomefindings.find((x) => x.id === findingId);
  if (!f) throw new Error("That finding was not found.");
  if (!note.trim()) throw new Error("Write how it was settled.");
  return {
    ...job,
    outcomefindings: job.outcomefindings.map((x) =>
      x.id === findingId ? { ...x, status: "resolved", resolutionNote: note.trim() } : x
    ),
    updatedAt: now,
  };
}

export type DeliveryState = "match" | "difference" | "cannot_compare" | "not_checked";

export interface DeliveryRow {
  field: SpecField;
  state: DeliveryState;
  finding?: OutcomeFinding;
  /** A report written against an earlier value of this field (now revised). */
  earlier?: OutcomeFinding;
}

/**
 * A typed delivery report is tied to the value that was agreed when it was
 * written. If the field has since been revised, the report refers to an
 * obsolete version and must not be shown as a result against the current spec.
 * Findings that were not typed in through "Record delivery" (seeded or older
 * data) are never treated as obsolete.
 */
export function isStaleFinding(job: Job, finding: OutcomeFinding): boolean {
  if (!finding.reportedBy) return false;
  const field = job.kaamNaksha.fields.find((f) => f.key === finding.fieldKey);
  if (!field) return false;
  return String(finding.agreedValue ?? "") !== agreedText(field);
}

/** For every confirmed field: matches, reported difference, cannot be compared, or not checked. */
export function deliveryOverview(job: Job): DeliveryRow[] {
  return confirmedFields(job).map((field) => {
    const mine = job.outcomefindings
      .filter((f) => f.fieldKey === field.key)
      .sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
    const current = mine.filter((f) => !isStaleFinding(job, f));
    const earlier = mine.find((f) => isStaleFinding(job, f));
    const latest = current[0];
    if (!latest) return { field, state: "not_checked" as const, earlier };
    const state: DeliveryState =
      latest.outcome ?? (compareValues(latest.agreedValue, latest.observedValue) ? "match" : "difference");
    return { field, state, finding: latest, earlier };
  });
}

// ── SAMAJH: answers, clarification, and what stays open ──────────────────────

/**
 * Where a finding stands. These four are kept apart on purpose:
 *  - open       nobody has answered the question yet
 *  - answered   someone recorded a reply (JAWAB). A reply is not a clarification:
 *               nobody has said the two sides now mean the same thing
 *  - clarified  a person marked it clarified. That is a button press for a role
 *               in AAKAAR, not proof of what anybody understood
 *  - unresolved the people tried and could not settle it, and it stays open
 */
export type FindingStatus = "open" | "answered" | "clarified" | "unresolved";

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  answered: "Answered, not yet clarified",
  clarified: "Clarified by a person",
  unresolved: "Could not be settled",
};

export function findingStatus(a: Ambiguity): FindingStatus {
  if (a.resolved) return "clarified";
  if (a.unresolvedAt) return "unresolved";
  if (a.answer) return "answered";
  return "open";
}

function findAmbiguity(job: Job, id: string): Ambiguity {
  const a = job.ambiguities.find((x) => x.id === id);
  if (!a) throw new Error("That finding was not found.");
  return a;
}

function replaceAmbiguity(job: Job, next: Ambiguity, now: string): Job {
  return { ...job, ambiguities: job.ambiguities.map((a) => (a.id === next.id ? next : a)), updatedAt: now };
}

/**
 * Record the reply to the question (JAWAB). This keeps the words as given. It does
 * not mark anything clarified, and it does not change KAAM-NAKSHA.
 */
export function recordAnswer(
  job: Job,
  ambiguityId: string,
  text: string,
  by: "customer" | "maker" | "both" | "entered",
  now: string
): Job {
  const a = findAmbiguity(job, ambiguityId);
  if (a.resolved) throw new Error("This finding is already clarified. Reopen it before changing the answer.");
  const clean = text.trim();
  if (!clean) throw new Error("Write the answer first.");
  if (!["customer", "maker", "both", "entered"].includes(by)) throw new Error("Choose who gave this answer.");
  return replaceAmbiguity(
    job,
    { ...a, answer: { text: clean, by, at: now }, unresolvedAt: undefined, unresolvedNote: undefined },
    now
  );
}

/**
 * A person marks the finding clarified. An answer must exist (or be given here).
 * `by` records which role's button was pressed. It is not an identity check.
 */
export function markClarified(
  job: Job,
  ambiguityId: string,
  by: Role | "entered",
  now: string,
  answerText?: string
): Job {
  const a = findAmbiguity(job, ambiguityId);
  if (a.resolved) throw new Error("This finding is already clarified.");
  let answer = a.answer;
  const given = answerText?.trim();
  if (given && given !== answer?.text) {
    answer = { text: given, by: by === "entered" ? "entered" : by, at: now };
  }
  if (!answer) throw new Error("Record the answer first. A finding cannot be clarified without one.");
  return replaceAmbiguity(
    job,
    {
      ...a,
      answer,
      resolved: true,
      resolvedAt: now,
      resolvedBy: by === "entered" ? undefined : by,
      resolutionNote: answer.text,
      unresolvedAt: undefined,
      unresolvedNote: undefined,
    },
    now
  );
}

/** The people tried and could not settle it. The finding stays open, on purpose, with the reason. */
export function markUnresolved(job: Job, ambiguityId: string, note: string, now: string): Job {
  const a = findAmbiguity(job, ambiguityId);
  if (a.resolved) throw new Error("This finding is already clarified. Reopen it first.");
  if (!note.trim()) throw new Error("Say why it could not be settled.");
  return replaceAmbiguity(job, { ...a, unresolvedAt: now, unresolvedNote: note.trim() }, now);
}

/** Take a clarified or unresolved finding back to open. The recorded answer is kept. */
export function reopenAmbiguity(job: Job, ambiguityId: string, now: string): Job {
  const a = findAmbiguity(job, ambiguityId);
  if (a.specFieldKey) {
    throw new Error("This answer is already in KAAM-NAKSHA. Propose a change there instead of reopening it.");
  }
  return replaceAmbiguity(
    job,
    {
      ...a,
      resolved: false,
      resolvedAt: undefined,
      resolvedBy: undefined,
      resolutionNote: undefined,
      unresolvedAt: undefined,
      unresolvedNote: undefined,
    },
    now
  );
}

// ── Source text: correction without losing the original ──────────────────────

/**
 * Correct the text of a source (for example a speech-to-text mistake). The first
 * words captured stay in `originalText`, and the source is marked corrected, so
 * the correction is never passed off as what the speaker said. Putting back the
 * original text removes the correction mark.
 */
export function correctSourceText(job: Job, sourceId: string, text: string, now: string): Job {
  const src = job.sources.find((s) => s.id === sourceId);
  if (!src) throw new Error("That source was not found.");
  const clean = text.trim();
  if (!clean) throw new Error("The text cannot be empty.");
  const original = src.originalText ?? src.excerpt ?? "";
  const restored = clean === original.trim();
  const next: EvidenceSource = {
    ...src,
    originalText: original || undefined,
    excerpt: clean,
    correctedAt: restored ? undefined : now,
  };
  return { ...job, sources: job.sources.map((s) => (s.id === sourceId ? next : s)), updatedAt: now };
}

/** True when a person has changed the words of this source since they were first captured. */
export function isCorrected(src: EvidenceSource): boolean {
  return !!src.originalText && !!src.correctedAt && src.originalText.trim() !== (src.excerpt ?? "").trim();
}