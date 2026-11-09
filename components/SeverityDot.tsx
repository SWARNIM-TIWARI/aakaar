"use client";

import type { MismatchSeverity } from "@/lib/types";

const SEVERITY_COLORS: Record<MismatchSeverity, string> = {
  high:   "bg-[var(--color-sindoor)]",
  medium: "bg-[var(--color-haldi)]",
  low:    "bg-[var(--color-neem)]",
};

const SEVERITY_LABELS: Record<MismatchSeverity, string> = {
  high:   "High impact",
  medium: "Medium impact",
  low:    "Low impact",
};

interface Props {
  severity: MismatchSeverity;
  showLabel?: boolean;
}

/** Square marker with a text label, so severity never relies on colour alone. */
export default function SeverityDot({ severity, showLabel = false }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block w-2.5 h-2.5 flex-shrink-0 ${SEVERITY_COLORS[severity]}`}
        style={{ borderRadius: 1 }}
        role="img"
        aria-label={SEVERITY_LABELS[severity]}
      />
      {showLabel && <span className="t-meta">{SEVERITY_LABELS[severity]}</span>}
    </span>
  );
}