import type { SingleChoiceQuestionContext } from "../../convex/machines/types";

type Choice = SingleChoiceQuestionContext["choices"][number];

const DEFAULTS: Choice = {
  id: 1,
  content: "Default choice",
  isCorrect: false,
};

export function makeChoice(overrides?: Partial<Choice>): Choice {
  return { ...DEFAULTS, ...overrides };
}

/**
 * Создать N вариантов, первый — правильный.
 */
export function makeChoices({ count }: { count: number }): Choice[] {
  return Array.from({ length: count }, (_, i) =>
    makeChoice({
      id: i + 1,
      content: `Choice ${String(i + 1)}`,
      isCorrect: i === 0,
    }),
  );
}
