import { Composer } from "grammy";
import { createActor } from "xstate";
import { BotContext } from "../../context";
import { api } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";
import { QuestionManager } from "../../../questions/questionManager";

const composer = new Composer<BotContext>();

// /test <seedId> — показать конкретный вопрос по его seedId (для тестирования)
composer.command("test", async (ctx) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId || !ctx.chat?.id) return;

  const chatId = ctx.chat.id;
  const args = ctx.match?.trim();

  if (!args) {
    await ctx.reply("Укажите номер вопроса: /test 21");
    return;
  }

  const seedId = parseInt(args, 10);
  if (isNaN(seedId)) {
    await ctx.reply("Номер вопроса должен быть числом: /test 21");
    return;
  }

  // 1. Найти вопрос по seedId
  const question = await ctx.convex.runQuery(api.queries.getQuestionBySeedId, {
    seedId,
  });
  if (!question) {
    await ctx.reply(`Вопрос #${seedId} не найден.`);
    return;
  }

  // 2. Активировать drill если не активен
  const user = await ctx.convex.runQuery(api.development.dev_getUserState, {
    telegramId,
  });

  const drillActor = user?.drillState
    ? createActor(drillMachine, { snapshot: JSON.parse(user.drillState) })
    : createActor(drillMachine);
  drillActor.start();

  if (drillActor.getSnapshot().value === "idle") {
    drillActor.send({ type: "START" });
    await ctx.convex.runMutation(api.development.dev_updateDrillState, {
      telegramId,
      drillState: JSON.stringify(drillActor.getSnapshot()),
    });
  }

  // 3. Показать вопрос (start() удалит старое неотвеченное сообщение если есть)
  const manager = new QuestionManager(ctx.convex, ctx.api, chatId, telegramId);
  await manager.start(question);
});

export default composer;
