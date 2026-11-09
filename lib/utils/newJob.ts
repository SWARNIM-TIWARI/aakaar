import type { EvidenceSource } from "@/lib/types";

// Helpers for creating a job from natural speech or text, without assuming what the work is.

/**
 * A short working title taken from the first words of what someone said, used only when
 * no title was typed. The person can rename the job later. Never invents wording: it is
 * the speaker's own first words.
 */
export function titleFromStatement(text: string, maxWords = 6, maxChars = 48): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const wordsOf = (t: string) => t.split(" ").filter(Boolean);
  // Prefer the first clause when it is a thought of its own (three or more words),
  // otherwise the first few words.
  const firstClause = flat.split(/[,.;:!?।]/u)[0].trim();
  const words = wordsOf(firstClause).length >= 3 ? wordsOf(firstClause).slice(0, maxWords + 2) : wordsOf(flat).slice(0, maxWords);
  let title = words.join(" ").replace(/[\s,;:।.\-–—!?]+$/u, "");
  if (title.length > maxChars) title = title.slice(0, maxChars).replace(/\s+\S*$/, "");
  return title ? title.charAt(0).toLocaleUpperCase() + title.slice(1) : "";
}

/** The title a new job is saved with: what was typed, else the customer's or maker's first words. */
export function chooseJobTitle(typed: string, customerSaid: string, makerSaid: string): string {
  return typed.trim() || titleFromStatement(customerSaid) || titleFromStatement(makerSaid);
}

// ── Statements: keep what was heard, allow correction ────────────────────────


export interface StatementInput {
  id: string;
  party: "customer" | "maker";
  /** The text as it stands now (possibly corrected by a person). */
  text: string;
  /** Raw speech-to-text results, in order, exactly as returned. Empty when the person typed. */
  transcripts: string[];
  transcribedBy?: "gnani_prisma" | "browser_speech";
  now: string;
}

/**
 * Turn one statement into an evidence source without losing what was first captured.
 * Spoken: the speech-to-text result is kept in `originalText`; if the text was changed
 * afterwards the source is marked corrected, so the correction is never passed off as
 * what the speaker said. Typed: the first typed text is kept as the original.
 * Returns null when nothing was said.
 */
export function buildStatementSource(i: StatementInput): EvidenceSource | null {
  const text = i.text.trim();
  if (!text) return null;
  const spoken = i.transcripts.length > 0;
  const who = i.party === "customer" ? "Customer" : "Maker";
  const original = spoken ? i.transcripts.join(" ").replace(/\s+/g, " ").trim() : text;
  const corrected = spoken && text.replace(/\s+/g, " ") !== original;
  return {
    id: i.id,
    kind: spoken ? "transcript" : "manual_note",
    label: `${who}'s initial statement (${spoken ? "spoken" : "typed"})`,
    excerpt: text,
    capturedAt: i.now,
    party: i.party,
    inputMethod: spoken ? "voice" : "typed",
    transcribedBy: spoken ? i.transcribedBy : undefined,
    originalText: original,
    correctedAt: corrected ? i.now : undefined,
  };
}

/** Notes and context are the person's own notes, not anyone's statement. */
export function buildNotesSource(id: string, text: string, now: string): EvidenceSource | null {
  const t = text.trim();
  if (!t) return null;
  return {
    id,
    kind: "manual_note",
    label: "Notes and context",
    excerpt: t,
    capturedAt: now,
    party: "entered",
    inputMethod: "typed",
    originalText: t,
  };
}