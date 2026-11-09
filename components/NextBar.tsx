"use client";

import { ArrowRight } from "lucide-react";
import type { NextStep, StageId } from "@/lib/utils/jobStage";
import { STAGES } from "@/lib/utils/jobStage";

interface Props {
  stage: StageId;
  step: NextStep;
  onGoToStage?: (id: StageId) => void;
  onAnalyze?: () => void;
  analyzing?: boolean;
}

/**
 * The top of every stage: what this stage is, what has happened so far, and the ONE next
 * action. It replaces the older three-row guide, which said the same generic things on every
 * screen. The button only appears when there is a real next move.
 */
export default function NextBar({ stage, step, onGoToStage, onAnalyze, analyzing }: Props) {
  const info = STAGES.find((s) => s.id === stage)!;

  function run() {
    const cta = step.cta;
    if (!cta) return;
    if (cta.go && onGoToStage) return onGoToStage(cta.go);
    if (cta.action === "analyze" && onAnalyze) return onAnalyze();
    if (cta.focus) {
      const el = document.getElementById(cta.focus) ?? document.querySelector(`[data-focus="${cta.focus}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: "center", behavior: "auto" });
        const target = el.matches("input,textarea,select,button") ? el : el.querySelector<HTMLElement>("input,textarea,select,button");
        // A button that opens a form is pressed for the person, so the form is ready to type into.
        if (el.hasAttribute("data-open-form") && target instanceof HTMLButtonElement) target.click();
        else target?.focus({ preventScroll: true });
      }
    }
  }

  return (
    <section className="next-bar px-4 py-3 sm:px-5" aria-label={`${info.label}: what to do next`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 space-y-1" style={{ flexBasis: "18rem" }}>
          <p className="hang">
            <span className="folio-head border-0">So far</span>
            <span className="t-body" data-testid="so-far">{step.soFar}</span>
          </p>
          <p className="hang">
            <span className="folio-head border-0" style={{ color: "var(--color-indigo)" }}>Next</span>
            <span className="text-[1.02rem] font-semibold leading-snug" role="status" data-testid="next-sentence">{step.sentence}</span>
          </p>
        </div>
        {step.cta && (
          <button type="button" className="btn btn-primary shrink-0" onClick={run} disabled={analyzing && step.cta.action === "analyze"} data-testid="next-cta">
            {step.cta.label}
            <ArrowRight size={15} aria-hidden={true} />
          </button>
        )}
      </div>
    </section>
  );
}