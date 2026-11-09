"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Plus } from "lucide-react";
import type { Job, Quote } from "@/lib/types";
import AddQuoteForm, { type NewQuoteInput } from "@/components/AddQuoteForm";
import NextBar from "@/components/NextBar";
import { nextStep } from "@/lib/utils/jobStage";
import { STAGE_TERMS } from "@/lib/utils/terms";
import { compareQuoteTotals, formatRupees, likeForLike, normalizeItem } from "@/lib/spec/calculations";

interface Props {
  job: Job;
  onShowEvidence: (sourceIds: string[]) => void;
  onAddQuote?: (q: NewQuoteInput) => void;
  onGoToStage?: (id: "sauda" | "samajh" | "vaada" | "kya_hua") => void;
}

type RowKind = "comparable" | "different_scope" | "price_missing";

const ROW_CHIP: Record<RowKind, { label: string; cls: string }> = {
  comparable: { label: "Priced in every quote", cls: "chip-confirmed" },
  different_scope: { label: "Not in every quote", cls: "chip-revised" },
  price_missing: { label: "A price is missing", cls: "chip-decision" },
};

export default function SaudaModule({ job, onShowEvidence, onAddQuote, onGoToStage }: Props) {
  const comparisons = compareQuoteTotals(job.quotes);
  const common = likeForLike(job.quotes);
  const [adding, setAdding] = useState(false);

  const addForm =
    adding && onAddQuote ? (
      <div id="add-quote" data-focus="add-quote">
        <AddQuoteForm
          defaultMaker={job.quotes.length === 0 ? job.makerName : undefined}
          onSave={(q) => {
            onAddQuote(q);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      </div>
    ) : null;

  // The next-bar button opens the form when asked to focus it.
  const step = nextStep(job, "sauda");
  const bar = (
    <NextBar
      stage="sauda"
      step={step}
      onGoToStage={onGoToStage}
    />
  );
  const addButton =
    onAddQuote && !adding ? (
      <button
        type="button"
        id="add-quote"
        data-focus="add-quote"
        data-open-form
        className="btn btn-quiet inline-flex items-center gap-1"
        onClick={() => setAdding(true)}
      >
        <Plus size={16} aria-hidden="true" /> Add a quote
      </button>
    ) : null;

  const heading = (
    <header className="flex items-end justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h2 className="display-sign text-[1.9rem] sm:text-[2.2rem]" style={{ color: "var(--color-indigo-deep)" }}>
          {STAGE_TERMS.sauda.name}
        </h2>
        <p className="mt-0.5 flex items-baseline gap-2 flex-wrap">
          <span lang="hi" className="font-devanagari text-[1.05rem] font-semibold">{STAGE_TERMS.sauda.hindi}</span>
          <span className="t-support">Each offer in one ledger: price, what is in it, what is left out.</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="chip chip-unclear">
          {job.quotes.length} quote{job.quotes.length !== 1 ? "s" : ""}
        </span>
        {addButton}
      </div>
    </header>
  );

  if (job.quotes.length === 0) {
    return (
      <div className="space-y-5">
        {heading}
        {bar}
        {addForm}
        {!adding && (
          <div className="sheet px-5 py-6 flex gap-6 items-center flex-wrap">
            <div className="jali" aria-hidden={true} />
            <div className="min-w-[14rem] flex-1">
              <p className="t-section">No quotes yet.</p>
              <p className="t-support mt-1 max-w-md">
                Add each maker&rsquo;s quote. AAKAAR lines them up row by row, shows what is missing or left out,
                and adds up only what can fairly be compared. It never chooses a quote for you.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Ordered list of unique line items (first seen order)
  const descOrder: string[] = [];
  const normToLabel = new Map<string, string>();
  job.quotes.forEach((q) =>
    q.lines.forEach((l) => {
      const k = normalizeItem(l.description);
      if (!normToLabel.has(k)) {
        normToLabel.set(k, l.description);
        descOrder.push(k);
      }
    })
  );

  // Items named in a quote without a price
  const unknownRows: string[] = [];
  job.quotes.forEach((q) =>
    q.unknownItems.forEach((u) => {
      const k = normalizeItem(u);
      if (!normToLabel.has(k) && !unknownRows.find((x) => normalizeItem(x) === k)) unknownRows.push(u);
    })
  );

  const rowKind = (k: string): RowKind => {
    const pricedIn = job.quotes.filter((q) => q.lines.some((l) => normalizeItem(l.description) === k && l.isKnown && l.amountRs !== undefined)).length;
    const mentionedIn = job.quotes.filter(
      (q) => q.lines.some((l) => normalizeItem(l.description) === k) || q.unknownItems.some((u) => normalizeItem(u) === k)
    ).length;
    if (pricedIn === job.quotes.length) return "comparable";
    if (mentionedIn < job.quotes.length) return "different_scope";
    return "price_missing";
  };

  const colCount = job.quotes.length;
  const gridCols = `minmax(var(--ledger-item), 2fr) repeat(${colCount}, minmax(8.5rem, 1fr))`;
  const cell = (i: number) => `px-3 py-3 ${i > 0 ? "border-l border-[var(--color-line)]" : ""}`;
  const anyExclusions = job.quotes.some((q) => (q.exclusions?.length ?? 0) > 0);
  const anyNotes = job.quotes.some((q) => !!q.notes?.trim());
  const maker = (q: Quote) => q.makerName;

  return (
    <div className="space-y-5">
      {heading}
      {bar}
      {addForm}

      {/* The ledger. Scrolls sideways on narrow screens instead of squashing columns. */}
      <p className="t-meta sm:hidden" data-testid="ledger-scroll-hint">Swipe the ledger sideways to see each maker&apos;s column.</p>
      <div className="sheet overflow-x-auto ledger-scroll" data-testid="sauda-ledger">
        <div role="table" aria-label="Quote comparison ledger" style={{ minWidth: `calc(var(--ledger-item) + ${colCount * 8.5}rem)` }}>
          {/* Column heads: one maker per column */}
          <div role="row" className="grid" style={{ gridTemplateColumns: gridCols, borderBottom: "1px solid var(--color-ink)", background: "var(--color-paper)" }}>
            <div role="columnheader" className="px-3 py-3 folio-margin">
              <span className="folio-head border-0">Item</span>
              <span lang="hi" className="font-devanagari t-meta ml-2">मद</span>
            </div>
            {job.quotes.map((q, i) => (
              <div key={q.id} role="columnheader" className={cell(i)}>
                <p className="text-[1rem] font-bold leading-tight">{maker(q)}</p>
                <p className="t-meta">
                  Received <span className="font-mono">{new Date(q.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  {" · "}as stated in the quote
                </p>
                {q.sourceIds.length > 0 && (
                  <button type="button" onClick={() => onShowEvidence(q.sourceIds)} className="btn btn-text" style={{ minHeight: "1.6rem", padding: "0.1rem 0" }}>
                    View source
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Priced items */}
          {descOrder.map((k) => {
            const label = normToLabel.get(k)!;
            const kind = rowKind(k);
            const chip = ROW_CHIP[kind];
            return (
              <div key={k} role="row" className="grid border-b border-[var(--color-line)]" style={{ gridTemplateColumns: gridCols }}>
                <div role="rowheader" className="px-3 py-3 folio-margin">
                  <p className="text-[0.95rem]">{label}</p>
                  <span className={`chip ${chip.cls} mt-1`}>{chip.label}</span>
                </div>
                {job.quotes.map((q, i) => {
                  const line = q.lines.find((l) => normalizeItem(l.description) === k) ?? null;
                  const named = q.unknownItems.some((u) => normalizeItem(u) === k);
                  return (
                    <div key={q.id} role="cell" className={`${cell(i)} text-right`}>
                      {line ? (
                        <>
                          {line.isKnown && line.amountRs !== undefined ? (
                            <span className="font-mono text-[0.98rem] font-semibold">{formatRupees(line.amountRs)}</span>
                          ) : (
                            <span className="chip chip-decision">Price not stated</span>
                          )}
                          {line.quantity !== undefined && <p className="t-meta font-mono">qty {line.quantity}</p>}
                          {line.notes && <p className="t-meta mt-1 leading-snug">{line.notes}</p>}
                        </>
                      ) : named ? (
                        <span className="chip chip-decision">Price not stated</span>
                      ) : (
                        <span className="t-meta">Not in this quote</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Items named without a price */}
          {unknownRows.map((item) => {
            const k = normalizeItem(item);
            return (
              <div key={item} role="row" className="grid border-b border-dashed border-[var(--color-line)]" style={{ gridTemplateColumns: gridCols }}>
                <div role="rowheader" className="px-3 py-3 folio-margin">
                  <p className="text-[0.95rem]">{item}</p>
                  <span className="chip chip-decision mt-1">{ROW_CHIP.price_missing.label}</span>
                </div>
                {job.quotes.map((q, i) => (
                  <div key={q.id} role="cell" className={`${cell(i)} text-right`}>
                    {q.unknownItems.some((u) => normalizeItem(u) === k) ? (
                      <span className="t-meta" style={{ color: "var(--color-madder)" }}>In the quote, no price given</span>
                    ) : (
                      <span className="t-meta">Not in this quote</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {/* What each quote leaves out */}
          {anyExclusions && (
            <div role="row" className="grid border-b border-[var(--color-line)]" style={{ gridTemplateColumns: gridCols }} data-testid="sauda-exclusions">
              <div role="rowheader" className="px-3 py-3 folio-margin">
                <p className="text-[0.95rem] font-semibold">Left out of the quote</p>
                <p className="t-meta">As the maker said it</p>
              </div>
              {job.quotes.map((q, i) => (
                <div key={q.id} role="cell" className={cell(i)}>
                  {q.exclusions?.length ? (
                    <ul className="space-y-0.5">
                      {q.exclusions.map((x) => (
                        <li key={x} className="t-body" style={{ color: "var(--color-madder)" }}>{x}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="t-meta">Nothing recorded as left out</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* What the maker said */}
          {anyNotes && (
            <div role="row" className="grid border-b border-[var(--color-line)]" style={{ gridTemplateColumns: gridCols }}>
              <div role="rowheader" className="px-3 py-3 folio-margin">
                <p className="text-[0.95rem] font-semibold">What the maker said</p>
              </div>
              {job.quotes.map((q, i) => (
                <div key={q.id} role="cell" className={cell(i)}>
                  <p className="t-support whitespace-pre-line">{q.notes?.trim() || "Nothing added"}</p>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div role="row" className="grid" style={{ gridTemplateColumns: gridCols, borderTop: "1px solid var(--color-ink)", background: "var(--color-paper)" }}>
            <div role="rowheader" className="px-3 py-3 folio-margin">
              <p className="text-[0.95rem] font-bold">Total of what is priced</p>
              <p className="t-meta">Items with a stated price only</p>
            </div>
            {comparisons.map((cmp, i) => (
              <div key={cmp.quoteId} role="cell" className={`${cell(i)} text-right`}>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-mono text-[1.05rem] font-bold" data-testid="quote-total">{formatRupees(cmp.knownTotalRs)}</span>
                  {cmp.isIncomparable ? (
                    <AlertTriangle size={14} className="flex-shrink-0" style={{ color: "var(--color-madder)" }} aria-label="Not directly comparable" />
                  ) : (
                    <CheckCircle2 size={14} className="flex-shrink-0" style={{ color: "var(--color-botanical)" }} aria-label="Comparable" />
                  )}
                </div>
                {cmp.isIncomparable && (
                  <p className="t-meta mt-1 leading-snug" style={{ color: "var(--color-madder)" }}>{cmp.incomparabilityReason}</p>
                )}
              </div>
            ))}
          </div>

          {common && (
            <div role="row" className="grid border-t border-[var(--color-line)]" style={{ gridTemplateColumns: gridCols, background: "var(--color-paper)" }} data-testid="like-for-like">
              <div role="rowheader" className="px-3 py-3 folio-margin">
                <p className="text-[0.95rem] font-bold">Like for like</p>
                <p className="t-meta">
                  {common.items.length} item{common.items.length === 1 ? "" : "s"} priced in every quote
                </p>
              </div>
              {common.totals.map((t, i) => (
                <div key={t.quoteId} role="cell" className={`${cell(i)} text-right`}>
                  <span className="font-mono text-[1.05rem] font-bold">{formatRupees(t.totalRs)}</span>
                </div>
              ))}
            </div>
          )}
          {!common && job.quotes.length >= 2 && (
            <div role="row" className="px-3 py-3 border-t border-[var(--color-line)]" style={{ background: "var(--color-paper)" }}>
              <p className="t-support">No single item is priced in every quote, so there is no like-for-like total to show.</p>
            </div>
          )}
        </div>
      </div>

      {/* No winner, said plainly */}
      {job.quotes.length >= 2 && (
        <p className="t-support flex items-start gap-2 max-w-3xl">
          <Info size={15} className="flex-shrink-0 mt-1" aria-hidden={true} />
          <span>
            <strong className="text-[var(--color-ink)]">AAKAAR does not pick a quote.</strong> The lowest total is not always the
            best offer: one quote may leave out installation, another may use a different material. Close the gaps above, then
            decide yourself. The like-for-like row adds up only the items every maker priced.
          </span>
        </p>
      )}
    </div>
  );
}