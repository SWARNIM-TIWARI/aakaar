// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR — Field Key Utilities
// Stable semantic identity for ambiguity deduplication (Fix 5).
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Normalize an ambiguity fieldKey to a stable, lowercase, slug form.
 * Used for deduplication: two fieldKeys that normalize to the same string
 * are treated as the same ambiguity, regardless of casing or separators.
 *
 * Examples:
 *   "material_finish"  → "material_finish"
 *   "MaterialFinish"   → "materialfinish"
 *   "material-finish"  → "material_finish"
 *   "  Material Finish " → "material_finish"
 */
export function normalizeFieldKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")   // spaces and hyphens → underscore
    .replace(/[^a-z0-9_]/g, "") // remove other non-alphanumeric characters
    .replace(/^_+|_+$/g, "");   // trim leading/trailing underscores
}
