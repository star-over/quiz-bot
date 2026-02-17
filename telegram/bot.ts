// Telegram bot implementation for Convex httpAction
import { Bot } from "grammy";

// Create a bot instance without starting it
// The bot token will be used in Convex environment variables
const bot = new Bot(process.env.BOT_TOKEN || "");

// Register bot commands and handlers
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

// Export the bot for use in Convex httpAction
export default bot;
