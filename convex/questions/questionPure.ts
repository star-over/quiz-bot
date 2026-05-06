// Чистые функции бизнес-логики вопросов.
// Без side-эффектов, без зависимостей от Convex/Telegram — только логика.

import type { SCQContext } from "../machines/types";

// Данные об одном KC для отладочного блока
export interface KcDebugEntry {
  kcId: string;
  cefrLevel: string;
  consolidated?: boolean;
  masteryBefore?: { known: number; halfLife: number };
  masteryAfter?: { known: number; halfLife: number };
}

// Строит отладочный блок для вопроса/фидбека (только dev-режим).
// Telegram HTML: <b>, <i>, <code> для форматирования.
export function buildDebugFooter({
  seedId,
  slip,
  choicesCount,
  isExposure,
  kcs,
  elapsedMs,
}: {
  seedId: number | undefined;
  slip: number;
  choicesCount: number;
  isExposure?: boolean;
  kcs: KcDebugEntry[];
  elapsedMs?: number;
}): string {
  const guessPct = Math.round((1 / choicesCount) * 100);
  const slipPct = Math.round(slip * 100);
  const elapsed = elapsedMs !== undefined ? `  ⏱ ${(elapsedMs / 1000).toFixed(1)}s` : "";
  const exposure = isExposure ? "  👁 <i>exposure</i>" : "";

  // Флаги consolidated по всем KC: 🔒 если хотя бы один consolidated
  const hasConsolidated = kcs.some((kc) => kc.consolidated);
  const frozen = hasConsolidated ? "  🔒" : "";

  const headerLine = `📋 <b>#${seedId ?? "?"}</b>${elapsed}${frozen}  🎲 <i>guess</i>=${guessPct}%  🎯 <i>slip</i>=${slipPct}%${exposure}`;

  const kcLines = kcs.map(({ kcId, cefrLevel, masteryBefore, masteryAfter }) => {
    const level = `<b>[${cefrLevel}]</b>`;

    if (masteryAfter !== undefined) {
      // Фидбек: показываем до → после
      const knownBefore = masteryBefore !== undefined ? masteryBefore.known.toFixed(2) : "🆕";
      const knownAfter = masteryAfter.known.toFixed(2);
      const hl = `<i>hl</i>: ${Math.round(masteryAfter.halfLife)}d`;
      return `📊 ${kcId}\n${level}  <b>${knownBefore} → ${knownAfter}</b>  ${hl}`;
    }

    if (masteryBefore !== undefined) {
      // Вопрос: только текущее состояние
      const hl = `<i>hl</i>: ${Math.round(masteryBefore.halfLife)}d`;
      return `📊 ${kcId}\n${level}  <b>P=${masteryBefore.known.toFixed(2)}</b>  ${hl}`;
    }

    // KC встречается впервые
    return `📊 ${kcId}\n${level}  🆕 <i>new</i>`;
  });

  return ["━━━━━━━━━━━━", headerLine, ...kcLines].join("\n");
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

export function safeParseSnapshot(input: string | undefined): { success: true; snapshot: unknown } | { success: false } {
  if (!input) return { success: false };
  try {
    return { success: true, snapshot: JSON.parse(input) };
  } catch {
    return { success: false };
  }
}

const TELEGRAM_MAX_TEXT = 4096;
const TELEGRAM_MAX_CAPTION = 1024;
const ELLIPSIS = "...";

export function truncateTelegramText(text: string, maxLength: number = TELEGRAM_MAX_TEXT): string {
  if (text.length <= maxLength) return text;
  const cutAt = maxLength - ELLIPSIS.length;
  return text.slice(0, Math.max(0, cutAt)) + ELLIPSIS;
}

export function truncateTelegramCaption(text: string): string {
  return truncateTelegramText(text, TELEGRAM_MAX_CAPTION);
}
