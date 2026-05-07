import { Composer } from "grammy";
import type { BotContext } from "../../context";
import { deliverQuestion } from "../../../questions/answerFlow";
import { createAnswerFlowAdapter } from "../../../questions/answerFlowAdapter";
import { activateDrill } from "../../drillLifecycle";
import { createDrillLifecycleAdapter } from "../../drillLifecycleAdapter";

const composer = new Composer<BotContext>();

composer.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from || !ctx.chat.id) return;

  const telegramId = from.id.toString();
  const chatId = ctx.chat.id;

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
  });

  const deps = createAnswerFlowAdapter({ ctx: ctx.convex, bot: ctx.api, chatId });
  const nextQuestion = await deps.advanceDrill({ telegramUserId: telegramId, now: Date.now() });
  if (nextQuestion) {
    await deliverQuestion({ deps, telegramUserId: telegramId, chatId, question: nextQuestion });
  }
});

export default composer;
