"use client";

import { AlertTriangle, CheckCircle2, Circle, HelpCircle, History, XCircle } from "lucide-react";
import type { ComponentType } from "react";
import type { FieldStatus } from "@/lib/types";

type IconType = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

// Every status is text plus a shape. Colour is never the only signal.
const STATUS_CONFIG: Record<FieldStatus, { label: string; className: string; Icon: IconType }> = {
  confirmed:         { label: "Confirmed",      className: "chip-confirmed", Icon: CheckCircle2 },
  possible_mismatch: { label: "Needs decision", className: "chip-decision",  Icon: AlertTriangle },
  proposed:          { label: "Proposed",       className: "chip-proposed",  Icon: Circle },
  unclear:           { label: "Unclear",        className: "chip-unclear",   Icon: HelpCircle },
  rejected:          { label: "Rejected",       className: "chip-decision",  Icon: XCircle },
  changed:           { label: "Revised",        className: "chip-revised",   Icon: History },
  disputed:          { label: "Disputed",       className: "chip-decision",  Icon: AlertTriangle },
  unverified:        { label: "Unverified",     className: "chip-unclear",   Icon: HelpCircle },
};

interface Props {
  status: FieldStatus;
  /** Kept for existing call sites; both sizes render at a readable size now. */
  size?: "xs" | "sm";
}

export default function StatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "chip-unclear", Icon: HelpCircle };
  const { Icon } = cfg;
  return (
    <span className={`chip ${cfg.className}`}>
      <Icon size={12} aria-hidden={true} />
      {cfg.label}
    </span>
  );
}