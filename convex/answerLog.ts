import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Записать ответ пользователя в лог.
 * Вызывается из QuestionManager.handleAnswer после показа фидбека.
 */
export const logAnswer = internalMutation({
  args: {
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    selectedChoiceId: v.number(),
    isCorrect: v.boolean(),
    choicesCount: v.number(),
    selectedPosition: v.number(),
    correctPosition: v.number(),
    shownAt: v.number(),
    respondedAt: v.number(),
    chatId: v.number(),
    messageId: v.number(),
    kcIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("answerLog", {
      ...args,
      skipped: false,
      ...(args.kcIds?.[0] ? { primaryKcId: args.kcIds[0] } : {}),
    });
  },
});

/**
 * Записать пропуск вопроса в лог.
 * Sentinel-значения: selectedChoiceId = -1, isCorrect = false, selectedPosition = -1.
 */
export const logSkip = internalMutation({
  args: {
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    choicesCount: v.number(),
    correctPosition: v.number(),
    shownAt: v.number(),
    respondedAt: v.number(),
    chatId: v.number(),
    messageId: v.number(),
    kcIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("answerLog", {
      ...args,
      skipped: true,
      selectedChoiceId: -1,
      isCorrect: false,
      selectedPosition: -1,
      ...(args.kcIds?.[0] ? { primaryKcId: args.kcIds[0] } : {}),
    });
  },
});

/**
 * Унифицированное логирование ответа или пропуска.
 * Диспетчеризует в ту же таблицу answerLog с дискриминантом skipped.
 */
export const logResponse = internalMutation({
  args: {
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    skipped: v.boolean(),
    selectedChoiceId: v.optional(v.number()),
    isCorrect: v.optional(v.boolean()),
    choicesCount: v.number(),
    selectedPosition: v.optional(v.number()),
    correctPosition: v.number(),
    shownAt: v.number(),
    respondedAt: v.number(),
    chatId: v.number(),
    messageId: v.number(),
    kcIds: v.optional(v.array(v.string())),
    primaryKcId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const base = {
      telegramUserId: args.telegramUserId,
      questionId: args.questionId,
      choicesCount: args.choicesCount,
      correctPosition: args.correctPosition,
      shownAt: args.shownAt,
      respondedAt: args.respondedAt,
      chatId: args.chatId,
      messageId: args.messageId,
      ...(args.kcIds ? { kcIds: args.kcIds } : {}),
      ...(args.kcIds?.[0] ? { primaryKcId: args.kcIds[0] } : {}),
    };

    if (args.skipped) {
      await ctx.db.insert("answerLog", {
        ...base,
        skipped: true,
        selectedChoiceId: -1,
        isCorrect: false,
        selectedPosition: -1,
      });
    } else {
      if (
        args.selectedChoiceId === undefined ||
        args.isCorrect === undefined ||
        args.selectedPosition === undefined
      ) {
        throw new Error(
          "logResponse: missing required fields for non-skipped response",
        );
      }
      await ctx.db.insert("answerLog", {
        ...base,
        skipped: false,
        selectedChoiceId: args.selectedChoiceId,
        isCorrect: args.isCorrect,
        selectedPosition: args.selectedPosition,
      });
    }
  },
});

/**
 * Получить последние ответы пользователя по конкретному KC.
 * Используется для deduplication вопросов — исключить недавно показанные.
 *
 * Индекс `by_user_primaryKc` вместо `by_user` + JS filter:
 * - `kcIds` — массив, Convex не индексирует массивы
 * - `primaryKcId` — денормализация `kcIds[0]` (primary KC вопроса)
 * - Достаточно, т.к. вызывается для `slot.kcId`, который всегда primary
 */
export const getRecentAnswersForKc = internalQuery({
  args: {
    telegramUserId: v.string(),
    kcId: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, { telegramUserId, kcId, limit }) => {
    const answers = await ctx.db
      .query("answerLog")
      .withIndex("by_user_primaryKc", (q) =>
        q.eq("telegramUserId", telegramUserId).eq("primaryKcId", kcId),
      )
      .order("desc")
      .take(limit);

    return answers.map((a) => ({ questionId: a.questionId, shownAt: a.shownAt }));
  },
});
