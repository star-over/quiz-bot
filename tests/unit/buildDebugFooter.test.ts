import { describe, it, expect } from "vitest";
import { buildDebugFooter } from "../../convex/questions/questionPure";

describe("buildDebugFooter", () => {
  it("новый KC — показывает 🆕 new", () => {
    const result = buildDebugFooter({
      seedId: 7,
      slip: 0.08,
      choicesCount: 4,
      kcs: [{ kcId: "spelling/receive", cefrLevel: "B1" }],
    });

    expect(result).toContain("<b>#7</b>");
    expect(result).toContain("<i>guess</i>=25%");
    expect(result).toContain("<i>slip</i>=8%");
    expect(result).toContain("🆕");
    expect(result).toContain("<i>new</i>");
    expect(result).not.toContain("⏱");
  });

  it("KC с мастери до — показывает P= и hl=", () => {
    const result = buildDebugFooter({
      seedId: 42,
      slip: 0.05,
      choicesCount: 4,
      kcs: [
        {
          kcId: "grammar/determiners/a_an",
          cefrLevel: "A1",
          masteryBefore: { known: 0.32, halfLife: 2.1 },
        },
      ],
    });

    expect(result).toContain("<b>P=0.32</b>");
    expect(result).toContain("<i>hl</i>: 2d");
    expect(result).not.toContain("→");
  });

  it("фидбек с мастери до и после — показывает переход", () => {
    const result = buildDebugFooter({
      seedId: 42,
      slip: 0.05,
      choicesCount: 4,
      kcs: [
        {
          kcId: "grammar/determiners/a_an",
          cefrLevel: "A1",
          masteryBefore: { known: 0.32, halfLife: 2.1 },
          masteryAfter: { known: 0.71, halfLife: 3.8 },
        },
      ],
      elapsedMs: 3200,
    });

    expect(result).toContain("⏱ 3.2s");
    expect(result).toContain("<b>0.32 → 0.71</b>");
    expect(result).toContain("<i>hl</i>: 4d");
  });

  it("фидбек с новым KC — показывает 🆕 → after", () => {
    const result = buildDebugFooter({
      seedId: 7,
      slip: 0.08,
      choicesCount: 3,
      kcs: [
        {
          kcId: "spelling/receive",
          cefrLevel: "B1",
          masteryAfter: { known: 0.45, halfLife: 1.0 },
        },
      ],
      elapsedMs: 1500,
    });

    expect(result).toContain("<i>guess</i>=33%");
    expect(result).toContain("<b>🆕 → 0.45</b>");
    expect(result).toContain("<i>hl</i>: 1d");
    expect(result).toContain("⏱ 1.5s");
  });

  it("несколько KC — каждый на отдельной строке с 📊", () => {
    const result = buildDebugFooter({
      seedId: 2,
      slip: 0.05,
      choicesCount: 4,
      kcs: [
        { kcId: "grammar/past_time/past_simple_irregular", cefrLevel: "A1" },
        { kcId: "vocab/go", cefrLevel: "A1" },
      ],
    });

    expect(result).toContain("📊 grammar/past_time/past_simple_irregular");
    expect(result).toContain("📊 vocab/go");
  });

  it("seedId undefined — показывает #?", () => {
    const result = buildDebugFooter({
      seedId: undefined,
      slip: 0.05,
      choicesCount: 4,
      kcs: [],
    });

    expect(result).toContain("<b>#?</b>");
  });

  it("yes_no вопрос — guess=50%", () => {
    const result = buildDebugFooter({
      seedId: 13,
      slip: 0.05,
      choicesCount: 2,
      kcs: [{ kcId: "grammar/past_time/past_simple_irregular", cefrLevel: "A1" }],
    });

    expect(result).toContain("<i>guess</i>=50%");
  });

  it("разделитель — ━ (жирная линия)", () => {
    const result = buildDebugFooter({
      seedId: 1,
      slip: 0.05,
      choicesCount: 4,
      kcs: [],
    });

    expect(result).toContain("━━━━━━━━━━━━");
  });

  it("exposure=true → показывает 👁 exposure", () => {
    const result = buildDebugFooter({
      seedId: 1,
      slip: 0.05,
      choicesCount: 4,
      kcs: [{ kcId: "grammar/past_time", cefrLevel: "A1" }],
      isExposure: true,
    });

    expect(result).toContain("👁 <i>exposure</i>");
  });

  it("consolidated KC → показывает 🔒", () => {
    const result = buildDebugFooter({
      seedId: 1,
      slip: 0.05,
      choicesCount: 4,
      kcs: [{ kcId: "grammar/past_time", cefrLevel: "A1", consolidated: true }],
    });

    expect(result).toContain("🔒");
  });
});
