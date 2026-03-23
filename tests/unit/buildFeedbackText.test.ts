import { describe, it, expect } from "vitest";
import { buildFeedbackText } from "../../convex/questions/questionPure";
import { makeQuestionContext } from "../fixtures/contexts";
import { makeChoice } from "../fixtures/choices";

const choices = [
  makeChoice({ id: 1, content: "Apple", isCorrect: true, explanation: "Apple is correct" }),
  makeChoice({ id: 2, content: "Banana", isCorrect: false }),
  makeChoice({ id: 3, content: "Cherry", isCorrect: false }),
];

describe("buildFeedbackText", () => {
  it("правильный ответ — ✅ у правильного, текст 'Правильно!'", () => {
    const context = makeQuestionContext({ choices, selectedChoiceId: 1 });
    const text = buildFeedbackText({ context, isCorrect: true });

    expect(text).toContain("✅ <b>Правильно!</b>");
    expect(text).toContain("1. Apple ✅");
    expect(text).not.toContain("❌");
  });

  it("неправильный ответ — ❌ у выбранного, ✅ у правильного", () => {
    const context = makeQuestionContext({ choices, selectedChoiceId: 2 });
    const text = buildFeedbackText({ context, isCorrect: false });

    expect(text).toContain("❌ <b>Неправильно.</b>");
    expect(text).toContain("1. Apple ✅");
    expect(text).toContain("2. Banana ❌");
    expect(text).not.toContain("3. Cherry ❌");
  });

  it("пропуск — текст 'Пропущено.', ✅ у правильного", () => {
    const context = makeQuestionContext({ choices });
    const text = buildFeedbackText({ context, isCorrect: false, skipped: true });

    expect(text).toContain("🙈 <b>Пропущено.</b>");
    expect(text).toContain("1. Apple ✅");
  });

  it("omitExplanation=true — нет объяснения в тексте", () => {
    const context = makeQuestionContext({ choices, selectedChoiceId: 1 });
    const text = buildFeedbackText({ context, isCorrect: true, omitExplanation: true });

    expect(text).not.toContain("Apple is correct");
  });

  it("omitExplanation=false — объяснение присутствует", () => {
    const context = makeQuestionContext({ choices, selectedChoiceId: 1 });
    const text = buildFeedbackText({ context, isCorrect: true });

    expect(text).toContain("Apple is correct");
  });

  it("содержит prompt вопроса", () => {
    const context = makeQuestionContext({ choices, prompt: "Pick a fruit" });
    const text = buildFeedbackText({ context, isCorrect: false, skipped: true });

    expect(text).toContain("Pick a fruit");
  });
});
