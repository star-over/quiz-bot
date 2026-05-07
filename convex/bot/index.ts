// Основной файл для инициализации и настройки Telegram бота
import type { Bot } from "grammy";
import { validateEnvVars } from "./envValidator";
import type { BotContext } from "./context";
import type { EnvVars } from "./envValidator";

// Импортируем все обработчики-композеры
import startCommand from "./handlers/commands/start";
import helpCommand from "./handlers/commands/help";
import testCommand from "./handlers/commands/test";
import stopCommand from "./handlers/commands/stop";
import textMessages from "./handlers/messages/text";
import quizAnswerCallback from "./handlers/callbacks/callbackRouter";
import reactionHandler from "./handlers/callbacks/reactionHandler";
import rateLimitMiddleware from "./rateLimit";

// Lazy singleton: валидация откладывается до первого вызова getEnv()
let _env: EnvVars | undefined;
export function getEnv(): EnvVars {
  if (!_env) _env = validateEnvVars();
  return _env;
}

/**
 * Регистрирует все обработчики (композеры) для бота.
 * Этот подход позволяет нам инициализировать бота и внедрять зависимости (например, контекст Convex)
 * на верхнем уровне, а затем просто применять к нему всю логику.
 * @param bot Экземпляр бота, к которому будут применены обработчики.
 */
export const registerHandlers = (bot: Bot<BotContext>) => {
  // Rate limit first
  bot.use(rateLimitMiddleware);

  // Регистрируем все композеры
  bot.use(startCommand);
  bot.use(helpCommand);
  bot.use(testCommand);
  bot.use(stopCommand);

  // Обработчик колбэков и реакций должен идти до обработчика текстовых сообщений
  bot.use(quizAnswerCallback);
  bot.use(reactionHandler);
  bot.use(textMessages);
};
