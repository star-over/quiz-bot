import { Composer } from "grammy";
import type { BotContext } from "../../context";
import { deactivateDrill } from "../../drillLifecycle";
import { createDrillLifecycleAdapter } from "../../drillLifecycleAdapter";

const composer = new Composer<BotContext>();

// /stop — остановить drill, удалить неотвеченный вопрос
composer.command("stop", async (ctx) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId || !ctx.chat.id) return;

  const chatId = ctx.chat.id;
  const drillDeps = createDrillLifecycleAdapter({
    ctx: ctx.convex,
    bot: ctx.api,
    chatId,
  });
  await deactivateDrill({ deps: drillDeps, telegramId, chatId });

  await ctx.reply("Бот остановлен. Нажмите /start чтобы продолжить.");
});

export default composer;
