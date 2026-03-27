// Чистые функции бизнес-логики вопросов.
// Без side-эффектов, без зависимостей от Convex/Telegram — только логика.

import type { SCQContext } from "../machines/types";

// Данные об одном KC для отладочного блока
export interface KcDebugEntry {
  kcId: string;
  cefrLevel: string;
  masteryBefore?: { known: number; halfLife: number };
  masteryAfter?: { known: number; halfLife: number };
}

// Строит отладочный блок для вопроса/фидбека (только dev-режим).
// seedId, slip, kcs — данные вопроса; elapsedMs — только для фидбека.
export function buildDebugFooter({
  seedId,
  slip,
  kcs,
  elapsedMs,
}: {
  seedId: number | undefined;
  slip: number;
  kcs: KcDebugEntry[];
  elapsedMs?: number;
}): string {
  const slipPct = Math.round(slip * 100);
  const elapsed = elapsedMs !== undefined ? `  ⏱${(elapsedMs / 1000).toFixed(1)}s` : "";
  const header = `#${seedId ?? "?"}  slip=${slipPct}%${elapsed}`;

  const kcLines = kcs.map(({ kcId, cefrLevel, masteryBefore, masteryAfter }) => {
    const level = `[${cefrLevel}]`;

    if (masteryAfter !== undefined) {
      // Фидбек: показываем до → после
      const knownBefore = masteryBefore !== undefined ? masteryBefore.known.toFixed(2) : "new";
      const knownAfter = masteryAfter.known.toFixed(2);
      const hlAfter = `hl=${masteryAfter.halfLife.toFixed(1)}d`;
      return `${kcId} ${level}  ${knownBefore}→${knownAfter}  ${hlAfter}`;
    }

    if (masteryBefore !== undefined) {
      // Вопрос: только текущее состояние
      return `${kcId} ${level}  P=${masteryBefore.known.toFixed(2)}  hl=${masteryBefore.halfLife.toFixed(1)}d`;
    }

    // KC встречается впервые
    return `${kcId} ${level}  new`;
  });

  return ["────────────", header, ...kcLines].join("\n");
}

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
