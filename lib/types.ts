// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Core TypeScript Types
// All domain types live here. Never infer types from AI output, always validate
// through Zod schemas (lib/ai/schemas.ts) and cast to these types.
// ──────────────────────────────────────────────────────────────────────────────

import type { ValueKind } from "@/lib/spec/values";

// ── Field lifecycle ───────────────────────────────────────────────────────────

/** The lifecycle state of a single spec field */
export type FieldStatus =
  | "proposed"       // stated by one party, not yet reviewed
  | "unclear"        // not enough detail to evaluate
  | "possible_mismatch" // parties seem to mean different things
  | "confirmed"      // both parties agreed explicitly
  | "rejected"       // explicitly rejected by one party
  | "changed"        // previously confirmed, now revised
  | "disputed"       // active disagreement, unresolved
  | "unverified";    // stated in outcome but not yet confirmed against spec

/** Who made a claim or confirmation */
export type PartyRole = "customer" | "maker" | "system" | "both";

/** How consequential a mismatch is */
export type MismatchSeverity = "high" | "medium" | "low";

// ── Evidence ─────────────────────────────────────────────────────────────────

/** A single piece of evidence, a quote snippet, a voice transcript, a photo */
export interface EvidenceSource {
  id: string;
  kind: "transcript" | "quote_document" | "photo" | "manual_note" | "system";
  label: string;          // short human-readable label, e.g. "Sharma quote PDF"
  excerpt?: string;       // relevant snippet of text
  capturedAt: string;     // ISO timestamp
  /**
   * Who the statement is from. "entered" means someone typed it into AAKAAR
   * without saying whose words it is. "inspection" means a reported inspection.
   */
  party: EvidenceParty;
  confidence?: number;    // 0-1, used when source is ASR transcript
  /** How the words got into AAKAAR. Absent on older sources. */
  inputMethod?: "typed" | "voice";
  /** For voice: which service turned the speech into text. */
  transcribedBy?: "gnani_prisma" | "browser_speech";
  /**
   * The words exactly as first captured: the speech-to-text transcript for voice,
   * the first typed text otherwise. Kept untouched when someone corrects the text
   * afterwards, so a correction is never passed off as what the speaker said.
   */
  originalText?: string;
  /** When a person last corrected the text in `excerpt`. */
  correctedAt?: string;
}

/** Who an evidence source is attributed to. */
export type EvidenceParty = PartyRole | "inspection" | "entered";

// ── Spec Fields ──────────────────────────────────────────────────────────────

/**
 * A single tracked field in the shared specification.
 * The central unit of BAAT KA FARQ, we track what the customer
 * meant vs. what the maker understood.
 */
export interface SpecField<T = unknown> {
  key: string;
  label: string;
  labelHindi?: string;
  /** Current proposed/stated value */
  value?: T;
  /** Value proposed but not yet confirmed */
  proposedValue?: T;
  /** Value that has been explicitly agreed by both parties */
  agreedValue?: T;
  /** What the customer believes this field means */
  customerMeaning?: string;
  /** What the maker believes this field means */
  makerMeaning?: string;
  status: FieldStatus;
  /** IDs of EvidenceSource items supporting this field */
  sourceIds: string[];
  /** Which parties need to confirm before status can become "confirmed" */
  confirmationBy: PartyRole[];
  lastChangedAt?: string;
  notes?: string;
  /**
   * Who has marked the CURRENT value as confirmed, and when. Each mark is a
   * record that someone pressed a button for that role in AAKAAR. It is not a
   * signature and not an authenticated identity. Optional so that fields saved
   * before this existed still load.
   */
  roleConfirmations?: { customer?: RoleMark; maker?: RoleMark };
  /** Ambiguity this field was created from, if any. */
  fromAmbiguityId?: string;
  /** What kind of value this is, so it is read and compared correctly. */
  valueKind?: ValueKind;
  /** Where the field came from. Older fields work it out from their notes and sources. */
  origin?: "suggested" | "entered" | "from_answer";
}

/** One role marking one value as confirmed. */
export interface RoleMark {
  at: string;           // ISO timestamp
  value: string;        // the exact value that was marked
  specVersion: number;  // KAAM-NAKSHA version at the time
}

// ── Quotes ───────────────────────────────────────────────────────────────────

/** A single line item in a quote */
export interface QuoteLine {
  id: string;
  description: string;
  quantity?: number;
  unit?: string;
  /** Rupee amount, undefined means not stated / unknown */
  amountRs?: number;
  /** true if this line was explicit and can be summed reliably */
  isKnown: boolean;
  notes?: string;
}

/** A quote from one maker/vendor */
export interface Quote {
  id: string;
  makerName: string;
  makerContact?: string;
  submittedAt: string;
  lines: QuoteLine[];
  /** Items present in quote but without a price, cannot be summed */
  unknownItems: string[];
  /**
   * Items that exist in one quote but not another, prevents
   * us from presenting a false "apples to apples" comparison.
   */
  nonEquivalentItems: string[];
  /** What the maker said this quote does NOT include (for example "installation extra"). */
  exclusions?: string[];
  /** Sum of all isKnown lines, computed deterministically, never from AI */
  knownTotalRs: number;
  /** Whether this quote has been confirmed/accepted */
  status: "draft" | "received" | "accepted" | "rejected";
  notes?: string;
  sourceIds: string[];
}

// ── Ambiguities (BAAT KA FARQ) ───────────────────────────────────────────────

/**
 * A semantic mismatch between how the customer described something
 * and how the maker interpreted it.
 * This is the core output of BAAT KA FARQ analysis.
 */
export interface Ambiguity {
  id: string;
  /** Which spec field this relates to */
  fieldKey: string;
  fieldLabel: string;
  /** The customer's interpretation */
  interpretationA: string;
  /** The maker's interpretation */
  interpretationB: string;
  /** What goes wrong if this gap isn't resolved */
  consequence: string;
  materialImpact: MismatchSeverity;
  /** The one clarifying question that would resolve this */
  clarificationQuestion: string;
  sourceIds: string[];
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: PartyRole;
  resolutionNote?: string;
  /** Key of the KAAM-NAKSHA field created from this clarification, if any. */
  specFieldKey?: string;
  /** The answer someone recorded (JAWAB). Recording an answer is not confirming it. */
  answer?: { text: string; by: "customer" | "maker" | "both" | "entered"; at: string };
  /** Set when the people could not settle this point and it stays open on purpose. */
  unresolvedAt?: string;
  unresolvedNote?: string;
}

// ── Revisions ────────────────────────────────────────────────────────────────

/**
 * A tracked change to the spec after it was created or confirmed.
 * Revisions never silently overwrite; every change is versioned.
 */
export interface Revision {
  id: string;
  proposedAt: string;
  proposedBy: PartyRole;
  fieldKey: string;
  fieldLabel: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  costImpactRs?: number;     // signed: positive = more expensive
  timeImpactDays?: number;   // signed: positive = more time
  status: "proposed" | "accepted" | "rejected";
  acceptedAt?: string;
  acceptedBy?: PartyRole;
  rejectedAt?: string;
  rejectedBy?: PartyRole;
}

// ── Party Confirmations ───────────────────────────────────────────────────────

/** An explicit confirmation from a party that they agree to the spec */
export interface PartyConfirmation {
  id: string;
  party: PartyRole;
  confirmedAt: string;
  specVersion: number;
  statement: string;  // what they confirmed (plain language)
  /** Which field keys were in scope at this confirmation */
  fieldKeysConfirmed: string[];
}

// ── Outcome Findings (KYA HUA?) ───────────────────────────────────────────────

/** A finding when comparing what was delivered vs. what was agreed */
export interface OutcomeFinding {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  agreedValue: unknown;
  observedValue: unknown;
  discrepancy: string;          // plain language description of the gap
  severity: MismatchSeverity;
  evidenceSourceIds: string[];
  discoveredAt: string;
  status: "open" | "acknowledged" | "resolved" | "disputed";
  resolutionNote?: string;
  /**
   * Set on findings recorded through "Record delivery". These are typed
   * reports, not independent observations.
   */
  reportedBy?: "customer" | "maker" | "inspection";
  /** Computed by the app from the agreed and reported values. */
  outcome?: "match" | "difference" | "cannot_compare";
  note?: string;
  /** The KAAM-NAKSHA version the agreed value was read from. */
  specVersion?: number;
}

// ── KAAM-NAKSHA ───────────────────────────────────────────────────────────────

/** One change to the CONTENT of the specification. Confirmations are not content changes. */
export interface VersionEntry {
  version: number;
  at: string;
  kind: "field_added" | "value_edited" | "change_accepted" | "suggestions_added";
  fieldKey?: string;
  summary: string;
}

/**
 * The living shared specification. Not a contract, a working understanding
 * that both parties are building together.
 */
export interface KaamNaksha {
  /** Increments when the CONTENT changes (a field added, a value edited, a change accepted). Not on confirmation. */
  version: number;
  /** What changed in each version. Optional so older jobs still load. */
  history?: VersionEntry[];
  createdAt: string;
  lastUpdatedAt: string;

  // Core spec fields
  fields: SpecField[];
  confirmations: PartyConfirmation[];

  // Computed/derived
  completeness: number;  // 0-100, % of fields with status "confirmed"
}

// ── Job ───────────────────────────────────────────────────────────────────────

export type JobStatus =
  | "sauda"      // comparing quotes / scoping
  | "samajh"     // understanding being established / BAAT KA FARQ active
  | "vaada"      // spec confirmed, work in progress
  | "kya_hua"    // outcome being evaluated
  | "complete"   // closed successfully
  | "disputed";  // in active dispute

/**
 * The top-level entity, one custom work engagement.
 */
export interface Job {
  id: string;
  title: string;
  jobType: "custom_furniture" | "construction" | "tailoring" | "other";
  status: JobStatus;
  customerName?: string;
  makerName?: string;
  description?: string;  // original customer brief / transcript
  createdAt: string;
  updatedAt: string;

  sources: EvidenceSource[];
  quotes: Quote[];
  ambiguities: Ambiguity[];
  kaamNaksha: KaamNaksha;
  revisions: Revision[];
  outcomefindings: OutcomeFinding[];

  /** If true, this job was loaded from the seeded demo scenario */
  isDemo: boolean;
  demoLabel?: string;

  /** The last time the gap check ran, so "no gaps found" is different from "never run". */
  lastAnalysis?: {
    at: string;
    providerUsed: string;
    gapsFound: number;
    /** Suggestions the app chose not to save, and why. */
    skipped?: { label: string; reason: string }[];
  };
}

// ── Analysis Result ───────────────────────────────────────────────────────────

/**
 * What the reasoning provider returns after analyzing a job.
 * Always validated through Zod before being used.
 */
export interface AnalysisResult {
  ambiguities: Omit<Ambiguity, "id" | "resolved" | "resolvedAt" | "resolvedBy" | "resolutionNote">[];
  suggestedSpecFields: Omit<SpecField, "sourceIds" | "confirmationBy" | "lastChangedAt">[];
  summary: string;
  providerUsed: string;
  analysisVersion: string;
}

// ── Repository ───────────────────────────────────────────────────────────────

/** Clean storage interface, swap localStorage for DB without touching UI */
export interface Repository {
  getJob(id: string): Job | null;
  listJobs(): Pick<Job, "id" | "title" | "status" | "createdAt" | "updatedAt" | "isDemo" | "demoLabel">[];
  saveJob(job: Job): void;
  deleteJob(id: string): void;
  clearAll(): void;
}

// ── UI State ─────────────────────────────────────────────────────────────────

export interface UIState {
  activeModule: "sauda" | "samajh" | "vaada" | "kya_hua";
  selectedAmbiguityId?: string;
  selectedFieldKey?: string;
  evidenceDrawerOpen: boolean;
  evidenceDrawerSourceIds: string[];
  isRecording: boolean;
  isAnalyzing: boolean;
  analysisError?: string;
  /** Which reasoning provider was used in the last successful analysis. */
  lastProviderUsed?: string;
}