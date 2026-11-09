// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR — Zod Schemas for AI Output Validation
// Every AI response MUST pass through these schemas before use.
// Never trust raw AI JSON — always validate.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Shared enums ──────────────────────────────────────────────────────────────

const MismatchSeveritySchema = z.enum(["high", "medium", "low"]);

const FieldStatusSchema = z.enum([
  "proposed",
  "unclear",
  "possible_mismatch",
  "confirmed",
  "rejected",
  "changed",
  "disputed",
  "unverified",
]);

// ── Ambiguity ─────────────────────────────────────────────────────────────────

export const AmbiguityOutputSchema = z.object({
  fieldKey: z.string().min(1),
  fieldLabel: z.string().min(1),
  interpretationA: z.string().min(10),
  interpretationB: z.string().min(10),
  consequence: z.string().min(10),
  materialImpact: MismatchSeveritySchema,
  clarificationQuestion: z.string().min(10),
  sourceIds: z.array(z.string()).default([]),
});

export type AmbiguityOutput = z.infer<typeof AmbiguityOutputSchema>;

// ── Spec Field ────────────────────────────────────────────────────────────────

export const SpecFieldOutputSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  labelHindi: z.string().optional(),
  value: z.unknown().optional(),
  customerMeaning: z.string().optional(),
  makerMeaning: z.string().optional(),
  status: FieldStatusSchema,
  notes: z.string().optional(),
});

export type SpecFieldOutput = z.infer<typeof SpecFieldOutputSchema>;

// ── Full Analysis Result ──────────────────────────────────────────────────────

export const AnalysisResultSchema = z.object({
  ambiguities: z.array(AmbiguityOutputSchema),
  suggestedSpecFields: z.array(SpecFieldOutputSchema),
  summary: z.string().min(1),
  providerUsed: z.string(),
  analysisVersion: z.string(),
});

export type AnalysisResultOutput = z.infer<typeof AnalysisResultSchema>;

// ── Transcription ─────────────────────────────────────────────────────────────

export const TranscriptionResultSchema = z.object({
  transcript: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  language: z.string().optional(),
  durationSeconds: z.number().optional(),
});

export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;
