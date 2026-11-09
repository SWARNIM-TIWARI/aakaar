import {
  parseNumeric,
  compareReport,
  isYesNoAnswer,
  parsePureDate,
  inferValueKind,
  isDecisionRule,
  mentionedAsMoney,
  looksLikeInventedRate,
  readAs,
} from "@/lib/spec/values";

describe("reading numbers with their meaning", () => {
  it("reads rupee amounts written in many ways as the same money", () => {
    for (const t of ["₹4,400", "Rs. 4400", "INR 4,400", "4400 rupees", "4,400/-", "4400 rs"]) {
      const p = parseNumeric(t);
      expect(p?.dimension).toBe("money");
      expect(p?.base).toBe(4400);
    }
  });
  it("reads Hinglish and English amounts in words", () => {
    expect(parseNumeric("paanch hazaar rupaye")).toMatchObject({ dimension: "money", base: 5000 });
    expect(parseNumeric("thirty thousand")).toMatchObject({ base: 30000 });
    expect(parseNumeric("do lakh rupees")).toMatchObject({ dimension: "money", base: 200000 });
    expect(parseNumeric("5k rs")).toMatchObject({ dimension: "money", base: 5000 });
  });
  it("reads lengths in a common unit", () => {
    const a = parseNumeric("6 ft")!;
    const b = parseNumeric("72 inches")!;
    expect(a.dimension).toBe("length");
    expect(Math.abs(a.base - b.base)).toBeLessThan(0.5);
    expect(parseNumeric("1800 mm")!.base).toBeCloseTo(1800, 0);
  });
  it("reads a count and ignores a non-number", () => {
    expect(parseNumeric("4 drawers")).toMatchObject({ dimension: "count", base: 4 });
    expect(parseNumeric("walnut finish")).toBeNull();
    expect(parseNumeric("")).toBeNull();
  });
  it("reads dates only when the whole value is a date", () => {
    expect(parsePureDate("20 Oct 2026")).toBe("2026-10-20");
    expect(parsePureDate("Oct 20, 2026")).toBe("2026-10-20");
    expect(parsePureDate("20/10/2026")).toBe("2026-10-20");
    expect(parsePureDate("Before Diwali (Oct 20, 2026)")).toBeNull();
  });
});

describe("F. comparing an agreed value with a reported one", () => {
  it("does not call a yes a difference when the agreed value is money", () => {
    const c = compareReport("INR 4,400", "yes");
    expect(c.result).toBe("cannot_compare");
    expect(c.reason).toMatch(/amount of money/);
    expect(c.reason).toMatch(/cannot be compared/);
  });
  it("treats haan, ok and theek hai the same way", () => {
    for (const t of ["haan", "ok", "Theek hai", "done", "yes."]) {
      expect(isYesNoAnswer(t)).toBe(true);
      expect(compareReport("₹4,400", t).result).toBe("cannot_compare");
    }
  });
  it("matches the same amount however it is written", () => {
    expect(compareReport("INR 4,400", "₹4400").result).toBe("match");
    expect(compareReport("₹4,400", "four thousand four hundred").result).not.toBe("difference");
    expect(compareReport("₹29,200", "Rs 29200").result).toBe("match");
  });
  it("finds a real difference in amounts", () => {
    expect(compareReport("₹4,400", "₹5,000").result).toBe("difference");
  });
  it("does not compare money with a weight or a different currency", () => {
    expect(compareReport("₹4,400", "4 kg").result).toBe("cannot_compare");
    expect(compareReport("₹4,400", "$50").result).toBe("cannot_compare");
  });
  it("compares measurements across units and refuses a missing unit", () => {
    expect(compareReport("6 ft", "72 inches").result).toBe("match");
    expect(compareReport("6 ft", "5 ft").result).toBe("difference");
    const c = compareReport("6 ft", "6");
    expect(c.result).toBe("cannot_compare");
    expect(c.reason).toMatch(/no unit/);
  });
  it("compares counts, with number words", () => {
    expect(compareReport("4", "four").result).toBe("match");
    expect(compareReport("Four drawers", "4 drawers").result).toBe("match");
    expect(compareReport("4", "3").result).toBe("difference");
    expect(compareReport("4", "yes").result).toBe("cannot_compare");
  });
  it("compares words, and does not take a yes for a material", () => {
    expect(compareReport("Natural walnut veneer", "walnut laminate").result).toBe("difference");
    expect(compareReport("Walnut-look laminate", "walnut look laminate").result).toBe("match");
    expect(compareReport("Natural walnut veneer", "yes").result).toBe("cannot_compare");
  });
  it("compares whole dates as dates", () => {
    expect(compareReport("20 Oct 2026", "Oct 20, 2026").result).toBe("match");
    expect(compareReport("20 Oct 2026", "25 Oct 2026").result).toBe("difference");
    expect(compareReport("20 Oct 2026", "yes").result).toBe("cannot_compare");
  });
  it("never calls a missing value a difference", () => {
    expect(compareReport("", "x").result).toBe("cannot_compare");
    expect(compareReport("x", "").result).toBe("cannot_compare");
  });
});

describe("what kind of value is this field", () => {
  it("recognises amounts, quantities, measurements, materials, finishes, dates and text", () => {
    expect(inferValueKind("Advance", "₹5,000")).toBe("currency");
    expect(inferValueKind("Total budget", "thirty thousand")).toBe("currency");
    expect(inferValueKind("Number of drawers", "4")).toBe("quantity");
    expect(inferValueKind("Width", "6 ft")).toBe("measurement");
    expect(inferValueKind("Body material", "18 mm BWP plywood")).toBe("material");
    expect(inferValueKind("Finish", "Walnut look laminate")).toBe("finish");
    expect(inferValueKind("Delivery date", "20 Oct 2026")).toBe("date");
    expect(inferValueKind("Installation", "Included")).toBe("text");
  });
});

describe("a rule for choosing a quote is not a detail of the work", () => {
  it("is recognised", () => {
    expect(isDecisionRule("Decision", "Lowest price wins")).toBe(true);
    expect(isDecisionRule("Selection rule", "cheapest quote")).toBe(true);
    expect(isDecisionRule("Material", "lowest price wins")).toBe(true);
    expect(isDecisionRule("Body material", "18 mm plywood")).toBe(false);
    expect(isDecisionRule("Budget", "₹30,000")).toBe(false);
  });
});

describe("D. Diwali patakhe: the numbers are money", () => {
  const said = [
    "Diwali ke liye patakhe chahiye. Budget paanch hazaar rupaye hai.",
    "Maker: bhai ₹5,000 mein ho jayega, sab milake.",
  ];
  it("sees that 5000 was spoken as money", () => {
    expect(mentionedAsMoney(5000, said)).toBe(true);
  });
  it("does not treat a plain count as money", () => {
    expect(mentionedAsMoney(4, ["four drawers chahiye"])).toBe(false);
  });
  it("reads the amount as money whatever the label", () => {
    expect(inferValueKind("Patakhe", "5000 rupaye")).toBe("currency");
    expect(inferValueKind("Patakhe budget", "5000")).toBe("currency");
  });
  it("flags a per-piece rate that nobody stated", () => {
    expect(looksLikeInventedRate("Rate per piece", "₹50", said)).toBe(true);
    expect(looksLikeInventedRate("Price per item", "₹12.5", said)).toBe(true);
  });
  it("allows a rate that is stated in the words", () => {
    expect(looksLikeInventedRate("Rate per piece", "₹50", ["Anaar ₹50 per piece, 100 pieces"])).toBe(false);
  });
  it("leaves ordinary fields alone", () => {
    expect(looksLikeInventedRate("Budget", "₹5,000", said)).toBe(false);
  });
});

describe("showing an amount the way it is read", () => {
  it("offers a reading only when the raw text differs", () => {
    expect(readAs("5000 rupaye", "currency")).toBe("₹5,000");
    expect(readAs("₹5,000", "currency")).toBeUndefined();
    expect(readAs("5000", "quantity")).toBeUndefined();
  });
});