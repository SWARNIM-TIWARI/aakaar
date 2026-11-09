"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

export interface NewQuoteInput {
  makerName: string;
  /** Items with a stated price. */
  lines: { description: string; amountRs: number; quantity?: number }[];
  /** Items named in the quote with no price. Never summed. */
  unpricedItems: string[];
  /** What the maker said the quote does NOT include. */
  exclusions?: string[];
  notes?: string;
}

interface Props {
  defaultMaker?: string;
  onSave: (q: NewQuoteInput) => void;
  onCancel: () => void;
}

interface Row {
  key: number;
  description: string;
  amount: string;
  qty: string;
}

let rowKey = 0;
const newRow = (): Row => ({ key: ++rowKey, description: "", amount: "", qty: "" });

/** A quantity is typed on purpose here, so a plain number is read as a count and nothing else. */
function parseQty(raw: string): number | undefined {
  const t = raw.trim();
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : undefined;
}

/** Parse "29,200", "₹29200", "29200.50". Returns undefined when blank or not a plain number. */
function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (cleaned === "") return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

/**
 * Manual quote entry. A blank price means "not stated", so the item is recorded
 * as unpriced and is never counted in the total. Totals are worked out by the app.
 */
export default function AddQuoteForm({ defaultMaker, onSave, onCancel }: Props) {
  const [maker, setMaker] = useState(defaultMaker ?? "");
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [notes, setNotes] = useState("");
  const [exclusions, setExclusions] = useState("");

  const badAmount = (r: Row) => r.amount.trim() !== "" && parseAmount(r.amount) === undefined;
  const filled = rows.filter((r) => r.description.trim() !== "");
  const hasBad = filled.some(badAmount);
  const canSave = maker.trim().length > 0 && filled.length > 0 && !hasBad;

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const lines: NewQuoteInput["lines"] = [];
    const unpricedItems: string[] = [];
    filled.forEach((r) => {
      const amt = parseAmount(r.amount);
      if (amt === undefined) unpricedItems.push(r.description.trim());
      else lines.push({ description: r.description.trim(), amountRs: amt, quantity: parseQty(r.qty) });
    });
    const left = exclusions.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
    onSave({ makerName: maker.trim(), lines, unpricedItems, exclusions: left.length ? left : undefined, notes: notes.trim() || undefined });
  }

  return (
    <form onSubmit={submit} className="sheet animate-slide-up" aria-label="Add a quote">
      <div className="rule-b px-4 py-3">
        <h3 className="t-section">
          Add a quote <span lang="hi" className="font-devanagari" style={{ color: "var(--color-muted)", fontWeight: 500 }}>कोटेशन जोड़ें</span>
        </h3>
        <p className="t-support">
          One maker, one quote. Leave the price blank if the maker did not state one; that item is kept as unpriced and is never counted in the total.
        </p>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label htmlFor="q-maker" className="t-label block mb-1">
            Maker name <span style={{ color: "var(--color-sindoor)" }}>(required)</span>
          </label>
          <input
            id="q-maker"
            className="field"
            value={maker}
            onChange={(e) => setMaker(e.target.value)}
            placeholder="Sharma Carpentry"
            autoFocus
          />
        </div>

        <fieldset>
          <legend className="t-label mb-2">Items in the quote <span className="font-normal">(quantity is optional; price in rupees)</span></legend>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_4rem_7.5rem_2rem] gap-2 items-start">
                <div>
                  <label htmlFor={`q-desc-${r.key}`} className="sr-only">Item {i + 1} description</label>
                  <input
                    id={`q-desc-${r.key}`}
                    className="field"
                    value={r.description}
                    onChange={(e) => update(r.key, { description: e.target.value })}
                    placeholder={i === 0 ? "What is being offered" : "Another item or service"}
                  />
                </div>
                <div>
                  <label htmlFor={`q-qty-${r.key}`} className="sr-only">Item {i + 1} quantity (optional)</label>
                  <input
                    id={`q-qty-${r.key}`}
                    className="field font-mono"
                    inputMode="decimal"
                    value={r.qty}
                    onChange={(e) => update(r.key, { qty: e.target.value })}
                    placeholder="Qty"
                  />
                </div>
                <div>
                  <label htmlFor={`q-amt-${r.key}`} className="sr-only">Item {i + 1} price in rupees</label>
                  <input
                    id={`q-amt-${r.key}`}
                    className="field font-mono"
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(e) => update(r.key, { amount: e.target.value })}
                    placeholder="₹ price"
                    aria-invalid={badAmount(r) || undefined}
                  />
                  {badAmount(r) && (
                    <p className="t-meta" style={{ color: "var(--color-sindoor)" }}>Numbers only</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-text"
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
                  style={{ padding: "0.55rem 0" }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-text mt-2 inline-flex items-center gap-1"
            onClick={() => setRows((rs) => [...rs, newRow()])}
          >
            <Plus size={14} aria-hidden="true" /> Add another item
          </button>
        </fieldset>

        <div>
          <label htmlFor="q-excl" className="t-label block mb-1">What this quote leaves out (optional, one per line)</label>
          <textarea
            id="q-excl"
            className="field"
            rows={2}
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
            placeholder={"Installation extra\nTransport not included"}
          />
        </div>

        <div>
          <label htmlFor="q-notes" className="t-label block mb-1">What the maker said about this quote (optional)</label>
          <textarea
            id="q-notes"
            className="field"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Valid for 7 days, advance 50%"
          />
        </div>
      </div>

      <div className="rule-t flex flex-wrap gap-2 px-4 py-3">
        <button type="submit" className="btn btn-primary" disabled={!canSave}>
          Save quote
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}