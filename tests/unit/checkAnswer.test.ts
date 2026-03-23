import { describe, it, expect } from "vitest";
import { checkAnswer } from "../../convex/questions/questionPure";
import { makeChoices } from "../fixtures/choices";

describe("checkAnswer", () => {
  const choices = makeChoices({ count: 4 }); // id=1 correct, id=2,3,4 incorrect

  it("возвращает true для правильного ответа", () => {
    expect(checkAnswer({ choices, selectedChoiceId: 1 })).toBe(true);
  });

  it("возвращает false для неправильного ответа", () => {
    expect(checkAnswer({ choices, selectedChoiceId: 2 })).toBe(false);
  });

  it("возвращает false для несуществующего choiceId", () => {
    expect(checkAnswer({ choices, selectedChoiceId: 999 })).toBe(false);
  });
});
