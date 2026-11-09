// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR, Values: what a number or phrase in a field actually means
// Deterministic helpers. No AI. They exist so that "5,000" is read as money when
// the people were talking about money, so that a yes/no answer is not mistaken for
// a delivered amount, and so that a rule such as "lowest price wins" never becomes
// a material or a quantity in the specification.
// ──────────────────────────────────────────────────────────────────────────────

export type ValueKind = "currency" | "quantity" | "measurement" | "material" | "finish" | "date" | "text";

export const VALUE_KINDS: ValueKind[] = ["currency", "quantity", "measurement", "material", "finish", "date", "text"];

export const VALUE_KIND_INFO: Record<ValueKind, { label: string; hindi: string; hint: string }> = {
  currency: { label: "Amount", hindi: "रकम", hint: "Money, in rupees" },
  quantity: { label: "Quantity", hindi: "गिनती", hint: "How many" },
  measurement: { label: "Measurement", hindi: "नाप", hint: "A size, length or weight with its unit" },
  material: { label: "Material", hindi: "माल", hint: "What it is made of" },
  finish: { label: "Finish", hindi: "फ़िनिश", hint: "Surface, colour or look" },
  date: { label: "Date", hindi: "तारीख़", hint: "When" },
  text: { label: "Text", hindi: "विवरण", hint: "Any other detail, in words" },
};

// ── Numbers written as words ─────────────────────────────────────────────────

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  ek: 1, do: 2, teen: 3, tin: 3, chaar: 4, char: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7,
  aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, bees: 20, tees: 30, chalis: 40, pachas: 50,
  saath: 60, sattar: 70, assi: 80, nabbe: 90,
};
const MULTIPLIER: Record<string, number> = {
  hundred: 100, sau: 100, thousand: 1_000, hazaar: 1_000, hazar: 1_000, hajar: 1_000,
  lakh: 100_000, lakhs: 100_000, lac: 100_000, crore: 10_000_000, crores: 10_000_000,
};

/** Read a short run of number words ("paanch hazaar", "thirty thousand"). Returns null if the run is not a number. */
function wordsToNumber(tokens: string[]): number | null {
  if (tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  let sawNumber = false;
  for (const t of tokens) {
    if (t in SMALL) {
      current += SMALL[t];
      sawNumber = true;
    } else if (t in MULTIPLIER) {
      const m = MULTIPLIER[t];
      if (m === 100) {
        current = (current || 1) * 100;
      } else {
        total += (current || 1) * m;
        current = 0;
      }
      sawNumber = true;
    } else {
      return null;
    }
  }
  return sawNumber ? total + current : null;
}

// ── Reading a value as a number with its meaning ─────────────────────────────

export type Dimension = "money" | "length" | "mass" | "count" | "plain";

export interface ParsedNumber {
  /** The number as read, in the unit written (₹ for money, as written for others). */
  amount: number;
  dimension: Dimension;
  /** The amount in a base unit: rupees, millimetres, grams, a plain count. */
  base: number;
  /** The unit as written, if any. */
  unit?: string;
  /** Money in a currency other than rupees. */
  otherCurrency?: boolean;
}

const MONEY_MARK = /₹|\brs\b\.?|\binr\b|\brupee[s]?\b|\brupaye\b|\brupya\b|\brupaiye\b|\/-/i;
const OTHER_CURRENCY = /\$|€|£|\busd\b|\beur\b|\bgbp\b|\bdollars?\b/i;

const LENGTH_UNITS: [RegExp, number][] = [
  [/^(mm|millimet(?:re|er)s?)$/, 1],
  [/^(cm|centimet(?:re|er)s?)$/, 10],
  [/^(m|met(?:re|er)s?)$/, 1000],
  [/^(ft|feet|foot|fut)$/, 304.8],
  [/^(in|inch|inches|")$/, 25.4],
];
const MASS_UNITS: [RegExp, number][] = [
  [/^(g|gm|gram|grams)$/, 1],
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/, 1000],
];
const COUNT_UNITS = /^(pc|pcs|piece|pieces|nos|no|units?|set|sets|drawers?|doors?|shelves|shelf|panels?)$/;

const MAGNITUDE_WORD = /^(k|thousand|hazaar|hazar|hajar|lakh|lakhs|lac|crore|crores|cr)$/;
const MAGNITUDE_VALUE: Record<string, number> = {
  k: 1_000, thousand: 1_000, hazaar: 1_000, hazar: 1_000, hajar: 1_000,
  lakh: 100_000, lakhs: 100_000, lac: 100_000, crore: 10_000_000, crores: 10_000_000, cr: 10_000_000,
};

/**
 * Read the first number in a phrase, with what it measures.
 * "₹4,400", "Rs 4400/-", "paanch hazaar rupaye" => money. "6 ft", "72 in" => length.
 * "four", "4 drawers" => a plain count. Returns null when the phrase has no number.
 */
export function parseNumeric(input: unknown): ParsedNumber | null {
  const text = String(input ?? "").toLowerCase().trim();
  if (!text) return null;
  const cleaned = text.replace(/(\d),(?=\d{2,3}\b)/g, "$1");
  const hasMoney = MONEY_MARK.test(cleaned);
  const otherCurrency = OTHER_CURRENCY.test(cleaned);

  let amount: number | null = null;
  let rest = "";

  // Digits first: "4400", "4.5", "5k", "2 lakh"
  const dm = cleaned.match(/(\d+(?:\.\d+)?)\s*([a-z"]+)?/);
  if (dm) {
    amount = Number(dm[1]);
    const word = dm[2] ?? "";
    if (word && MAGNITUDE_WORD.test(word)) {
      amount *= MAGNITUDE_VALUE[word];
      rest = "";
    } else {
      rest = word;
    }
    if (word === "" && cleaned.slice(cleaned.indexOf(dm[1]) + dm[1].length).trimStart().startsWith('"')) rest = '"';
  } else {
    // Number words: take the longest run of number words, then the unit word after it.
    const tokens = cleaned.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    let best: { n: number; end: number } | null = null;
    for (let i = 0; i < tokens.length; i++) {
      let j = i;
      while (j < tokens.length && (tokens[j] in SMALL || tokens[j] in MULTIPLIER)) j++;
      if (j > i) {
        const n = wordsToNumber(tokens.slice(i, j));
        if (n !== null) {
          best = { n, end: j };
          break;
        }
      }
    }
    if (!best) return null;
    amount = best.n;
    rest = tokens[best.end] ?? "";
  }
  if (amount === null || !Number.isFinite(amount)) return null;

  if (hasMoney || otherCurrency) {
    return { amount, dimension: "money", base: amount, unit: otherCurrency ? "other" : "INR", otherCurrency: otherCurrency || undefined };
  }
  for (const [re, factor] of LENGTH_UNITS) {
    if (re.test(rest)) return { amount, dimension: "length", base: amount * factor, unit: rest };
  }
  for (const [re, factor] of MASS_UNITS) {
    if (re.test(rest)) return { amount, dimension: "mass", base: amount * factor, unit: rest };
  }
  if (COUNT_UNITS.test(rest)) return { amount, dimension: "count", base: amount, unit: rest };
  return { amount, dimension: "plain", base: amount, unit: rest || undefined };
}

// ── Dates ────────────────────────────────────────────────────────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A phrase that is only a date, as ISO yyyy-mm-dd. Returns null for anything else ("before Diwali"). */
export function parsePureDate(input: unknown): string | null {
  const t = String(input ?? "").toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // day first, as written in India
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$/);
  if (m && MONTHS.includes(m[2])) return `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})$/);
  if (m && MONTHS.includes(m[1])) return `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

// ── Money formatting ─────────────────────────────────────────────────────────

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

/** A value shown the way it should be read, or undefined when no reading is needed. */
export function readAs(value: string, kind: ValueKind | undefined): string | undefined {
  if (kind !== "currency") return undefined;
  const p = parseNumeric(value);
  if (!p || p.dimension !== "money" || p.otherCurrency) return undefined;
  const shown = formatINR(p.base);
  const compact = value.replace(/\s/g, "");
  return compact === shown.replace(/\s/g, "") ? undefined : shown;
}

// ── Comparing an agreed value with a reported one ────────────────────────────

export type ComparisonResult = "match" | "difference" | "cannot_compare";

export interface Comparison {
  result: ComparisonResult;
  /** A plain sentence. Present when the values cannot be compared. */
  reason?: string;
}

const YES_NO = /^(yes|yep|yeah|no|nope|ok|okay|ok\.?|haan|han|ha|haa|nahi|nahin|na|theek|thik|theek hai|thik hai|sahi|done|fine|correct|right|true|false|confirmed|agreed|good|all good|sab theek|sab thik|pura|ho gaya|hogaya)[.!\s]*$/i;

export function isYesNoAnswer(text: unknown): boolean {
  return YES_NO.test(String(text ?? "").trim());
}

const NUMBER_WORD_TO_DIGIT: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  ek: "1", teen: "3", chaar: "4", paanch: "5", panch: "5", chhe: "6", saat: "7", aath: "8", nau: "9", das: "10",
};

function words(v: unknown): string[] {
  return String(v ?? "")
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[^a-z0-9.\sऀ-ॿ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORD_TO_DIGIT[w] ?? w);
}

const DIMENSION_NAME: Record<Dimension, string> = {
  money: "an amount of money",
  length: "a length or size",
  mass: "a weight",
  count: "a count",
  plain: "a number",
};

/**
 * Compare an agreed value with a reported one. Three outcomes, never two:
 * they match, they differ, or they cannot be compared (for example "yes" against
 * an agreed price). A value that cannot be compared is never called a difference.
 */
export function compareReport(agreed: unknown, reported: unknown): Comparison {
  const a = String(agreed ?? "").trim();
  const r = String(reported ?? "").trim();
  if (!a) return { result: "cannot_compare", reason: "There is no agreed value to compare with." };
  if (!r) return { result: "cannot_compare", reason: "Nothing was reported." };

  const pa = parseNumeric(a);
  const pr = parseNumeric(r);

  // Whole dates compare as dates.
  const da = parsePureDate(a);
  const dr = parsePureDate(r);
  if (da && dr) return { result: da === dr ? "match" : "difference" };
  if (da && !dr && (isYesNoAnswer(r) || !pr)) {
    return { result: "cannot_compare", reason: `The agreed value is a date (${a}). The report "${r}" does not give a date. Ask on which date it was actually delivered.` };
  }

  // The agreed value is a number of some kind: the report must be the same kind of number.
  const agreedIsPureNumber = pa && words(a).length <= 4 && !/[a-z]{4,}/.test(a.replace(/rupees?|rupaye|hazaar|thousand|lakh|crore|inches|feet|metres?|meters?|pieces|drawers?|doors?|shelves|units?|grams?|kilos?|kilograms?/gi, ""));
  if (pa && agreedIsPureNumber) {
    const agreedWhat = DIMENSION_NAME[pa.dimension];
    if (isYesNoAnswer(r) || !pr) {
      return {
        result: "cannot_compare",
        reason: `The agreed value is ${agreedWhat} (${a}). The report "${r}" does not state one, so the two cannot be compared. Ask what it actually was.`,
      };
    }
    if (pa.dimension === "money" || pr.dimension === "money") {
      if (pa.dimension !== pr.dimension && !(pa.dimension === "money" && pr.dimension === "plain" && !pr.unit)) {
        return { result: "cannot_compare", reason: `The agreed value is ${agreedWhat} (${a}) but the report "${r}" reads as ${DIMENSION_NAME[pr.dimension]}.` };
      }
      if (pa.otherCurrency || pr.otherCurrency) {
        if (pa.otherCurrency && pr.otherCurrency && pa.base === pr.base) return { result: "match" };
        return { result: "cannot_compare", reason: "The two values are in different currencies, so they cannot be compared." };
      }
      return { result: pa.base === pr.base ? "match" : "difference" };
    }
    if (pa.dimension === "length" || pa.dimension === "mass") {
      if (pr.dimension !== pa.dimension) {
        return {
          result: "cannot_compare",
          reason: pr.dimension === "plain" && !pr.unit
            ? `The agreed value is ${agreedWhat} (${a}) but the report "${r}" gives no unit. Say whether it is feet, inches, millimetres or another unit.`
            : `The agreed value is ${agreedWhat} (${a}) but the report "${r}" reads as ${DIMENSION_NAME[pr.dimension]}.`,
        };
      }
      return { result: Math.abs(pa.base - pr.base) < 0.5 ? "match" : "difference" };
    }
    // Counts and plain numbers. A unit word like "drawers" does not change a count.
    if ((pa.dimension === "count" || pa.dimension === "plain") && (pr.dimension === "count" || pr.dimension === "plain")) {
      return { result: pa.base === pr.base ? "match" : "difference" };
    }
    return { result: "cannot_compare", reason: `The agreed value is ${agreedWhat} (${a}) but the report "${r}" reads as ${DIMENSION_NAME[pr.dimension]}.` };
  }

  // Words against words.
  if (isYesNoAnswer(r)) {
    return {
      result: "cannot_compare",
      reason: `The report "${r}" is a yes or no. It does not say what was delivered, so it cannot be compared with "${a}". Ask what was actually delivered.`,
    };
  }
  const wa = words(a);
  const wr = words(r);
  if (wa.length === 0 || wr.length === 0) return { result: "cannot_compare", reason: "The values could not be read for comparison." };
  const same = wa.join(" ") === wr.join(" ") || [...wa].sort().join(" ") === [...wr].sort().join(" ");
  return { result: same ? "match" : "difference" };
}

// ── What kind of value is this field? ────────────────────────────────────────

const LABEL_CURRENCY = /\b(price|cost|budget|rate|amount|advance|payment|total|fee|fees|charges?|rupee|rupees|paisa|kimat|daam|quote|discount|token)\b|₹/i;
const LABEL_DATE = /\b(date|deadline|delivery|deliver|due|tarikh|by when|handover|before|after|when)\b/i;
const LABEL_MEASURE = /\b(size|width|height|length|depth|thickness|dimension|dimensions|measurement|weight|diameter|nap|lambai|chaudai)\b/i;
const LABEL_QUANTITY = /\b(number of|count|qty|quantity|how many|pieces|units|nos|no\. of)\b/i;
const LABEL_FINISH = /\b(finish|polish|paint|colou?r|shade|texture|matt|matte|gloss|lamination|lacquer|look)\b/i;
const LABEL_MATERIAL = /\b(material|plywood|board|wood|fabric|metal|steel|glass|laminate|veneer|core|carcass|hardware|hinge|channel)\b/i;

/** Best guess at what kind of value a field holds. A person can always change it. */
export function inferValueKind(label: string, value: unknown): ValueKind {
  const v = String(value ?? "").trim();
  const parsed = parseNumeric(v);
  if (parsed && parsed.dimension === "money") return "currency";
  if (parsePureDate(v)) return "date";
  if (LABEL_FINISH.test(label)) return "finish";
  if (LABEL_MATERIAL.test(label) && !LABEL_QUANTITY.test(label)) return "material";
  if (LABEL_CURRENCY.test(label)) return "currency";
  if (parsed && (parsed.dimension === "length" || parsed.dimension === "mass")) return "measurement";
  if (LABEL_MEASURE.test(label)) return "measurement";
  if (LABEL_QUANTITY.test(label)) return "quantity";
  if (LABEL_DATE.test(label) && (parsePureDate(v) || /\b(\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|diwali|holi|eid|week|month|din|hafta)\b/i.test(v))) return "date";
  if (parsed && (parsed.dimension === "count" || (parsed.dimension === "plain" && /^\d+$/.test(v)))) return "quantity";
  return "text";
}

// ── Rules for choosing between quotes are not details of the work ─────────────

const DECISION_RULE =
  /\b(lowest|cheapest|least|minimum|best)\s+(price|quote|rate|bid|cost|offer)\b|\bl1\b|\bprice\s+wins\b|\bwhoever\b[^.]*\b(lowest|cheapest)\b|\b(decision|selection|choosing)\s+(rule|criteri(a|on))\b|\bwinner\b/i;

/** True when a "field" is really a rule for choosing between makers, not a detail of the work. */
export function isDecisionRule(label: string, value: unknown): boolean {
  return DECISION_RULE.test(`${label} ${String(value ?? "")}`);
}

// ── Numbers that were really money ───────────────────────────────────────────

/**
 * Does this number appear in the given texts right beside a money word or sign?
 * Used so that "paanch hazaar" in a statement about Diwali patakhe stays an amount
 * and is never turned into a number of fireworks.
 */
export function mentionedAsMoney(amount: number, texts: string[]): boolean {
  for (const raw of texts) {
    const text = raw.toLowerCase().replace(/(\d),(?=\d{2,3}\b)/g, "$1");
    // digits with an optional magnitude word
    const re = /(\d+(?:\.\d+)?)\s*(k|thousand|hazaar|hazar|lakh|lac|crore|cr)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const n = Number(m[1]) * (m[2] ? MAGNITUDE_VALUE[m[2]] : 1);
      if (n !== amount) continue;
      const near = text.slice(Math.max(0, m.index - 16), m.index + m[0].length + 16);
      if (MONEY_MARK.test(near) || /\b(budget|rate|price|kimat|daam|total|advance|cost)\b/.test(near)) return true;
    }
    // number words, e.g. "paanch hazaar rupaye"
    const tokens = text.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      let j = i;
      while (j < tokens.length && (tokens[j] in SMALL || tokens[j] in MULTIPLIER)) j++;
      if (j > i) {
        const n = wordsToNumber(tokens.slice(i, j));
        if (n === amount) {
          const near = tokens.slice(Math.max(0, i - 3), j + 3).join(" ");
          if (MONEY_MARK.test(near) || /\b(budget|rate|price|kimat|daam|total|advance|cost)\b/.test(near)) return true;
        }
        i = j;
      }
    }
  }
  return false;
}

/** A per-item rate or unit price that the sources never state. Never invent one. */
const RATE_LABEL = /\b(per\s*(piece|pc|item|unit|pack|box|kg|sq\.?\s*ft)|each|rate\s*per|unit\s*(price|rate)|price\s*per|per\s*piece)\b|\/\s*(pc|piece|unit|item)\b/i;

export function looksLikeInventedRate(label: string, value: unknown, sourceTexts: string[]): boolean {
  if (!RATE_LABEL.test(`${label} ${String(value ?? "")}`)) return false;
  const parsed = parseNumeric(value);
  if (!parsed) return true; // a "rate" with no figure carries nothing the sources said
  const hay = sourceTexts.join(" \n ").toLowerCase().replace(/(\d),(?=\d{2,3}\b)/g, "$1");
  // The figure must appear in the sources together with a per-unit word, or it was derived.
  const figure = String(Math.round(parsed.base));
  const idx = hay.indexOf(figure);
  if (idx === -1) return true;
  const near = hay.slice(Math.max(0, idx - 30), idx + figure.length + 30);
  return !/\b(per|each|every|har)\b/.test(near);
}