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
    await ctx.db.insert("answerLog", { ...args, skipped: false });
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
  },
  handler: async (ctx, args) => {
    if (args.skipped) {
      await ctx.db.insert("answerLog", {
        ...args,
        selectedChoiceId: -1,
        isCorrect: false,
        selectedPosition: -1,
      });
    } else {
      await ctx.db.insert("answerLog", {
        ...args,
        selectedChoiceId: args.selectedChoiceId!,
        isCorrect: args.isCorrect!,
        selectedPosition: args.selectedPosition!,
      });
    }
  },
});

/**
 * Получить последние ответы пользователя по конкретному KC.
 * Используется для deduplication вопросов — исключить недавно показанные.
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
      .withIndex("by_user", (q) => q.eq("telegramUserId", telegramUserId))
      .collect();
    const filtered = answers.filter((a) => a.kcIds?.includes(kcId));
    return filtered.slice(-limit).map((a) => ({ questionId: a.questionId, shownAt: a.shownAt }));
  },
});
