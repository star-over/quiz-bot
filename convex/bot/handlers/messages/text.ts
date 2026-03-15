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

// Стандартный ответ на текстовые сообщения, которые не подошли под другие обработчики
composer.on("message:text", async (ctx) => {
  await ctx.reply(
    "Я понимаю только определенные команды. Пожалуйста, используйте /help для получения списка доступных команд."
  );
});

export default composer;
