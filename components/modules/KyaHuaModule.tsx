"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import { AlertTriangle, CheckCircle2, Circle, FileText, HelpCircle, Paperclip } from "lucide-react";
import type { Job, OutcomeFinding } from "@/lib/types";
import SeverityDot from "@/components/SeverityDot";
import NextBar from "@/components/NextBar";
import { compareValues, deliveryOverview, findDuplicateReport, isStaleFinding, type DeliveryInput, type DeliveryState, type Reporter } from "@/lib/spec/workflow";
import { compareReport } from "@/lib/spec/values";
import { nextStep } from "@/lib/utils/jobStage";
import { STAGE_TERMS } from "@/lib/utils/terms";

type Result = string | null;

interface Props {
  job: Job;
  onShowEvidence: (sourceIds: string[]) => void;
  onRecordDelivery?: (input: DeliveryInput) => Result;
  onSettle?: (findingId: string, note: string) => Result;
  onGoToStage?: (id: "sauda" | "samajh" | "vaada" | "kya_hua") => void;
}

type IconType = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
const NUMERIC = /^[₹~\d×xX\-\s,.ftcm%]+$/;
const isNumeric = (v: unknown) => !isBlank(v) && NUMERIC.test(String(v).trim());

/**
 * Neutral comparison label. This only compares the agreed value with the value
 * the parties reported. Nobody has inspected the work, and no verdict is implied.
 */
function comparison(f: OutcomeFinding): { label: string; cls: string; Icon: IconType } {
  if (isBlank(f.observedValue)) return { label: "Not checked", cls: "chip-unclear", Icon: HelpCircle };
  if (f.outcome === "cannot_compare") return { label: "Cannot be compared", cls: "chip-unclear", Icon: HelpCircle };
  const matches = f.outcome ? f.outcome === "match" : compareValues(f.agreedValue, f.observedValue);
  if (matches) return { label: "Matches spec", cls: "chip-confirmed", Icon: CheckCircle2 };
  return { label: "Reported difference", cls: "chip-decision", Icon: AlertTriangle };
}

const OVERVIEW_CHIP: Record<DeliveryState, { label: string; cls: string; Icon: IconType }> = {
  match: { label: "Matches spec", cls: "chip-confirmed", Icon: CheckCircle2 },
  difference: { label: "Reported difference", cls: "chip-decision", Icon: AlertTriangle },
  cannot_compare: { label: "Cannot be compared", cls: "chip-unclear", Icon: HelpCircle },
  not_checked: { label: "Not checked", cls: "chip-unclear", Icon: HelpCircle },
};

const STATE_LABEL: Record<OutcomeFinding["status"], string> = {
  open: "Open",
  acknowledged: "Acknowledged by both",
  resolved: "Settled by the parties",
  disputed: "Parties disagree",
};

export default function KyaHuaModule({ job, onShowEvidence, onRecordDelivery, onSettle, onGoToStage }: Props) {
  const { outcomefindings } = job;
  const overview = deliveryOverview(job);
  const [preselect, setPreselect] = useState<string | undefined>(undefined);

  // Reports written against a value that has since been revised are kept, but they
  // are never shown as results against the current agreement.
  const earlier = outcomefindings.filter((f) => isStaleFinding(job, f));
  const current = outcomefindings.filter((f) => !isStaleFinding(job, f));
  const open = current.filter((f) => f.status === "open" || f.status === "disputed");
  const acknowledged = current.filter((f) => f.status === "acknowledged");
  const resolved = current.filter((f) => f.status === "resolved");

  return (
    <div className="space-y-6">
      {/* Heading */}
      <header>
        <h2 className="display-sign text-[1.9rem] sm:text-[2.2rem]" style={{ color: "var(--color-indigo-deep)" }}>
          {STAGE_TERMS.kya_hua.name}
        </h2>
        <p className="mt-0.5 flex items-baseline gap-2 flex-wrap">
          <span lang="hi" className="font-devanagari text-[1.05rem] font-semibold">{STAGE_TERMS.kya_hua.hindi}</span>
          <span className="t-support">What was agreed, set beside what the parties say was delivered.</span>
        </p>
      </header>

      <NextBar stage="kya_hua" step={nextStep(job, "kya_hua")} onGoToStage={onGoToStage} />

      {/* Findings, not verdicts */}
      <div className="sheet px-4 py-3" style={{ borderLeft: "4px solid var(--color-indigo)" }}>
        <p className="t-body">
          <strong>These are reports, not verdicts.</strong> Each line below is what a person typed in, set beside the
          confirmed agreement. AAKAAR has not inspected the work and does not label anyone dishonest. When a report is not
          the same kind of thing as the agreement (a &ldquo;yes&rdquo; against a price), it says so instead of calling it a difference.
        </p>
      </div>

      {/* Agreed fields and whether each has been checked */}
      <section aria-labelledby="agreed-fields">
        <h3 id="agreed-fields" className="t-section mb-2">Agreed fields</h3>
        {overview.length === 0 ? (
          <div className="sheet px-5 py-6">
            <p className="t-body">No confirmed fields yet.</p>
            <p className="t-support mt-1 max-w-md">
              Only a field confirmed by both the customer and the maker can be checked against delivery.
            </p>
            {onGoToStage && (
              <button type="button" className="btn btn-text mt-2" style={{ paddingLeft: 0 }} onClick={() => onGoToStage("vaada")}>
                Go to VAADA
              </button>
            )}
          </div>
        ) : (
          <div className="sheet" data-testid="delivery-overview">
            {overview.map((row) => {
              const chip = OVERVIEW_CHIP[row.state];
              const { Icon } = chip;
              return (
                <div key={row.field.key} className="register-row last:border-b-0 px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-[0.95rem] font-semibold">{row.field.label}</p>
                    <p className="t-support">
                      Agreed by both roles: <span className="font-mono font-semibold text-[var(--color-ink)]">{String(row.field.agreedValue ?? row.field.value ?? "")}</span>
                    </p>
                    {row.finding && (
                      <p className="t-support">
                        Reported by the {row.finding.reportedBy ?? "parties"}:{" "}
                        <span className="font-mono font-semibold text-[var(--color-ink)]">{String(row.finding.observedValue)}</span>
                        <span className="t-meta"> (typed, not verified)</span>
                      </p>
                    )}
                    {row.earlier && (
                      <p className="t-meta">
                        This field was revised after the last report ({String(row.earlier.observedValue)}).
                        That report was made against the earlier value, so it is not compared with the current one.
                      </p>
                    )}
                  </div>
                  <span className={`chip ${chip.cls}`}>
                    <Icon size={12} aria-hidden={true} />
                    {chip.label}
                  </span>
                  {onRecordDelivery && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => {
                        setPreselect(row.field.key);
                        document.getElementById("delivery-form")?.scrollIntoView({ block: "center" });
                      }}
                      aria-label={`${row.state === "not_checked" ? "Record delivery" : "Record another report"} for ${row.field.label}`}
                    >
                      {row.state === "not_checked" ? "Record delivery" : "Record another report"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {onRecordDelivery && overview.length > 0 && (
        <RecordDeliveryForm key={preselect ?? "default"} job={job} preselect={preselect} onSave={onRecordDelivery} />
      )}

      <FindingGroup title="Open" hindi="खुला" findings={open} onShowEvidence={onShowEvidence} onSettle={onSettle} startAt={1} />
      <FindingGroup
        title="Acknowledged"
        hindi="माना गया"
        findings={acknowledged}
        onShowEvidence={onShowEvidence}
        startAt={open.length + 1}
      />
      <FindingGroup
        title="Settled"
        hindi="निपटा"
        findings={resolved}
        onShowEvidence={onShowEvidence}
        startAt={open.length + acknowledged.length + 1}
        quiet
      />
      <FindingGroup
        title="Against an earlier version"
        hindi="पुराना संस्करण"
        findings={earlier}
        onShowEvidence={onShowEvidence}
        startAt={current.length + 1}
        quiet
        earlier
      />
    </div>
  );
}

function FindingGroup({
  title,
  hindi,
  findings,
  onShowEvidence,
  onSettle,
  startAt,
  quiet = false,
  earlier = false,
}: {
  title: string;
  hindi: string;
  findings: OutcomeFinding[];
  onShowEvidence: (ids: string[]) => void;
  onSettle?: (findingId: string, note: string) => Result;
  startAt: number;
  quiet?: boolean;
  earlier?: boolean;
}) {
  if (findings.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className="t-section mb-2 flex items-baseline gap-2">
        {title}
        <span lang="hi" className="font-devanagari t-support font-medium">{hindi}</span>
        <span className="font-mono t-meta">{findings.length}</span>
      </h3>
      <div className="space-y-3">
        {findings.map((f, i) => (
          <FindingRecord key={f.id} finding={f} no={startAt + i} onShowEvidence={onShowEvidence} onSettle={onSettle} quiet={quiet} earlier={earlier} anchor={title === "Open" && i === 0} />
        ))}
      </div>
    </section>
  );
}

function FindingRecord({
  finding: f,
  no,
  onShowEvidence,
  onSettle,
  quiet,
  earlier,
  anchor,
}: {
  anchor?: boolean;
  finding: OutcomeFinding;
  no: number;
  onShowEvidence: (ids: string[]) => void;
  onSettle?: (findingId: string, note: string) => Result;
  quiet: boolean;
  earlier: boolean;
}) {
  const typed = !!f.reportedBy;
  const cmp = earlier
    ? { label: "Earlier version", cls: "chip-revised", Icon: HelpCircle as IconType }
    : comparison(f);
  const { Icon } = cmp;
  const numeric = isNumeric(f.agreedValue) && isNumeric(f.observedValue);
  const valueCls = `text-[1.05rem] font-semibold ${numeric ? "font-mono" : ""}`;

  return (
    <article className={`sheet ${quiet ? "opacity-80" : ""}`} id={anchor ? "first-open-report" : undefined} data-testid="delivery-finding" data-outcome={f.outcome ?? "legacy"}>
      {/* Head: number, field, comparison label, severity */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-3 rule-b">
        <span className="entry-no">K{String(no).padStart(2, "0")}</span>
        <h4 className="text-[1rem] font-semibold">{f.fieldLabel}</h4>
        <span className={`chip ${cmp.cls}`}>
          <Icon size={12} aria-hidden={true} />
          {cmp.label}
        </span>
        {f.evidenceSourceIds.length > 0 && (
          <span className="chip chip-proposed">
            {typed ? <FileText size={12} aria-hidden={true} /> : <Paperclip size={12} aria-hidden={true} />}
            {typed ? "Typed report" : "Evidence attached"}
          </span>
        )}
        {typed && <span className="chip chip-unclear">Reported, not verified</span>}
        {!typed && (
          <span className="sm:ml-auto inline-flex items-center gap-3">
            <SeverityDot severity={f.severity} showLabel />
          </span>
        )}
      </div>

      {/* Agreed beside reported */}
      <div className="grid sm:grid-cols-2">
        <div className="px-4 py-3 sm:border-r border-[var(--color-line)] max-sm:rule-b">
          <p className="t-label">{earlier ? "Agreed at the time of the report (since revised)" : "Agreed in the spec"}</p>
          <p className={valueCls}>{isBlank(f.agreedValue) ? "Not recorded" : String(f.agreedValue)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="t-label">{typed ? `Reported by the ${f.reportedBy} (typed in AAKAAR, not independently verified)` : "Reported by the parties"}</p>
          <p className={valueCls}>{isBlank(f.observedValue) ? "Not checked" : String(f.observedValue)}</p>
        </div>
      </div>

      {/* Plain language gap, kept separate from the values */}
      {f.discrepancy && (
        <div className="px-4 py-3 rule-t" data-testid="finding-explanation">
          <p className="t-label">{f.outcome === "cannot_compare" ? "Why these cannot be compared" : "What differs"}</p>
          <p className="text-[0.95rem] leading-snug">{f.discrepancy}</p>
          {f.outcome === "cannot_compare" && !earlier && (
            <p className="t-support mt-1">
              No difference is being claimed. Ask the person who reported it what the delivered value actually was, then record that as a new report.
            </p>
          )}
        </div>
      )}

      {/* Foot: state, date, sources */}
      <div className="px-4 py-2.5 rule-t flex items-center gap-x-4 gap-y-1 flex-wrap bg-[var(--color-canvas)]">
        <span className="inline-flex items-center gap-1.5 t-meta">
          <Circle size={10} aria-hidden={true} />
          {typed && f.outcome === "match" ? "No difference reported" : STATE_LABEL[f.status]}
        </span>
        <span className="t-meta">
          Noted <span className="font-mono">{new Date(f.discoveredAt).toLocaleDateString("en-IN")}</span>
        </span>
        {f.evidenceSourceIds.length > 0 && (
          <button
            type="button"
            onClick={() => onShowEvidence(f.evidenceSourceIds)}
            className="btn btn-text sm:ml-auto"
            style={{ minHeight: "1.75rem", padding: "0.1rem 0" }}
          >
            View {f.evidenceSourceIds.length} source{f.evidenceSourceIds.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {f.note && (
        <div className="px-4 py-3 rule-t">
          <p className="t-label">Note</p>
          <p className="text-[0.95rem] leading-snug">{f.note}</p>
        </div>
      )}

      {!earlier && f.status === "open" && onSettle && <SettleForm findingId={f.id} onSettle={onSettle} />}

      {f.resolutionNote && f.outcome !== "match" && (
        <div className="px-4 py-3 rule-t">
          <p className="t-label">How it was settled</p>
          <p className="text-[0.95rem] leading-snug">{f.resolutionNote}</p>
        </div>
      )}
    </article>
  );
}

// ── Record delivery ───────────────────────────────────────────────────────────

function RecordDeliveryForm({
  job,
  preselect,
  onSave,
}: {
  job: Job;
  preselect?: string;
  onSave: (input: DeliveryInput) => Result;
}) {
  const fields = deliveryOverview(job).map((r) => r.field);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [reported, setReported] = useState("");
  const [by, setBy] = useState<Reporter>("customer");
  const [note, setNote] = useState("");
  const [error, setError] = useState<Result>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const fieldKey = picked ?? preselect ?? fields[0]?.key ?? "";
  const field = fields.find((f) => f.key === fieldKey);
  const agreed = field ? String(field.agreedValue ?? field.value ?? "") : "";
  // What AAKAAR will make of the text, shown before saving so nothing is a surprise.
  const preview = reported.trim() ? (compareValues(agreed, reported) ? ({ result: "match" } as const) : compareReport(agreed, reported)) : null;
  const duplicate = reported.trim() && field ? findDuplicateReport(job, field.key, reported, by) : undefined;
  const [again, setAgain] = useState(false);

  return (
    <form
      id="delivery-form"
      className="sheet"
      aria-label="Record delivery"
      onSubmit={(e) => {
        e.preventDefault();
        const err = onSave({ fieldKey, reportedValue: reported, reportedBy: by, note, allowDuplicate: again });
        setError(err);
        if (!err) {
          setSaved(`Saved a report for ${field?.label ?? "the field"}.`);
          setReported("");
          setNote("");
          setAgain(false);
        } else {
          setSaved(null);
        }
      }}
    >
      <div className="rule-b px-4 py-3">
        <h3 className="t-section" id="delivery-form-title">Record delivery</h3>
        <p className="t-support">
          Type what was reported as delivered. AAKAAR compares it with the agreed value. It does not check the work itself,
          and the confirmed specification is not changed.
        </p>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dl-field" className="t-label block mb-1">Agreed field</label>
          <select id="dl-field" className="field" value={fieldKey} onChange={(e) => setPicked(e.target.value)}>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="t-label mb-1">Agreed value</p>
          <p className="text-[1.05rem] font-semibold" data-testid="agreed-value">{agreed}</p>
        </div>
        <div>
          <label htmlFor="dl-reported" className="t-label block mb-1">
            Reported as delivered <span style={{ color: "var(--color-sindoor)" }}>(required)</span>
          </label>
          <input id="dl-reported" className="field" value={reported} onChange={(e) => { setReported(e.target.value); setAgain(false); setSaved(null); }} />
        </div>
        <div>
          <label htmlFor="dl-by" className="t-label block mb-1">Reported by</label>
          <select id="dl-by" className="field" value={by} onChange={(e) => setBy(e.target.value as Reporter)}>
            <option value="customer">Customer</option>
            <option value="maker">Maker</option>
            <option value="inspection">Inspection</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="dl-note" className="t-label block mb-1">Note (optional)</label>
          <input id="dl-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {preview && (
        <div className="mx-4 mb-3 px-3 py-2 border" style={{ borderColor: "var(--color-line)", background: "var(--color-paper)" }} data-testid="comparison-preview" role="status">
          <p className="t-label">How AAKAAR will read this</p>
          <p className="text-[0.95rem]">
            {preview.result === "match" && "It says the same as the agreed value."}
            {preview.result === "difference" && "It says something different from the agreed value. It will be recorded as a reported difference."}
            {preview.result === "cannot_compare" && `These cannot be compared. ${"reason" in preview && preview.reason ? preview.reason : ""} It will be recorded as not comparable, not as a difference.`}
          </p>
        </div>
      )}
      {duplicate && (
        <p className="px-4 pb-2 t-support" style={{ color: "var(--color-ochre-text)" }} role="alert" data-testid="duplicate-warning">
          The {by} already reported this for {field?.label} on {new Date(duplicate.discoveredAt).toLocaleDateString("en-IN")}. A repeat of the same words is not new evidence.
          Record it again only if it is a separate report.
        </p>
      )}
      {error && <p className="px-4 pb-2 t-support" style={{ color: "var(--color-sindoor)" }} role="alert">{error}</p>}
      {saved && <p className="px-4 pb-2 t-support" style={{ color: "var(--color-neem)" }} role="status">{saved}</p>}

      <div className="rule-t px-4 py-3 flex items-center gap-3 flex-wrap">
        {duplicate && !again ? (
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setAgain(true)}>This is a separate report</button>
            <span className="t-meta">Otherwise there is nothing to save.</span>
          </>
        ) : (
          <button type="submit" className="btn btn-primary">{duplicate ? "Record it again" : "Save report"}</button>
        )}
      </div>
    </form>
  );
}

function SettleForm({ findingId, onSettle }: { findingId: string; onSettle: (id: string, note: string) => Result }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<Result>(null);
  const id = `settle-${findingId}`;
  return (
    <form
      className="px-4 py-3 rule-t space-y-2"
      aria-label="Record how this was settled"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSettle(findingId, note));
      }}
    >
      <label htmlFor={id} className="t-label block">How did the parties settle this?</label>
      <input id={id} className="field" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="t-support" style={{ color: "var(--color-sindoor)" }} role="alert">{error}</p>}
      <button type="submit" className="btn btn-quiet">Mark as settled</button>
    </form>
  );
}