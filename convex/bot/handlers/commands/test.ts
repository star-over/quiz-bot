import { Composer } from "grammy";
import { createActor } from "xstate";
import { BotContext } from "../../context";
import { api, internal } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";
import { QuestionManager } from "../../../questions/questionManager";

const composer = new Composer<BotContext>();

// /test <seedId> — показать конкретный вопрос по его seedId (для тестирования)
composer.command("test", async (ctx) => {
  const from = ctx.from;
  if (!from || !ctx.chat?.id) return;

  const telegramId = from.id.toString();
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

  // 2. Создать или синхронизировать профиль пользователя
  await ctx.convex.runMutation(internal.users.ensureUser, {
    telegramId,
    firstName: from.first_name,
    ...(from.last_name !== undefined ? { lastName: from.last_name } : {}),
    ...(from.username !== undefined ? { username: from.username } : {}),
    ...(from.language_code !== undefined ? { languageCode: from.language_code } : {}),
    chatId,
  });

  // 3. Активировать drill если не активен
  const user = await ctx.convex.runQuery(internal.users.getByTelegramId, {
    telegramId,
  });

  const drillActor = user?.drillSnapshot
    ? createActor(drillMachine, { snapshot: JSON.parse(user.drillSnapshot) })
    : createActor(drillMachine);
  drillActor.start();

  if (drillActor.getSnapshot().value === "idle") {
    drillActor.send({ type: "START" });
    await ctx.convex.runMutation(internal.users.updateDrillSnapshot, {
      telegramId,
      drillSnapshot: JSON.stringify(drillActor.getSnapshot()),
    });
  }

  // 4. Показать вопрос (start() удалит старое неотвеченное сообщение если есть)
  const manager = new QuestionManager(ctx.convex, ctx.api, chatId, telegramId);
  await manager.start(question);
});

export default composer;
