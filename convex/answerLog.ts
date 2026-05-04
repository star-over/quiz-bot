import { internalMutation } from "./_generated/server";
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

