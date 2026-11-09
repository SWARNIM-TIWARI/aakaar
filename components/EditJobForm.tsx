"use client";

import { useState } from "react";
import type { Job } from "@/lib/types";

export interface JobEdits {
  title: string;
  customerName?: string;
  makerName?: string;
  description?: string;
}

interface Props {
  job: Pick<Job, "id" | "title" | "customerName" | "makerName" | "description">;
  onSave: (edits: JobEdits) => void;
  onCancel: () => void;
}

/**
 * Inline editor for a job's own details. Evidence sources, quotes, decisions and
 * revisions are never touched here, so editing a title cannot rewrite the record.
 */
export default function EditJobForm({ job, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(job.title);
  const [customerName, setCustomerName] = useState(job.customerName ?? "");
  const [makerName, setMakerName] = useState(job.makerName ?? "");
  const [description, setDescription] = useState(job.description ?? "");

  const id = `edit-${job.id}`;
  const canSave = title.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      title: title.trim(),
      customerName: customerName.trim() || undefined,
      makerName: makerName.trim() || undefined,
      description: description.trim() || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="sheet animate-slide-up" aria-label="Edit job details">
      <div className="rule-b px-4 py-3">
        <h2 className="t-section">
          Edit job <span lang="hi" className="font-devanagari" style={{ color: "var(--color-muted)", fontWeight: 500 }}>बदलाव</span>
        </h2>
        <p className="t-support">
          Changes the job details only. Saved quotes, sources, decisions and revisions stay exactly as recorded.
        </p>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-title`} className="t-label block mb-1">
            Job title <span style={{ color: "var(--color-sindoor)" }}>(required)</span>
          </label>
          <input
            id={`${id}-title`}
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor={`${id}-customer`} className="t-label block mb-1">Customer name</label>
          <input
            id={`${id}-customer`}
            className="field"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-maker`} className="t-label block mb-1">Maker name</label>
          <input
            id={`${id}-maker`}
            className="field"
            value={makerName}
            onChange={(e) => setMakerName(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-notes`} className="t-label block mb-1">Job notes</label>
          <textarea
            id={`${id}-notes`}
            className="field"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="rule-t flex flex-wrap gap-2 px-4 py-3">
        <button type="submit" className="btn btn-primary" disabled={!canSave}>
          Save changes
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}