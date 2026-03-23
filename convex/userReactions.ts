import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Обновить реакции пользователя на сообщение бота.
 * Telegram присылает полный актуальный набор реакций — перезаписываем.
 * Пустой массив = пользователь убрал все реакции → удаляем запись.
 */
export const upsertReaction = internalMutation({
  args: {
    telegramUserId: v.string(),
    chatId:         v.number(),
    messageId:      v.number(),
    reactions:      v.array(v.string()),
  },
  handler: async (ctx, { telegramUserId, chatId, messageId, reactions }) => {
    const entry = await ctx.db
      .query("userReactions")
      .withIndex("by_chatId_messageId", (q) =>
        q.eq("chatId", chatId).eq("messageId", messageId),
      )
      .first();

    if (entry) {
      if (reactions.length > 0) {
        await ctx.db.patch("userReactions", entry._id, { reactions, updatedAt: Date.now() });
      } else {
        await ctx.db.delete("userReactions", entry._id);
      }
    } else if (reactions.length > 0) {
      await ctx.db.insert("userReactions", {
        telegramUserId,
        chatId,
        messageId,
        reactions,
        updatedAt: Date.now(),
      });
    }
  },
});
