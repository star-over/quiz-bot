import { describe, it, expect, beforeEach, beforeAll, afterEach } from "vitest";
import { makeTextUpdate, makeCallbackUpdate, makeReactionUpdate } from "../fixtures/updates";
import type { createTestBot } from "../helpers/botTestHarness";

// Устанавливаем env vars ДО импорта бота (validateEnvVars вызывается при загрузке модуля)
process.env.CONVEX_CLOUD_URL = "https://test.convex.cloud";
process.env.CONVEX_SITE_URL = "https://test.convex.site";
process.env.ENVIRONMENT = "development";
process.env.BOT_TOKEN = "fake:token";

type TestBot = Awaited<ReturnType<typeof createTestBot>>;
let testBot: TestBot;

beforeAll(async () => {
  const { createTestBot: create } = await import("../helpers/botTestHarness");
  testBot = await create();
});

beforeEach(() => {
  testBot.apiCalls.length = 0;
  testBot.convex.runQuery.mockReset().mockResolvedValue(null);
  testBot.convex.runMutation.mockReset().mockResolvedValue(undefined).mockResolvedValueOnce({ allowed: true, retryAfterMs: 0 });
});

describe("/help", () => {
  it("отправляет сообщение со справкой", async () => {
    await testBot.send(makeTextUpdate({ text: "/help" }));

    const sendCalls = testBot.apiCalls.filter((c) => c.method === "sendMessage");
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]?.payload.text).toContain("/start");
    expect(sendCalls[0]?.payload.text).toContain("/stop");
    expect(sendCalls[0]?.payload.text).toContain("/help");
  });
});

describe("/stop", () => {
  it("при отсутствии пользователя — отправляет сообщение об остановке", async () => {
    // runQuery возвращает null (пользователь не найден)
    await testBot.send(makeTextUpdate({ text: "/stop" }));

    const sendCalls = testBot.apiCalls.filter((c) => c.method === "sendMessage");
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]?.payload.text).toContain("остановлен");
  });

  it("при активном вопросе — удаляет сообщение и очищает snapshot", async () => {
    // Генерируем валидный drillSnapshot через реальную машину
    const { createActor } = await import("xstate");
    const { drillMachine } = await import("../../convex/machines/drillMachine");
    const drillActor = createActor(drillMachine);
    drillActor.start();
    drillActor.send({ type: "START" });
    const validDrillSnapshot = JSON.stringify(drillActor.getSnapshot());

    const snapshot = JSON.stringify({
      context: { messageId: 555 },
      value: "awaitingAnswer",
    });
    testBot.convex.runQuery.mockResolvedValueOnce({
      _id: "user1",
      telegramId: "123456789",
      questionSnapshot: snapshot,
      drillSnapshot: validDrillSnapshot,
    });

    await testBot.send(makeTextUpdate({ text: "/stop" }));

    const deleteCalls = testBot.apiCalls.filter((c) => c.method === "deleteMessage");
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]?.payload.message_id).toBe(555);
  });
});

describe("/start", () => {
  it("вызывает ensureUser и updateDrillSnapshot", async () => {
    await testBot.send(makeTextUpdate({ text: "/start" }));

    const mutationCalls = testBot.convex.runMutation.mock.calls;
    // Должен вызвать ensureUser и updateDrillSnapshot
    expect(mutationCalls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("callback_query: answer", () => {
  it("вызывает answerCallbackQuery", async () => {
    await testBot.send(makeCallbackUpdate({ data: "qa:question1:1" }));

    const answerCalls = testBot.apiCalls.filter((c) => c.method === "answerCallbackQuery");
    expect(answerCalls).toHaveLength(1);
  });

  it("при отсутствии questionSnapshot — не вызывает editMessage", async () => {
    // runQuery возвращает null (нет активной сессии)
    await testBot.send(makeCallbackUpdate({ data: "qa:question1:2" }));

    const editCalls = testBot.apiCalls.filter(
      (c) => c.method === "editMessageText" || c.method === "editMessageCaption",
    );
    expect(editCalls).toHaveLength(0);
  });
});

describe("callback_query: skip", () => {
  it("вызывает answerCallbackQuery", async () => {
    await testBot.send(makeCallbackUpdate({ data: "skip:question1" }));

    const answerCalls = testBot.apiCalls.filter((c) => c.method === "answerCallbackQuery");
    expect(answerCalls).toHaveLength(1);
  });
});

describe("callback_query: invalid", () => {
  it("некорректные данные — answerCallbackQuery с alert", async () => {
    await testBot.send(makeCallbackUpdate({ data: "garbage" }));

    const answerCalls = testBot.apiCalls.filter((c) => c.method === "answerCallbackQuery");
    expect(answerCalls).toHaveLength(1);
    expect(answerCalls[0]?.payload.show_alert).toBe(true);
  });

  it("callback без chat.id — answerCallbackQuery без обработки", async () => {
    const update = makeCallbackUpdate({ data: "qa:q1:1" });
    if (update.callback_query?.message) {
      (update.callback_query.message as any).chat = undefined;
    }

    await testBot.send(update);

    const answerCalls = testBot.apiCalls.filter((c) => c.method === "answerCallbackQuery");
    expect(answerCalls).toHaveLength(1);
    // Нет show_alert и текста — просто пустой answerCallbackQuery
    expect(answerCalls[0]?.payload.show_alert).toBeUndefined();
  });
});

// Хелпер: создаёт валидный snapshot scqMachine в состоянии awaitingAnswer
async function makeAwaitingAnswerSnapshot(): Promise<string> {
  const { createActor } = await import("xstate");
  const { scqMachine } = await import("../../convex/machines/scqMachine");
  const actor = createActor(scqMachine, {
    input: {
      questionId: "question1",
      prompt: "Test?",
      explanation: undefined,
      choices: [
        { id: 1, content: "Right", isCorrect: true },
        { id: 2, content: "Wrong", isCorrect: false },
      ],
    },
  });
  actor.start();
  actor.send({ type: "MESSAGE_SENT", messageId: 100, isPhoto: false, shownAt: Date.now() - 2000 });
  return JSON.stringify(actor.getSnapshot());
}

describe("debug footer (dev mode)", () => {
  afterEach(() => {
    // Восстанавливаем dev-режим после каждого теста
    process.env.ENVIRONMENT = "development";
  });

  it("dev mode + kcs → footer присутствует в фидбеке", async () => {
    const snapshot = await makeAwaitingAnswerSnapshot();

    // runQuery: getByTelegramId → getQuestionById → getCatalogEntries → getByTelegramId (next())
    testBot.convex.runQuery
      .mockResolvedValueOnce({ _id: "user1", telegramId: "123456789", questionSnapshot: snapshot })
      .mockResolvedValueOnce({ _id: "question1", seedId: 7, slip: 0.08, kcs: ["spelling/receive"], choices: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] })
      .mockResolvedValueOnce([{ kcId: "spelling/receive", cefrLevel: "B1", category: "spelling" }])
      .mockResolvedValueOnce(null); // next() → нет drill

    // runMutation: updateMastery → mastery results (остальные мутации возвращают undefined)
    testBot.convex.runMutation
      .mockResolvedValueOnce([{ kcId: "spelling/receive", after: { known: 0.32, halfLife: 2.0 } }]);

    await testBot.send(makeCallbackUpdate({ data: "qa:question1:1" }));

    const editCalls = testBot.apiCalls.filter((c) => c.method === "editMessageText");
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]?.payload.text).toContain("━━━━━━━━━━━━");
    expect(editCalls[0]?.payload.text).toContain("#7");
    expect(editCalls[0]?.payload.text).toContain("spelling/receive");
    expect(editCalls[0]?.payload.text).toContain("<i>slip</i>=8%");
    expect(editCalls[0]?.payload.text).toContain("<i>guess</i>=25%");
    expect(editCalls[0]?.payload.text).toContain("→ 0.32");
  });

  it("dev mode, новый KC → показывает 🆕 → after (без before)", async () => {
    const snapshot = await makeAwaitingAnswerSnapshot();

    testBot.convex.runQuery
      .mockResolvedValueOnce({ _id: "user1", telegramId: "123456789", questionSnapshot: snapshot })
      .mockResolvedValueOnce({ _id: "question1", seedId: 7, slip: 0.08, kcs: ["spelling/receive"], choices: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] })
      .mockResolvedValueOnce([{ kcId: "spelling/receive", cefrLevel: "B1", category: "spelling" }])
      .mockResolvedValueOnce(null);

    // updateMastery: новый KC — нет before
    testBot.convex.runMutation
      .mockResolvedValueOnce([{ kcId: "spelling/receive", after: { known: 0.32, halfLife: 2.0 } }]);

    await testBot.send(makeCallbackUpdate({ data: "qa:question1:1" }));

    const editCalls = testBot.apiCalls.filter((c) => c.method === "editMessageText");
    expect(editCalls[0]?.payload.text).toContain("🆕 → 0.32");
  });

  it("prod mode → footer отсутствует в фидбеке", async () => {
    process.env.ENVIRONMENT = "production";

    const snapshot = await makeAwaitingAnswerSnapshot();

    testBot.convex.runQuery
      .mockResolvedValueOnce({ _id: "user1", telegramId: "123456789", questionSnapshot: snapshot })
      .mockResolvedValueOnce(null); // next() → нет drill

    // updateMastery возвращает [] (вопрос без KC — как в реальности)
    testBot.convex.runMutation.mockResolvedValueOnce([]);

    await testBot.send(makeCallbackUpdate({ data: "qa:question1:1" }));

    const editCalls = testBot.apiCalls.filter((c) => c.method === "editMessageText");
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]?.payload.text).not.toContain("━━━━━━━━━━━━");
  });

  it("dev mode, kcs отсутствуют → footer не добавляется", async () => {
    const snapshot = await makeAwaitingAnswerSnapshot();

    testBot.convex.runQuery
      .mockResolvedValueOnce({ _id: "user1", telegramId: "123456789", questionSnapshot: snapshot })
      .mockResolvedValueOnce({ _id: "question1", seedId: 7, slip: 0.08, kcs: [] }) // пустой kcs
      .mockResolvedValueOnce(null); // next()

    // updateMastery возвращает [] (вопрос без KC — как в реальности)
    testBot.convex.runMutation.mockResolvedValueOnce([]);

    await testBot.send(makeCallbackUpdate({ data: "qa:question1:1" }));

    const editCalls = testBot.apiCalls.filter((c) => c.method === "editMessageText");
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]?.payload.text).not.toContain("━━━━━━━━━━━━");
  });
});

describe("text messages", () => {
  it("'помощь' → подсказка использовать /help", async () => {
    await testBot.send(makeTextUpdate({ text: "помощь" }));

    const sendCalls = testBot.apiCalls.filter((c) => c.method === "sendMessage");
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]?.payload.text).toContain("/help");
  });

  it("'начать' → подсказка использовать /start", async () => {
    await testBot.send(makeTextUpdate({ text: "начать" }));

    const sendCalls = testBot.apiCalls.filter((c) => c.method === "sendMessage");
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]?.payload.text).toContain("/start");
  });

  it("произвольный текст → сообщение о сохранении", async () => {
    await testBot.send(makeTextUpdate({ text: "привет, бот!" }));

    const sendCalls = testBot.apiCalls.filter((c) => c.method === "sendMessage");
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]?.payload.text).toContain("Спасибо за сообщение");
  });

  it("текст с reply_to_message → передает replyToMessageId в logMessage", async () => {
    const update = makeTextUpdate({ text: "ответ" });
    (update.message as any).reply_to_message = { message_id: 777 };

    await testBot.send(update);

    const mutationCalls = testBot.convex.runMutation.mock.calls;
    const logCall = mutationCalls.find(
      (call) => call[1]?.text === "ответ",
    );
    expect(logCall?.[1]).toMatchObject({ replyToMessageId: 777 });
  });
});

describe("message reactions", () => {
  it("реакция → вызывает upsertReaction", async () => {
    await testBot.send(makeReactionUpdate());

    const mutationCalls = testBot.convex.runMutation.mock.calls;
    // call[0] — пустой объект-ссылка на Convex функцию, call[1] — аргументы
    const upsertCall = mutationCalls.find(
      (call) => call[1]?.telegramUserId === "123456789" && call[1]?.reactions?.includes("👍"),
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall?.[1]).toMatchObject({
      telegramUserId: "123456789",
      reactions: ["👍"],
    });
  });

  it("анонимная реакция (без user) → не вызывает upsertReaction", async () => {
    const anonymousReaction = {
      update_id: 9999,
      message_reaction: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123456789, type: "private", first_name: "Test" },
        // user отсутствует
        old_reaction: [],
        new_reaction: [{ type: "emoji", emoji: "👍" }],
      },
    };
    await testBot.send(anonymousReaction as any);

    const mutationCalls = testBot.convex.runMutation.mock.calls;
    const upsertCall = mutationCalls.find(
      (call) => call[1]?.reactions?.includes("👍"),
    );
    expect(upsertCall).toBeUndefined();
  });

  it("custom_emoji реакция → не добавляет в emojis", async () => {
    const customReaction = {
      update_id: 9998,
      message_reaction: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123456789, type: "private", first_name: "Test" },
        user: { id: 123456789, is_bot: false, first_name: "Test" },
        old_reaction: [],
        new_reaction: [{ type: "custom_emoji", custom_emoji_id: "abc123" }],
      },
    };
    await testBot.send(customReaction as any);

    const mutationCalls = testBot.convex.runMutation.mock.calls;
    const upsertCall = mutationCalls.find(
      (call) => call[1]?.telegramUserId === "123456789",
    );
    expect(upsertCall?.[1]).toMatchObject({
      reactions: [],
    });
  });
});

describe("rate limiting", () => {
  it("превышен лимит (текст) → блокирует и отправляет предупреждение", async () => {
    // Первая мутация: rate limit check → блокируем
    testBot.convex.runMutation.mockReset().mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 5_000,
    });

    await testBot.send(makeTextUpdate({ text: "/help" }));

    const sendCalls = testBot.apiCalls.filter((c) => c.method === "sendMessage");
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]?.payload.text).toContain("Слишком много запросов");
    expect(sendCalls[0]?.payload.text).toContain("5 с");
  });

  it("превышен лимит (callback) → answerCallbackQuery с alert", async () => {
    testBot.convex.runMutation.mockReset().mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 3_200,
    });

    await testBot.send(makeCallbackUpdate({ data: "qa:question1:1" }));

    const answerCalls = testBot.apiCalls.filter((c) => c.method === "answerCallbackQuery");
    expect(answerCalls).toHaveLength(1);
    expect(answerCalls[0]?.payload.text).toContain("Слишком много запросов");
    expect(answerCalls[0]?.payload.show_alert).toBe(true);
  });
});
