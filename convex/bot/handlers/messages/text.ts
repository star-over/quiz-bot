// Обработчик текстовых сообщений для Telegram бота
import { Context } from "grammy";

export const handleTextMessage = async (ctx: Context) => {
  // Проверяем, есть ли текст в сообщении
  if (!ctx.message?.text) {
    return;
  }

  const text = ctx.message.text;

  // Обработка специальных команд, которые отправлены без слэша
  switch (text.toLowerCase()) {
    case "помощь":
    case "help":
      await ctx.reply("Для получения помощи используйте команду /help");
      return;

    case "начать":
    case "start":
      await ctx.reply("Для начала работы используйте команду /start");
      return;

    case "викторина":
    case "quiz":
      await ctx.reply("Для начала викторины используйте команду /quiz");
      return;
  }

  // Обработка эхо-сообщений для тестирования
  if (text.startsWith("Эхо:")) {
    const echoText = text.substring(4).trim();
    await ctx.reply(`Вы сказали: ${echoText}`);
    return;
  }

  // Стандартный ответ на текстовые сообщения
  await ctx.reply(
    "Я понимаю только определенные команды. Пожалуйста, используйте /help для получения списка доступных команд."
  );
};
