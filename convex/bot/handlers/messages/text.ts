import { Composer } from "grammy";
import { BotContext } from "../../context";

const composer = new Composer<BotContext>();

// Обработка специальных команд, которые отправлены без слэша
composer.hears(/^(помощь|help)$/i, async (ctx) => {
  await ctx.reply("Для получения помощи используйте команду /help");
});

composer.hears(/^(начать|start)$/i, async (ctx) => {
  await ctx.reply("Для начала работы используйте команду /start");
});

composer.hears(/^(викторина|quiz)$/i, async (ctx) => {
  await ctx.reply("Для начала викторины используйте команду /quiz");
});

// Обработка эхо-сообщений для тестирования
composer.hears(/^Эхо:(.*)/i, async (ctx) => {
  if (ctx.match && ctx.match[1]) {
    const echoText = ctx.match[1].trim();
    await ctx.reply(`Вы сказали: ${echoText}`);
  }
});

// Стандартный ответ на текстовые сообщения, которые не подошли под другие обработчики
composer.on("message:text", async (ctx) => {
  await ctx.reply(
    "Я понимаю только определенные команды. Пожалуйста, используйте /help для получения списка доступных команд."
  );
});

export default composer;
