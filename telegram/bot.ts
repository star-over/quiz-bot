// Упрощенный эхо-бот без использования дополнительных зависимостей
import { Bot } from "grammy";
import dotenv from "dotenv";
dotenv.config();

// Создаем бота
const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN must be provided!");
}

const bot = new Bot(token);

// Команда /start
bot.command("start", async (ctx) => {
  await ctx.reply("Привет! Я эхо-бот. Отправь мне любое сообщение, и я его повторю.");
});

// Эхо-ответ на любые текстовые сообщения
bot.on("message:text", async (ctx) => {
  await ctx.reply(`Вы сказали: ${ctx.message.text}`);
});

// Обработка любых других сообщений
bot.on("message", async (ctx) => {
  await ctx.reply("Пожалуйста, отправьте текстовое сообщение.");
});

// Обработка ошибок
bot.catch((err) => {
  console.error(`Error while handling update ${err.ctx.update.update_id}:`);
  console.error(err.error);
});

// Запуск бота
bot.start({
  onStart: (botInfo) => {
    console.log(`Бот @${botInfo.username} запущен!`);
  },
});

console.log("Бот запущен...");
