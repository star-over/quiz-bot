import { Composer } from "grammy";
import { BotContext } from "../../context";
import { api } from "../../../_generated/api";
import { QuestionManager } from "../../../questions/questionManager";

const composer = new Composer<BotContext>();

composer.command("test", async (ctx) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    return ctx.reply("Не удалось получить ваш ID. Попробуйте еще раз.");
  }

  const question = await ctx.convex.runQuery(api.queries.getRandomQuestion, {
    random: Math.random(),
  });

  if (!question) {
    return ctx.reply("Не удалось найти ни одного вопроса в базе данных.");
  }

  const manager = new QuestionManager(
    ctx.convex,
    ctx.api,
    ctx.chat.id,
    telegramId,
  );
  await manager.start(question);
});

export default composer;
