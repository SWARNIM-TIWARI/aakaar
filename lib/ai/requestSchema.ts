// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Reasoning request schema
// The job sent to /api/reason is validated here. Source kinds and parties use
// the SAME values as the canonical types in lib/types.ts, so every job the app
// can produce (including the synthetic demo) passes.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

/** Must match EvidenceSource["kind"] in lib/types.ts. */
export const SOURCE_KINDS = ["transcript", "quote_document", "photo", "manual_note", "system"] as const;

/** Must match EvidenceParty in lib/types.ts. */
export const SOURCE_PARTIES = ["customer", "maker", "system", "both", "inspection", "entered"] as const;

export const EvidenceSourceSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(SOURCE_KINDS),
  label: z.string().max(300),
  excerpt: z.string().max(8000).optional(),
  capturedAt: z.string(),
  party: z.enum(SOURCE_PARTIES),
});

export const AmbiguitySchema = z.object({
  id: z.string().min(1).max(128),
  fieldKey: z.string().min(1).max(128),
  fieldLabel: z.string().max(200),
  interpretationA: z.string().max(2000),
  interpretationB: z.string().max(2000),
  consequence: z.string().max(2000),
  materialImpact: z.enum(["high", "medium", "low"]),
  clarificationQuestion: z.string().max(2000),
  sourceIds: z.array(z.string().max(128)),
  resolved: z.boolean(),
});

export const KaamNakshaSchema = z.object({
  version: z.number().int().min(0),
  createdAt: z.string(),
  lastUpdatedAt: z.string(),
  completeness: z.number().min(0).max(100),
  fields: z.array(z.object({}).passthrough()),
  confirmations: z.array(z.object({}).passthrough()),
});

export const JobSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(300),
  jobType: z.string(),
  status: z.enum(["sauda", "samajh", "vaada", "kya_hua", "complete", "disputed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  isDemo: z.boolean(),
  customerName: z.string().max(200).optional(),
  makerName: z.string().max(200).optional(),
  sources: z.array(EvidenceSourceSchema).max(300),
  ambiguities: z.array(AmbiguitySchema).max(100),
  kaamNaksha: KaamNakshaSchema,
  description: z.string().max(4000).optional(),
  demoLabel: z.string().max(200).optional(),
  quotes: z.array(z.object({}).passthrough()).optional(),
  revisions: z.array(z.object({}).passthrough()).optional(),
  outcomefindings: z.array(z.object({}).passthrough()).optional(),
});

export const RequestSchema = z.object({
  /** The full job. The server has no database, the browser owns the state. */
  job: JobSchema,
});