import { Composer } from "grammy";
import type { BotContext } from "../../context";
import { QuestionManager } from "../../../questions/questionManager";
import { parseCallbackData } from "./callbackParser";

const composer = new Composer<BotContext>();

composer.on("callback_query:data", async (ctx) => {
  const parsed = parseCallbackData({ data: ctx.callbackQuery.data });
  const telegramId = ctx.from.id.toString();
  const chatId = ctx.chat?.id;

  if (!chatId) return ctx.answerCallbackQuery();

  if (parsed === null) {
    return ctx.answerCallbackQuery({ text: "Некорректные данные кнопки.", show_alert: true });
  }

  const manager = new QuestionManager({ ctx: ctx.convex, bot: ctx.api, chatId, telegramId });

  if (parsed.type === "answer") {
    await manager.handleAnswer(parsed.choiceId);
  } else {
    await manager.handleSkip();
  }

  return ctx.answerCallbackQuery();
});

export default composer;
