import { Composer } from "grammy";
import type { BotContext } from "../../context";
import { api } from "../../../_generated/api";
import { deliverQuestion } from "../../../questions/answerFlow";
import { createAnswerFlowAdapter } from "../../../questions/answerFlowAdapter";
import { activateDrill } from "../../drillLifecycle";
import { createDrillLifecycleAdapter } from "../../drillLifecycleAdapter";

const composer = new Composer<BotContext>();

composer.command("test", async (ctx) => {
  const from = ctx.from;
  if (!from || !ctx.chat.id) return;

  const telegramId = from.id.toString();
  const chatId = ctx.chat.id;
  const args = ctx.match.trim();

  if (!args) {
    await ctx.reply("Укажите номер вопроса: /test 21");
    return;
  }

  const seedId = parseInt(args, 10);
  if (isNaN(seedId)) {
    await ctx.reply("Номер вопроса должен быть числом: /test 21");
    return;
  }

  const question = await ctx.convex.runQuery(api.queries.getQuestionBySeedId, {
    seedId,
  });
  if (!question) {
    await ctx.reply(`Вопрос #${seedId} не найден.`);
    return;
  }

  const drillDeps = createDrillLifecycleAdapter({
    ctx: ctx.convex,
    bot: ctx.api,
  });
  await activateDrill({
    deps: drillDeps,
    telegramId,
    profile: {
      firstName: from.first_name,
      ...(from.last_name !== undefined ? { lastName: from.last_name } : {}),
      ...(from.username !== undefined ? { username: from.username } : {}),
      ...(from.language_code !== undefined ? { languageCode: from.language_code } : {}),
      chatId,
    },
    reenter: false,
  });

  const deps = createAnswerFlowAdapter({ ctx: ctx.convex, bot: ctx.api, chatId });
  await deliverQuestion({ deps, telegramUserId: telegramId, chatId, question });
});

export default composer;
