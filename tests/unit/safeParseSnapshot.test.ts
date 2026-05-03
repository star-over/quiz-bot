import { describe, it, expect } from "vitest";
import { safeParseSnapshot } from "../../convex/questions/questionPure";

describe("safeParseSnapshot", () => {
  it("parses valid JSON", () => {
    const obj = { value: "questioning", context: { messageId: 42 } };
    const result = safeParseSnapshot(JSON.stringify(obj));
    expect(result.success).toBe(true);
    expect(result.snapshot).toEqual(obj);
  });

  it("returns failure for invalid JSON", () => {
    const result = safeParseSnapshot("{broken");
    expect(result.success).toBe(false);
    expect(result.snapshot).toBeUndefined();
  });

  it("returns failure for null input", () => {
    const result = safeParseSnapshot(undefined);
    expect(result.success).toBe(false);
  });
});
