import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Записать текстовое сообщение пользователя в лог.
 * Вызывается из обработчика message:text.
 * Хранится для будущего анализа (паттерны, свободный ввод, попытки говорить с ботом).
 */
export const logMessage = internalMutation({
  args: {
    telegramUserId:   v.string(),
    chatId:           v.number(),
    messageId:        v.number(),
    text:             v.string(),
    sentAt:           v.number(),
    replyToMessageId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("userMessages", args);
  },
});
