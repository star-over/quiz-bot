import type { SCQContext } from "../../convex/machines/types";
import { makeChoices } from "./choices";

const DEFAULTS: SCQContext = {
  questionId: "test-question-id",
  prompt: "What is the correct answer?",
  choices: makeChoices({ count: 4 }),
};

export function makeQuestionContext(
  overrides?: Partial<SCQContext>,
): SCQContext {
  return {
    ...DEFAULTS,
    ...overrides,
    choices: overrides?.choices ?? DEFAULTS.choices,
  };
}
