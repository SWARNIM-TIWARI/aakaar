import type { Job } from "@/lib/types";
import { STAGE_TERMS } from "@/lib/utils/terms";
import {
  findingStatus,
  confirmedFields,
  deliveryOverview,
  fieldState,
  isStaleFinding,
  pendingRevisions,
} from "@/lib/spec/workflow";

export type StageId = "sauda" | "samajh" | "vaada" | "kya_hua";

export type StageState =
  | "not_started"
  | "in_progress"
  | "needs_decision"
  | "answered"
  | "no_gaps"
  | "confirmed"
  | "outcome_recorded";

export const STAGE_STATE_LABEL: Record<StageState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  needs_decision: "Needs decision",
  answered: "Questions answered",
  no_gaps: "No gaps found",
  confirmed: "Confirmed by both",
  outcome_recorded: "Delivery checked",
};

export interface StageInfo {
  id: StageId;
  no: string;
  label: string;
  hindi: string;
  gloss: string;
  state: StageState;
  /** Number of open items when the stage needs a decision. */
  open: number;
}

export const STAGES: { id: StageId; no: string; label: string; hindi: string; gloss: string }[] = [
  { id: "sauda", no: "01", label: STAGE_TERMS.sauda.name, hindi: STAGE_TERMS.sauda.hindi, gloss: STAGE_TERMS.sauda.gloss },
  { id: "samajh", no: "02", label: STAGE_TERMS.samajh.name, hindi: STAGE_TERMS.samajh.hindi, gloss: STAGE_TERMS.samajh.gloss },
  { id: "vaada", no: "03", label: STAGE_TERMS.vaada.name, hindi: STAGE_TERMS.vaada.hindi, gloss: STAGE_TERMS.vaada.gloss },
  { id: "kya_hua", no: "04", label: STAGE_TERMS.kya_hua.name, hindi: STAGE_TERMS.kya_hua.hindi, gloss: STAGE_TERMS.kya_hua.gloss },
];

/** Counts the app really holds, gathered once so stages and next steps agree. */
function counts(job: Job) {
  const fields = job.kaamNaksha.fields;
  const openGaps = job.ambiguities.filter((a) => !a.resolved).length;
  const answeredGaps = job.ambiguities.filter((a) => findingStatus(a) === "answered").length;
  const unresolvedGaps = job.ambiguities.filter((a) => findingStatus(a) === "unresolved").length;
  const cannotCompare = deliveryOverview(job).filter((r) => r.state === "cannot_compare").length;
  const answeredNotInSpec = job.ambiguities.filter((a) => a.resolved && !a.specFieldKey).length;
  const decisionFields = fields.filter((f) => fieldState(f) === "needs_decision").length;
  const revisions = pendingRevisions(job).length;
  const unconfirmed = fields.filter((f) => f.status !== "confirmed" && fieldState(f) !== "needs_decision").length;
  const confirmed = confirmedFields(job).length;
  const overview = deliveryOverview(job);
  const unchecked = overview.filter((r) => r.state === "not_checked").length;
  // A report that could not be compared is not a difference. It is counted on its own (cannotCompare).
  const openFindings = job.outcomefindings.filter(
    (f) => !isStaleFinding(job, f) && (f.status === "open" || f.status === "disputed") && f.outcome !== "cannot_compare"
  ).length;
  return { fields, openGaps, answeredGaps, unresolvedGaps, cannotCompare, answeredNotInSpec, decisionFields, revisions, unconfirmed, confirmed, unchecked, openFindings };
}

/** Human readable state per stage, from counts the app already has. No percentages. */
export function stageInfo(job: Job): StageInfo[] {
  const c = counts(job);

  const sauda: StageState = job.quotes.length === 0 ? "not_started" : "in_progress";

  const samajh: StageState =
    job.ambiguities.length === 0
      ? job.lastAnalysis
        ? "no_gaps"
        : "not_started"
      : c.openGaps > 0
      ? "needs_decision"
      : "answered";

  const vaadaOpen = c.decisionFields + c.revisions;
  const vaada: StageState =
    c.fields.length === 0
      ? "not_started"
      : vaadaOpen > 0
      ? "needs_decision"
      : c.fields.every((f) => f.status === "confirmed")
      ? "confirmed"
      : "in_progress";

  // Delivery is only "checked" once every confirmed field has a report and no difference is open.
  const kya: StageState =
    job.outcomefindings.length === 0
      ? "not_started"
      : c.openFindings > 0 || c.cannotCompare > 0
      ? "needs_decision"
      : c.unchecked > 0
      ? "in_progress"
      : "outcome_recorded";

  const states: Record<StageId, { state: StageState; open: number }> = {
    sauda: { state: sauda, open: 0 },
    samajh: { state: samajh, open: c.openGaps },
    vaada: { state: vaada, open: vaadaOpen },
    kya_hua: { state: kya, open: c.openFindings + c.cannotCompare },
  };

  return STAGES.map((s) => ({ ...s, ...states[s.id] }));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One plain sentence saying what to do next in a given stage, from the real job state. */
export function stageNext(job: Job, stage: StageId): string {
  const c = counts(job);
  switch (stage) {
    case "sauda":
      if (job.quotes.length === 0) return "Add the first quote you received.";
      if (job.quotes.length === 1) return "Add another maker's quote to compare, or move on to SAMAJH.";
      return "Quotes are lined up. Move on to SAMAJH to check for gaps.";
    case "samajh":
      if (job.ambiguities.length === 0 && job.lastAnalysis) return "The check found no gaps in what was said. Move on to VAADA and write down what was agreed.";
      if (job.ambiguities.length === 0) return "Press Analyze to check the statements for gaps.";
      if (c.openGaps > 0) return `Ask the ${plural(c.openGaps, "open question", "open questions")} and write down each answer.`;
      if (c.answeredNotInSpec > 0) return `Add ${plural(c.answeredNotInSpec, "answered question", "answered questions")} to KAAM-NAKSHA.`;
      return "Questions are answered. Review the specification in VAADA.";
    case "vaada":
      if (c.fields.length === 0) return "Add a field below, or add an answered question from SAMAJH.";
      if (c.revisions > 0) return `Accept or reject ${plural(c.revisions, "proposed change", "proposed changes")}.`;
      if (c.decisionFields > 0) return `Give ${plural(c.decisionFields, "field", "fields")} a clear value.`;
      if (c.unconfirmed > 0) return `${plural(c.unconfirmed, "field still needs", "fields still need")} confirmation from the customer and the maker.`;
      return "All fields are confirmed. Record what was delivered in KYA HUA?.";
    case "kya_hua":
      if (c.confirmed === 0) return "Confirm at least one field in VAADA first. Only confirmed fields can be checked.";
      if (c.openFindings > 0) return `Review ${plural(c.openFindings, "reported difference", "reported differences")}.`;
      if (c.cannotCompare > 0) return `${plural(c.cannotCompare, "report could not be compared", "reports could not be compared")}. Ask what was actually delivered, then record that as a new report.`;
      if (c.unchecked > 0) return `Record delivery for ${plural(c.unchecked, "field", "fields")} not yet checked.`;
      return "Every confirmed field has a delivery report.";
  }
}

/** One plain sentence saying what to do next for the whole job. */
export function nextAction(job: Job): string {
  const c = counts(job);

  if (c.openFindings > 0) return `Review ${plural(c.openFindings, "reported difference", "reported differences")}`;
  if (c.cannotCompare > 0) return `Ask what was actually delivered (${plural(c.cannotCompare, "report cannot be compared", "reports cannot be compared")})`;
  if (c.openGaps > 0) return `Ask ${plural(c.openGaps, "open question", "open questions")}`;
  if (c.revisions > 0) return `Answer ${plural(c.revisions, "proposed change", "proposed changes")}`;
  if (c.decisionFields > 0) return `Decide ${plural(c.decisionFields, "spec field", "spec fields")}`;
  // Quotes and the gap check are early steps. Once the specification is under way they stop being nagged.
  const started = job.ambiguities.length > 0 || c.fields.length > 0 || !!job.lastAnalysis;
  if (!started && job.quotes.length === 0) return "Add the quotes you received";
  if (!started) return "Run the check for gaps";
  if (c.answeredNotInSpec > 0) return `Add ${plural(c.answeredNotInSpec, "answer", "answers")} to the specification`;
  if (c.fields.length === 0) return "Add the agreed points to KAAM-NAKSHA";
  if (c.unconfirmed > 0) return `Confirm ${plural(c.unconfirmed, "field", "fields")} as customer and maker`;
  if (c.unchecked > 0 || job.outcomefindings.length === 0) return "Record what was delivered";
  return "Nothing waiting";
}

/** The one outstanding decision of a job, in a plain phrase, or null when nothing is waiting. */
export function outstandingDecision(job: Job): string | null {
  const c = counts(job);
  if (c.openFindings > 0) return `${plural(c.openFindings, "reported difference", "reported differences")} to settle`;
  if (c.cannotCompare > 0) return `${plural(c.cannotCompare, "delivery report", "delivery reports")} could not be compared`;
  if (c.openGaps > 0) {
    const waitingClear = c.answeredGaps;
    return waitingClear > 0 && waitingClear === c.openGaps
      ? `${plural(c.openGaps, "answer", "answers")} waiting to be marked clarified`
      : `${plural(c.openGaps, "open question", "open questions")} in BAAT KA FARQ`;
  }
  if (c.revisions > 0) return `${plural(c.revisions, "proposed change", "proposed changes")} waiting for the other role`;
  if (c.decisionFields > 0) return `${plural(c.decisionFields, "field", "fields")} with no clear value`;
  if (c.unconfirmed > 0) return `${plural(c.unconfirmed, "field", "fields")} not yet confirmed by both roles`;
  return null;
}

export const JOB_TYPE_LABEL: Record<Job["jobType"], string> = {
  custom_furniture: "Furniture and carpentry",
  construction: "Construction and repair",
  tailoring: "Tailoring",
  other: "Other work",
};

/** Short register number from the job id, e.g. job_a1b2c3d4e5 becomes K-D4E5. */
export function jobNumber(job: Pick<{ id: string; isDemo: boolean }, "id" | "isDemo">): string {
  if (job.isDemo) return "DEMO";
  return `K-${job.id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── The one next action of a screen ──────────────────────────────────────────

export interface NextStep {
  /** One plain sentence: what needs doing here, from the real job state. */
  sentence: string;
  /** What has happened so far, from the real job state. Never a percentage. */
  soFar: string;
  /** The single button. Absent when the next move is just typing into the page. */
  cta?: { label: string; go?: StageId; action?: "analyze"; focus?: string };
}

/** What has happened so far in a stage, counted from the job itself. */
export function soFar(job: Job, stage: StageId): string {
  const c = counts(job);
  const bits: string[] = [];
  switch (stage) {
    case "sauda":
      bits.push(plural(job.quotes.length, "quote", "quotes") + " recorded");
      break;
    case "samajh":
      if (job.ambiguities.length === 0) bits.push(job.lastAnalysis ? "Checked once, no gaps found" : "Not checked yet");
      else {
        bits.push(plural(job.ambiguities.length, "finding", "findings"));
        if (c.answeredGaps) bits.push(`${c.answeredGaps} answered, waiting to be marked clarified`);
        if (c.unresolvedGaps) bits.push(`${c.unresolvedGaps} left unresolved`);
        const clarified = job.ambiguities.filter((a) => a.resolved).length;
        if (clarified) bits.push(`${clarified} clarified`);
      }
      break;
    case "vaada":
      bits.push(plural(c.fields.length, "field", "fields") + ` in KAAM-NAKSHA v${job.kaamNaksha.version}`);
      if (c.confirmed) bits.push(`${c.confirmed} confirmed by both roles`);
      break;
    case "kya_hua":
      bits.push(plural(job.outcomefindings.filter((f) => !isStaleFinding(job, f)).length, "report", "reports") + " recorded");
      if (c.cannotCompare) bits.push(`${c.cannotCompare} could not be compared`);
      break;
  }
  return bits.join(" · ");
}

/** The single next step for a stage: a sentence, what happened so far, and at most one button. */
export function nextStep(job: Job, stage: StageId): NextStep {
  const c = counts(job);
  const base = { sentence: stageNext(job, stage), soFar: soFar(job, stage) };
  switch (stage) {
    case "sauda":
      if (job.quotes.length === 0) return { ...base, cta: { label: "Add the first quote", focus: "add-quote" } };
      if (job.quotes.length === 1) return { ...base, cta: { label: "Add another quote", focus: "add-quote" } };
      return { ...base, cta: { label: "Check for gaps in SAMAJH", go: "samajh" } };
    case "samajh":
      if (job.ambiguities.length === 0 && !job.lastAnalysis) return { ...base, cta: { label: "Check for gaps", action: "analyze" } };
      if (job.ambiguities.length === 0) return { ...base, cta: { label: "Go to VAADA", go: "vaada" } };
      if (c.openGaps > 0) return { ...base, cta: { label: "Answer the first open question", focus: "first-open-finding" } };
      if (c.answeredNotInSpec > 0) return { ...base, cta: { label: "Add answers to KAAM-NAKSHA", focus: "add-to-spec" } };
      return { ...base, cta: { label: "Review in VAADA", go: "vaada" } };
    case "vaada":
      if (c.fields.length === 0) return { ...base, cta: { label: "Add the first field", focus: "add-field" } };
      if (c.revisions > 0) return { ...base, cta: { label: "Answer the proposed change", focus: "pending-change" } };
      if (c.decisionFields > 0) return { ...base, cta: { label: "Give the field a clear value", focus: "first-decision-field" } };
      if (c.unconfirmed > 0) return { ...base, cta: { label: "Mark confirmations", focus: "first-unconfirmed-field" } };
      return { ...base, cta: { label: "Record the delivery", go: "kya_hua" } };
    case "kya_hua":
      if (c.confirmed === 0) return { ...base, cta: { label: "Go to VAADA", go: "vaada" } };
      if (c.openFindings > 0) return { ...base, cta: { label: "Review the open report", focus: "first-open-report" } };
      if (c.cannotCompare > 0) return { ...base, cta: { label: "Record a clearer report", focus: "delivery-form" } };
      if (c.unchecked > 0) return { ...base, cta: { label: "Record delivery", focus: "delivery-form" } };
      return base;
  }
}