import { Composer } from "grammy";
import { createActor } from "xstate";
import { BotContext } from "../../context";
import { internal } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";
import { QuestionManager } from "../../../questions/questionManager";

const composer = new Composer<BotContext>();

// /start — запустить drill (бесконечную подачу вопросов)
composer.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from || !ctx.chat?.id) return;

  const telegramId = from.id.toString();
  const chatId = ctx.chat.id;

  // 0. Создать или синхронизировать профиль пользователя
  await ctx.convex.runMutation(internal.users.ensureUser, {
    telegramId,
    firstName: from.first_name,
    ...(from.last_name !== undefined ? { lastName: from.last_name } : {}),
    ...(from.username !== undefined ? { username: from.username } : {}),
    ...(from.language_code !== undefined ? { languageCode: from.language_code } : {}),
    chatId,
  });

  // 1. Загрузить или создать drill-машину, перевести в questioning
  const user = await ctx.convex.runQuery(internal.users.getByTelegramId, {
    telegramId,
  });

  const drillActor = user?.drillSnapshot
    ? createActor(drillMachine, { snapshot: JSON.parse(user.drillSnapshot) })
    : createActor(drillMachine);
  drillActor.start();
  drillActor.send({ type: "START" });

  await ctx.convex.runMutation(internal.users.updateDrillSnapshot, {
    telegramId,
    drillSnapshot: JSON.stringify(drillActor.getSnapshot()),
  });

  // 2. Подать вопрос (start() внутри удалит старое неотвеченное сообщение если есть)
  const manager = new QuestionManager(ctx.convex, ctx.api, chatId, telegramId);
  await manager.next();
});

export default composer;
