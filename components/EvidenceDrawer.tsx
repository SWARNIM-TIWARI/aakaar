"use client";

import { useEffect, useRef, useState } from "react";
import { X, FileText, Mic, Image, StickyNote, Cpu } from "lucide-react";
import type { EvidenceSource } from "@/lib/types";
import { isCorrected } from "@/lib/spec/workflow";

const KIND_ICONS = {
  transcript: Mic,
  quote_document: FileText,
  photo: Image,
  manual_note: StickyNote,
  system: Cpu,
} as const;

const KIND_LABELS = {
  transcript: "Voice transcript",
  quote_document: "Quote document",
  photo: "Photo",
  manual_note: "Manual note",
  system: "System",
};

interface Props {
  open: boolean;
  onClose: () => void;
  sources: EvidenceSource[];
  title?: string;
  /** Correct the text of a source. The original words are kept. Returns an error sentence or null. */
  onCorrect?: (sourceId: string, text: string) => string | null;
}

const BY_LABEL = { gnani_prisma: "Gnani speech-to-text", browser_speech: "the browser's speech recognition" } as const;

function CorrectText({ src, onCorrect }: { src: EvidenceSource; onCorrect: (id: string, text: string) => string | null }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(src.excerpt ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!editing) {
    return (
      <button type="button" className="btn btn-text mt-1" style={{ paddingLeft: 0 }} onClick={() => { setText(src.excerpt ?? ""); setEditing(true); }}>
        Correct the text
      </button>
    );
  }
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const err = onCorrect(src.id, text);
        setError(err);
        if (!err) setEditing(false);
      }}
    >
      <label htmlFor={`fix-${src.id}`} className="t-label block">Corrected text</label>
      <textarea id={`fix-${src.id}`} className="field" rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <p className="t-meta">The words as first captured are kept below the corrected text and the source is marked corrected.</p>
      {error && <p className="t-support" role="alert" style={{ color: "var(--color-madder)" }}>{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">Save the correction</button>
        <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>
  );
}

export default function EvidenceDrawer({ open, onClose, sources, title = "Evidence sources", onCorrect }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes the drawer, and focus moves to the close button when it opens.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-[var(--color-ink)]/25 z-40" onClick={onClose} aria-hidden="true" />

      {/* Drawer */}
      <aside
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[var(--color-surface)] z-50 flex flex-col border-l border-[var(--color-line)] animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Evidence"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 rule-b">
          <div>
            <h2 className="t-section">{title}</h2>
            <p className="t-meta">
              <span className="font-mono">{sources.length}</span> source{sources.length !== 1 ? "s" : ""} shown as captured
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="btn btn-quiet" aria-label="Close evidence">
            <X size={16} aria-hidden={true} />
            Close
          </button>
        </div>

        {/* Sources */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {sources.length === 0 ? (
            <p className="t-support py-8">No sources linked to this item.</p>
          ) : (
            sources.map((src, i) => {
              const Icon = KIND_ICONS[src.kind] ?? FileText;
              const isCustomer = src.party === "customer";
              const isMaker = src.party === "maker";
              return (
                <article key={src.id} className="register-row last:border-b-0 pb-5 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span className="entry-no pt-0.5">S{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.95rem] font-semibold leading-snug">{src.label}</p>
                      <p className="t-meta flex items-center gap-1.5 flex-wrap mt-0.5">
                        <Icon size={13} aria-hidden={true} />
                        <span>{KIND_LABELS[src.kind]}</span>
                        <span>{src.party === "entered" ? "typed in AAKAAR" : src.party === "inspection" ? "reported by an inspection" : `from ${src.party}`}</span>
                        {src.inputMethod && (
                          <span>
                            {src.inputMethod === "voice"
                              ? `spoken, transcribed${src.transcribedBy ? ` by ${BY_LABEL[src.transcribedBy]}` : ""}`
                              : "typed"}
                          </span>
                        )}
                        {isCorrected(src) && <span style={{ color: "var(--color-ochre-text)", fontWeight: 600 }}>corrected by a person</span>}
                        {src.confidence !== undefined && (
                          <span>
                            speech to text confidence <span className="font-mono">{Math.round(src.confidence * 100)}%</span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {src.excerpt && (
                    <div
                      className={`evidence mt-3 ${isCustomer ? "evidence-customer" : isMaker ? "evidence-maker" : ""}`}
                    >
                      <p className="text-[0.95rem] leading-relaxed whitespace-pre-line">&ldquo;{src.excerpt}&rdquo;</p>
                    </div>
                  )}
                  {isCorrected(src) && (
                    <div className="evidence mt-2" style={{ borderLeftColor: "var(--color-ochre)" }} data-testid="original-text">
                      <p className="prov prov-recorded">
                        Original, as first captured{src.inputMethod === "voice" ? " (speech-to-text result)" : ""}
                      </p>
                      <p className="text-[0.9rem] leading-relaxed whitespace-pre-line">&ldquo;{src.originalText}&rdquo;</p>
                      <p className="t-meta mt-1">
                        The text above was corrected on{" "}
                        <span className="font-mono">{src.correctedAt ? new Date(src.correctedAt).toLocaleDateString("en-IN") : ""}</span>.
                        It is not what the speaker said.
                      </p>
                    </div>
                  )}
                  {onCorrect && src.excerpt && (src.kind === "transcript" || src.kind === "manual_note") && !src.label.startsWith("Delivery report") && (
                    <CorrectText src={src} onCorrect={onCorrect} />
                  )}

                  <p className="t-meta mt-2 font-mono">
                    {new Date(src.capturedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </article>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 rule-t">
          <p className="t-meta">Sources appear exactly as captured. Check important claims directly with the parties.</p>
        </div>
      </aside>
    </>
  );
}