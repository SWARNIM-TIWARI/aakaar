"use client";

import { useState } from "react";
import { Zap, Loader2, CheckCircle2, HelpCircle, MessageSquare, PauseCircle, Mic, Pencil } from "lucide-react";
import type { Ambiguity, EvidenceSource, Job } from "@/lib/types";
import SeverityDot from "@/components/SeverityDot";
import ListenButton from "@/components/ListenButton";
import NextBar from "@/components/NextBar";
import { FINDING_STATUS_LABEL, findingStatus, isCorrected, type FindingStatus, type Role } from "@/lib/spec/workflow";
import { nextStep } from "@/lib/utils/jobStage";
import { FINDING_TERMS, PROVENANCE_LABEL, ROLE_TERMS, TERMS } from "@/lib/utils/terms";

type Result = string | null;
type StageId = "sauda" | "samajh" | "vaada" | "kya_hua";
type AnswerBy = "customer" | "maker" | "both" | "entered";

interface Props {
  job: Job;
  onShowEvidence: (sourceIds: string[]) => void;
  onAnalyze: () => Promise<void> | void;
  isAnalyzing: boolean;
  analysisError?: string;
  lastProviderUsed?: string;
  onRecordAnswer: (id: string, text: string, by: AnswerBy) => Result;
  onMarkClarified: (id: string, by: Role | "entered") => Result;
  onMarkUnresolved: (id: string, note: string) => Result;
  onReopen: (id: string) => Result;
  /** Adds a recorded answer to KAAM-NAKSHA as a PROPOSED field. */
  onAddToSpec?: (ambiguityId: string, value: string) => Result;
  onGoToStage?: (id: StageId) => void;
}

const STATUS_CHIP: Record<FindingStatus, { cls: string; Icon: typeof HelpCircle }> = {
  open: { cls: "chip-decision", Icon: HelpCircle },
  answered: { cls: "chip-revised", Icon: MessageSquare },
  clarified: { cls: "chip-confirmed", Icon: CheckCircle2 },
  unresolved: { cls: "chip-unclear", Icon: PauseCircle },
};

const BY_LABEL: Record<AnswerBy, string> = {
  customer: "the customer",
  maker: "the maker",
  both: "both, together",
  entered: "someone entering it for them",
};

export default function SamajhModule(props: Props) {
  const { job, onAnalyze, isAnalyzing, analysisError, lastProviderUsed, onGoToStage } = props;

  const notDone = job.ambiguities.filter((a) => !a.resolved);
  const clarified = job.ambiguities.filter((a) => a.resolved);
  const skipped = job.lastAnalysis?.skipped ?? [];
  const no = (id: string) => `F${String(job.ambiguities.findIndex((x) => x.id === id) + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Title: the signature of the product */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="display-sign text-[1.9rem] sm:text-[2.2rem]" style={{ color: "var(--color-indigo-deep)" }}>
            {TERMS.baatKaFarq.name}
          </h2>
          <p className="mt-0.5 flex items-baseline gap-2 flex-wrap">
            <span lang="hi" className="font-devanagari text-[1.05rem] font-semibold">{TERMS.baatKaFarq.hindi}</span>
            <span className="t-support">{TERMS.baatKaFarq.gloss}.</span>
          </p>
        </div>
        {job.ambiguities.length > 0 && (
          <button type="button" onClick={() => void onAnalyze()} disabled={isAnalyzing} className="btn btn-quiet">
            {isAnalyzing ? <Loader2 size={15} className="animate-spin" aria-hidden={true} /> : <Zap size={15} aria-hidden={true} />}
            {isAnalyzing ? "Checking" : "Check again"}
          </button>
        )}
      </header>

      <NextBar
        stage="samajh"
        step={nextStep(job, "samajh")}
        onGoToStage={onGoToStage}
        onAnalyze={() => void onAnalyze()}
        analyzing={isAnalyzing}
      />

      <Legend />

      <StatementsPanel job={job} onShowEvidence={props.onShowEvidence} />

      {analysisError && (
        <div role="alert" className="px-3 py-2 border t-support" style={{ borderRadius: 2, borderColor: "var(--color-madder)", background: "color-mix(in srgb, var(--color-madder) 6%, var(--color-surface))", color: "var(--color-madder)" }}>
          {analysisError}
        </div>
      )}

      {lastProviderUsed && !isAnalyzing && (
        <p className="t-meta">
          Last check by <span className="font-mono">{lastProviderUsed}</span>
          {lastProviderUsed === "demo" && (
            <span style={{ color: "var(--color-ochre-text)" }}>
              {" "}
              {job.isDemo
                ? "Synthetic demo, not a live model."
                : "Starter checklist only. The demo provider does not read what was said on this job. Connect a reasoning provider for questions drawn from the actual statements."}
            </span>
          )}
        </p>
      )}

      {job.ambiguities.length === 0 && !isAnalyzing && (
        <div className="sheet px-5 py-6 flex gap-6 items-center flex-wrap">
          <div className="jali" aria-hidden={true} />
          <div className="min-w-[14rem] flex-1">
            <p className="t-section">{job.lastAnalysis ? "The check found no gaps." : "Nothing has been checked yet."}</p>
            <p className="t-support mt-1 max-w-md">
              {job.lastAnalysis
                ? "Nothing in what was recorded needed a question. That is not proof the two sides agree, only that this check found no gap. Go on to VAADA, or check again after adding more statements."
                : "AAKAAR reads the customer's and the maker's statements and points at anything they may understand differently. Nothing is marked clarified until a person says so."}
            </p>
          </div>
        </div>
      )}

      {notDone.length > 0 && (
        <section aria-labelledby="open-findings" className="space-y-4">
          <h3 id="open-findings" className="t-section flex items-baseline gap-2">
            Needs a decision <span className="font-mono t-meta">{notDone.length}</span>
          </h3>
          {notDone.map((a, i) => (
            <Finding key={a.id} a={a} no={no(a.id)} first={i === 0} {...props} />
          ))}
        </section>
      )}

      {clarified.length > 0 && (
        <section aria-labelledby="clarified-findings" className="space-y-3">
          <h3 id="clarified-findings" className="t-section flex items-baseline gap-2">
            Clarified by a person <span className="font-mono t-meta">{clarified.length}</span>
          </h3>
          {clarified.map((a) => (
            <Finding key={a.id} a={a} no={no(a.id)} first={false} {...props} />
          ))}
        </section>
      )}

      {skipped.length > 0 && (
        <details className="sheet">
          <summary className="px-4 py-3 cursor-pointer t-support">
            {skipped.length} suggestion{skipped.length === 1 ? "" : "s"} not added to KAAM-NAKSHA
          </summary>
          <ul className="px-4 pb-3 space-y-2 rule-t pt-3">
            {skipped.map((s, i) => (
              <li key={i} className="t-body">
                <strong>{s.label}.</strong> <span className="t-support">{s.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Legend: how to read a finding ─────────────────────────────────────────────

function Legend() {
  return (
    <p className="t-meta flex flex-wrap gap-x-5 gap-y-1" aria-label="How to read a finding">
      <span><span className="prov prov-recorded">{PROVENANCE_LABEL.recorded}</span> were typed or spoken by a person.</span>
      <span><span className="prov prov-inferred">{PROVENANCE_LABEL.inferred}</span> is an inference. Nobody said it.</span>
      <span><span className="prov prov-confirmed">{PROVENANCE_LABEL.clarified}</span> is a button press for a role, not a verified identity.</span>
    </p>
  );
}

// ── One finding: a folio entry ────────────────────────────────────────────────

type FindingProps = Props & { a: Ambiguity; no: string; first: boolean };

function recordedWords(job: Job, a: Ambiguity, party: "customer" | "maker"): EvidenceSource[] {
  return a.sourceIds
    .map((id) => job.sources.find((s) => s.id === id))
    .filter((s): s is EvidenceSource => !!s && s.party === party && !!s.excerpt);
}

function Finding({ a, no, job, first, onShowEvidence, onRecordAnswer, onMarkClarified, onMarkUnresolved, onReopen, onAddToSpec, onGoToStage }: FindingProps) {
  const status = findingStatus(a);
  const chip = STATUS_CHIP[status];
  const { Icon } = chip;
  const customer = recordedWords(job, a, "customer");
  const maker = recordedWords(job, a, "maker");
  const sources = a.sourceIds.map((id) => job.sources.find((s) => s.id === id)).filter((s): s is EvidenceSource => !!s);
  const [open, setOpen] = useState(!a.resolved || !a.specFieldKey);

  if (a.resolved && !open) {
    return (
      <article className="sheet px-4 py-3 flex items-center gap-3 flex-wrap" data-testid="finding" data-status={status}>
        <span className="entry-no">{no}</span>
        <h4 className="font-semibold">{a.fieldLabel}</h4>
        <span className={`chip ${chip.cls}`}><Icon size={12} aria-hidden={true} />{FINDING_STATUS_LABEL[status]}</span>
        <span className="t-support flex-1 min-w-[10rem] line-clamp-1">{a.answer?.text ?? a.resolutionNote}</span>
        <button type="button" className="btn btn-text" onClick={() => setOpen(true)} aria-expanded={false}>Show</button>
      </article>
    );
  }

  return (
    <article
      className="sheet reg-marks"
      data-testid="finding"
      data-status={status}
      id={first ? "first-open-finding" : undefined}
      aria-label={`Finding ${no}: ${a.fieldLabel}`}
    >
      {/* Head: entry number, what it is about, STATUS */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap px-4 sm:px-5 py-3 rule-b">
        <span className="entry-no" style={{ color: "var(--color-madder)" }}>{no}</span>
        <h4 className="text-[1.12rem] font-bold">{a.fieldLabel}</h4>
        <span className={`chip ${chip.cls}`} data-testid="finding-status">
          <Icon size={12} aria-hidden={true} />
          {FINDING_STATUS_LABEL[status]}
        </span>
        {!a.resolved && <SeverityDot severity={a.materialImpact} showLabel />}
        {a.resolved && (
          <button type="button" className="btn btn-text sm:ml-auto" onClick={() => setOpen(false)}>Hide</button>
        )}
      </div>

      <div className="folio-margin ml-4 sm:ml-5 my-1">
        {/* BAAT: recorded words */}
        <Row term={FINDING_TERMS.baat}>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <Said role="customer" sources={customer} onShowEvidence={onShowEvidence} />
            <Said role="maker" sources={maker} onShowEvidence={onShowEvidence} />
          </div>
        </Row>

        {/* FARQ: AAKAAR's reading of the two sides */}
        <Row term={FINDING_TERMS.farq}>
          <p className="prov prov-inferred">{PROVENANCE_LABEL.inferred}</p>
          <div className="mt-1 grid sm:grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-1 items-start">
            <p className="t-body"><span className="t-label block">Customer&rsquo;s words may mean</span>{a.interpretationA}</p>
            <span className="hidden sm:block font-mono text-[1.3rem] font-semibold pt-5" aria-hidden={true} style={{ color: "var(--color-madder)" }}>≠?</span>
            <p className="t-body"><span className="t-label block">Maker&rsquo;s words may mean</span>{a.interpretationB}</p>
          </div>
          <div className="ticks mt-3" aria-hidden={true} />
          <p className="t-meta mt-1">A possible difference, not a confirmed one. Neither person has said this.</p>
        </Row>

        {/* ASAR */}
        <Row term={FINDING_TERMS.asar}>
          <p className="t-body">{a.consequence.trim() || "The consequence is not known."}</p>
        </Row>

        {/* SOURCE */}
        <Row term={FINDING_TERMS.source}>
          {sources.length === 0 ? (
            <p className="t-support">No source is attached to this finding.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <li key={s.id}>
                  <button type="button" className="chip chip-proposed" onClick={() => onShowEvidence([s.id])} aria-label={`Open source: ${s.label}`}>
                    {s.inputMethod === "voice" ? <Mic size={12} aria-hidden={true} /> : <Pencil size={12} aria-hidden={true} />}
                    {s.label}
                    {isCorrected(s) && <span className="font-normal"> · corrected</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Row>

        {/* AGLA SAWAL */}
        <Row term={FINDING_TERMS.aglaSawal}>
          <p className="text-[1.1rem] font-semibold leading-snug" data-testid="next-question">&ldquo;{a.clarificationQuestion}&rdquo;</p>
          <div className="mt-2"><ListenButton text={a.clarificationQuestion} language="auto" label="Listen" /></div>
        </Row>

        {/* JAWAB */}
        <Row term={FINDING_TERMS.jawab}>
          <Answer
            a={a}
            status={status}
            onRecordAnswer={onRecordAnswer}
            onMarkClarified={onMarkClarified}
            onMarkUnresolved={onMarkUnresolved}
            onReopen={onReopen}
            onAddToSpec={onAddToSpec}
            onGoToStage={onGoToStage}
          />
        </Row>
      </div>

      {/* STATUS tracker */}
      <div className="rule-t px-4 sm:px-5 py-2.5 flex items-center gap-x-3 gap-y-1 flex-wrap" style={{ background: "var(--color-paper)" }}>
        <span className="folio-head border-0">{FINDING_TERMS.status.name}</span>
        <Tracker status={status} />
      </div>
    </article>
  );
}

function Row({ term, children }: { term: { name: string; hindi: string; gloss: string }; children: React.ReactNode }) {
  return (
    <section className="hang px-4 sm:px-5 py-3 rule-b last:border-b-0" aria-label={term.name}>
      <header>
        <p className="folio-head border-0 leading-tight">{term.name}</p>
        <p lang="hi" className="font-devanagari t-meta leading-tight">{term.hindi}</p>
        <p className="t-meta leading-tight hidden sm:block">{term.gloss}</p>
      </header>
      <div className="min-w-0 mt-1 sm:mt-0">{children}</div>
    </section>
  );
}

function Said({ role, sources, onShowEvidence }: { role: "customer" | "maker"; sources: EvidenceSource[]; onShowEvidence: (ids: string[]) => void }) {
  const term = ROLE_TERMS[role];
  return (
    <div className={`evidence ${role === "customer" ? "evidence-customer" : "evidence-maker"}`}>
      <p className="t-label" style={{ color: role === "customer" ? "var(--color-indigo)" : "var(--color-botanical)" }}>
        {term.name} <span lang="hi" className="font-devanagari font-normal">{term.hindi}</span>
      </p>
      {sources.length === 0 ? (
        <p className="t-support mt-0.5">No recorded words from the {term.name.toLowerCase()} are attached to this finding.</p>
      ) : (
        sources.map((s) => (
          <div key={s.id} className="mt-1">
            <p className="prov prov-recorded">
              {PROVENANCE_LABEL.recorded} · {s.inputMethod === "voice" ? "spoken, transcribed" : "typed"}
              {isCorrected(s) ? " · corrected" : ""}
            </p>
            <p className="t-body whitespace-pre-line line-clamp-5">{s.excerpt}</p>
            <button type="button" className="btn btn-text" style={{ paddingLeft: 0, minHeight: "1.6rem" }} onClick={() => onShowEvidence([s.id])}>
              Open the full source
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function Tracker({ status }: { status: FindingStatus }) {
  const steps: { id: FindingStatus; label: string }[] =
    status === "unresolved"
      ? [{ id: "open", label: "Open" }, { id: "unresolved", label: "Could not be settled" }]
      : [{ id: "open", label: "Open" }, { id: "answered", label: "Answered" }, { id: "clarified", label: "Clarified" }];
  const at = steps.findIndex((s) => s.id === status);
  return (
    <ol className="flex items-center gap-x-2 flex-wrap" aria-label="Where this finding stands">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2 t-meta" aria-current={i === at ? "step" : undefined} style={{ fontWeight: i === at ? 700 : 400, color: i === at ? "var(--color-ink)" : undefined }}>
          <span className="font-mono">{i <= at ? "●" : "○"}</span>
          {s.label}
          {i < steps.length - 1 && <span aria-hidden={true}>—</span>}
        </li>
      ))}
    </ol>
  );
}

// ── JAWAB: record the answer, then (separately) mark it clarified ─────────────

function Answer({
  a,
  status,
  onRecordAnswer,
  onMarkClarified,
  onMarkUnresolved,
  onReopen,
  onAddToSpec,
  onGoToStage,
}: {
  a: Ambiguity;
  status: FindingStatus;
  onRecordAnswer: Props["onRecordAnswer"];
  onMarkClarified: Props["onMarkClarified"];
  onMarkUnresolved: Props["onMarkUnresolved"];
  onReopen: Props["onReopen"];
  onAddToSpec?: Props["onAddToSpec"];
  onGoToStage?: Props["onGoToStage"];
}) {
  const [text, setText] = useState(a.answer?.text ?? "");
  const [by, setBy] = useState<AnswerBy>(a.answer?.by ?? "customer");
  const [markedBy, setMarkedBy] = useState<Role | "entered">("customer");
  const [note, setNote] = useState("");
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [error, setError] = useState<Result>(null);
  const id = `jawab-${a.id}`;

  const run = (r: Result) => setError(r);

  if (status === "clarified") {
    return (
      <div className="space-y-3">
        <p className="prov prov-confirmed">
          {PROVENANCE_LABEL.clarified}
          {a.resolvedBy ? ` · marked by the ${a.resolvedBy}` : " · marked by someone entering it"}
          {a.resolvedAt ? ` · ${new Date(a.resolvedAt).toLocaleDateString("en-IN")}` : ""}
        </p>
        <p className="t-body whitespace-pre-line" data-testid="recorded-answer">{a.answer?.text ?? a.resolutionNote}</p>
        {a.specFieldKey ? (
          <p className="t-support">
            <strong>In KAAM-NAKSHA as a proposed field.</strong> Nobody has confirmed it yet.{" "}
            {onGoToStage && (
              <button type="button" className="btn btn-text" style={{ padding: 0, minHeight: 0 }} onClick={() => onGoToStage("vaada")}>
                Open VAADA
              </button>
            )}
          </p>
        ) : (
          <>
            {onAddToSpec && <AddToSpec a={a} onAddToSpec={onAddToSpec} />}
            <button type="button" className="btn btn-text" style={{ paddingLeft: 0 }} onClick={() => run(onReopen(a.id))}>
              Reopen this finding
            </button>
          </>
        )}
        {error && <p className="t-support" role="alert" style={{ color: "var(--color-madder)" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {a.answer && (
        <div className="evidence" style={{ borderLeftColor: "var(--color-ochre)" }}>
          <p className="prov prov-recorded">
            {PROVENANCE_LABEL.recorded} · answer given by {BY_LABEL[a.answer.by]} · {new Date(a.answer.at).toLocaleDateString("en-IN")}
          </p>
          <p className="t-body whitespace-pre-line" data-testid="recorded-answer">{a.answer.text}</p>
        </div>
      )}

      {status === "unresolved" && (
        <div className="evidence" style={{ borderLeftColor: "var(--color-muted)" }}>
          <p className="prov" style={{ color: "var(--color-muted)" }}>{PROVENANCE_LABEL.unresolved}</p>
          <p className="t-body">{a.unresolvedNote}</p>
        </div>
      )}

      <div>
        <label htmlFor={id} className="t-label block mb-1">
          {a.answer ? "Change the recorded answer" : "What answer did you get?"}
        </label>
        <textarea
          id={id}
          className="field"
          rows={3}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder="Write the answer in the words it was given, in any language."
        />
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <label className="t-meta flex items-center gap-2">
            Answer given by
            <select className="field" style={{ width: "auto", minHeight: "2rem", padding: "0.2rem 0.5rem" }} value={by} onChange={(e) => setBy(e.target.value as AnswerBy)} aria-label="Who gave this answer">
              <option value="customer">The customer</option>
              <option value="maker">The maker</option>
              <option value="both">Both, together</option>
              <option value="entered">Someone entering it for them</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => run(onRecordAnswer(a.id, text, by))}>
            Save the answer
          </button>
        </div>
        <p className="t-meta mt-1">Saving an answer only records it. It does not mean both sides now agree.</p>
      </div>

      {a.answer && (
        <div className="rule-t pt-3">
          <p className="t-label mb-1">Is it clear to both now?</p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="t-meta flex items-center gap-2">
              Marked by
              <select className="field" style={{ width: "auto", minHeight: "2rem", padding: "0.2rem 0.5rem" }} value={markedBy} onChange={(e) => setMarkedBy(e.target.value as Role | "entered")} aria-label="Who is marking this clarified">
                <option value="customer">Customer role</option>
                <option value="maker">Maker role</option>
                <option value="entered">Someone else</option>
              </select>
            </label>
            <button type="button" className="btn btn-confirm" onClick={() => run(onMarkClarified(a.id, markedBy))}>
              <CheckCircle2 size={15} aria-hidden={true} />
              Mark clarified
            </button>
          </div>
        </div>
      )}

      {status !== "unresolved" && (
        <div>
          {!showUnresolved ? (
            <button type="button" className="btn btn-text" style={{ paddingLeft: 0 }} onClick={() => setShowUnresolved(true)}>
              We could not settle this
            </button>
          ) : (
            <div className="space-y-2">
              <label htmlFor={`${id}-why`} className="t-label block">Why could it not be settled?</label>
              <input id={`${id}-why`} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the maker will check samples first." />
              <div className="flex gap-2">
                <button type="button" className="btn btn-quiet" onClick={() => run(onMarkUnresolved(a.id, note))}>Keep it open, with this reason</button>
                <button type="button" className="btn btn-text" onClick={() => setShowUnresolved(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="t-support" role="alert" style={{ color: "var(--color-madder)" }}>{error}</p>}
    </div>
  );
}

function AddToSpec({ a, onAddToSpec }: { a: Ambiguity; onAddToSpec: (ambiguityId: string, value: string) => Result }) {
  const [value, setValue] = useState(a.answer?.text ?? a.resolutionNote ?? "");
  const [error, setError] = useState<Result>(null);
  const inputId = `spec-value-${a.id}`;
  return (
    <div className="sheet px-3 py-3 space-y-2" style={{ background: "var(--color-paper)" }} data-focus="add-to-spec">
      <label htmlFor={inputId} className="t-label block">Add to KAAM-NAKSHA</label>
      <p className="t-meta">
        Write the value the answer settles, in your own words, for example &ldquo;Matt finish&rdquo; or &ldquo;4 units&rdquo;.
        It is added as <strong>proposed</strong>. The customer role and the maker role each mark it later in VAADA.
      </p>
      <input id={inputId} className="field" value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} />
      {error && <p className="t-support" role="alert" style={{ color: "var(--color-madder)" }}>{error}</p>}
      <button type="button" className="btn btn-primary" onClick={() => setError(onAddToSpec(a.id, value))}>
        Add as a proposed field
      </button>
    </div>
  );
}

// ── What each side said ───────────────────────────────────────────────────────

function StatementsPanel({ job, onShowEvidence }: { job: Job; onShowEvidence: (ids: string[]) => void }) {
  const said = job.sources.filter(
    (s) => (s.party === "customer" || s.party === "maker") && !s.label.startsWith("Delivery report") && s.excerpt
  );
  if (said.length === 0) {
    return (
      <p className="t-support">
        No statements were recorded when this job was created. Edit the job or add a quote so there is something to compare.
      </p>
    );
  }
  const side = (role: "customer" | "maker") => said.filter((s) => s.party === role);
  return (
    <details className="sheet" open={job.ambiguities.length === 0}>
      <summary className="px-4 py-3 cursor-pointer t-section">
        Everything recorded from each side <span className="t-meta font-mono">{said.length}</span>
      </summary>
      <div className="grid gap-4 p-4 sm:grid-cols-2 rule-t">
        {(["customer", "maker"] as const).map((role) => (
          <div key={role} className={`evidence ${role === "customer" ? "evidence-customer" : "evidence-maker"} space-y-3`}>
            <p className="t-label" style={{ color: role === "customer" ? "var(--color-indigo)" : "var(--color-botanical)" }}>
              {ROLE_TERMS[role].name} <span lang="hi" className="font-devanagari font-normal">{ROLE_TERMS[role].hindi}</span>
            </p>
            {side(role).length === 0 && <p className="t-support">Nothing recorded.</p>}
            {side(role).map((s) => (
              <div key={s.id}>
                <p className="prov prov-recorded">
                  {s.label} · {s.inputMethod === "voice" ? "spoken, transcribed" : "typed"}
                  {isCorrected(s) ? " · corrected" : ""}
                </p>
                <p className="t-body whitespace-pre-line">{s.excerpt}</p>
                <button type="button" className="btn btn-text" style={{ paddingLeft: 0, minHeight: "1.6rem" }} onClick={() => onShowEvidence([s.id])}>
                  Open source
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}