// Основной файл для инициализации и настройки Telegram бота
import { Bot } from "grammy";
import { handleStartCommand } from "./handlers/commands/start";
import { handleHelpCommand } from "./handlers/commands/help";
import { handleTextMessage } from "./handlers/messages/text";
import { handleQuizAnswerCallback } from "./handlers/callbacks/quizAnswer";
import { validateEnvVars } from "./envValidator";

// Валидируем переменные окружения
export const env = validateEnvVars();

// Создаем экземпляр бота
const bot = new Bot(env.BOT_TOKEN);



// Регистрируем обработчики команд
bot.command("start", handleStartCommand);
bot.command("help", handleHelpCommand);

// Регистрируем обработчики сообщений
bot.on("message:text", handleTextMessage);

// Регистрируем обработчики callback-запросов
bot.callbackQuery(/.*/, handleQuizAnswerCallback);

// Экспортируем бота для использования в Convex httpAction
export default bot;
