"use client";

import { useCallback, useState } from "react";
import { RotateCcw } from "lucide-react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { chooseJobTitle } from "@/lib/utils/newJob";
import { JOB_TYPE_LABEL } from "@/lib/utils/jobStage";
import { ROLE_TERMS } from "@/lib/utils/terms";
import type { Job } from "@/lib/types";

export interface NewJobValues {
  title: string;
  jobType: Job["jobType"];
  customerName: string;
  makerName: string;
  customerText: string;
  customerTranscripts: string[];
  customerTranscribedBy?: "gnani_prisma" | "browser_speech";
  makerText: string;
  makerTranscripts: string[];
  makerTranscribedBy?: "gnani_prisma" | "browser_speech";
  notes: string;
}

interface Props {
  creating: boolean;
  onCreate: (v: NewJobValues) => void;
  onCancel: () => void;
}

type By = "gnani_prisma" | "browser_speech";
const BY_LABEL: Record<By, string> = { gnani_prisma: "Gnani speech-to-text", browser_speech: "the browser's speech recognition" };

/**
 * One side's statement. The text box is the statement. If it was spoken, the speech-to-text
 * result is shown separately, exactly as heard, and stays on record even if the text is edited.
 */
function Statement({
  side,
  text,
  setText,
  transcripts,
  setTranscripts,
  by,
  setBy,
  placeholder,
}: {
  side: "customer" | "maker";
  text: string;
  setText: (t: string) => void;
  transcripts: string[];
  setTranscripts: (t: string[]) => void;
  by?: By;
  setBy: (b: By) => void;
  placeholder: string;
}) {
  const term = ROLE_TERMS[side];
  const original = transcripts.join(" ").replace(/\s+/g, " ").trim();
  const edited = transcripts.length > 0 && text.replace(/\s+/g, " ").trim() !== original;
  const id = `new-${side}-said`;

  const onTranscript = useCallback(
    (t: string, source: By) => {
      setTranscripts([...transcripts, t]);
      setBy(source);
      setText(text.trim() ? `${text.trim()} ${t}` : t);
    },
    [transcripts, text, setTranscripts, setBy, setText]
  );

  return (
    <div className={`evidence ${side === "customer" ? "evidence-customer" : "evidence-maker"} space-y-3`}>
      <label htmlFor={id} className="t-label block" style={{ color: side === "customer" ? "var(--color-indigo)" : "var(--color-botanical)" }}>
        {side === "customer" ? "Customer's first statement" : "Maker's first statement"}{" "}
        <span lang="hi" className="font-devanagari font-normal">{term.hindi}</span>
      </label>
      <textarea id={id} className="field" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />

      <div>
        <p className="t-meta mb-1">Or speak it (up to 30 seconds). The words are written into the box above.</p>
        <VoiceRecorder onTranscript={onTranscript} language="hi-IN" />
      </div>

      {transcripts.length > 0 && (
        <div className="border px-3 py-2" style={{ borderColor: "var(--color-line)", background: "var(--color-paper)" }} data-testid={`transcript-${side}`}>
          <p className="prov prov-recorded">Original transcript, as heard by {by ? BY_LABEL[by] : "speech-to-text"}</p>
          <p className="t-body whitespace-pre-line" lang="hi">{original}</p>
          {edited ? (
            <p className="t-meta mt-1" style={{ color: "var(--color-ochre-text)" }}>
              You have edited the text above. The statement will be saved as <strong>corrected</strong>, and this original transcript is kept next to it.{" "}
              <button type="button" className="btn btn-text" style={{ padding: 0, minHeight: 0 }} onClick={() => setText(original)}>
                <RotateCcw size={12} aria-hidden={true} /> Put the transcript back
              </button>
            </p>
          ) : (
            <p className="t-meta mt-1">Transcription can mistake a word. If it did, correct the text above. This original stays on record.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function NewJobForm({ creating, onCreate, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [jobType, setJobType] = useState<Job["jobType"]>("other");
  const [customerName, setCustomerName] = useState("");
  const [makerName, setMakerName] = useState("");
  const [customerText, setCustomerText] = useState("");
  const [customerTranscripts, setCustomerTranscripts] = useState<string[]>([]);
  const [customerBy, setCustomerBy] = useState<By | undefined>();
  const [makerText, setMakerText] = useState("");
  const [makerTranscripts, setMakerTranscripts] = useState<string[]>([]);
  const [makerBy, setMakerBy] = useState<By | undefined>();
  const [notes, setNotes] = useState("");

  const chosenTitle = chooseJobTitle(title, customerText, makerText);

  return (
    <form
      className="sheet animate-slide-up"
      aria-label="New job"
      onSubmit={(e) => {
        e.preventDefault();
        if (!chosenTitle) return;
        onCreate({
          title: chosenTitle,
          jobType,
          customerName,
          makerName,
          customerText,
          customerTranscripts,
          customerTranscribedBy: customerBy,
          makerText,
          makerTranscripts,
          makerTranscribedBy: makerBy,
          notes,
        });
      }}
    >
      <div className="rule-b px-4 py-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="t-section">
            Naya kaam <span lang="hi" className="font-devanagari" style={{ color: "var(--color-muted)", fontWeight: 500 }}>नया काम</span>
          </h2>
          <p className="t-support">A new job. Say it or type it, in Hindi, English or both. Each side is kept apart and never merged.</p>
        </div>
        <button type="button" className="btn btn-text" onClick={onCancel}>Cancel</button>
      </div>

      <div className="p-4 space-y-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div>
            <label htmlFor="new-title" className="t-label block mb-1">
              What is the kaam? <span className="font-normal" style={{ color: "var(--color-muted)" }}>(optional if someone has said it below)</span>
            </label>
            <input id="new-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name the work in a few words" autoFocus />
          </div>
          <div>
            <label htmlFor="new-type" className="t-label block mb-1">Type of work</label>
            <select id="new-type" className="field" value={jobType} onChange={(e) => setJobType(e.target.value as Job["jobType"])}>
              {(Object.keys(JOB_TYPE_LABEL) as Job["jobType"][]).map((k) => (
                <option key={k} value={k}>{JOB_TYPE_LABEL[k]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Statement
            side="customer"
            text={customerText}
            setText={setCustomerText}
            transcripts={customerTranscripts}
            setTranscripts={setCustomerTranscripts}
            by={customerBy}
            setBy={setCustomerBy}
            placeholder="What the customer asked for, in their own words"
          />
          <Statement
            side="maker"
            text={makerText}
            setText={setMakerText}
            transcripts={makerTranscripts}
            setTranscripts={setMakerTranscripts}
            by={makerBy}
            setBy={setMakerBy}
            placeholder="The maker's offer or reply, as it was given"
          />
        </div>
        <p className="t-meta">
          Either side can be added now or later. Nothing becomes an agreed term until the customer role and the maker role each mark it confirmed.
        </p>

        <div>
          <label htmlFor="new-notes" className="t-label block mb-1">
            Notes and context <span className="font-normal" style={{ color: "var(--color-muted)" }}>(optional)</span>
          </label>
          <textarea id="new-notes" className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else that helps, such as a deadline or where the work is. This is your note, not anyone's statement." />
        </div>

        <div className="rule-t pt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-customer" className="t-label block mb-1">Customer name (optional)</label>
            <input id="new-customer" className="field" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="new-maker" className="t-label block mb-1">Maker name (optional)</label>
            <input id="new-maker" className="field" value={makerName} onChange={(e) => setMakerName(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="rule-t px-4 py-3 flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={!chosenTitle || creating}>
          {creating ? "Creating" : "Create job"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}