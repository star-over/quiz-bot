import { Composer } from "grammy";
import { BotContext } from "../../context";
import { QuestionManager } from "../../../questions/questionManager";

const composer = new Composer<BotContext>();

// Форматы callback_data:
// "qa:<questionId>:<optionId>" — вопросы с одиночным выбором
// "yn:<questionId>:<optionId>" — вопросы Да/Нет
const QA_PREFIX = "qa:";
const YN_PREFIX = "yn:";

composer.on("callback_query:data", async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const telegramId = ctx.from.id.toString();
  const chatId = ctx.chat?.id;

  if (!chatId) return ctx.answerCallbackQuery();

  if (callbackData.startsWith(QA_PREFIX) || callbackData.startsWith(YN_PREFIX)) {
    const prefix = callbackData.startsWith(QA_PREFIX) ? QA_PREFIX : YN_PREFIX;
    const parts = callbackData.slice(prefix.length).split(":");
    const optionIdRaw = parts[1];

    if (!optionIdRaw) {
      return ctx.answerCallbackQuery({ text: "Некорректные данные кнопки.", show_alert: true });
    }

    const optionId = parseInt(optionIdRaw, 10);
    if (isNaN(optionId)) {
      return ctx.answerCallbackQuery({ text: "Некорректные данные кнопки.", show_alert: true });
    }

    const manager = new QuestionManager(ctx.convex, ctx.api, chatId, telegramId);
    await manager.handleAnswer(optionId);
  }

  return ctx.answerCallbackQuery();
});

export default composer;
