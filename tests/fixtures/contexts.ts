import type { SingleChoiceQuestionContext } from "../../convex/machines/types";
import { makeChoices } from "./choices";

const DEFAULTS: SingleChoiceQuestionContext = {
  questionId: "test-question-id",
  prompt: "What is the correct answer?",
  choices: makeChoices({ count: 4 }),
};

export function makeQuestionContext(
  overrides?: Partial<SingleChoiceQuestionContext>,
): SingleChoiceQuestionContext {
  return {
    ...DEFAULTS,
    ...overrides,
    choices: overrides?.choices ?? DEFAULTS.choices,
  };
}
