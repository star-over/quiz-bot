import { Composer } from "grammy";
import type { BotContext } from "../../context";
import { internal } from "../../../_generated/api";

const composer = new Composer<BotContext>();

// Логируем все входящие текстовые сообщения для будущего анализа
composer.on("message:text", async (ctx, next) => {
  const replyToMessageId = ctx.message.reply_to_message?.message_id;
  await ctx.convex.runMutation(internal.userMessages.logMessage, {
    telegramUserId: String(ctx.from.id),
    chatId:         ctx.chat.id,
    messageId:      ctx.message.message_id,
    text:           ctx.message.text,
    sentAt:         ctx.message.date * 1000,
    ...(replyToMessageId !== undefined && { replyToMessageId }),
  });
  await next();
});

// Подсказки для пользователей, пишущих словами вместо команд
composer.hears(/^(помощь|help)$/i, async (ctx) => {
  await ctx.reply("Для получения помощи используйте команду /help");
});

composer.hears(/^(начать|start)$/i, async (ctx) => {
  await ctx.reply("Для начала работы используйте команду /start");
});

// Ответ на любое нераспознанное текстовое сообщение
composer.on("message:text", async (ctx) => {
  await ctx.reply(
    "Спасибо за сообщение! Бот сохранит его для анализа. Если нужна помощь — используйте /help.",
  );
});

export default composer;
