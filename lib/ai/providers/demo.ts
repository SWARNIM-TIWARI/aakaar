// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Demo Provider
// Fully deterministic, no API keys, no network. Returns the canonical
// wardrobe analysis. This is synthetic data for demonstration purposes only.
// ──────────────────────────────────────────────────────────────────────────────

import type { AnalysisResult, Job } from "@/lib/types";
import { DEMO_JOB_ID } from "@/lib/data/demo-scenario";

const DEMO_ANALYSIS_VERSION = "demo-v1.0.0";

// ── Demo analysis for the wardrobe scenario ───────────────────────────────────

function getDemoWardrobeAnalysis(): AnalysisResult {
  return {
    providerUsed: "demo",
    analysisVersion: DEMO_ANALYSIS_VERSION,
    summary:
      "Two key mismatches detected between customer expectation and maker interpretation. The most consequential gap is around 'walnut finish', the term could mean real solid wood, a walnut veneer, or a walnut-look laminate, and each has a different cost and feel; a clarifying question is needed before any quote is accepted. Installation cost inclusion also varies between quotes. Recommend resolving the finish question first.",
    ambiguities: [
      {
        fieldKey: "material_finish",
        fieldLabel: "Material & Finish",
        interpretationA:
          "Customer said 'walnut finish' while sharing a reference photo. One reading is that they expect solid walnut wood or a real-wood veneer; another is that they may be fine with a walnut-look laminate, the phrase alone does not settle this.",
        interpretationB:
          "Sharma Carpentry quoted '18mm commercial ply + walnut-colour laminate'. Looks similar at first glance, but is a laminate sheet on plywood.",
        consequence:
          "If unresolved: customer receives laminate wardrobe while expecting wood. High risk of rejection on delivery, dispute over quality, and potential refund claim.",
        materialImpact: "high",
        clarificationQuestion:
          "When you said 'walnut finish', were you thinking of solid walnut wood, a thin walnut veneer, or a laminate that looks like walnut? The price difference can be ₹5,000 to ₹15,000.",
        sourceIds: ["src_customer_brief", "src_sharma_quote"],
      },
      {
        fieldKey: "installation",
        fieldLabel: "Fitting / Installation",
        interpretationA:
          "Customer explicitly said 'fitting included honi chahiye', expects installation to be part of the price.",
        interpretationB:
          "Verma Furniture Works' quote charges ₹2,000 for installation and ₹1,500 for transport separately (₹3,500 not in base price). Sharma includes installation in base price.",
        consequence:
          "If customer chooses Verma expecting Sharma-style inclusion, they'll face an unexpected ₹3,500 charge at delivery, a common reason for disputes in custom furniture.",
        materialImpact: "medium",
        clarificationQuestion:
          "The Verma Furniture Works quote doesn't include installation or transport, that's ₹3,500 extra beyond the base price. Is this acceptable, or do you need installation included like Sharma's quote?",
        sourceIds: ["src_customer_brief", "src_verma_quote"],
      },
    ],
    suggestedSpecFields: [
      {
        key: "material_finish",
        label: "Material & Finish",
        labelHindi: "सामग्री और फिनिश",
        status: "possible_mismatch",
        customerMeaning: "Walnut look, like the reference photo",
        makerMeaning: "Walnut-colour laminate on 18mm commercial plywood",
        notes: "HIGH priority: clarify before quote acceptance",
      },
      {
        key: "installation",
        label: "Fitting / Installation",
        labelHindi: "फिटिंग",
        status: "possible_mismatch",
        customerMeaning: "Included in price, no extra charge",
        makerMeaning: "Varies: Sharma includes it, Verma charges ₹3,500 extra",
        notes: "MEDIUM priority: affects final cost comparison",
      },
      {
        key: "drawers",
        label: "Number of Drawers",
        labelHindi: "दराज की संख्या",
        value: 4,
        status: "changed",
        notes: "Revised from 3 to 4 on Oct 5",
      },
      {
        key: "deadline",
        label: "Delivery Deadline",
        labelHindi: "डिलीवरी की समय सीमा",
        value: "Before Diwali (Oct 20, 2026)",
        status: "unclear",
        customerMeaning: "Before Diwali, firm deadline",
        makerMeaning: "Neither maker has confirmed this timeline in writing",
        notes: "Neither maker has confirmed delivery by Oct 20",
      },
    ],
  };
}

// ── Generic demo analysis for non-demo jobs ───────────────────────────────────

function getGenericDemoAnalysis(job: Job): AnalysisResult {
  return {
    providerUsed: "demo",
    analysisVersion: DEMO_ANALYSIS_VERSION,
    summary: `Starter checklist for "${job.title}". The demo provider does not read what was said on this job, so nothing below is a finding about the customer's or maker's words. Connect a reasoning provider in .env.local to get questions drawn from the actual statements.`,
    ambiguities: [
      {
        fieldKey: "scope",
        fieldLabel: "Scope of Work (starter question)",
        interpretationA:
          "Not analysed. The demo provider has not read the customer's statement.",
        interpretationB:
          "Not analysed. The demo provider has not read the maker's statement or quote.",
        consequence:
          "Unclear scope is a common source of disagreement in custom work. This is a general prompt, not a finding about this job.",
        materialImpact: "medium",
        clarificationQuestion:
          "Can you list the three most important things the finished work must do or have, and the one thing that cannot be compromised?",
        sourceIds: [],
      },
    ],
    suggestedSpecFields: [
      {
        key: "scope",
        label: "Scope of Work",
        status: "unclear",
        notes: "Starter field. Needs explicit agreement from both parties.",
      },
    ],
  };
}

// ── Public function ───────────────────────────────────────────────────────────

/**
 * Run demo analysis. For the canonical wardrobe demo job, returns the
 * pre-authored detailed analysis. For other jobs, returns a generic demo result.
 *
 * This function is synchronous and deterministic, no network calls.
 */
export function runDemoAnalysis(job: Job): AnalysisResult {
  if (job.id === DEMO_JOB_ID || job.isDemo) {
    return getDemoWardrobeAnalysis();
  }
  return getGenericDemoAnalysis(job);
}