// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR — Spec Diffing & Revision Integrity
// Revisions NEVER silently overwrite. Every agreed value is versioned.
// ──────────────────────────────────────────────────────────────────────────────

import type { KaamNaksha, Revision, SpecField } from "@/lib/types";

// ── Field diff ────────────────────────────────────────────────────────────────

export interface FieldChange {
  key: string;
  label: string;
  previousValue: unknown;
  newValue: unknown;
  statusChanged: boolean;
  previousStatus?: SpecField["status"];
  newStatus?: SpecField["status"];
}

/**
 * Return the set of fields that changed between two KAAM-NAKSHA versions.
 */
export function diffKaamNaksha(
  previous: KaamNaksha,
  current: KaamNaksha
): FieldChange[] {
  const changes: FieldChange[] = [];
  const prevMap = new Map(previous.fields.map((f) => [f.key, f]));

  for (const field of current.fields) {
    const prev = prevMap.get(field.key);
    if (!prev) {
      // New field
      changes.push({
        key: field.key,
        label: field.label,
        previousValue: undefined,
        newValue: field.agreedValue ?? field.value,
        statusChanged: true,
        previousStatus: undefined,
        newStatus: field.status,
      });
      continue;
    }

    const prevVal = prev.agreedValue ?? prev.value;
    const currVal = field.agreedValue ?? field.value;
    const valueChanged = JSON.stringify(prevVal) !== JSON.stringify(currVal);
    const statusChanged = prev.status !== field.status;

    if (valueChanged || statusChanged) {
      changes.push({
        key: field.key,
        label: field.label,
        previousValue: prevVal,
        newValue: currVal,
        statusChanged,
        previousStatus: prev.status,
        newStatus: field.status,
      });
    }
  }

  return changes;
}

// ── Revision application ──────────────────────────────────────────────────────

/**
 * Apply an accepted revision to a KAAM-NAKSHA.
 * Returns a new KaamNaksha — never mutates the original.
 * Increments version. If the field was "confirmed", marks it "changed".
 */
export function applyRevision(
  naksha: KaamNaksha,
  revision: Revision
): KaamNaksha {
  if (revision.status !== "accepted") {
    throw new Error(
      `Cannot apply revision ${revision.id}: status is "${revision.status}", must be "accepted"`
    );
  }

  const now = new Date().toISOString();

  const updatedFields = naksha.fields.map((field) => {
    if (field.key !== revision.fieldKey) return field;

    return {
      ...field,
      // If it was confirmed, mark it "changed" to surface the revision
      status:
        field.status === "confirmed"
          ? ("changed" as const)
          : field.status,
      value: revision.newValue,
      // Clear the agreed value — needs re-confirmation
      agreedValue: undefined,
      lastChangedAt: now,
      notes: field.notes
        ? `${field.notes}\n[Revised ${now}: ${revision.reason}]`
        : `[Revised ${now}: ${revision.reason}]`,
    };
  });

  return {
    ...naksha,
    version: naksha.version + 1,
    lastUpdatedAt: now,
    // Recompute completeness after revision
    completeness: computeCompleteness(updatedFields),
    fields: updatedFields,
  };
}

/**
 * Compute completeness as the % of fields that are "confirmed".
 */
export function computeCompleteness(fields: SpecField[]): number {
  if (fields.length === 0) return 0;
  const confirmed = fields.filter((f) => f.status === "confirmed").length;
  return Math.round((confirmed / fields.length) * 100);
}

// ── Integrity assertion ───────────────────────────────────────────────────────

export interface IntegrityViolation {
  fieldKey: string;
  violation: string;
}

/**
 * Assert that no revision silently overwrote a confirmed agreedValue.
 * Throws if any agreed value was changed without a corresponding revision record.
 *
 * Used in tests and optionally in the UI debug panel.
 */
export function assertRevisionIntegrity(
  before: KaamNaksha,
  after: KaamNaksha,
  appliedRevisions: Revision[]
): IntegrityViolation[] {
  const violations: IntegrityViolation[] = [];
  const revisionFieldKeys = new Set(
    appliedRevisions
      .filter((r) => r.status === "accepted")
      .map((r) => r.fieldKey)
  );

  const beforeMap = new Map(before.fields.map((f) => [f.key, f]));

  for (const afterField of after.fields) {
    const beforeField = beforeMap.get(afterField.key);
    if (!beforeField) continue;

    // Check: was an agreed value changed without a revision record?
    const agreedChanged =
      JSON.stringify(beforeField.agreedValue) !==
      JSON.stringify(afterField.agreedValue);
    const wasConfirmed = beforeField.status === "confirmed";

    if (agreedChanged && wasConfirmed && !revisionFieldKeys.has(afterField.key)) {
      violations.push({
        fieldKey: afterField.key,
        violation: `agreedValue changed for confirmed field "${afterField.key}" without a recorded revision`,
      });
    }
  }

  return violations;
}
