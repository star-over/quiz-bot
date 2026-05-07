import { createActor, type Snapshot } from "xstate";
import { drillMachine } from "../machines/drillMachine.js";
import { safeParseSnapshot } from "../questions/questionPure.js";
import type { Doc } from "../_generated/dataModel.js";

export type UserRow = Doc<"users">;

export interface EnsureUserArgs {
  telegramId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  chatId: number;
}

export interface DrillLifecycleDeps {
  ensureUser(args: EnsureUserArgs): Promise<void>;
  getUser(args: { telegramId: string }): Promise<UserRow | null>;
  updateDrillSnapshot(args: {
    telegramId: string;
    drillSnapshot?: string;
  }): Promise<void>;
  updateQuestionSnapshot(args: {
    telegramId: string;
    questionSnapshot?: string;
  }): Promise<void>;
  deleteMessage(args: { chatId: number; messageId: number }): Promise<void>;
}

export interface DrillProfile {
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  chatId: number;
}

/**
 * Активировать drill-режим для пользователя.
 * - ensureUser создаёт/обновляет пользователя
 * - Загружает drillSnapshot, парсит через safeParseSnapshot
 * - Создаёт XState-actor, отправляет START
 * - Сохраняет новый snapshot
 *
 * @param reenter Если true (default), всегда шлёт START даже из questioning.
 *                Если false, шлёт START только из idle (как /test).
 */
export async function activateDrill({
  deps,
  telegramId,
  profile,
  reenter = true,
}: {
  deps: DrillLifecycleDeps;
  telegramId: string;
  profile: DrillProfile;
  reenter?: boolean;
}): Promise<void> {
  await deps.ensureUser({ telegramId, ...profile });
  const user = await deps.getUser({ telegramId });

  let snapshot: unknown;
  if (user?.drillSnapshot) {
    const parsed = safeParseSnapshot(user.drillSnapshot);
    if (parsed.success) snapshot = parsed.snapshot;
  }

  const actor = snapshot
    ? createActor(drillMachine, { snapshot: snapshot as Snapshot<unknown> })
    : createActor(drillMachine);
  actor.start();

  const currentState = actor.getSnapshot().value;

  if (reenter || currentState === "idle") {
    actor.send({ type: "START" });
    await deps.updateDrillSnapshot({
      telegramId,
      drillSnapshot: JSON.stringify(actor.getSnapshot()),
    });
  }
}

/**
 * Деактивировать drill-режим:
 * - Удаляет сообщение с неотвеченным вопросом (если есть)
 * - Очищает questionSnapshot
 * - Отправляет STOP drill-машине
 * - Сохраняет idle-snapshot
 */
export async function deactivateDrill({
  deps,
  telegramId,
  chatId,
}: {
  deps: DrillLifecycleDeps;
  telegramId: string;
  chatId: number;
}): Promise<void> {
  const user = await deps.getUser({ telegramId });
  if (!user) return;

  // 1. Очистить question message
  if (user.questionSnapshot) {
    const parsed = safeParseSnapshot(user.questionSnapshot);
    if (parsed.success) {
      const msgId = (parsed.snapshot as { context?: { messageId?: number } })
        .context?.messageId;
      if (msgId) {
        await deps.deleteMessage({ chatId, messageId: msgId });
      }
    }
    await deps.updateQuestionSnapshot({ telegramId });
  }

  // 2. Перевести drill в idle
  if (user.drillSnapshot) {
    const parsed = safeParseSnapshot(user.drillSnapshot);
    if (parsed.success) {
      const actor = createActor(drillMachine, { snapshot: parsed.snapshot as Snapshot<unknown> });
      actor.start();
      actor.send({ type: "STOP" });
      await deps.updateDrillSnapshot({
        telegramId,
        drillSnapshot: JSON.stringify(actor.getSnapshot()),
      });
    } else {
      // Corrupted — clear
      await deps.updateDrillSnapshot({ telegramId });
    }
  }
}

/**
 * Проверить, находится ли пользователь в drill-режиме (questioning).
 * Corrupted snapshot → clear → false.
 */
export async function isDrilling({
  deps,
  telegramId,
}: {
  deps: DrillLifecycleDeps;
  telegramId: string;
}): Promise<boolean> {
  const user = await deps.getUser({ telegramId });
  if (!user?.drillSnapshot) return false;

  const parsed = safeParseSnapshot(user.drillSnapshot);
  if (!parsed.success) {
    await deps.updateDrillSnapshot({ telegramId });
    return false;
  }

  return (parsed.snapshot as { value?: string }).value === "questioning";
}
