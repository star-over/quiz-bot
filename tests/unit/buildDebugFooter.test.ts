import { describe, it, expect } from "vitest";
import { buildDebugFooter } from "../../convex/questions/questionPure";

describe("buildDebugFooter", () => {
  it("новый KC — показывает 'new'", () => {
    const result = buildDebugFooter({
      seedId: 7,
      slip: 0.08,
      kcs: [{ kcId: "spelling:receive", cefrLevel: "B1" }],
    });

    expect(result).toContain("#7");
    expect(result).toContain("slip=8%");
    expect(result).toContain("spelling:receive [B1]  new");
    expect(result).not.toContain("⏱");
  });

  it("KC с мастери до — показывает P= и hl=", () => {
    const result = buildDebugFooter({
      seedId: 42,
      slip: 0.05,
      kcs: [
        {
          kcId: "grammar:determiners:a_an",
          cefrLevel: "A1",
          masteryBefore: { known: 0.32, halfLife: 2.1 },
        },
      ],
    });

    expect(result).toContain("grammar:determiners:a_an [A1]  P=0.32  hl=2.1d");
    expect(result).not.toContain("→");
  });

  it("фидбек с мастери до и после — показывает переход", () => {
    const result = buildDebugFooter({
      seedId: 42,
      slip: 0.05,
      kcs: [
        {
          kcId: "grammar:determiners:a_an",
          cefrLevel: "A1",
          masteryBefore: { known: 0.32, halfLife: 2.1 },
          masteryAfter: { known: 0.71, halfLife: 3.8 },
        },
      ],
      elapsedMs: 3200,
    });

    expect(result).toContain("⏱3.2s");
    expect(result).toContain("0.32→0.71");
    expect(result).toContain("hl=3.8d");
  });

  it("фидбек с новым KC — показывает new→after", () => {
    const result = buildDebugFooter({
      seedId: 7,
      slip: 0.08,
      kcs: [
        {
          kcId: "spelling:receive",
          cefrLevel: "B1",
          masteryAfter: { known: 0.45, halfLife: 1.0 },
        },
      ],
      elapsedMs: 1500,
    });

    expect(result).toContain("new→0.45");
    expect(result).toContain("hl=1.0d");
    expect(result).toContain("⏱1.5s");
  });

  it("несколько KC — каждый на отдельной строке", () => {
    const result = buildDebugFooter({
      seedId: 2,
      slip: 0.05,
      kcs: [
        { kcId: "grammar:past_time:past_simple_irregular", cefrLevel: "A1" },
        { kcId: "vocab:go", cefrLevel: "A1" },
      ],
    });

    expect(result).toContain("grammar:past_time:past_simple_irregular [A1]  new");
    expect(result).toContain("vocab:go [A1]  new");
  });

  it("seedId undefined — показывает #?", () => {
    const result = buildDebugFooter({
      seedId: undefined,
      slip: 0.05,
      kcs: [],
    });

    expect(result).toContain("#?");
  });
});
