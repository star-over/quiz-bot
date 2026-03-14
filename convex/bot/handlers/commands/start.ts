// Обработчик команды /start для Telegram бота
import { Context } from "grammy";

export const handleStartCommand = async (ctx: Context) => {
  const welcomeMessage = `
👋 Добро пожаловать в Quiz Bot!!!!


Я помогу вам создавать и проходить увлекательные викторины.

Доступные команды:
/start - Начать работу с ботом
/help - Показать справку
/quiz - Начать новую викторину
/stats - Посмотреть статистику

Готовы проверить свои знания? Начните новую викторину прямо сейчас!
  `;

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
  });
};
