import { Composer } from "grammy";
import { createActor } from "xstate";
import { BotContext } from "../../context";
import { api } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";
import { QuestionManager } from "../../../questions/questionManager";

const composer = new Composer<BotContext>();

// /start — запустить drill (бесконечную подачу вопросов)
composer.command("start", async (ctx) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId || !ctx.chat?.id) return;

  const chatId = ctx.chat.id;

  // 1. Загрузить или создать drill-машину, перевести в questioning
  const user = await ctx.convex.runQuery(api.development.dev_getUserState, {
    telegramId,
  });

  const drillActor = user?.drillState
    ? createActor(drillMachine, { snapshot: JSON.parse(user.drillState) })
    : createActor(drillMachine);
  drillActor.start();
  drillActor.send({ type: "START" });

  await ctx.convex.runMutation(api.development.dev_updateDrillState, {
    telegramId,
    drillState: JSON.stringify(drillActor.getSnapshot()),
  });

  // 2. Подать вопрос (start() внутри удалит старое неотвеченное сообщение если есть)
  const manager = new QuestionManager(ctx.convex, ctx.api, chatId, telegramId);
  await manager.next();
});

export default composer;
