import { Composer } from "grammy";
import { BotContext } from "../../context";
import { internal } from "../../../_generated/api";

const composer = new Composer<BotContext>();

composer.on("message_reaction", async (ctx) => {
  const { chat, message_id, new_reaction } = ctx.messageReaction;

  // Извлекаем только стандартные эмодзи, игнорируем custom_emoji и paid
  const emojis: string[] = [];
  for (const r of new_reaction) {
    if (r.type === "emoji") emojis.push(r.emoji);
  }

  await ctx.convex.runMutation(internal.answerLog.updateReactions, {
    chatId: chat.id,
    messageId: message_id,
    reactions: emojis,
  });
});

export default composer;
