import { Composer } from "grammy";
import type { BotContext } from "../../context";
import { internal } from "../../../_generated/api";

const composer = new Composer<BotContext>();

composer.on("message_reaction", async (ctx) => {
  const { chat, message_id, new_reaction, user } = ctx.messageReaction;

  if (!user) return; // анонимные реакции (каналы) не записываем

  const emojis: string[] = [];
  for (const r of new_reaction) {
    if (r.type === "emoji") emojis.push(r.emoji);
  }

  await ctx.convex.runMutation(internal.userReactions.upsertReaction, {
    telegramUserId: String(user.id),
    chatId: chat.id,
    messageId: message_id,
    reactions: emojis,
  });
});

export default composer;
