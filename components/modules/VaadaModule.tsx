"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Circle, Clock, HelpCircle, History, Plus, XCircle, AlertTriangle } from "lucide-react";
import type { Job, KaamNaksha, Revision, SpecField } from "@/lib/types";
import ListenButton from "@/components/ListenButton";
import NextBar from "@/components/NextBar";
import { formatRupees } from "@/lib/spec/calculations";
import {
  FIELD_STATE_LABEL,
  fieldOrigin,
  fieldState,
  isRevised,
  openGapFor,
  pendingRevisionFor,
  type FieldState,
  type NewFieldInput,
  type RevisionInput,
  type Role,
} from "@/lib/spec/workflow";
import { nextStep } from "@/lib/utils/jobStage";
import { inferValueKind, VALUE_KINDS, VALUE_KIND_INFO, type ValueKind } from "@/lib/spec/values";
import { SPEC_ORIGIN_LABEL, STAGE_TERMS, TERMS } from "@/lib/utils/terms";

type Result = string | null;

interface Props {
  job: Job;
  onShowEvidence: (sourceIds: string[]) => void;
  onAddField?: (input: NewFieldInput) => Result;
  onEditField?: (key: string, edits: { label?: string; value: string; notes?: string; valueKind?: ValueKind }) => Result;
  onConfirm?: (key: string, role: Role) => Result;
  onProposeRevision?: (key: string, input: RevisionInput) => Result;
  onRespondRevision?: (revisionId: string, role: Role, decision: "accept" | "reject") => Result;
  onGoToStage?: (id: "sauda" | "samajh" | "vaada" | "kya_hua") => void;
}

// ── Craft groups: a work sheet reads by practical category ───────────────────

interface Group {
  id: string;
  title: string;
  hindi: string;
  match: RegExp;
}

// Checked in this order; the first match wins. "other" catches the rest.
const GROUPS: Group[] = [
  { id: "installation", title: "Installation", hindi: "फिटिंग", match: /install|fitting|mounting/ },
  { id: "delivery", title: "Delivery", hindi: "डिलीवरी", match: /deadline|deliver|dispatch|handover|diwali/ },
  { id: "price", title: "Price and scope", hindi: "दाम और काम", match: /budget|price|cost|scope|amount|payment|advance/ },
  { id: "dimensions", title: "Dimensions", hindi: "नाप", match: /dimension|size|height|width|depth|length|thickness|\bmm\b|feet|foot/ },
  { id: "layout", title: "Internal layout", hindi: "अंदर की बनावट", match: /drawer|shel|partition|compartment|layout|internal|\brod\b/ },
  { id: "hardware", title: "Hardware", hindi: "हार्डवेयर", match: /hardware|handle|hinge|channel|lock|knob|slide|fitting/ },
  { id: "finish", title: "Finish", hindi: "फिनिश", match: /finish|polish|laminate|veneer|paint|colou?r|walnut|matt|gloss/ },
  { id: "material", title: "Material and carcass", hindi: "सामान", match: /material|carcass|plywood|board|wood|ply\b|bwp|mdf|hdhmr/ },
];

function groupFields(fields: SpecField[]): { group: Group; fields: SpecField[] }[] {
  const other: Group = { id: "other", title: "Other", hindi: "बाकी", match: /./ };
  // Display order follows the craft sequence in the brief
  const displayOrder = ["material", "finish", "dimensions", "layout", "hardware", "installation", "price", "delivery", "other"];
  const buckets = new Map<string, SpecField[]>();
  for (const f of fields) {
    const hay = `${f.key} ${f.label}`.toLowerCase();
    const g = GROUPS.find((x) => x.match.test(hay)) ?? other;
    buckets.set(g.id, [...(buckets.get(g.id) ?? []), f]);
  }
  // A job that is not carpentry may match none of the groups above. Then "Other" would be
  // the whole spec, so it is called "Details" instead.
  if (fields.length > 0 && fields.every((f) => !GROUPS.some((g) => g.match.test(`${f.key} ${f.label}`.toLowerCase())))) {
    other.title = "Details";
    other.hindi = "ब्योरा";
  }
  const all = [...GROUPS, other];
  return displayOrder
    .filter((id) => (buckets.get(id) ?? []).length > 0)
    .map((id) => ({ group: all.find((g) => g.id === id)!, fields: buckets.get(id)! }));
}

const NUMERIC = /^[₹~\d×xX\-\s,.ftcm%]+$/;
const isNumeric = (v: unknown) => NUMERIC.test(String(v).trim());

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Read back text: confirmed items only, kept under about 450 characters. */
function buildReadBack(fields: SpecField[]): { text: string; used: number; total: number } {
  const confirmed = fields.filter((f) => f.status === "confirmed");
  let text = "";
  let used = 0;
  for (const f of confirmed) {
    const value = f.agreedValue ?? f.value;
    if (value === undefined || value === null) continue;
    const sentence = `${f.label}: ${String(value)}.`;
    if ((text + " " + sentence).trim().length > 450) break;
    text = (text + " " + sentence).trim();
    used += 1;
  }
  return { text, used, total: confirmed.length };
}

const OTHER: Record<Role, Role> = { customer: "maker", maker: "customer" };

export default function VaadaModule({
  job,
  onShowEvidence,
  onAddField,
  onEditField,
  onConfirm,
  onProposeRevision,
  onRespondRevision,
  onGoToStage,
}: Props) {
  const { kaamNaksha, revisions } = job;
  const grouped = groupFields(kaamNaksha.fields);
  const readBack = buildReadBack(kaamNaksha.fields);
  const [adding, setAdding] = useState(false);
  const firstUnconfirmedKey = kaamNaksha.fields.find((f) => fieldState(f) !== "confirmed")?.key;

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="display-sign text-[1.9rem] sm:text-[2.2rem]" style={{ color: "var(--color-indigo-deep)" }}>
            {TERMS.kaamNaksha.name}
          </h2>
          <p className="mt-0.5 flex items-baseline gap-2 flex-wrap">
            <span lang="hi" className="font-devanagari text-[1.05rem] font-semibold">{TERMS.kaamNaksha.hindi}</span>
            <span className="t-support">{TERMS.kaamNaksha.gloss}. {STAGE_TERMS.vaada.hindi} means a promise.</span>
          </p>
        </div>
        <div className="sm:text-right">
          <p className="t-meta">
            {kaamNaksha.version === 0 ? (
              <span data-testid="spec-version">No version yet. The first field creates v1.</span>
            ) : (
              <>Version <span className="font-mono font-semibold text-[var(--color-ink)]" data-testid="spec-version">v{kaamNaksha.version}</span></>
            )}
          </p>
          <CompletenessCount fields={kaamNaksha.fields} />
        </div>
      </div>

      <NextBar stage="vaada" step={nextStep(job, "vaada")} onGoToStage={onGoToStage} />

      {/* Not a contract */}
      <div className="sheet px-4 py-3" style={{ borderLeft: "4px solid var(--color-ochre)" }}>
        <p className="t-body">
          <strong>This is not a legal contract.</strong> The KAAM-NAKSHA is a shared working understanding.
          Use it to line up expectations, not as a binding agreement. A confirm button records that someone pressed it for a role.
          It is not a signature and does not prove who pressed it.
        </p>
      </div>

      {/* Read back, confirmed items only */}
      {readBack.used > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <ListenButton text={readBack.text} language="auto" label="Read back" />
          <p className="t-meta">
            Reads confirmed items only
            {readBack.used < readBack.total ? ` (first ${readBack.used} of ${readBack.total})` : ""}.
          </p>
        </div>
      )}

      {/* Add a field */}
      {onAddField && (
        <div id="add-field" data-focus="add-field" data-open-form>
          {adding ? (
            <AddFieldForm
              onSave={(input) => {
                const err = onAddField(input);
                if (!err) setAdding(false);
                return err;
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" className="btn btn-primary inline-flex items-center gap-1" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden={true} /> Add a field
            </button>
          )}
        </div>
      )}

      {/* Work sheet, grouped by craft category */}
      {kaamNaksha.fields.length === 0 ? (
        <div className="sheet px-5 py-6">
          <p className="t-body">No specification fields yet.</p>
          <p className="t-support mt-1 max-w-lg">
            Add a field with the button above, or answer a question in SAMAJH and add the answer here.
          </p>
          {onGoToStage && (
            <button type="button" className="btn btn-text mt-2" style={{ paddingLeft: 0 }} onClick={() => onGoToStage("samajh")}>
              Go to SAMAJH
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ group, fields }) => (
            <section key={group.id} aria-labelledby={`grp-${group.id}`}>
              <h3 id={`grp-${group.id}`} className="t-section mb-2 flex items-baseline gap-2">
                {group.title}
                <span lang="hi" className="font-devanagari t-support font-medium">{group.hindi}</span>
              </h3>
              <div className="sheet">
                {fields.map((field) => (
                  <FieldRow
                    key={field.key}
                    first={field.key === firstUnconfirmedKey}
                    field={field}
                    job={job}
                    onShowEvidence={onShowEvidence}
                    onEditField={onEditField}
                    onConfirm={onConfirm}
                    onProposeRevision={onProposeRevision}
                    onRespondRevision={onRespondRevision}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Confirmations */}
      {kaamNaksha.confirmations.length > 0 && (
        <section aria-labelledby="confirmations">
          <h3 id="confirmations" className="t-section mb-2">Confirmations on record</h3>
          <div className="sheet">
            {kaamNaksha.confirmations.map((conf) => (
              <ConfirmationRow key={conf.id} conf={conf} naksha={kaamNaksha} />
            ))}
          </div>
        </section>
      )}

      {/* Version history: changes to the CONTENT of the specification */}
      {(kaamNaksha.history?.length ?? 0) > 0 && (
        <section aria-labelledby="versions">
          <h3 id="versions" className="t-section mb-1">Version history</h3>
          <p className="t-meta mb-2">
            A new version is written only when the content changes. Marking a field confirmed does not add a version. Who confirmed what is recorded on each field.
          </p>
          <ol className="sheet" data-testid="version-history">
            {[...(kaamNaksha.history ?? [])].reverse().map((h, i) => (
              <li key={`${h.version}-${i}`} className="register-row last:border-b-0 px-4 py-2.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-[3rem_8.5rem_1fr]">
                <span className="entry-no" style={{ color: "var(--color-madder)" }}>v{h.version}</span>
                <span className="t-meta font-mono">{stamp(h.at)}</span>
                <span className="t-body">{h.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Revision history, shown as redlines */}
      {revisions.length > 0 && (
        <section aria-labelledby="revisions">
          <h3 id="revisions" className="t-section mb-2 flex items-center gap-2">
            <History size={16} aria-hidden={true} /> Badlaav
            <span lang="hi" className="font-devanagari t-support font-medium">बदलाव</span>
            <span className="t-support font-medium">revision history</span>
          </h3>
          <div className="space-y-3">
            {revisions.map((rev, i) => (
              <RevisionRecord key={rev.id} revision={rev} index={i + 1} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── State chip ────────────────────────────────────────────────────────────────

const STATE_CHIP: Record<FieldState, { cls: string; Icon: typeof Circle }> = {
  confirmed: { cls: "chip-confirmed", Icon: CheckCircle2 },
  awaiting_customer: { cls: "chip-proposed", Icon: Clock },
  awaiting_maker: { cls: "chip-proposed", Icon: Clock },
  proposed: { cls: "chip-proposed", Icon: Circle },
  needs_decision: { cls: "chip-decision", Icon: AlertTriangle },
  unclear: { cls: "chip-unclear", Icon: HelpCircle },
};

function StateChips({ field, openGap }: { field: SpecField; openGap?: boolean }) {
  const state = fieldState(field);
  const { cls, Icon } = STATE_CHIP[state];
  const origin = fieldOrigin(field);
  return (
    <>
      <span className="chip chip-unclear" title="How this field came to be here">{SPEC_ORIGIN_LABEL[origin]}</span>
      {openGap && (
        <span className="chip chip-decision">
          <AlertTriangle size={12} aria-hidden={true} />
          Open question in SAMAJH
        </span>
      )}
      <span className={`chip ${cls}`}>
        <Icon size={12} aria-hidden={true} />
        {FIELD_STATE_LABEL[state]}
      </span>
      {isRevised(field) && state !== "confirmed" && (
        <span className="chip chip-revised">
          <History size={12} aria-hidden={true} />
          Revised, confirm again
        </span>
      )}
    </>
  );
}

// ── Add a field ───────────────────────────────────────────────────────────────

function AddFieldForm({ onSave, onCancel }: { onSave: (i: NewFieldInput) => Result; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<ValueKind | "auto">("auto");
  const [error, setError] = useState<Result>(null);
  const guess = label.trim() && value.trim() ? inferValueKind(label, value) : null;

  return (
    <form
      className="sheet animate-slide-up"
      aria-label="Add a specification field"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ label, value, notes, valueKind: kind === "auto" ? undefined : kind }));
      }}
    >
      <div className="rule-b px-4 py-3">
        <h3 className="t-section">Add a field</h3>
        <p className="t-support">It starts as proposed. Nobody has confirmed it yet.</p>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nf-label" className="t-label block mb-1">Field name <span style={{ color: "var(--color-sindoor)" }}>(required)</span></label>
          <input id="nf-label" className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name the detail, for example Size" autoFocus />
        </div>
        <div>
          <label htmlFor="nf-value" className="t-label block mb-1">Value <span style={{ color: "var(--color-sindoor)" }}>(required)</span></label>
          <input id="nf-value" className="field" value={value} onChange={(e) => setValue(e.target.value)} placeholder="As agreed, in words or numbers" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="nf-kind" className="t-label block mb-1">What kind of value is this?</label>
          <select id="nf-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as ValueKind | "auto")}>
            <option value="auto">{guess ? `Let AAKAAR read it (looks like: ${VALUE_KIND_INFO[guess].label})` : "Let AAKAAR read it"}</option>
            {VALUE_KINDS.map((k) => (
              <option key={k} value={k}>{VALUE_KIND_INFO[k].label} ({VALUE_KIND_INFO[k].hindi}): {VALUE_KIND_INFO[k].hint}</option>
            ))}
          </select>
          <p className="t-meta mt-1">A number can be money, a count or a size. Say which when it matters, so it is read the way you mean it.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="nf-notes" className="t-label block mb-1">Note (optional)</label>
          <input id="nf-notes" className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error && <p className="px-4 pb-2 t-support" style={{ color: "var(--color-sindoor)" }} role="alert">{error}</p>}
      <div className="rule-t flex flex-wrap gap-2 px-4 py-3">
        <button type="submit" className="btn btn-primary">Add as proposed</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── One worksheet row ─────────────────────────────────────────────────────────

function FieldRow({
  field,
  first,
  job,
  onShowEvidence,
  onEditField,
  onConfirm,
  onProposeRevision,
  onRespondRevision,
}: {
  field: SpecField;
  first?: boolean;
  job: Job;
  onShowEvidence: (ids: string[]) => void;
  onEditField?: Props["onEditField"];
  onConfirm?: Props["onConfirm"];
  onProposeRevision?: Props["onProposeRevision"];
  onRespondRevision?: Props["onRespondRevision"];
}) {
  const displayValue = field.agreedValue ?? field.value;
  const hasValue = displayValue !== undefined && displayValue !== null && String(displayValue).trim() !== "";
  const state = fieldState(field);
  const pending = pendingRevisionFor(job, field.key);
  const marks = field.roleConfirmations;
  const hasMarks = !!(marks?.customer || marks?.maker);
  const canEdit = !!onEditField && state !== "confirmed" && field.status !== "changed" && !hasMarks && !pending;
  const openGap = openGapFor(job, field.key);
  const canConfirm = !!onConfirm && state !== "confirmed" && state !== "needs_decision" && state !== "unclear" && !pending && !openGap;
  const canPropose = !!onProposeRevision && hasValue && !pending;

  const kind: ValueKind = field.valueKind ?? inferValueKind(field.label, displayValue ?? "");
  const kindInfo = VALUE_KIND_INFO[kind];
  const kindIsNumeric = kind === "currency" || kind === "quantity" || kind === "measurement" || kind === "date";
  const [mode, setMode] = useState<"none" | "edit" | "propose">("none");
  const [error, setError] = useState<Result>(null);

  const isMarked = (role: Role) => !!marks?.[role] && marks[role]!.value === String(field.value ?? "").trim();

  const markLine = (role: Role) => {
    const m = marks?.[role];
    const ok = m && m.value === String(field.value ?? "").trim();
    const who = role === "customer" ? "Customer role" : "Maker role";
    if (state === "confirmed" && !marks) return `${who}: part of an older confirmed record`;
    return ok && m ? `${who}: marked confirmed ${stamp(m.at)} (spec v${m.specVersion})` : `${who}: not marked yet`;
  };

  return (
    <div
      className="register-row last:border-b-0 px-4 py-3 grid gap-x-5 gap-y-2 md:grid-cols-[11rem_minmax(0,1fr)_auto]"
      data-testid="field-row"
      data-field={field.key}
      id={first ? "first-unconfirmed-field" : undefined}
      style={openGap ? { borderLeft: "3px solid var(--color-madder)" } : undefined}
    >
      {/* Label */}
      <div>
        <p className="text-[0.95rem] font-semibold leading-snug">{field.label}</p>
        {field.labelHindi && <p lang="hi" className="font-devanagari t-meta">{field.labelHindi}</p>}
      </div>

      {/* Value and detail */}
      <div className="min-w-0">
        {hasValue && (
          <p className={`text-[1rem] leading-snug ${isNumeric(displayValue) || kindIsNumeric ? "font-mono font-semibold" : ""}`}>
            {String(displayValue)}
            <span className="ml-2 t-meta font-sans font-normal" title={kindInfo.hint}>
              {kindInfo.label} <span lang="hi" className="font-devanagari">{kindInfo.hindi}</span>
            </span>
          </p>
        )}
        {openGap && (
          <p className="t-support mt-1" style={{ color: "var(--color-madder)" }}>
            A value is entered, but SAMAJH still has an open question about this point, so it is not clear yet.
            Clear the question before confirming.
          </p>
        )}

        {field.customerMeaning && field.makerMeaning && field.status === "possible_mismatch" && (
          <div className="mt-2 grid sm:grid-cols-2 gap-3">
            <div className="evidence evidence-customer">
              <p className="t-label">Customer&rsquo;s meaning</p>
              <p className="text-[0.9rem] leading-snug">{field.customerMeaning}</p>
            </div>
            <div className="evidence evidence-maker">
              <p className="t-label">Maker&rsquo;s meaning</p>
              <p className="text-[0.9rem] leading-snug">{field.makerMeaning}</p>
            </div>
          </div>
        )}

        {field.notes && <p className="t-support mt-1.5 whitespace-pre-line">{field.notes}</p>}

        {(hasMarks || state === "confirmed") && (
          <ul className="t-meta mt-1.5 space-y-0.5" aria-label="Confirmations for this field">
            <li>{markLine("customer")}</li>
            <li>{markLine("maker")}</li>
          </ul>
        )}
      </div>

      {/* State, source, last change */}
      <div className="flex md:flex-col items-center md:items-end gap-x-3 gap-y-1.5 flex-wrap">
        <StateChips field={field} openGap={!!openGap} />
        {field.sourceIds.length > 0 && (
          <button
            type="button"
            onClick={() => onShowEvidence(field.sourceIds)}
            className="btn btn-text"
            style={{ minHeight: "1.75rem", padding: "0.1rem 0" }}
            aria-label={`View ${field.sourceIds.length} source${field.sourceIds.length !== 1 ? "s" : ""} for ${field.label}`}
          >
            {field.sourceIds.length} source{field.sourceIds.length !== 1 ? "s" : ""}
          </button>
        )}
        {field.lastChangedAt && (
          <span className="t-meta">
            Changed <span className="font-mono">{shortDate(field.lastChangedAt)}</span>
          </span>
        )}
      </div>

      {/* A change waiting for the other role */}
      {pending && onRespondRevision && (
        <div className="md:col-span-3 evidence" style={{ borderLeftColor: "var(--color-ochre)" }} id="pending-change" data-focus="pending-change">
          <p className="t-label">Proposed change</p>
          <p className="text-[1rem]">
            <span className="line-through" style={{ color: "var(--color-sindoor)" }}>{String(pending.previousValue)}</span>
            {" "}
            <ArrowRight size={14} className="inline" aria-hidden={true} />{" "}
            <span className="font-semibold">{String(pending.newValue)}</span>
          </p>
          <p className="t-support">
            {pending.reason} Proposed by the <span className="capitalize">{pending.proposedBy}</span>. The current value stays on record until the other role accepts.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(pending.proposedBy === "customer" || pending.proposedBy === "maker") && (
              <>
                <button
                  type="button"
                  className="btn btn-confirm"
                  onClick={() => setError(onRespondRevision(pending.id, OTHER[pending.proposedBy as Role], "accept"))}
                >
                  Accept as {OTHER[pending.proposedBy as Role]}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setError(onRespondRevision(pending.id, OTHER[pending.proposedBy as Role], "reject"))}
                >
                  Reject as {OTHER[pending.proposedBy as Role]}
                </button>
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={() => setError(onRespondRevision(pending.id, pending.proposedBy as Role, "reject"))}
                >
                  Withdraw as {pending.proposedBy}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {(canConfirm || canEdit || canPropose) && mode === "none" && (
        <div className="md:col-span-3 flex flex-wrap items-center gap-2">
          {canConfirm && (
            <>
              <button
                type="button"
                className="btn btn-confirm"
                disabled={isMarked("customer")}
                onClick={() => setError(onConfirm!(field.key, "customer"))}
                aria-label={`Mark ${field.label} confirmed as customer`}
              >
                Mark confirmed as customer
              </button>
              <button
                type="button"
                className="btn btn-confirm"
                disabled={isMarked("maker")}
                onClick={() => setError(onConfirm!(field.key, "maker"))}
                aria-label={`Mark ${field.label} confirmed as maker`}
              >
                Mark confirmed as maker
              </button>
            </>
          )}
          {canEdit && (
            <button type="button" className="btn btn-quiet" onClick={() => { setMode("edit"); setError(null); }}>
              Edit
            </button>
          )}
          {canPropose && !canEdit && (
            <button type="button" className="btn btn-quiet" onClick={() => { setMode("propose"); setError(null); }}>
              Propose a change
            </button>
          )}
        </div>
      )}

      {mode === "edit" && onEditField && (
        <div className="md:col-span-3">
          <EditForm
            field={field}
            onSave={(edits) => {
              const err = onEditField(field.key, edits);
              if (!err) setMode("none");
              return err;
            }}
            onCancel={() => setMode("none")}
          />
        </div>
      )}

      {mode === "propose" && onProposeRevision && (
        <div className="md:col-span-3">
          <ProposeForm
            field={field}
            onSave={(input) => {
              const err = onProposeRevision(field.key, input);
              if (!err) setMode("none");
              return err;
            }}
            onCancel={() => setMode("none")}
          />
        </div>
      )}

      {error && (
        <p className="md:col-span-3 t-support" style={{ color: "var(--color-sindoor)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function EditForm({
  field,
  onSave,
  onCancel,
}: {
  field: SpecField;
  onSave: (e: { label?: string; value: string; notes?: string; valueKind?: ValueKind }) => Result;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ValueKind>(field.valueKind ?? inferValueKind(field.label, field.value ?? ""));
  const [value, setValue] = useState(String(field.value ?? ""));
  const [notes, setNotes] = useState(field.notes ?? "");
  const [error, setError] = useState<Result>(null);
  const id = `edit-${field.key}`;
  return (
    <form
      className="space-y-2"
      aria-label={`Edit ${field.label}`}
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ value, notes, valueKind: kind }));
      }}
    >
      <label htmlFor={`${id}-value`} className="t-label block">Value for {field.label}</label>
      <input id={`${id}-value`} className="field" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      <label htmlFor={`${id}-kind`} className="t-label block">Kind of value</label>
      <select id={`${id}-kind`} className="field" value={kind} onChange={(e) => setKind(e.target.value as ValueKind)}>
        {VALUE_KINDS.map((k) => (
          <option key={k} value={k}>{VALUE_KIND_INFO[k].label} ({VALUE_KIND_INFO[k].hindi})</option>
        ))}
      </select>
      <label htmlFor={`${id}-notes`} className="t-label block">Note (optional)</label>
      <input id={`${id}-notes`} className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <p className="t-support" style={{ color: "var(--color-sindoor)" }} role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Save</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function ProposeForm({
  field,
  onSave,
  onCancel,
}: {
  field: SpecField;
  onSave: (i: RevisionInput) => Result;
  onCancel: () => void;
}) {
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [by, setBy] = useState<Role>("customer");
  const [error, setError] = useState<Result>(null);
  const id = `rev-${field.key}`;
  return (
    <form
      className="space-y-2"
      aria-label={`Propose a change to ${field.label}`}
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ newValue, reason, proposedBy: by }));
      }}
    >
      <p className="t-support">
        The current value stays on record. The other role has to accept the change, and then both roles confirm the new value again.
      </p>
      <label htmlFor={`${id}-new`} className="t-label block">New value for {field.label}</label>
      <input id={`${id}-new`} className="field" value={newValue} onChange={(e) => setNewValue(e.target.value)} autoFocus />
      <label htmlFor={`${id}-reason`} className="t-label block">Why</label>
      <input id={`${id}-reason`} className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
      <label htmlFor={`${id}-by`} className="t-label block">Proposed by</label>
      <select id={`${id}-by`} className="field" value={by} onChange={(e) => setBy(e.target.value as Role)}>
        <option value="customer">Customer</option>
        <option value="maker">Maker</option>
      </select>
      {error && <p className="t-support" style={{ color: "var(--color-sindoor)" }} role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Propose change</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Confirmation entry ────────────────────────────────────────────────────────

function ConfirmationRow({
  conf,
  naksha,
}: {
  conf: KaamNaksha["confirmations"][number];
  naksha: KaamNaksha;
}) {
  const covered = conf.fieldKeysConfirmed
    .map((k) => naksha.fields.find((f) => f.key === k)?.label)
    .filter(Boolean) as string[];

  return (
    <div className="register-row last:border-b-0 px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip chip-confirmed">
          <CheckCircle2 size={12} aria-hidden={true} />
          <span className="capitalize">{conf.party}</span> confirmed
        </span>
        <span className="t-meta">
          Spec version <span className="font-mono">{conf.specVersion}</span> on{" "}
          <span className="font-mono">{new Date(conf.confirmedAt).toLocaleDateString("en-IN")}</span>
        </span>
      </div>
      <div className="evidence mt-2">
        <p className="text-[0.95rem] leading-snug">&ldquo;{conf.statement}&rdquo;</p>
      </div>
      <p className="t-meta mt-1.5">
        Covers: {covered.length > 0 ? covered.join(", ") : "scope not recorded"}
      </p>
    </div>
  );
}

// ── Revision shown as a redline record ────────────────────────────────────────

function RevisionRecord({ revision: r, index }: { revision: Revision; index: number }) {
  const state = {
    accepted: { label: "Accepted", cls: "chip-confirmed", Icon: CheckCircle2 },
    rejected: { label: "Rejected", cls: "chip-decision", Icon: XCircle },
    proposed: { label: "Proposed, awaiting the other role", cls: "chip-proposed", Icon: Circle },
  }[r.status];
  const { Icon } = state;
  const numericPair = isNumeric(r.previousValue) && isNumeric(r.newValue);

  return (
    <article className="sheet px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="entry-no">R{index}</span>
        <h4 className="text-[1rem] font-semibold">{r.fieldLabel}</h4>
        <span className={`chip ${state.cls} sm:ml-auto`}>
          <Icon size={12} aria-hidden={true} />
          {state.label}
        </span>
      </div>

      {/* Previous value stays visible next to the new one */}
      <div className={`mt-2 flex items-center gap-3 flex-wrap text-[1rem] ${numericPair ? "font-mono" : ""}`}>
        <span
          className="line-through decoration-2"
          style={{ color: "var(--color-sindoor)", textDecorationColor: "var(--color-sindoor)" }}
          aria-label={`Previous value ${String(r.previousValue)}`}
        >
          {String(r.previousValue)}
        </span>
        <ArrowRight size={16} className="text-[var(--color-muted)]" aria-hidden={true} />
        <span className="font-semibold" aria-label={`New value ${String(r.newValue)}`}>
          {String(r.newValue)}
        </span>
      </div>

      {r.status === "proposed" && (
        <p className="t-meta mt-1">The previous value stays on record until this is accepted.</p>
      )}

      <p className="t-support mt-2">{r.reason}</p>

      <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap t-meta">
        <span>
          <span className="capitalize">{r.proposedBy}</span> proposed on{" "}
          <span className="font-mono">{new Date(r.proposedAt).toLocaleDateString("en-IN")}</span>
        </span>
        {r.acceptedBy && r.acceptedAt && (
          <span>
            <span className="capitalize">{r.acceptedBy}</span> accepted on{" "}
            <span className="font-mono">{new Date(r.acceptedAt).toLocaleDateString("en-IN")}</span>
          </span>
        )}
        {r.rejectedBy && r.rejectedAt && (
          <span>
            <span className="capitalize">{r.rejectedBy}</span> {r.rejectedBy === r.proposedBy ? "withdrew" : "rejected"} on{" "}
            <span className="font-mono">{new Date(r.rejectedAt).toLocaleDateString("en-IN")}</span>
          </span>
        )}
        {r.costImpactRs !== undefined && r.costImpactRs !== 0 && (
          <span
            className="font-mono font-semibold"
            style={{ color: r.costImpactRs > 0 ? "var(--color-sindoor)" : "var(--color-neem)" }}
          >
            {r.costImpactRs > 0 ? "+" : ""}
            {formatRupees(r.costImpactRs)}
          </span>
        )}
        {r.timeImpactDays !== undefined && r.timeImpactDays !== 0 && (
          <span className="inline-flex items-center gap-1 font-mono">
            <Clock size={12} aria-hidden={true} />
            {r.timeImpactDays > 0 ? "+" : ""}
            {r.timeImpactDays}d
          </span>
        )}
      </div>
    </article>
  );
}

// ── Counts instead of a percentage bar ────────────────────────────────────────

function CompletenessCount({ fields }: { fields: SpecField[] }) {
  const tally: Record<FieldState, number> = {
    confirmed: 0, awaiting_customer: 0, awaiting_maker: 0, proposed: 0, needs_decision: 0, unclear: 0,
  };
  fields.forEach((f) => { tally[fieldState(f)] += 1; });
  const awaiting = tally.awaiting_customer + tally.awaiting_maker;

  const parts: string[] = [];
  if (tally.confirmed > 0) parts.push(`${tally.confirmed} confirmed by both`);
  if (awaiting > 0) parts.push(`${awaiting} awaiting one role`);
  if (tally.proposed > 0) parts.push(`${tally.proposed} proposed`);
  if (tally.needs_decision > 0) parts.push(`${tally.needs_decision} need a decision`);
  if (tally.unclear > 0) parts.push(`${tally.unclear} unclear`);

  return (
    <p className="text-[0.9rem] font-semibold mt-0.5">
      {parts.length > 0 ? parts.join(", ") : `${fields.length} fields`}
    </p>
  );
}