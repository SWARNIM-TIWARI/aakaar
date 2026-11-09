/**
 * Live check of the configured reasoning provider against three essential cases.
 * Skipped unless EVAL_LIVE=1, so the normal test run never calls a paid API.
 *
 * PowerShell (keys stay in your shell, never in the browser):
 *   $env:EVAL_LIVE="1"
 *   $env:REASONING_PROVIDER="openai-compatible"
 *   $env:OPENAI_COMPATIBLE_BASE_URL="https://api.groq.com/openai/v1"
 *   $env:OPENAI_COMPATIBLE_API_KEY="<your key>"
 *   $env:OPENAI_COMPATIBLE_MODEL="openai/gpt-oss-120b"
 *   npx jest reasoning-live
 */
import type { Job } from "@/lib/types";
import { analyzeJob } from "@/lib/ai/reasoner";

const live = process.env.EVAL_LIVE === "1";
const maybe = live ? describe : describe.skip;

function job(customer: string, maker: string): Job {
  const now = "2026-11-07T10:00:00.000Z";
  return {
    id: "job_eval", title: "Wardrobe", jobType: "other", status: "sauda", isDemo: false,
    customerName: "Asha", makerName: "Ravi", description: customer, createdAt: now, updatedAt: now,
    sources: [
      { id: "src_c", kind: "manual_note", label: "Customer brief", excerpt: customer, capturedAt: now, party: "customer" },
      { id: "src_m", kind: "manual_note", label: "Maker's initial offer", excerpt: maker, capturedAt: now, party: "maker" },
    ],
    quotes: [], ambiguities: [], revisions: [], outcomefindings: [],
    kaamNaksha: { version: 1, createdAt: now, lastUpdatedAt: now, completeness: 0, confirmations: [], fields: [] },
  };
}

maybe("live reasoning provider", () => {
  jest.setTimeout(90_000);

  it("true mismatch: veneer versus laminate and a different drawer count are raised", async () => {
    const r = await analyzeJob(job(
      "Natural walnut veneer, four drawers, installation included.",
      "Walnut-colour laminate on 18 mm BWP plywood, three drawers, installation extra."
    ));
    const text = JSON.stringify(r.ambiguities).toLowerCase();
    expect(r.ambiguities.length).toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/veneer|laminate/);
    expect(text).toMatch(/drawer/);
  });

  it("false positive: when both sides say the same thing, no gap is invented", async () => {
    const r = await analyzeJob(job(
      "Four drawers, 18 mm BWP plywood, natural walnut veneer, installation included.",
      "Four drawers, 18 mm BWP plywood, natural walnut veneer, installation included."
    ));
    expect(r.ambiguities.length).toBe(0);
  });

  it("genuine ambiguity: a vague request is turned into one clear question", async () => {
    const r = await analyzeJob(job(
      "I want a good finish on the wardrobe, ready soon.",
      "I will make it nicely. Price depends."
    ));
    expect(r.ambiguities.length).toBeGreaterThanOrEqual(1);
    for (const a of r.ambiguities) expect(a.clarificationQuestion.trim().endsWith("?")).toBe(true);
  });

  // ── Release scenarios A to D (synthetic). Only a real model can answer these. ──

  it("A: natural walnut veneer against walnut-look laminate raises a material difference and a question", async () => {
    const r = await analyzeJob(job(
      "I want natural walnut veneer on the wardrobe doors.",
      "I will do walnut-look laminate on the doors."
    ));
    expect(r.ambiguities.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(r.ambiguities).toLowerCase()).toMatch(/veneer|laminate/);
    for (const a of r.ambiguities) expect(a.clarificationQuestion.trim().endsWith("?")).toBe(true);
  });

  it("B: walnut-look laminate on both sides invents no disagreement", async () => {
    const r = await analyzeJob(job(
      "I want walnut-look laminate on the wardrobe doors.",
      "I will do walnut-look laminate on the doors."
    ));
    expect(r.ambiguities.length).toBe(0);
  });

  it("C: 'walnut finish' on both sides is reported as ambiguity, not as a decided material", async () => {
    const r = await analyzeJob(job("Walnut finish on the wardrobe.", "Yes, walnut finish."));
    expect(r.ambiguities.length).toBeGreaterThanOrEqual(1);
    for (const a of r.ambiguities) expect(a.clarificationQuestion.trim().endsWith("?")).toBe(true);
    expect(r.suggestedSpecFields.some((f) => f.status === "confirmed")).toBe(false);
  });

  it("D: amounts in a Diwali patakhe order stay money, and no per-item rate is invented", async () => {
    const r = await analyzeJob(job(
      "Diwali ke liye patakhe chahiye, paanch hazaar rupaye ka maal.",
      "Theek hai, 5000 rupaye mein ho jayega, Diwali se pehle."
    ));
    const asCount = r.suggestedSpecFields.filter(
      (f) => /number of|quantity|count|pieces/i.test(f.label) && /5000|5,000|paanch hazaar/i.test(String(f.value ?? ""))
    );
    expect(asCount).toHaveLength(0);
  });
});