import { Composer } from "grammy";
import { createActor } from "xstate";
import type { BotContext } from "../../context";
import { internal } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";

const composer = new Composer<BotContext>();

// /stop — остановить drill, удалить неотвеченный вопрос
composer.command("stop", async (ctx) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId || !ctx.chat.id) return;

  const chatId = ctx.chat.id;
  const user = await ctx.convex.runQuery(internal.users.getByTelegramId, {
    telegramId,
  });

  // 1. Удалить неотвеченный вопрос
  if (user?.questionSnapshot) {
    const old = JSON.parse(user.questionSnapshot) as { context?: { messageId?: number } };
    if (old.context?.messageId) {
      await ctx.api.deleteMessage(chatId, old.context.messageId).catch(() => {
        // Сообщение уже удалено — игнорируем
      });
    }
    await ctx.convex.runMutation(internal.users.updateQuestionSnapshot, {
      telegramId,
    });
  }

  // 2. Перевести drill в idle
  if (user?.drillSnapshot) {
    const drillActor = createActor(drillMachine, {
      snapshot: JSON.parse(user.drillSnapshot),
    });
    drillActor.start();
    drillActor.send({ type: "STOP" });
    await ctx.convex.runMutation(internal.users.updateDrillSnapshot, {
      telegramId,
      drillSnapshot: JSON.stringify(drillActor.getSnapshot()),
    });
  }

  await ctx.reply("Бот остановлен. Нажмите /start чтобы продолжить.");
});

export default composer;
