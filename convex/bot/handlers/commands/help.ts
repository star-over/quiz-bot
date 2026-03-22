import { Composer } from "grammy";
import { BotContext } from "../../context";

const composer = new Composer<BotContext>();

const helpMessage = `
Справка по Quiz Bot:

/start - Начать отвечать на вопросы
/stop - Остановить бота
/help - Показать эту справку
`;

composer.command("help", async (ctx) => {
  await ctx.reply(helpMessage, {
    parse_mode: "Markdown",
  });
});

export default composer;
