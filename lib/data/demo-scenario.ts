// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR — Canonical Demo Scenario
// The seeded wardrobe job — fully deterministic, no API keys needed.
// This is SYNTHETIC data created for demonstration purposes only.
// ──────────────────────────────────────────────────────────────────────────────

import type { Job } from "@/lib/types";

export const DEMO_JOB_ID = "demo_wardrobe_001";

export const DEMO_JOB: Job = {
  id: DEMO_JOB_ID,
  title: "Six-foot Walnut Wardrobe",
  jobType: "custom_furniture",
  status: "samajh",
  customerName: "Priya Mehta (Demo)",
  makerName: "Sharma Carpentry Works (Demo)",
  description:
    "Bhai, photo jaisa six-foot wardrobe chahiye. Walnut finish, teen drawers, andar shelves. Budget thirty thousand ke aas-paas hai. Diwali se pehle chahiye, fitting included honi chahiye.",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-08T14:30:00.000Z",
  isDemo: true,
  demoLabel: "Wardrobe — Demo",

  sources: [
    {
      id: "src_customer_brief",
      kind: "transcript",
      label: "Customer voice brief",
      excerpt:
        "Bhai, photo jaisa six-foot wardrobe chahiye. Walnut finish, teen drawers, andar shelves. Budget thirty thousand ke aas-paas hai. Diwali se pehle chahiye, fitting included honi chahiye.",
      capturedAt: "2026-10-01T10:00:00.000Z",
      party: "customer",
      confidence: 0.96,
    },
    {
      id: "src_sharma_quote",
      kind: "quote_document",
      label: "Sharma Carpentry — Written Quote",
      excerpt:
        "Six-door wardrobe, 6ft × 3ft × 2ft. Material: 18mm commercial ply + walnut-colour laminate. 3 drawers + 4 shelves. Transport extra. Installation included.",
      capturedAt: "2026-10-02T09:00:00.000Z",
      party: "maker",
    },
    {
      id: "src_verma_quote",
      kind: "quote_document",
      label: "Verma Furniture Works — Written Quote",
      excerpt:
        "Wardrobe 6ft. MDF board. 3 drawers. Delivery charges: ₹1,500.",
      capturedAt: "2026-10-02T11:00:00.000Z",
      party: "maker",
    },
    {
      id: "src_revision_call",
      kind: "transcript",
      label: "Customer revision request (call)",
      excerpt: "Actually bhai, teen ki jagah chaar drawers rakhna. Extra cost batao.",
      capturedAt: "2026-10-05T16:00:00.000Z",
      party: "customer",
      confidence: 0.92,
    },
    {
      id: "src_delivery_complaint",
      kind: "transcript",
      label: "Customer complaint on delivery",
      excerpt: "Bhai, teen hi drawers aaye hain. Maine chaar maange the na.",
      capturedAt: "2026-10-08T14:00:00.000Z",
      party: "customer",
      confidence: 0.97,
    },
  ],

  quotes: [
    {
      id: "quote_sharma",
      makerName: "Sharma Carpentry Works",
      makerContact: "sharma@demo.example",
      submittedAt: "2026-10-02T09:00:00.000Z",
      status: "received",
      lines: [
        {
          id: "ql_s1",
          description: "Six-door wardrobe (6ft × 3ft × 2ft) — 18mm commercial ply + walnut-colour laminate",
          amountRs: 28000,
          isKnown: true,
        },
        {
          id: "ql_s2",
          description: "Transportation to site",
          amountRs: 1200,
          isKnown: true,
        },
        {
          id: "ql_s3",
          description: "Installation & fitting",
          amountRs: 0,
          isKnown: true,
          notes: "Included in base price",
        },
      ],
      unknownItems: [],
      nonEquivalentItems: ["Voice biometrics lock (not in Verma quote)"],
      knownTotalRs: 29200,
      notes: "Installation included. Walnut finish is laminate, not solid wood.",
      sourceIds: ["src_sharma_quote"],
    },
    {
      id: "quote_verma",
      makerName: "Verma Furniture Works",
      makerContact: "verma@demo.example",
      submittedAt: "2026-10-02T11:00:00.000Z",
      status: "received",
      lines: [
        {
          id: "ql_r1",
          description: "Wardrobe 6ft — MDF board, 3 drawers",
          amountRs: 26500,
          isKnown: true,
        },
        {
          id: "ql_r2",
          description: "Installation charges",
          amountRs: 2000,
          isKnown: true,
        },
        {
          id: "ql_r3",
          description: "Delivery charges",
          amountRs: 1500,
          isKnown: true,
        },
      ],
      unknownItems: ["Shelf hardware (not priced)", "Handle/knobs (not mentioned)"],
      nonEquivalentItems: ["Shelves not specified in Verma quote"],
      knownTotalRs: 30000,
      notes: "MDF board — lighter but less durable than ply. Shelves and hardware not confirmed.",
      sourceIds: ["src_verma_quote"],
    },
  ],

  ambiguities: [
    {
      id: "amb_finish",
      fieldKey: "material_finish",
      fieldLabel: "Finish / Material",
      interpretationA:
        "Customer said 'walnut finish' while sharing a reference photo. One reading is they mean real walnut wood (solid or veneer); another is that 'walnut finish' simply means a walnut-look surface — the phrase alone does not settle which.",
      interpretationB:
        "Sharma quoted 'walnut-colour laminate on commercial ply' — looks similar but is laminate, not wood.",
      consequence:
        "Customer may expect solid or veneer wood; maker will deliver laminate. The look is similar, the feel and longevity are different. Customer could reject delivery citing mismatch.",
      materialImpact: "high",
      clarificationQuestion:
        "When you said 'walnut finish', were you imagining real walnut wood, a veneer, or a laminate that looks like walnut?",
      sourceIds: ["src_customer_brief", "src_sharma_quote"],
      resolved: false,
    },
    {
      id: "amb_install",
      fieldKey: "installation",
      fieldLabel: "Fitting / Installation",
      interpretationA:
        "Customer said 'fitting included honi chahiye' — expects transport + installation for free.",
      interpretationB:
        "Verma Furniture Works charges ₹2,000 for installation separately, plus ₹1,500 for transport.",
      consequence:
        "If customer accepts Verma's quote expecting installation included (like Sharma), they will be surprised by ₹3,500 in extra charges at delivery.",
      materialImpact: "medium",
      clarificationQuestion:
        "Verma's quote shows ₹2,000 installation + ₹1,500 transport charged separately. Did you expect both to be included in the base price?",
      sourceIds: ["src_customer_brief", "src_verma_quote"],
      resolved: false,
    },
  ],

  kaamNaksha: {
    version: 2,
    createdAt: "2026-10-01T10:00:00.000Z",
    lastUpdatedAt: "2026-10-05T16:00:00.000Z",
    completeness: 40,
    confirmations: [],
    fields: [
      {
        key: "dimensions",
        label: "Dimensions",
        labelHindi: "माप",
        value: "6ft height × 3ft width × 2ft depth",
        agreedValue: "6ft height × 3ft width × 2ft depth",
        customerMeaning: "Six-foot tall wardrobe like the photo",
        makerMeaning: "6ft × 3ft × 2ft as per quote",
        status: "confirmed",
        sourceIds: ["src_customer_brief", "src_sharma_quote"],
        confirmationBy: ["both"],
        lastChangedAt: "2026-10-02T09:00:00.000Z",
      },
      {
        key: "material_finish",
        label: "Material & Finish",
        labelHindi: "सामग्री और फिनिश",
        value: "Walnut finish",
        proposedValue: "18mm commercial ply + walnut-colour laminate",
        customerMeaning: "Walnut look — like the photo, could be real wood",
        makerMeaning: "Walnut-colour laminate on 18mm commercial plywood",
        status: "possible_mismatch",
        sourceIds: ["src_customer_brief", "src_sharma_quote"],
        confirmationBy: ["customer", "maker"],
        lastChangedAt: "2026-10-02T09:00:00.000Z",
        notes: "HIGH: Customer likely assumes wood; maker quotes laminate",
      },
      {
        key: "drawers",
        label: "Number of Drawers",
        labelHindi: "दराज की संख्या",
        value: 4,
        agreedValue: 4,
        customerMeaning: "Four drawers (revised from original 3)",
        makerMeaning: "Four drawers confirmed after revision call",
        status: "changed",
        sourceIds: ["src_customer_brief", "src_revision_call"],
        confirmationBy: ["both"],
        lastChangedAt: "2026-10-05T16:30:00.000Z",
        notes: "Originally 3 drawers; revised to 4 on Oct 5",
      },
      {
        key: "shelves",
        label: "Internal Shelves",
        labelHindi: "अंदर की अलमारियाँ",
        value: "Yes — andar shelves",
        customerMeaning: "Some shelves inside, exact number unspecified",
        makerMeaning: "4 shelves per Sharma quote",
        status: "unclear",
        sourceIds: ["src_customer_brief", "src_sharma_quote"],
        confirmationBy: ["customer"],
        notes: "Exact shelf count and configuration not confirmed",
      },
      {
        key: "budget",
        label: "Budget",
        labelHindi: "बजट",
        value: "~₹30,000",
        customerMeaning: "Around thirty thousand — flexible by a little",
        makerMeaning: "Sharma: ₹29,200 known total. Verma: ₹30,000 known total.",
        status: "proposed",
        sourceIds: ["src_customer_brief"],
        confirmationBy: ["customer", "maker"],
      },
      {
        key: "installation",
        label: "Installation / Fitting",
        labelHindi: "फिटिंग",
        value: "Included",
        customerMeaning: "Fitting included — no extra charge",
        makerMeaning: "Sharma: included. Verma: ₹2,000 extra.",
        status: "possible_mismatch",
        sourceIds: ["src_customer_brief", "src_sharma_quote", "src_verma_quote"],
        confirmationBy: ["customer", "maker"],
        notes: "MEDIUM: Depends on which maker is chosen",
      },
      {
        key: "deadline",
        label: "Deadline",
        labelHindi: "समय सीमा",
        value: "Before Diwali",
        customerMeaning: "Before Diwali 2026 (Oct 20)",
        makerMeaning: "Not confirmed — makers haven't stated delivery timeline",
        status: "unclear",
        sourceIds: ["src_customer_brief"],
        confirmationBy: ["maker"],
        notes: "Neither maker has confirmed Diwali deadline in writing",
      },
    ],
  },

  revisions: [
    {
      id: "rev_001",
      proposedAt: "2026-10-05T16:00:00.000Z",
      proposedBy: "customer",
      fieldKey: "drawers",
      fieldLabel: "Number of Drawers",
      previousValue: 3,
      newValue: 4,
      reason: "Customer wants one extra drawer for storage",
      costImpactRs: 1500,
      timeImpactDays: 1,
      status: "accepted",
      acceptedAt: "2026-10-05T16:30:00.000Z",
      acceptedBy: "maker",
    },
  ],

  outcomefindings: [
    {
      id: "finding_001",
      fieldKey: "drawers",
      fieldLabel: "Number of Drawers",
      agreedValue: 4,
      observedValue: 3,
      discrepancy:
        "Customer received 3 drawers. The agreed spec (after revision on Oct 5) was 4 drawers. This matches the original brief but NOT the confirmed revision.",
      severity: "high",
      evidenceSourceIds: ["src_delivery_complaint", "src_revision_call"],
      discoveredAt: "2026-10-08T14:00:00.000Z",
      status: "open",
    },
  ],
};
