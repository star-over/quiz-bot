import { Composer } from "grammy";
import { createActor } from "xstate";
import type { BotContext } from "../../context";
import { internal } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";
import { deliverQuestion } from "../../../questions/answerFlow";
import { createAnswerFlowAdapter } from "../../../questions/answerFlowAdapter";

const composer = new Composer<BotContext>();

composer.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from || !ctx.chat.id) return;

  const telegramId = from.id.toString();
  const chatId = ctx.chat.id;

  await ctx.convex.runMutation(internal.users.ensureUser, {
    telegramId,
    firstName: from.first_name,
    ...(from.last_name !== undefined ? { lastName: from.last_name } : {}),
    ...(from.username !== undefined ? { username: from.username } : {}),
    ...(from.language_code !== undefined ? { languageCode: from.language_code } : {}),
    chatId,
  });

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

  const deps = createAnswerFlowAdapter({ ctx: ctx.convex, bot: ctx.api, chatId });
  const nextQuestion = await deps.advanceDrill({ telegramUserId: telegramId, now: Date.now() });
  if (nextQuestion) {
    await deliverQuestion({ deps, telegramUserId: telegramId, chatId, question: nextQuestion });
  }
});

export default composer;
