// Чистые функции бизнес-логики вопросов.
// Без side-эффектов, без зависимостей от Convex/Telegram — только логика.

import type { SCQContext } from "../machines/types";

export function checkAnswer({
  choices,
  selectedChoiceId,
}: {
  choices: SCQContext["choices"];
  selectedChoiceId: number;
}): boolean {
  return choices.find((c) => c.id === selectedChoiceId)?.isCorrect ?? false;
}

// Получить explanation: для ответа — explanation выбранного варианта, для пропуска — правильного
export function getExplanation({
  context,
  skipped = false,
}: {
  context: SCQContext;
  skipped?: boolean;
}): string | undefined {
  if (skipped) {
    const correctChoice = context.choices.find((c) => c.isCorrect);
    return correctChoice?.explanation ?? context.explanation;
  }
  const selectedChoice = context.choices.find(
    (c) => c.id === context.selectedChoiceId,
  );
  return selectedChoice?.explanation ?? context.explanation;
}

// Строит текст сообщения с результатом и объяснением
export function buildFeedbackText({
  context,
  isCorrect,
  omitExplanation = false,
  skipped = false,
}: {
  context: SCQContext;
  isCorrect: boolean;
  omitExplanation?: boolean;
  skipped?: boolean;
}): string {
  const choiceLines = context.choices
    .map((choice, i) => {
      const isSelected = choice.id === context.selectedChoiceId;
      const mark = choice.isCorrect ? " ✅" : isSelected ? " ❌" : "";
      return `${String(i + 1)}. ${choice.content}${mark}`;
    })
    .join("\n");

  const result = skipped
    ? "🙈 <b>Пропущено.</b>"
    : isCorrect
      ? "✅ <b>Правильно!</b>"
      : "❌ <b>Неправильно.</b>";

  const explanation = omitExplanation
    ? undefined
    : getExplanation({ context, skipped });

  return [
    context.prompt,
    "",
    choiceLines,
    "",
    result,
    ...(explanation ? ["", explanation] : []),
  ].join("\n");
}
