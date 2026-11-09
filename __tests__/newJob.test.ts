import { titleFromStatement, chooseJobTitle } from "@/lib/utils/newJob";

describe("new job titles come from what was actually said", () => {
  it("uses the first words of a Hinglish statement as spoken", () => {
    expect(titleFromStatement("Bhai, wardrobe mein walnut finish chahiye, aur installation bhi included hona chahiye.")).toBe(
      "Bhai, wardrobe mein walnut finish chahiye"
    );
  });
  it("keeps Devanagari intact", () => {
    expect(titleFromStatement("ठीक है, walnut finish कर देंगे। Installation का अलग चार्ज लगेगा।")).toBe("ठीक है, walnut finish कर देंगे");
  });
  it("does not assume an object", () => {
    expect(titleFromStatement("Gate ka paint dobara karwana hai")).toBe("Gate ka paint dobara karwana hai");
  });
  it("returns empty text for empty input and never throws", () => {
    expect(titleFromStatement("   ")).toBe("");
    expect(titleFromStatement("")).toBe("");
  });
  it("limits length without cutting a word in half", () => {
    const t = titleFromStatement("extraordinarilylongwordnumberone extraordinarilylongwordnumbertwo", 6, 40);
    expect(t.length).toBeLessThanOrEqual(40);
  });
  it("prefers a typed title, then the customer, then the maker", () => {
    expect(chooseJobTitle("  Hall sofa ", "x y", "a b")).toBe("Hall sofa");
    expect(chooseJobTitle("", "Sofa ka kapda badalna hai", "a b")).toBe("Sofa ka kapda badalna hai");
    expect(chooseJobTitle("", "", "Quote for gate repair")).toBe("Quote for gate repair");
    expect(chooseJobTitle("", " ", " ")).toBe("");
  });
});