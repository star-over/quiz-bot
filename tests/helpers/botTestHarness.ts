/**
 * Test harness для integration-тестов grammY бота.
 *
 * Использует transformer для перехвата ВСЕХ исходящих API-вызовов Telegram.
 * Mock Convex context подменяет runQuery/runMutation/runAction.
 */
import { Bot } from "grammy";
import type { Update } from "grammy/types";
import { vi } from "vitest";
import type { BotContext } from "../../convex/bot/context";

// Один перехваченный вызов Telegram Bot API
export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

/**
 * Создаёт бот-инстанс с перехватом API-вызовов.
 * Возвращает { bot, apiCalls, send, convex }.
 */
export async function createTestBot() {
  // Динамический import: registerHandlers тянет validateEnvVars,
  // который читает process.env — мокаем до импорта
  const { registerHandlers } = await import("../../convex/bot/index");

  const apiCalls: ApiCall[] = [];
  const convex = {
    runQuery: vi.fn().mockResolvedValue(null),
    runMutation: vi.fn().mockResolvedValue(undefined),
    runAction: vi.fn().mockResolvedValue(undefined),
    storage: {
      getUrl: vi.fn().mockResolvedValue(null),
    },
  };

  // Фейковый токен — API-вызовы не дойдут до Telegram
  const bot = new Bot<BotContext>("fake:token");

  // Middleware: инъекция mock Convex context
  bot.use((ctx, next) => {
    ctx.convex = convex as any;
    return next();
  });

  // Регистрируем хендлеры (те же, что в продакшне)
  registerHandlers(bot);

  // Transformer: перехват исходящих вызовов
  bot.api.config.use((_prev, method, payload) => {
    apiCalls.push({ method, payload: payload as Record<string, unknown> });
    return fakeApiResponse(method);
  });

  // Инициализация бота (загрузка botInfo) без реального API-вызова
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: "TestBot",
    username: "test_bot",
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
  };
  await bot.init();

  async function send(update: Update) {
    await bot.handleUpdate(update);
  }

  return { bot, apiCalls, send, convex };
}

// Минимальные фейковые ответы для Telegram Bot API методов
function fakeApiResponse(method: string) {
  const messageResult = {
    ok: true,
    result: {
      message_id: 999,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 123456789, type: "private", first_name: "Test" },
      text: "",
    },
  };

  switch (method) {
    case "sendMessage":
    case "editMessageText":
    case "editMessageCaption":
      return Promise.resolve(messageResult);
    case "sendPhoto":
      return Promise.resolve({
        ok: true,
        result: {
          ...messageResult.result,
          photo: [{ file_id: "fake_file_id", file_unique_id: "fake", width: 800, height: 800, file_size: 1000 }],
        },
      });
    case "deleteMessage":
    case "answerCallbackQuery":
      return Promise.resolve({ ok: true, result: true });
    default:
      return Promise.resolve({ ok: true, result: true });
  }
}
