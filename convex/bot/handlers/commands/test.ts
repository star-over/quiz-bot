import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../context";
import { singleChoiceQuestionMachine } from "../../../machines/singleChoiceQuestion";
import { createActor, fromPromise, waitFor } from "xstate";
import { api } from "../../../_generated/api";

const composer = new Composer<BotContext>();

composer.command("test", async (ctx) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    return ctx.reply("Не удалось получить ваш ID. Попробуйте еще раз.");
  }

  // 1. Получаем случайный вопрос
  const question = await ctx.convex.runQuery(api.queries.getRandomQuestion, {
    random: Math.random(),
  });

  if (!question) {
    return ctx.reply("Не удалось найти ни одного вопроса в базе данных.");
  }

  // 2. Готовим опции и отправляем сообщение напрямую (вне машины),
  //    чтобы fetch был явно await-нут в контексте Convex action.
  const options = question.answers.map((answer, index) => ({
    id: String(index),
    text: answer.text,
    isCorrect: answer.score === 1,
  }));

  // Формат callback_data: "qa:<questionId>:<optionIndex>"
  // Лимит Telegram — 64 байта. JSON с UUID был ~107 байт, этот формат ~36 байт.
  const keyboard = new InlineKeyboard();
  options.forEach((option) => {
    keyboard.text(option.text, `qa:${question._id}:${option.id}`).row();
  });

  const message = await ctx.reply(question.text, { reply_markup: keyboard });

  // 3. Создаём машину. sendMessageService — noop, т.к. сообщение уже отправлено.
  //    Он просто возвращает реальный messageId для контекста машины.
  const questionMachine = singleChoiceQuestionMachine.provide({
    actors: {
      sendMessageService: fromPromise(async () => {
        return { messageId: message.message_id };
      }),
    },
    actions: {
      saveStatistics: ({ context }) => {
        console.log("Saving statistics for question:", context.questionId);
      },
    }
  });

  // 4. Запускаем актора и ждём состояния awaitingAnswer (тег "persist")
  const actor = createActor(questionMachine, {
    input: { questionId: question._id, questionText: question.text, options },
  });
  actor.start();

  const snapshot = await waitFor(actor, (s) => s.tags.has("persist"));

  // 5. Сохраняем состояние машины в БД
  await ctx.convex.runMutation(api.development.dev_updateUserMachineState, {
    telegramId,
    state: JSON.stringify(snapshot),
  });
});

export default composer;

