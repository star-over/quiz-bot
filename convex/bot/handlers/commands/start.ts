import { Composer } from "grammy";
import { BotContext } from "../../context";

const composer = new Composer<BotContext>();

const welcomeMessage = `
👋 Добро пожаловать в Quiz Bot!

Я помогу вам создавать и проходить увлекательные викторины.

Доступные команды:
/start - Начать работу с ботом
/help - Показать справку
/test - Запустить тестовый вопрос
`;

composer.command("start", async (ctx) => {
  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
  });
});

export default composer;
