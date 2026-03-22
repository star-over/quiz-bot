import { Composer } from "grammy";
import { createActor } from "xstate";
import { BotContext } from "../../context";
import { api } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";

const composer = new Composer<BotContext>();

// /stop — остановить drill, удалить неотвеченный вопрос
composer.command("stop", async (ctx) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId || !ctx.chat?.id) return;

  const chatId = ctx.chat.id;
  const user = await ctx.convex.runQuery(api.development.dev_getUserState, {
    telegramId,
  });

  // 1. Удалить неотвеченный вопрос
  if (user?.activeSession) {
    const old = JSON.parse(user.activeSession) as { context?: { messageId?: number } };
    if (old.context?.messageId) {
      await ctx.api.deleteMessage(chatId, old.context.messageId).catch(() => {});
    }
    await ctx.convex.runMutation(api.development.dev_updateUserMachineState, {
      telegramId,
    });
  }

  // 2. Перевести drill в idle
  if (user?.drillState) {
    const drillActor = createActor(drillMachine, {
      snapshot: JSON.parse(user.drillState),
    });
    drillActor.start();
    drillActor.send({ type: "STOP" });
    await ctx.convex.runMutation(api.development.dev_updateDrillState, {
      telegramId,
      drillState: JSON.stringify(drillActor.getSnapshot()),
    });
  }

  await ctx.reply("Бот остановлен. Нажмите /start чтобы продолжить.");
});

export default composer;
