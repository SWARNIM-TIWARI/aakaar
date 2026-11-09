// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, one bilingual vocabulary
//
// Every Hindi or Hinglish name the product uses is defined here once, with a plain
// English meaning, so the screens never use a term without explaining it and never
// name the same thing two ways. Hindi is written in Devanagari, the Latin spelling is
// how people type it. Nothing here translates what a person actually said: spoken and
// typed statements are always shown in the language they were given in.
// ──────────────────────────────────────────────────────────────────────────────

export interface Term {
  /** The name as the product writes it (Latin). */
  name: string;
  /** The same name in Devanagari. */
  hindi: string;
  /** What it means, in a few plain words. */
  gloss: string;
}

/** The four stages of a job. */
export const STAGE_TERMS = {
  sauda: { name: "SAUDA", hindi: "सौदा", gloss: "Compare the offers" },
  samajh: { name: "SAMAJH", hindi: "समझ", gloss: "Find what may be understood differently" },
  vaada: { name: "VAADA", hindi: "वादा", gloss: "Agree the work, in writing" },
  kya_hua: { name: "KYA HUA?", hindi: "क्या हुआ?", gloss: "Check what was delivered" },
} as const satisfies Record<string, Term>;

/** The product's own names for its things. */
export const TERMS = {
  baatKaFarq: { name: "BAAT KA FARQ", hindi: "बात का फ़र्क", gloss: "Where what was said may not mean the same to both sides" },
  kaamNaksha: { name: "KAAM-NAKSHA", hindi: "काम-नक्शा", gloss: "The shared written plan of the work" },
  kaamRegister: { name: "KAAM REGISTER", hindi: "काम रजिस्टर", gloss: "Every job in one list" },
} as const satisfies Record<string, Term>;

/** The labelled parts of one BAAT KA FARQ finding, in reading order. */
export const FINDING_TERMS = {
  baat: { name: "BAAT", hindi: "बात", gloss: "What each side said" },
  farq: { name: "FARQ", hindi: "फ़र्क", gloss: "Where the two may differ" },
  asar: { name: "ASAR", hindi: "असर", gloss: "Why it matters" },
  source: { name: "SOURCE", hindi: "स्रोत", gloss: "Where the words came from" },
  aglaSawal: { name: "AGLA SAWAL", hindi: "अगला सवाल", gloss: "The next question to ask" },
  jawab: { name: "JAWAB", hindi: "जवाब", gloss: "The answer you got" },
  status: { name: "STATUS", hindi: "स्थिति", gloss: "Where this finding stands" },
} as const satisfies Record<string, Term>;

/** The two sides of a job. "Role" because AAKAAR does not check who anyone is. */
export const ROLE_TERMS = {
  customer: { name: "Customer", hindi: "ग्राहक", gloss: "Whoever wants the work done" },
  maker: { name: "Maker", hindi: "कारीगर", gloss: "Whoever does the work" },
} as const satisfies Record<string, Term>;

/** How a field in KAAM-NAKSHA came to be, and who has marked it. Separate on purpose. */
export const SPEC_ORIGIN_LABEL = {
  suggested: "Suggested by analysis",
  entered: "Entered by a person",
  from_answer: "From an answered question",
} as const;

/** Where a piece of text in the product comes from. These are never merged. */
export const PROVENANCE_LABEL = {
  recorded: "Recorded words",
  inferred: "AAKAAR's reading",
  clarified: "Clarified by a person",
  unresolved: "Left unresolved",
} as const;