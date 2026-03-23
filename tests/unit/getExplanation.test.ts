import { describe, it, expect } from "vitest";
import { getExplanation } from "../../convex/questions/questionPure";
import { makeQuestionContext } from "../fixtures/contexts";
import { makeChoice } from "../fixtures/choices";

describe("getExplanation", () => {
  it("возвращает explanation выбранного варианта", () => {
    const choices = [
      makeChoice({ id: 1, isCorrect: true, explanation: "Correct explanation" }),
      makeChoice({ id: 2, isCorrect: false, explanation: "Wrong explanation" }),
    ];
    const context = makeQuestionContext({ choices, selectedChoiceId: 2 });

    expect(getExplanation({ context })).toBe("Wrong explanation");
  });

  it("fallback на question explanation если у варианта нет explanation", () => {
    const choices = [
      makeChoice({ id: 1, isCorrect: true }),
      makeChoice({ id: 2, isCorrect: false }),
    ];
    const context = makeQuestionContext({
      choices,
      selectedChoiceId: 2,
      explanation: "Question-level explanation",
    });

    expect(getExplanation({ context })).toBe("Question-level explanation");
  });

  it("возвращает undefined если нет explanation ни у варианта ни у вопроса", () => {
    const choices = [
      makeChoice({ id: 1, isCorrect: true }),
      makeChoice({ id: 2, isCorrect: false }),
    ];
    const context = makeQuestionContext({ choices, selectedChoiceId: 2 });

    expect(getExplanation({ context })).toBeUndefined();
  });

  it("при skipped=true возвращает explanation правильного варианта", () => {
    const choices = [
      makeChoice({ id: 1, isCorrect: true, explanation: "Correct explanation" }),
      makeChoice({ id: 2, isCorrect: false, explanation: "Wrong explanation" }),
    ];
    const context = makeQuestionContext({ choices });

    expect(getExplanation({ context, skipped: true })).toBe("Correct explanation");
  });

  it("при skipped=true fallback на question explanation", () => {
    const choices = [
      makeChoice({ id: 1, isCorrect: true }),
      makeChoice({ id: 2, isCorrect: false }),
    ];
    const context = makeQuestionContext({
      choices,
      explanation: "Question-level explanation",
    });

    expect(getExplanation({ context, skipped: true })).toBe("Question-level explanation");
  });
});
