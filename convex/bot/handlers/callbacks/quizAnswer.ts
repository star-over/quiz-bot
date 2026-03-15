import { Composer } from "grammy";
import { BotContext } from "../../context";
import { createActor, fromPromise, waitFor } from "xstate";
import { singleChoiceQuestionMachine } from "../../../machines/singleChoiceQuestion";
import { api } from "../../../_generated/api";


const composer = new Composer<BotContext>();

// Формат callback_data: "qa:<questionId>:<optionIndex>"
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

  // 1. Загружаем пользователя и его сохраненное состояние
  const user = await ctx.convex.runQuery(api.development.dev_getUserState, { telegramId });
  if (!user || !user.activeMachineState) {
    return ctx.answerCallbackQuery({ text: "Не найдено активной сессии.", show_alert: true });
  }

  // 2. Восстанавливаем состояние актора
  const persistedState = JSON.parse(user.activeMachineState);

  // 3. Создаем машину, предоставляя имплементацию для сервиса updateMessage.
  //    editMessageText вызывается напрямую (вне машины), чтобы Convex отследил fetch.
  const chatId = ctx.chat?.id;
  const questionMachine = singleChoiceQuestionMachine.provide({
    actors: {
      updateMessageService: fromPromise(async () => {
        // noop — сообщение редактируется ниже после завершения машины
      }),
    },
  });

  // 4. Воссоздаем актора, отправляем событие и ждём состояния "persist" (displayingFeedback)
  const actor = createActor(questionMachine, { snapshot: persistedState, input: persistedState.context });
  actor.start();
  actor.send({ type: "ANSWER_SELECTED", optionId });

  const snapshot = await waitFor(actor, (s) => s.tags.has("persist") || s.status !== "active");
  const machineCtx = snapshot.context;

  // 5. Редактируем сообщение с результатом напрямую
  if (machineCtx.messageId && chatId) {
    const feedbackText = machineCtx.isCorrect ? "✅ Правильно!" : "❌ Неправильно.";
    const newText = `${machineCtx.questionText}\n\n${feedbackText}`;

    await ctx.api.editMessageText(chatId, machineCtx.messageId, newText, {
      reply_markup: { inline_keyboard: [] },
    });
  }

  // 6. Сохраняем новое состояние машины
  await ctx.convex.runMutation(api.development.dev_updateUserMachineState, {
    telegramId,
    state: JSON.stringify(snapshot),
  });

  return ctx.answerCallbackQuery();
});

export default composer;
