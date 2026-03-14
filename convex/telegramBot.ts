import { httpAction } from "./_generated/server";
import { Bot, webhookCallback } from "grammy";
import { registerHandlers, env } from "./bot/index";
import { BotContext } from "./bot/context";

// Создаем HTTP экшен Convex, который будет обрабатывать вебхуки от Telegram
export const handleUpdate = httpAction(async (ctx, request) => {
  // Создаем НОВЫЙ экземпляр бота для КАЖДОГО запроса.
  // Это гарантирует, что контекст не будет "протекать" между разными вызовами.
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // Внедряем контекст Convex (ctx) в контекст grammY (grammyCtx).
  // Теперь во всех обработчиках будет доступен `grammyCtx.convex`.
  bot.use((grammyCtx, next) => {
    grammyCtx.convex = ctx;
    return next();
  });

  // Регистрируем все наши команды, сообщения и колбэки
  registerHandlers(bot);
  
  // webhookCallback создает обработчик запроса, совместимый со стандартным Request/Response API.
  const handle = webhookCallback(bot, "std/http");

  try {
    return await handle(request);
  } catch (e) {
    console.error(e);
    return new Response("Error: " + (e as Error).message, { status: 500 });
  }
});
