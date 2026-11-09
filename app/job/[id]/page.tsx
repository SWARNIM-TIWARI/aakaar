"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { Job, UIState, EvidenceSource, AnalysisResult, Quote } from "@/lib/types";
import { formatRupees, sumKnownLines } from "@/lib/spec/calculations";
import {
  addFieldFromAmbiguity,
  addSpecField,
  confirmField,
  correctSourceText,
  editProposedField,
  markClarified,
  markUnresolved,
  mergeSuggestedFields,
  proposeRevision,
  recordAnswer,
  recordDelivery,
  reopenAmbiguity,
  respondToRevision,
  settleFinding,
  type DeliveryInput,
  type NewFieldInput,
  type RevisionInput,
  type Role,
} from "@/lib/spec/workflow";
import type { NewQuoteInput } from "@/components/AddQuoteForm";
import { DEMO_JOB } from "@/lib/data/demo-scenario";
import { getRepository } from "@/lib/storage/repository";
import { sanitizeAnalysisResult } from "@/lib/ai/sanitizer";
import { nanoid } from "nanoid";
import { normalizeFieldKey } from "@/lib/utils/fieldKey";

import DemoBanner from "@/components/DemoBanner";
import EditJobForm from "@/components/EditJobForm";
import type { JobEdits } from "@/components/EditJobForm";
import JobRail from "@/components/JobRail";
import { JOB_TYPE_LABEL, STAGE_STATE_LABEL, jobNumber, shortDate, stageInfo } from "@/lib/utils/jobStage";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import SaudaModule from "@/components/modules/SaudaModule";
import SamajhModule from "@/components/modules/SamajhModule";
import VaadaModule from "@/components/modules/VaadaModule";
import KyaHuaModule from "@/components/modules/KyaHuaModule";

// ── Stage tabs (labels, numbers and states come from lib/utils/jobStage) ──────

type TabId = "sauda" | "samajh" | "vaada" | "kya_hua";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ui, setUi] = useState<UIState>({
    activeModule: "sauda",
    evidenceDrawerOpen: false,
    evidenceDrawerSourceIds: [],
    isRecording: false,
    isAnalyzing: false,
  });

  // ── Load job ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const repo = getRepository();

    // Always seed the demo
    // Reseed the synthetic demo when its text version changes (old copies had dash heavy copy).
    const storedDemo = repo?.getJob(DEMO_JOB.id);
    if (repo && (!storedDemo || storedDemo.demoLabel !== DEMO_JOB.demoLabel)) {
      repo.saveJob(DEMO_JOB);
    }

    let stored = repo?.getJob(jobId) ?? null;

    if (!stored) {
      setNotFound(true);
    } else {
      // Deduplicate ambiguities by normalised fieldKey (first occurrence wins).
      // Guards against duplicates saved in localStorage before the dedup fix.
      const seen = new Set<string>();
      stored = {
        ...stored,
        ambiguities: stored.ambiguities.filter((a) => {
          const k = normalizeFieldKey(a.fieldKey);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
      };
      setJob(stored);
      // Set default tab based on job status
      const fromHash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
      const hashTab: TabId | null =
        fromHash === "sauda" || fromHash === "samajh" || fromHash === "vaada" || fromHash === "kya_hua" ? fromHash : null;
      const defaultTab: TabId = hashTab ?? (
        stored.status === "vaada" || stored.status === "complete"
          ? "vaada"
          : stored.status === "kya_hua"
          ? "kya_hua"
          : stored.ambiguities.length > 0
          ? "samajh"
          : "sauda");
      setUi((u) => ({ ...u, activeModule: defaultTab }));
    }

    setLoading(false);
  }, [jobId]);

  // ── Persist job ───────────────────────────────────────────────────────────

  const saveJob = useCallback(
    (updated: Job) => {
      setJob(updated);
      const repo = getRepository();
      repo?.saveJob(updated);
    },
    []
  );

  // ── Evidence drawer ───────────────────────────────────────────────────────

  const showEvidence = useCallback((sourceIds: string[]) => {
    setUi((u) => ({
      ...u,
      evidenceDrawerOpen: true,
      evidenceDrawerSourceIds: sourceIds,
    }));
  }, []);

  const closeEvidence = useCallback(() => {
    setUi((u) => ({ ...u, evidenceDrawerOpen: false }));
  }, []);

  // ── Analysis ──────────────────────────────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    if (!job) return;
    setUi((u) => ({ ...u, isAnalyzing: true, analysisError: undefined }));

    try {
      // Always use the server-side route, provider selection (demo / openai-compatible /
      // evon-local) is controlled exclusively by REASONING_PROVIDER on the server.
      // We pass the full job object so the server has everything it needs.
      const res = await fetch("/api/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.error ?? `Analysis failed: ${res.status}`
        );
      }
      const result = (await res.json()) as AnalysisResult;

      // Sanitize: strip suggestions for protected spec fields, validate sourceIds
      const validSourceIds = new Set(job.sources.map((s) => s.id));
      const safeResult = sanitizeAnalysisResult(
        result,
        job.kaamNaksha.fields,
        validSourceIds
      );

      // Fix 5, idempotent deduplication using stable normalized fieldKey.
      // existingFieldKeys holds the normalized key of EVERY existing ambiguity
      // (resolved and unresolved) so re-analysis never creates a duplicate or
      // revives a resolved item.
      const existingFieldKeys = new Set(
        job.ambiguities.map((a) => normalizeFieldKey(a.fieldKey))
      );
      const newAmbiguities = safeResult.ambiguities
        .filter((a) => !existingFieldKeys.has(normalizeFieldKey(a.fieldKey)))
        .map((a) => ({
          ...a,
          // Stable, deterministic ID (NOT random) so re-analysis never adds a
          // duplicate even if the in-memory set is rebuilt from storage.
          id: `amb_${normalizeFieldKey(a.fieldKey)}_${nanoid(4)}`,
          resolved: false,
        }));

      // Show what provider the server actually used
      const providerLabel = result.providerUsed ?? "unknown";

      const now = new Date().toISOString();
      const withGaps: Job = {
        ...job,
        ambiguities: [...job.ambiguities, ...newAmbiguities],
        lastAnalysis: { at: now, providerUsed: safeResult.providerUsed, gapsFound: newAmbiguities.length },
        updatedAt: now,
      };
      // Valid suggested spec fields are kept as unreviewed proposals. A model can never
      // create a confirmed field, and the demo starter checklist is not saved on real jobs.
      const updated = mergeSuggestedFields(
        withGaps,
        safeResult,
        validSourceIds,
        now
      );

      saveJob(updated);
      setUi((u) => ({
        ...u,
        isAnalyzing: false,
        activeModule: "samajh",
        lastProviderUsed: providerLabel,
      }));
    } catch (err) {
      setUi((u) => ({
        ...u,
        isAnalyzing: false,
        analysisError: err instanceof Error ? err.message : "Analysis failed",
      }));
    }
  }, [job, saveJob]);

  function handleAddQuote(input: NewQuoteInput) {
    if (!job) return;
    const now = new Date().toISOString();
    const stamp = Date.now().toString(36);
    const sourceId = `src_quote_${stamp}`;
    const pricedText = input.lines.map((l) => `${l.description}${l.quantity ? ` (qty ${l.quantity})` : ""}: ${formatRupees(l.amountRs)}`);
    const excludedText = input.exclusions?.length ? [`Not included: ${input.exclusions.join("; ")}`] : [];
    const unpricedText = input.unpricedItems.map((u) => `${u}: price not stated`);
    const source: EvidenceSource = {
      id: sourceId,
      kind: "manual_note",
      label: `Quote entered for ${input.makerName}`,
      excerpt: [...pricedText, ...unpricedText, ...excludedText, input.notes].filter(Boolean).join("\n"),
      capturedAt: now,
      party: "maker",
    };
    const quote: Quote = {
      id: `quote_${stamp}`,
      makerName: input.makerName,
      submittedAt: now,
      lines: input.lines.map((l, i) => ({
        id: `ql_${stamp}_${i}`,
        description: l.description,
        amountRs: l.amountRs,
        quantity: l.quantity,
        isKnown: true,
      })),
      unknownItems: input.unpricedItems,
      nonEquivalentItems: [],
      exclusions: input.exclusions,
      knownTotalRs: 0,
      status: "received",
      notes: input.notes,
      sourceIds: [sourceId],
    };
    quote.knownTotalRs = sumKnownLines(quote.lines);

    let quotes: Quote[] = [...job.quotes, quote];

    // Items that appear in some quotes but not all are flagged, so the comparison never
    // looks like-for-like when it is not. Authored demo quotes are left as they are.
    if (!job.isDemo && quotes.length > 1) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
      const itemsOf = (q: Quote) => [...q.lines.map((l) => l.description), ...q.unknownItems];
      quotes = quotes.map((q) => {
        const mine = new Set(itemsOf(q).map(norm));
        const missing = new Set<string>();
        quotes.forEach((o) => {
          if (o.id === q.id) return;
          itemsOf(o).forEach((d) => {
            if (!mine.has(norm(d))) missing.add(d);
          });
        });
        return { ...q, nonEquivalentItems: Array.from(missing) };
      });
    }

    saveJob({ ...job, sources: [...job.sources, source], quotes, updatedAt: now });
  }

  // ── Workflow actions (all logic lives in lib/spec/workflow.ts) ───────────

  /** Run a workflow transition, save the result, and return a plain error sentence on failure. */
  function act(fn: (j: Job, now: string) => Job): string | null {
    if (!job) return "This job is not loaded.";
    try {
      saveJob(fn(job, new Date().toISOString()));
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "That did not work.";
    }
  }

  const workflow = {
    addFromClarification: (ambId: string, value: string) =>
      act((j, now) => addFieldFromAmbiguity(j, ambId, value, now)),
    addField: (input: NewFieldInput) => act((j, now) => addSpecField(j, input, now)),
    editField: (key: string, edits: { label?: string; value: string; notes?: string }) =>
      act((j, now) => editProposedField(j, key, edits, now)),
    confirm: (key: string, role: Role) => act((j, now) => confirmField(j, key, role, now)),
    propose: (key: string, input: RevisionInput) => act((j, now) => proposeRevision(j, key, input, now)),
    respond: (revId: string, role: Role, decision: "accept" | "reject") =>
      act((j, now) => respondToRevision(j, revId, role, decision, now)),
    recordDelivery: (input: DeliveryInput) => act((j, now) => recordDelivery(j, input, now)),
    settle: (findingId: string, note: string) => act((j, now) => settleFinding(j, findingId, note, now)),
    recordAnswer: (id: string, text: string, by: "customer" | "maker" | "both" | "entered") =>
      act((j, now) => recordAnswer(j, id, text, by, now)),
    markClarified: (id: string, by: Role | "entered") => act((j, now) => markClarified(j, id, by, now)),
    markUnresolved: (id: string, note: string) => act((j, now) => markUnresolved(j, id, note, now)),
    reopen: (id: string) => act((j, now) => reopenAmbiguity(j, id, now)),
    correctSource: (id: string, text: string) => act((j, now) => correctSourceText(j, id, text, now)),
  };

  const goToStage = (id: TabId) => {
    setUi((u) => ({ ...u, activeModule: id }));
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      // ignore
    }
  };

  function handleEdit(edits: JobEdits) {
    if (!job) return;
    saveJob({ ...job, ...edits });
    setEditing(false);
  }

  // ── Render guards ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-muted)" }} aria-label="Loading" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="t-title">This job is not in this browser</h1>
        <p className="t-support" style={{ maxWidth: "40ch" }}>
          Jobs are saved in the browser where they were created. Open the register to see the jobs stored here.
        </p>
        <Link href="/" className="btn btn-primary">
          Open the register
        </Link>
      </div>
    );
  }

  // Gather evidence sources for the drawer
  const drawerSources: EvidenceSource[] = ui.evidenceDrawerSourceIds
    .map((id) => job.sources.find((s) => s.id === id))
    .filter(Boolean) as EvidenceSource[];

  const stages = stageInfo(job);

  return (
    <div className="min-h-dvh flex flex-col">
      {/* ── Job identity strip ── */}
      <header style={{ background: "var(--color-surface)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-4">
          <Link href="/" className="btn btn-text" style={{ paddingLeft: 0 }}>
            <ArrowLeft size={15} aria-hidden={true} />
            Kaam register
          </Link>

          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 flex-wrap">
                <span className="entry-no">{jobNumber(job)}</span>
                {job.isDemo && <DemoBanner />}
              </p>
              <h1 className="t-title">{job.title}</h1>
            </div>
            {!job.isDemo && !editing && (
              <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
                Edit job
              </button>
            )}
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1">
            <div>
              <dt className="t-meta">Type of work</dt>
              <dd className="t-body">{JOB_TYPE_LABEL[job.jobType]}</dd>
            </div>
            <div>
              <dt className="t-meta">Customer <span lang="hi" className="font-devanagari">ग्राहक</span></dt>
              <dd className="t-body">{job.customerName ?? "Not named"}</dd>
            </div>
            <div>
              <dt className="t-meta">Maker <span lang="hi" className="font-devanagari">कारीगर</span></dt>
              <dd className="t-body">{job.makerName ?? "Not named"}</dd>
            </div>
            <div>
              <dt className="t-meta">Created</dt>
              <dd className="t-body font-mono">{shortDate(job.createdAt)}</dd>
            </div>
            <div>
              <dt className="t-meta">Last updated</dt>
              <dd className="t-body font-mono">{shortDate(job.updatedAt)}</dd>
            </div>
          </dl>
        </div>
        <div className="rule-jaal" aria-hidden={true} />
      </header>

      {editing && (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6">
          <EditJobForm job={job} onSave={handleEdit} onCancel={() => setEditing(false)} />
        </div>
      )}

      {/* ── Four stage journey rail ── */}
      <nav
        aria-label="Job stages"
        className="sticky top-0 z-20 rule-b"
        style={{ background: "var(--color-canvas)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div role="tablist" className="grid grid-cols-2 sm:grid-cols-4">
            {stages.map((stage) => {
              const isActive = ui.activeModule === stage.id;
              const needs = stage.state === "needs_decision";
              const done = stage.state === "answered" || stage.state === "confirmed" || stage.state === "outcome_recorded";
              const stateText = needs
                ? `${stage.open} ${stage.open === 1 ? "needs" : "need"} a decision`
                : STAGE_STATE_LABEL[stage.state];
              return (
                <button
                  key={stage.id}
                  type="button"
                  role="tab"
                  id={`tab-${stage.id}`}
                  aria-selected={isActive}
                  aria-controls="stage-panel"
                  onClick={() => goToStage(stage.id)}
                  className="text-left px-3 py-3 border-b-[3px] sm:border-l first:border-l-0"
                  style={{
                    borderBottomColor: isActive ? "var(--color-indigo)" : "transparent",
                    borderLeftColor: "var(--color-line)",
                    background: isActive ? "var(--color-surface)" : "transparent",
                  }}
                >
                  <span className="flex items-baseline gap-x-2 flex-wrap">
                    <span className="entry-no">{stage.no}</span>
                    <span className="font-bold whitespace-nowrap" style={{ color: isActive ? "var(--color-indigo)" : "var(--color-ink)" }}>
                      {stage.label}
                    </span>
                    <span lang="hi" className="font-devanagari t-meta whitespace-nowrap">{stage.hindi}</span>
                  </span>
                  <span
                    className="mt-0.5 flex items-center gap-1.5 t-meta"
                    style={{ color: needs ? "var(--color-sindoor)" : undefined, fontWeight: needs ? 600 : undefined }}
                  >
                    {needs ? (
                      <AlertTriangle size={13} aria-hidden={true} />
                    ) : done ? (
                      <CheckCircle2 size={13} aria-hidden={true} style={{ color: "var(--color-neem)" }} />
                    ) : (
                      <Circle size={13} aria-hidden={true} />
                    )}
                    {stateText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ── Working column and contextual rail ── */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] items-start">
        <main id="stage-panel" role="tabpanel" aria-labelledby={`tab-${ui.activeModule}`} className="min-w-0">
          {ui.activeModule === "sauda" && <SaudaModule job={job} onShowEvidence={showEvidence} onAddQuote={handleAddQuote} onGoToStage={goToStage} />}
          {ui.activeModule === "samajh" && (
            <SamajhModule
              job={job}
              onAddToSpec={workflow.addFromClarification}
              onGoToStage={goToStage}
              onShowEvidence={showEvidence}
              onAnalyze={runAnalysis}
              onRecordAnswer={workflow.recordAnswer}
              onMarkClarified={workflow.markClarified}
              onMarkUnresolved={workflow.markUnresolved}
              onReopen={workflow.reopen}
              isAnalyzing={ui.isAnalyzing}
              analysisError={ui.analysisError}
              lastProviderUsed={ui.lastProviderUsed}
            />
          )}
          {ui.activeModule === "vaada" && <VaadaModule
              job={job}
              onShowEvidence={showEvidence}
              onAddField={workflow.addField}
              onEditField={workflow.editField}
              onConfirm={workflow.confirm}
              onProposeRevision={workflow.propose}
              onRespondRevision={workflow.respond}
              onGoToStage={goToStage}
            />}
          {ui.activeModule === "kya_hua" && <KyaHuaModule
              job={job}
              onShowEvidence={showEvidence}
              onRecordDelivery={workflow.recordDelivery}
              onSettle={workflow.settle}
              onGoToStage={goToStage}
            />}
        </main>
        <JobRail job={job} />
      </div>

      {/* ── Evidence drawer ── */}
      <EvidenceDrawer
        open={ui.evidenceDrawerOpen}
        onClose={closeEvidence}
        sources={drawerSources}
        title={`Evidence (${drawerSources.length})`}
        onCorrect={workflow.correctSource}
      />
    </div>
  );
}