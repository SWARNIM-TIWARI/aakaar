// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Provider Adapter (Reasoner)
// Dispatches to the correct provider based on REASONING_PROVIDER env var.
// All arithmetic stays in lib/spec/calculations.ts, never here.
// ──────────────────────────────────────────────────────────────────────────────

import type { AnalysisResult, Job } from "@/lib/types";
import { AnalysisResultSchema } from "@/lib/ai/schemas";
import { runDemoAnalysis } from "@/lib/ai/providers/demo";

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are AAKAAR's reasoning engine. Your job is to analyze a custom work engagement between a customer and a maker/craftsperson.

CRITICAL RULES:
1. DO NOT perform any arithmetic or calculate totals. All calculations are done by deterministic code.
2. Extract structured data from the conversation, identify mismatches, ambiguities, missing information.
3. Be specific: quote exact words from the sources when identifying mismatches.
4. Use plain, clear language. Avoid jargon. Write for both parties to understand.
5. A "possible_mismatch" status means the two parties seem to be using the same word to mean different things.
6. If the customer and the maker clearly say the same thing about a point, that is NOT a gap. Do not invent one. If nothing needs clarifying, return "ambiguities": [] and keep the summary short.
7. Report a possible_mismatch only when the sources use different terms that change the work, the price or the look, for example veneer versus laminate, or a different number of items.
8. If a point is vague or missing (for example "good finish" or "soon"), ask one clarifying question. Write "Not specified" for a side that said nothing. Never invent what a party meant.
9. Never use the status "confirmed". Agreement is recorded by the parties in the app, not by you.
10. Copy sourceIds exactly as they appear in square brackets in the SOURCES list. Quote only words that appear in the sources.

Your output MUST be valid JSON matching this schema:
{
  "ambiguities": [
    {
      "fieldKey": "string (camelCase, e.g. materialFinish)",
      "fieldLabel": "string (human-readable)",
      "interpretationA": "string (customer's STATED REQUEST, cite only their exact quoted words from sources; do not infer private mental model)",
      "interpretationB": "string (maker's expressed terms, cite exact quote text from sources; do not infer intent)",
      "consequence": "string (what goes wrong if unresolved)",
      "materialImpact": "high" | "medium" | "low",
      "clarificationQuestion": "string (one clear question that resolves this)",
      "sourceIds": ["array of source IDs"]
    }
  ],
  "suggestedSpecFields": [
    {
      "key": "string",
      "label": "string",
      "labelHindi": "string (optional)",
      "value": "any (optional)",
      "customerMeaning": "string (optional)",
      "makerMeaning": "string (optional)",
      "status": "proposed" | "unclear" | "possible_mismatch" | "confirmed",
      "notes": "string (optional)"
    }
  ],
  "summary": "string (2-3 sentence overview of key findings)",
  "providerUsed": "string",
  "analysisVersion": "string"
}

Return ONLY the JSON object. No markdown, no explanation outside JSON.`;
}

function buildUserPrompt(job: Job): string {
  return `Analyze this custom work engagement:

JOB TITLE: ${job.title}
JOB TYPE: ${job.jobType}
CUSTOMER: ${job.customerName ?? "Not specified"}
MAKER: ${job.makerName ?? "Not specified"}

CUSTOMER BRIEF:
${job.description ?? "No brief provided"}

SOURCES (evidence):
${job.sources
  .map(
    (s) =>
      `[${s.id}] ${s.kind.toUpperCase()}, ${s.label} (${s.party}):
${s.excerpt ?? "No excerpt"}`
  )
  .join("\n\n")}

QUOTES (for context, DO NOT compute totals yourself):
${job.quotes
  .map(
    (q) =>
      `${q.makerName}:
Lines: ${q.lines.map((l) => `  - ${l.description}: ${l.amountRs !== undefined ? `₹${l.amountRs}` : "UNPRICED"}`).join("\n")}
Unknown items: ${q.unknownItems.join(", ") || "none"}
Non-equivalent items: ${q.nonEquivalentItems.join(", ") || "none"}`
  )
  .join("\n\n")}

Identify all semantic mismatches and ambiguities. Focus on gaps that could cause a dispute at delivery.`;
}

// ── OpenAI-compatible provider ────────────────────────────────────────────────

/** Pull the JSON object out of a model reply, ignoring code fences and any text around it. */
export function extractJson(content: string): unknown {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The reasoning provider did not return JSON");
  }
}

/** Environment values are often pasted with quotes, spaces or a "Bearer " prefix. Clean those up. */
export function cleanEnvValue(value: string | undefined): string {
  let v = (value ?? "").trim();
  const quoted = v.match(/^(['"`])([\s\S]*)\1$/);
  if (quoted) v = quoted[2].trim();
  return v.replace(/^Bearer\s+/i, "").trim();
}

/** A failure from the reasoning provider, explained in plain words and safe to show in the app. */
export class ProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export function explainProviderFailure(status: number, body: string, model: string): ProviderError {
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) {
    return new ProviderError(
      "The reasoning provider rejected the API key. Check OPENAI_COMPATIBLE_API_KEY in .env.local: " +
        "it should be the key alone, with no quotes or spaces. A key set in your PowerShell window " +
        "overrides the file, so close other terminals, then restart the server. " +
        "Open /api/reason/status to test the key without running an analysis.",
      status
    );
  }
  if (status === 404 || lower.includes("model_not_found") || lower.includes("decommissioned")) {
    return new ProviderError(
      `The reasoning provider does not offer the model "${model}" any more. Check OPENAI_COMPATIBLE_MODEL ` +
        "(for Groq, use openai/gpt-oss-120b), then restart the server.",
      status
    );
  }
  if (status === 429) {
    return new ProviderError(
      "The reasoning provider is limiting requests right now. Wait a minute and try again.",
      status
    );
  }
  if (status >= 500) {
    return new ProviderError(
      `The reasoning provider had a problem on its side (error ${status}). Try again shortly.`,
      status
    );
  }
  return new ProviderError(`The reasoning provider refused the request (error ${status}).`, status);
}

export async function runOpenAICompatible(job: Job): Promise<AnalysisResult> {
  const baseUrl = cleanEnvValue(process.env.OPENAI_COMPATIBLE_BASE_URL);
  const apiKey = cleanEnvValue(process.env.OPENAI_COMPATIBLE_API_KEY);
  const model = cleanEnvValue(process.env.OPENAI_COMPATIBLE_MODEL) || "gpt-3.5-turbo";

  if (!baseUrl || !apiKey) {
    throw new Error(
      "OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_API_KEY must be set"
    );
  }

  // Reasoning models (for example openai/gpt-oss-120b on Groq) spend part of the token budget on
  // thinking, so the default budget is generous. Optional settings are opt-in so that providers
  // that do not know them are never sent them.
  const maxTokens = Number(process.env.OPENAI_COMPATIBLE_MAX_TOKENS) || 4096;
  const tokenParam = baseUrl.includes("groq.com") ? "max_completion_tokens" : "max_tokens";
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(job) },
    ],
    temperature: 0.1,
    [tokenParam]: maxTokens,
  };
  if (process.env.OPENAI_COMPATIBLE_JSON_MODE === "true") body.response_format = { type: "json_object" };
  const effort = process.env.OPENAI_COMPATIBLE_REASONING_EFFORT;
  if (effort === "low" || effort === "medium" || effort === "high") body.reasoning_effort = effort;

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[Reasoning provider] ${response.status}: ${text.slice(0, 300)}`);
    throw explainProviderFailure(response.status, text, model);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI-compatible API");

  const parsed = extractJson(content);
  const validated = AnalysisResultSchema.parse({
    ...(parsed as object),
    providerUsed: `openai-compatible:${model}`,
    analysisVersion: "live-v1.0",
  });

  return validated;
}

// ── Evon local provider ───────────────────────────────────────────────────────

export async function runEvonLocal(job: Job): Promise<AnalysisResult> {
  const baseUrl =
    process.env.EVON_LOCAL_BASE_URL ?? "http://localhost:11434/v1";
  const model = process.env.EVON_LOCAL_MODEL ?? "evon-v3.3";

  // Evon local exposes an OpenAI-compatible endpoint
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(job) },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Evon local API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from Evon local");

  const parsed = extractJson(content);
  const validated = AnalysisResultSchema.parse({
    ...(parsed as object),
    providerUsed: `evon-local:${model}`,
    analysisVersion: "live-v1.0",
  });

  return validated;
}

// ── Main adapter ──────────────────────────────────────────────────────────────

/**
 * Analyze a job using the configured reasoning provider.
 * Provider is selected via REASONING_PROVIDER env var.
 *
 * Providers:
 * - demo (default): deterministic, no keys needed
 * - openai-compatible: any OpenAI-API-compatible endpoint
 * - evon-local: local Evon model via Ollama/LM Studio
 */
export async function analyzeJob(job: Job): Promise<AnalysisResult> {
  const provider = process.env.REASONING_PROVIDER ?? "demo";

  switch (provider) {
    case "demo":
      return runDemoAnalysis(job);

    case "openai-compatible":
      return runOpenAICompatible(job);

    case "evon-local":
      return runEvonLocal(job);

    default:
      throw new Error(
        `Unknown REASONING_PROVIDER "${provider}". ` +
        `Valid values: demo | openai-compatible | evon-local. ` +
        `Check your .env.local file. ` +
        `There is no automatic fallback, an unknown provider name is likely a misconfiguration.`
      );
  }
}