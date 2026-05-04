import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { bktUpdate, createInitialMastery } from "./bkt/bktPure";

/**
 * Получить текущий уровень знания пользователя по списку KC.
 * Возвращает только те KC, для которых уже есть запись (остальные = new).
 */
export const getMasteryForKcs = internalQuery({
  args: {
    telegramUserId: v.string(),
    kcIds: v.array(v.string()),
  },
  handler: async (ctx, { telegramUserId, kcIds }) => {
    const results = await Promise.all(
      kcIds.map((kcId) =>
        ctx.db
          .query("userMastery")
          .withIndex("by_user_kc", (q) =>
            q.eq("telegramUserId", telegramUserId).eq("kcId", kcId),
          )
          .unique(),
      ),
    );
    return results.flatMap((entry) =>
      entry
        ? [{ kcId: entry.kcId, known: entry.known, halfLife: entry.halfLife, consolidated: entry.consolidated }]
        : [],
    );
  },
});

// Результат обновления одного KC — до и после
export interface MasteryUpdateEntry {
  kcId: string;
  consolidated: boolean;
  before?: { known: number; halfLife: number };
  after: { known: number; halfLife: number };
}

/**
 * Обновить уровень знания пользователя по всем KC вопроса.
 *
 * Для каждого KC из questionKcs:
 * 1. Загрузить существующий userMastery (или создать начальный)
 * 2. Вычислить bktUpdate
 * 3. Записать/обновить userMastery
 *
 * Пропускает yes_no вопросы (GUESS=0.50 нарушает ограничение BKT).
 * Возвращает before/after для debug-отображения.
 */
export const updateMastery = internalMutation({
  args: {
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    isCorrect: v.boolean(),
    respondedAt: v.number(),
  },
  handler: async (ctx, { telegramUserId, questionId, isCorrect, respondedAt }) => {
    // Загрузить вопрос — нужен slip, choiceType, choices
    const question = await ctx.db.get("questions", questionId);
    if (!question) return [];

    const slip = question.slip;
    const choicesCount = question.choices.length;
    // yes_no — exposure-режим: Байес работает с GUESS=0.50 (слабый сигнал),
    // но LEARN использует отдельные значения (мини-урок, а не тест)
    const isExposure = question.choiceType === "yes_no";

    // Загрузить KC вопроса из M:M таблицы
    const questionKcs = await ctx.db
      .query("questionKcs")
      .withIndex("by_question", (q) => q.eq("questionId", questionId))
      .collect();

    if (questionKcs.length === 0) return [];

    const results: MasteryUpdateEntry[] = [];

    for (const qkc of questionKcs) {
      const existing = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) =>
          q.eq("telegramUserId", telegramUserId).eq("kcId", qkc.kcId),
        )
        .unique();

      if (existing) {
        // KC уже встречался — полный цикл BKT-F
        const before = { known: existing.known, halfLife: existing.halfLife };
        const output = bktUpdate({
          known: existing.known,
          halfLife: existing.halfLife,
          lastSeen: existing.lastSeen,
          now: respondedAt,
          isCorrect,
          choicesCount,
          slip,
          isPrimary: qkc.isPrimary,
          consolidated: existing.consolidated,
          isExposure,
        });
        // Infinity не сериализуется в JSON/Convex — ограничиваем
        const nextReviewAt = Number.isFinite(output.nextReviewAt)
          ? output.nextReviewAt
          : 32503680000000; // ~3000-01-01, consolidated KC исключён из расписания
        await ctx.db.patch("userMastery", existing._id, {
          known: output.known,
          halfLife: output.halfLife,
          lastSeen: respondedAt,
          nextReviewAt,
          consolidated: output.consolidated,
          seenCount: existing.seenCount + 1,
        });
        results.push({ kcId: qkc.kcId, consolidated: output.consolidated, before, after: { known: output.known, halfLife: output.halfLife } });
      } else {
        // Новый KC — создать начальную запись и сразу обновить
        const initial = createInitialMastery({ now: respondedAt });
        const output = bktUpdate({
          known: initial.known,
          halfLife: initial.halfLife,
          lastSeen: respondedAt,
          now: respondedAt,
          isCorrect,
          choicesCount,
          slip,
          isPrimary: qkc.isPrimary,
          consolidated: false,
          isExposure,
        });
        const nextReviewAt = Number.isFinite(output.nextReviewAt)
          ? output.nextReviewAt
          : 32503680000000;
        await ctx.db.insert("userMastery", {
          telegramUserId,
          kcId: qkc.kcId,
          known: output.known,
          halfLife: output.halfLife,
          lastSeen: respondedAt,
          nextReviewAt,
          consolidated: output.consolidated,
          seenCount: 1,
        });
        // before отсутствует → KC встретился впервые
        results.push({ kcId: qkc.kcId, consolidated: output.consolidated, after: { known: output.known, halfLife: output.halfLife } });
      }
    }

    return results;
  },
});
