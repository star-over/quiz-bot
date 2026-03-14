import { Composer } from "grammy";
import { BotContext } from "../../context";

const composer = new Composer<BotContext>();

const helpMessage = `
Справка по Quiz Bot:

/start - Начать работу с ботом
/help - Показать эту справку
/test - Запустить тестовый вопрос
`;

composer.command("help", async (ctx) => {
  await ctx.reply(helpMessage, {
    parse_mode: "Markdown",
  });
});

export default composer;
