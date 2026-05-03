import { describe, it, expect } from "vitest";
import { truncateTelegramText } from "../../convex/questions/questionPure";

describe("truncateTelegramText", () => {
  it("returns short text unchanged", () => {
    expect(truncateTelegramText("hello", 10)).toBe("hello");
  });

  it("truncates long text with ellipsis", () => {
    const text = "a".repeat(100);
    expect(truncateTelegramText(text, 10)).toBe("a".repeat(7) + "...");
  });

  it("respects 4096 limit by default", () => {
    const text = "b".repeat(5000);
    const result = truncateTelegramText(text);
    expect(result.length).toBe(4096);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles exact-length text", () => {
    const text = "c".repeat(4096);
    expect(truncateTelegramText(text).length).toBe(4096);
  });
});
