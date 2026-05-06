import { Composer } from "grammy";
import type { BotContext } from "../../context";
import { processResponse } from "../../../questions/answerFlow";
import { createAnswerFlowAdapter } from "../../../questions/answerFlowAdapter";
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

  const deps = createAnswerFlowAdapter({
    ctx: ctx.convex,
    bot: ctx.api,
    chatId,
  });

  await processResponse({
    deps,
    telegramUserId: telegramId,
    chatId,
    event:
      parsed.type === "answer"
        ? { type: "answer", choiceId: parsed.choiceId }
        : { type: "skip" },
  });

  return ctx.answerCallbackQuery();
});

export default composer;
