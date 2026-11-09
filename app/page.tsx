"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Circle, Plus } from "lucide-react";
import { nanoid } from "nanoid";
import type { Job } from "@/lib/types";
import { DEMO_JOB } from "@/lib/data/demo-scenario";
import { getRepository } from "@/lib/storage/repository";
import { JOB_TYPE_LABEL, STAGES, STAGE_STATE_LABEL, jobNumber, nextAction, outstandingDecision, shortDate, stageInfo } from "@/lib/utils/jobStage";
import type { StageState } from "@/lib/utils/jobStage";
import { buildNotesSource, buildStatementSource } from "@/lib/utils/newJob";
import { TERMS } from "@/lib/utils/terms";
import NewJobForm, { type NewJobValues } from "@/components/NewJobForm";
import EditJobForm from "@/components/EditJobForm";
import type { JobEdits } from "@/components/EditJobForm";
import DemoBanner from "@/components/DemoBanner";

/** The stage a job is currently working in, with its human readable state. */
function currentStage(job: Job): { label: string; hindi: string; state: StageState } {
  const info = stageInfo(job);
  const needs = info.find((s) => s.state === "needs_decision");
  if (needs) return { label: needs.label, hindi: needs.hindi, state: needs.state };
  const active = [...info].reverse().find((s) => s.state !== "not_started") ?? info[0];
  return { label: active.label, hindi: active.hindi, state: active.state };
}

function StateMark({ state }: { state: StageState }) {
  if (state === "needs_decision") {
    return <AlertTriangle size={13} aria-hidden={true} style={{ color: "var(--color-sindoor)" }} />;
  }
  if (state === "confirmed" || state === "outcome_recorded") {
    return <CheckCircle2 size={13} aria-hidden={true} style={{ color: "var(--color-neem)" }} />;
  }
  return <Circle size={13} aria-hidden={true} style={{ color: "var(--color-muted)" }} />;
}

const ROW_GRID = "grid grid-cols-[4.2rem_minmax(0,1fr)] sm:grid-cols-[4.2rem_minmax(0,1fr)_auto] gap-x-4";

export default function HomePage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showNewJob, setShowNewJob] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function reload() {
    const repo = getRepository();
    if (!repo) return;
    const full = repo
      .listJobs()
      .map((s) => repo.getJob(s.id))
      .filter((j): j is Job => j !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setJobs(full);
  }

  useEffect(() => {
    const repo = getRepository();
    if (!repo) return;
    const storedDemo = repo.getJob(DEMO_JOB.id);
    if (!storedDemo || storedDemo.demoLabel !== DEMO_JOB.demoLabel) repo.saveJob(DEMO_JOB);
    Promise.resolve().then(reload);
  }, []);

  function handleDelete(id: string, title: string) {
    const repo = getRepository();
    if (!repo) return;
    if (confirm(`Delete "${title}"? This cannot be undone.`)) {
      repo.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    }
  }

  function handleEdit(job: Job, edits: JobEdits) {
    const repo = getRepository();
    if (!repo) return;
    repo.saveJob({ ...job, ...edits });
    setEditingId(null);
    reload();
  }

  function handleCreate(v: NewJobValues) {
    setCreating(true);
    const now = new Date().toISOString();
    const sources = [
      buildStatementSource({ id: `src_${nanoid(8)}`, party: "customer", text: v.customerText, transcripts: v.customerTranscripts, transcribedBy: v.customerTranscribedBy, now }),
      buildStatementSource({ id: `src_${nanoid(8)}`, party: "maker", text: v.makerText, transcripts: v.makerTranscripts, transcribedBy: v.makerTranscribedBy, now }),
      buildNotesSource(`src_${nanoid(8)}`, v.notes, now),
    ].filter((x): x is NonNullable<typeof x> => x !== null);

    const job: Job = {
      id: `job_${nanoid(10)}`,
      title: v.title,
      jobType: v.jobType,
      status: "sauda",
      customerName: v.customerName.trim() || undefined,
      makerName: v.makerName.trim() || undefined,
      description: v.customerText.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      isDemo: false,
      sources,
      quotes: [],
      ambiguities: [],
      kaamNaksha: { version: 0, createdAt: now, lastUpdatedAt: now, completeness: 0, confirmations: [], fields: [], history: [] },
      revisions: [],
      outcomefindings: [],
    };

    getRepository()?.saveJob(job);
    router.push(`/job/${job.id}`);
  }

  const userJobs = jobs.filter((j) => !j.isDemo);
  const demoJob = jobs.find((j) => j.isDemo) ?? DEMO_JOB;
  const waiting = userJobs.filter((j) => stageInfo(j).some((s) => s.state === "needs_decision")).length;

  return (
    <div className="min-h-dvh">
      {/* Identity strip: the one place the hand-lettered wordmark appears */}
      <header style={{ background: "var(--color-surface)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-baseline gap-x-3 gap-y-0 flex-wrap">
          <span className="text-xl font-extrabold tracking-tight">AAKAAR</span>
          <span lang="hi" className="wordmark-hi">आकार</span>
          <span className="t-support">From baat to banaawat.</span>
        </div>
        <div className="rule-jaal" aria-hidden={true} />
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] items-start">
        {/* ── Main working column: the register ─────────────────────── */}
        <main className="space-y-6 min-w-0">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="display-sign text-[1.9rem] sm:text-[2.2rem]" style={{ color: "var(--color-indigo-deep)" }}>
                {TERMS.kaamRegister.name}
              </h1>
              <p className="mt-0.5 flex items-baseline gap-2 flex-wrap">
                <span lang="hi" className="font-devanagari text-[1.05rem] font-semibold">{TERMS.kaamRegister.hindi}</span>
                <span className="t-support">{TERMS.kaamRegister.gloss}.</span>
              </p>
              <p className="t-support">
                {userJobs.length === 0
                  ? "No jobs recorded yet."
                  : `${userJobs.length} ${userJobs.length === 1 ? "job" : "jobs"}, ${waiting} waiting on a decision.`}
              </p>
            </div>
            {!showNewJob && (
              <button type="button" className="btn btn-primary" onClick={() => setShowNewJob(true)}>
                <Plus size={16} aria-hidden={true} />
                Naya kaam
              </button>
            )}
          </div>

          {/* New job sheet */}
          {showNewJob && <NewJobForm creating={creating} onCreate={handleCreate} onCancel={() => setShowNewJob(false)} />}

          {/* Register */}
          {userJobs.length === 0 && !showNewJob ? (
            <section className="sheet p-5 flex gap-6 items-stretch overflow-hidden">
              <div className="space-y-3 min-w-0">
                <h2 className="t-section">Start with one real job</h2>
                <p className="t-body" style={{ maxWidth: "46ch" }}>
                  Any custom work will do. Write or speak what the customer asked for, then what the maker said
                  or quoted. AAKAAR puts the two side by side and shows where they may not mean the same thing.
                </p>
                <button type="button" className="btn btn-primary" onClick={() => setShowNewJob(true)}>
                  <Plus size={16} aria-hidden={true} />
                  Create the first job
                </button>
              </div>
              <div className="jali hidden sm:block shrink-0 ml-auto" aria-hidden={true} />
            </section>
          ) : userJobs.length > 0 ? (
            <section aria-label="Jobs">
              <div className="rule-b" />
              <ul>
                {userJobs.map((job) => {
                  if (editingId === job.id) {
                    return (
                      <li key={job.id} className="py-3">
                        <EditJobForm job={job} onSave={(e) => handleEdit(job, e)} onCancel={() => setEditingId(null)} />
                      </li>
                    );
                  }
                  const stage = currentStage(job);
                  const decision = outstandingDecision(job);
                  return (
                    <li key={job.id} className={`register-row py-4 ${ROW_GRID} items-start`} data-testid="register-row">
                      <span className="entry-no pt-1">{jobNumber(job)}</span>
                      <div className="min-w-0 folio-margin pl-3">
                        <div className="flex items-baseline gap-x-3 gap-y-0 flex-wrap">
                          <Link href={`/job/${job.id}`} className="font-bold text-lg hover:underline" style={{ color: "var(--color-ink)" }}>
                            {job.title}
                          </Link>
                          <span className="t-meta">{JOB_TYPE_LABEL[job.jobType]}</span>
                        </div>
                        <p className="t-meta">
                          <span className="font-semibold">Customer</span> {job.customerName ?? "not named"}
                          <span aria-hidden={true}> · </span>
                          <span className="font-semibold">Maker</span> {job.makerName ?? "not named"}
                        </p>
                        <dl className="mt-2 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                          <div>
                            <dt className="folio-head border-0">Stage</dt>
                            <dd className="t-body inline-flex items-center gap-1.5 flex-wrap">
                              <StateMark state={stage.state} />
                              <span className="font-semibold">{stage.label}</span>
                              <span className="t-meta">{STAGE_STATE_LABEL[stage.state]}</span>
                            </dd>
                          </div>
                          <div>
                            <dt className="folio-head border-0">Needs a decision</dt>
                            <dd className="t-body" style={decision ? { color: "var(--color-madder)", fontWeight: 600 } : { color: "var(--color-muted)" }} data-testid="register-decision">
                              {decision ?? "Nothing waiting"}
                            </dd>
                          </div>
                          <div>
                            <dt className="folio-head border-0">Next step</dt>
                            <dd className="t-body">{nextAction(job)}</dd>
                          </div>
                          <div>
                            <dt className="folio-head border-0">Updated</dt>
                            <dd className="t-body font-mono">{shortDate(job.updatedAt)}</dd>
                          </div>
                        </dl>
                      </div>
                      <span className="col-start-2 sm:col-start-3 sm:row-start-1 flex gap-1 mt-2 sm:mt-0 sm:justify-end">
                        <button type="button" className="btn btn-text" onClick={() => setEditingId(job.id)} aria-label={`Edit ${job.title}`}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-text btn-text-danger"
                          onClick={() => handleDelete(job.id, job.title)}
                          aria-label={`Delete ${job.title}`}
                        >
                          Delete
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Demo: present but secondary */}
          <section aria-label="Demo scenario" className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="t-label">Try the demo</h2>
              <DemoBanner />
            </div>
            <Link
              href={`/job/${demoJob.id}`}
              className={`block register-row rule-t py-4 ${ROW_GRID} items-start hover:bg-[var(--color-surface)]`}
              style={{ color: "var(--color-ink)" }}
            >
              <span className="entry-no pt-1">DEMO</span>
              <span className="min-w-0">
                <span className="font-bold text-lg block">{demoJob.title}</span>
                <span className="t-meta block">Invented customer and makers. No real people, numbers or calls.</span>
                <span className="t-body block mt-1">Starts at SAMAJH with the walnut finish question.</span>
              </span>
              <span className="col-start-2 sm:col-start-3 sm:row-start-1 font-semibold mt-2 sm:mt-0" style={{ color: "var(--color-indigo)" }}>
                Open demo
              </span>
            </Link>
          </section>
        </main>

        {/* ── Contextual rail ──────────────────────────────────────── */}
        <aside className="space-y-6 lg:sticky lg:top-6" aria-label="How a job moves">
          <section>
            <h2 className="t-label rule-b pb-2 mb-3">How a job moves</h2>
            <ol className="space-y-3">
              {[
                { ...STAGES[0], desc: "Put the quotes side by side, line by line, with what each leaves out." },
                { ...STAGES[1], desc: "See where both sides may mean different things, then ask." },
                { ...STAGES[2], desc: "Write the plan, field by field. Each role confirms separately." },
                { ...STAGES[3], desc: "Set what was reported as delivered beside what was agreed." },
              ].map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="entry-no pt-0.5">{s.no}</span>
                  <div>
                    <p className="font-bold leading-snug">
                      {s.label} <span lang="hi" className="font-devanagari" style={{ color: "var(--color-muted)", fontWeight: 500 }}>{s.hindi}</span>
                    </p>
                    <p className="t-support">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <blockquote className="evidence">
            <p lang="hi-Latn" className="font-devanagari italic">Dono haan bol rahe the. Par dono ki samajh alag thi.</p>
            <p className="t-meta mt-1">Both said yes. They were picturing different things.</p>
          </blockquote>

          <p className="t-meta rule-t pt-3">
            Jobs are stored in this browser only. There is no account and no server copy.
          </p>
        </aside>
      </div>
    </div>
  );
}