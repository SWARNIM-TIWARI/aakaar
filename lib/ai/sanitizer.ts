// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR — Analysis Result Sanitizer
//
// Guards applied after receiving AI analysis output, before it touches
// the live job state. Two invariants enforced:
//
//   1. Protected spec fields — fields with status "confirmed", "changed", or
//      "disputed" may not be overwritten by a new AI suggestion. The human
//      (or an explicit revision flow) is the only actor that may move those.
//
//   2. Source attribution — sourceIds in ambiguities are validated against the
//      job's actual sources. Unrecognised IDs are removed to prevent the UI
//      from presenting orphaned evidence links.
//
// This does NOT verify that a cited source actually entails the model's claim.
// Human review remains necessary for that.
// ──────────────────────────────────────────────────────────────────────────────

import type { AnalysisResult, SpecField } from "@/lib/types";

/** Field statuses that a re-analysis must not overwrite. */
const PROTECTED_STATUSES = new Set<SpecField["status"]>([
  "confirmed",
  "changed",
  "disputed",
]);

/**
 * Remove AI-suggested spec fields that would overwrite protected fields, and
 * strip unrecognised sourceIds from ambiguities.
 *
 * @param result       Raw analysis result from the reasoning provider.
 * @param existingFields  Current spec fields from kaamNaksha.fields.
 * @param validSourceIds  Set of source IDs that exist on the job. Pass
 *                        undefined to skip sourceId validation.
 */
export function sanitizeAnalysisResult(
  result: AnalysisResult,
  existingFields: SpecField[],
  validSourceIds?: Set<string>
): AnalysisResult {
  // Build a set of field keys that are protected
  const protectedKeys = new Set(
    existingFields
      .filter((f) => PROTECTED_STATUSES.has(f.status))
      .map((f) => f.key)
  );

  // Drop any suggested field whose key is already protected
  const safeSuggestedFields = result.suggestedSpecFields.filter(
    (f) => !protectedKeys.has(f.key)
  );

  // Strip unrecognised sourceIds from ambiguities if a valid-ID set is supplied
  const safeAmbiguities = validSourceIds
    ? result.ambiguities.map((a) => ({
        ...a,
        sourceIds: a.sourceIds.filter((id) => validSourceIds.has(id)),
      }))
    : result.ambiguities;

  return {
    ...result,
    suggestedSpecFields: safeSuggestedFields,
    ambiguities: safeAmbiguities,
  };
}
