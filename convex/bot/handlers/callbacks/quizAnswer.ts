import { Composer } from "grammy";
import { BotContext } from "../../context";
import { SingleChoiceQuestionManager } from "../../../questions/singleChoiceQuestion";

const composer = new Composer<BotContext>();

// Формат callback_data: "qa:<questionId>:<optionId>"
const QA_PREFIX = "qa:";

composer.on("callback_query:data", async (ctx) => {
  const callbackData = ctx.callbackQuery.data;

  if (!callbackData.startsWith(QA_PREFIX)) {
    return ctx.answerCallbackQuery();
  }

  const telegramId = ctx.from.id.toString();
  const parts = callbackData.slice(QA_PREFIX.length).split(":");
  const optionId = parts[1];

  if (!optionId) {
    return ctx.answerCallbackQuery({ text: "Некорректные данные кнопки.", show_alert: true });
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    return ctx.answerCallbackQuery();
  }

  const manager = new SingleChoiceQuestionManager(
    ctx.convex,
    ctx.api,
    chatId,
    telegramId,
  );
  await manager.handleAnswer(optionId);

  return ctx.answerCallbackQuery();
});

export default composer;
