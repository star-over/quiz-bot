// Обработчик callback-запросов для ответов на вопросы викторины
import { Context } from "grammy";

export const handleQuizAnswerCallback = async (ctx: Context) => {
  // Проверяем, что это callback-запрос
  if (!ctx.callbackQuery?.data) {
    await ctx.answerCallbackQuery({
      text: "Ошибка: некорректный запрос",
    });
    return;
  }

  try {
    // Парсим данные callback-запроса
    const callbackData = JSON.parse(ctx.callbackQuery.data);

    // Проверяем, что это ответ на вопрос викторины
    if (callbackData.type !== "quiz_answer") {
      await ctx.answerCallbackQuery({
        text: "Ошибка: некорректный тип запроса",
      });
      return;
    }

    // Извлекаем данные ответа
    const { questionId, optionId, sessionId } = callbackData;

    // Здесь будет логика обработки ответа на вопрос викторины
    // - Проверка правильности ответа
    // - Сохранение ответа в базе данных
    // - Обновление статистики пользователя
    // - Отправка следующего вопроса или результатов

    // Пока отправляем уведомление о полученном ответе
    await ctx.answerCallbackQuery({
      text: `Ваш ответ на вопрос ${questionId} записан!`,
    });

    // Обновляем сообщение с результатом
    await ctx.editMessageText(
      `Вы ответили на вопрос. Ваш выбор: вариант ${optionId}.\n\nОбработка ответов и логика викторины будет реализована в следующих итерациях.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Следующий вопрос",
                callback_data: JSON.stringify({
                  type: "next_question",
                  sessionId,
                }),
              },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("Ошибка обработки callback-запроса:", error);

    await ctx.answerCallbackQuery({
      text: "Ошибка обработки запроса",
    });

    await ctx.editMessageText(
      "Произошла ошибка при обработке вашего ответа. Пожалуйста, попробуйте еще раз."
    );
  }
};
