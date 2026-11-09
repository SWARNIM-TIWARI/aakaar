// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Deterministic Arithmetic
// ALL cost calculations happen here, never in AI/LLM code.
// LLMs must not perform arithmetic; they extract structured data only.
// ──────────────────────────────────────────────────────────────────────────────

import type { Quote, QuoteLine, Revision } from "@/lib/types";

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format a rupee amount for display.
 * Always deterministic, never delegates to AI.
 */
export function formatRupees(amount: number): string {
  if (!isFinite(amount)) return "Not set";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Line-item arithmetic ──────────────────────────────────────────────────────

/**
 * Sum the known (priced) lines in a quote.
 * Lines with isKnown=false are excluded, their absence is surfaced separately.
 */
export function sumKnownLines(lines: QuoteLine[]): number {
  return lines
    .filter((l) => l.isKnown && typeof l.amountRs === "number")
    .reduce((acc, l) => acc + (l.amountRs ?? 0), 0);
}

/**
 * Compute and return the known total for a quote.
 * This is the ONLY place where knownTotalRs is computed, not in AI code.
 */
export function computeQuoteKnownTotal(quote: Quote): number {
  return sumKnownLines(quote.lines);
}

// ── Quote comparison ──────────────────────────────────────────────────────────

export interface QuoteComparisonResult {
  quoteId: string;
  makerName: string;
  knownTotalRs: number;
  unknownItemCount: number;
  nonEquivalentItemCount: number;
  /**
   * If true, this quote cannot be fairly compared to others because
   * it's missing line items that other quotes include.
   */
  isIncomparable: boolean;
  incomparabilityReason?: string;
}

/**
 * Produce a comparison-ready summary for each quote.
 * Explicitly flags when quotes cannot be fairly compared.
 */
export function compareQuoteTotals(quotes: Quote[]): QuoteComparisonResult[] {
  return quotes.map((q) => {
    const knownTotalRs = sumKnownLines(q.lines);
    const unknownItemCount = q.unknownItems.length;
    const nonEquivalentItemCount = q.nonEquivalentItems.length;

    const isIncomparable = unknownItemCount > 0 || nonEquivalentItemCount > 0;
    const reasons: string[] = [];
    if (unknownItemCount > 0)
      reasons.push(`${unknownItemCount} unpriced item(s)`);
    if (nonEquivalentItemCount > 0)
      reasons.push(`${nonEquivalentItemCount} item(s) not in all quotes`);

    return {
      quoteId: q.id,
      makerName: q.makerName,
      knownTotalRs,
      unknownItemCount,
      nonEquivalentItemCount,
      isIncomparable,
      incomparabilityReason: isIncomparable ? reasons.join("; ") : undefined,
    };
  });
}

// ── Like-for-like comparison ──────────────────────────────────────────────────

/** Normalise an item description so the same item in two quotes lines up. */
export function normalizeItem(description: string): string {
  return description.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

export interface LikeForLike {
  /** The items that every quote prices. Only these are added up. */
  items: string[];
  totals: { quoteId: string; makerName: string; totalRs: number }[];
}

/**
 * The part of the quotes that can be set side by side: items that EVERY quote prices.
 * A quote that leaves an item out, or names it without a price, is not penalised or
 * rewarded here. It is simply not part of this sum. Returns null when there are fewer
 * than two quotes or no item is priced by all of them. This never picks a winner.
 */
export function likeForLike(quotes: Quote[]): LikeForLike | null {
  if (quotes.length < 2) return null;
  const pricedKeys = quotes.map(
    (q) => new Set(q.lines.filter((l) => l.isKnown && typeof l.amountRs === "number").map((l) => normalizeItem(l.description)))
  );
  const first = pricedKeys[0];
  const common = [...first].filter((k) => k && pricedKeys.every((set) => set.has(k)));
  if (common.length === 0) return null;
  const label = new Map<string, string>();
  quotes[0].lines.forEach((l) => {
    const k = normalizeItem(l.description);
    if (!label.has(k)) label.set(k, l.description);
  });
  return {
    items: common.map((k) => label.get(k) ?? k),
    totals: quotes.map((q) => ({
      quoteId: q.id,
      makerName: q.makerName,
      totalRs: q.lines
        .filter((l) => l.isKnown && typeof l.amountRs === "number" && common.includes(normalizeItem(l.description)))
        .reduce((a, l) => a + (l.amountRs ?? 0), 0),
    })),
  };
}

// ── Indian number-to-words (for TTS / voice output) ──────────────────────────

/**
 * Convert a rupee amount to spoken Hinglish words using the Indian number
 * grouping system: crore → lakh → hazaar → remainder.
 *
 * Examples:
 *   29200          → "29 hazaar 200 rupees"
 *   100000         → "1 lakh rupees"
 *   25000000       → "2 crore 50 lakh rupees"
 *   123456789      → "12 crore 34 lakh 56 hazaar 789 rupees"
 *
 * This function is deterministic, never delegated to AI.
 */
export function rupeesToWords(amount: number): string {
  if (!isFinite(amount) || amount < 0) return "";
  const n = Math.round(amount);
  if (n === 0) return "zero rupees";

  const parts: string[] = [];

  const crore    = Math.floor(n / 10_000_000);
  const lakh     = Math.floor((n % 10_000_000) / 100_000);
  const hazaar   = Math.floor((n % 100_000) / 1_000);
  const remainder = n % 1_000;

  if (crore > 0)     parts.push(`${crore} crore`);
  if (lakh > 0)      parts.push(`${lakh} lakh`);
  if (hazaar > 0)    parts.push(`${hazaar} hazaar`);
  if (remainder > 0) parts.push(String(remainder));

  return parts.join(" ") + " rupees";
}

// ── Revision cost impact ──────────────────────────────────────────────────────

/**
 * Compute the total cost delta from a set of accepted revisions.
 * Always deterministic.
 */
export function applyRevisionCost(
  baseRs: number,
  revisions: Revision[]
): number {
  const acceptedRevisions = revisions.filter((r) => r.status === "accepted");
  const totalImpact = acceptedRevisions.reduce(
    (acc, r) => acc + (r.costImpactRs ?? 0),
    0
  );
  return baseRs + totalImpact;
}

/**
 * Total time impact in days from accepted revisions.
 */
export function applyRevisionTime(
  baseDays: number,
  revisions: Revision[]
): number {
  const acceptedRevisions = revisions.filter((r) => r.status === "accepted");
  const totalImpact = acceptedRevisions.reduce(
    (acc, r) => acc + (r.timeImpactDays ?? 0),
    0
  );
  return baseDays + totalImpact;
}