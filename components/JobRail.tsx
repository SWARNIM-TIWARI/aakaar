"use client";

import type { Job } from "@/lib/types";
import { shortDate } from "@/lib/utils/jobStage";

interface Props {
  job: Job;
}

interface Entry {
  at: string;
  text: string;
}

/** Everything that has happened on the job, newest first, built only from stored records. */
function buildTimeline(job: Job): Entry[] {
  const entries: Entry[] = [];

  job.sources.forEach((s) =>
    entries.push({ at: s.capturedAt, text: /^(Field entered|Answer from)/i.test(s.label) ? s.label : `Source added: ${s.label}` })
  );
  job.quotes.forEach((q) => entries.push({ at: q.submittedAt, text: `Quote received from ${q.makerName}` }));
  job.ambiguities.forEach((a) => {
    if (a.resolved && a.resolvedAt) entries.push({ at: a.resolvedAt, text: `Clarified: ${a.fieldLabel}` });
  });
  job.kaamNaksha.confirmations.forEach((c) => {
    const labels = c.fieldKeysConfirmed
      .map((k) => job.kaamNaksha.fields.find((f) => f.key === k)?.label)
      .filter(Boolean);
    const who = c.party === "maker" ? "Maker" : "Customer";
    entries.push({
      at: c.confirmedAt,
      text: labels.length > 0 ? `${who} marked confirmed: ${labels.join(", ")}` : `${who} confirmed version ${c.specVersion}`,
    });
  });
  job.revisions.forEach((r) =>
    entries.push({ at: r.proposedAt, text: `Revision ${r.status}: ${r.fieldLabel}, ${String(r.previousValue)} to ${String(r.newValue)}` })
  );
  job.outcomefindings.forEach((f) => entries.push({ at: f.discoveredAt, text: `Reported difference: ${f.fieldLabel}` }));

  return entries
    .filter((e) => !Number.isNaN(new Date(e.at).getTime()))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
}

/** Narrow contextual rail: who is involved and what has happened. */
export default function JobRail({ job }: Props) {
  const timeline = buildTimeline(job);

  return (
    <aside className="space-y-6" aria-label="Job context">
      <section>
        <h2 className="t-label rule-b pb-2 mb-3">Job context</h2>
        <dl className="space-y-2 t-body">
          <div>
            <dt className="t-meta">Customer</dt>
            <dd>{job.customerName ?? "Not named"}</dd>
          </div>
          <div>
            <dt className="t-meta">Maker</dt>
            <dd>{job.makerName ?? "Not named, quotes may come from several makers"}</dd>
          </div>
          <div>
            <dt className="t-meta">Created</dt>
            <dd className="font-mono">{shortDate(job.createdAt)}</dd>
          </div>
          {job.description && (
            <div>
              <dt className="t-meta">Job notes</dt>
              <dd className="evidence" style={{ fontSize: "0.9rem" }}>{job.description}</dd>
            </div>
          )}
        </dl>
      </section>

      <section>
        <h2 className="t-label rule-b pb-2 mb-3">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="t-support">Nothing recorded yet. Entries appear here as the job moves.</p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-3">
                <span className="entry-no flex-shrink-0" style={{ minWidth: "5.2rem" }}>{shortDate(e.at).slice(0, 6)}</span>
                <span className="t-body" style={{ fontSize: "0.9rem" }}>{e.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}