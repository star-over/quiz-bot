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
 * Обновить реакции на сообщение с вопросом.
 * Вызывается из обработчика message_reaction.
 * Telegram присылает полный массив текущих реакций — перезаписываем.
 */
export const updateReactions = internalMutation({
  args: {
    chatId: v.number(),
    messageId: v.number(),
    reactions: v.array(v.string()),
  },
  handler: async (ctx, { chatId, messageId, reactions }) => {
    const entry = await ctx.db
      .query("answerLog")
      .withIndex("by_chatId_messageId", (q) =>
        q.eq("chatId", chatId).eq("messageId", messageId),
      )
      .first();

    if (!entry) return;

    await ctx.db.patch("answerLog", entry._id, {
      reactions: reactions.length > 0 ? reactions : undefined,
    });
  },
});
