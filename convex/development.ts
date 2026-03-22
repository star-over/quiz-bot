import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { env } from "./bot/index";

/**
 * DEVELOPMENT ONLY: A query to get a user and their active machine state.
 */
export const dev_getUserState = query({
  args: { telegramId: v.string() },
  handler: async (ctx, { telegramId }): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();
  },
});

/**
 * DEVELOPMENT ONLY: A mutation to create or update a user and save their machine state.
 */
export const dev_updateUserMachineState = mutation({
  args: {
    telegramId: v.string(),
    // undefined — очистить сессию, строка — сохранить снапшот
    state: v.optional(v.string()),
  },
  handler: async (ctx, { telegramId, state }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();

    if (user) {
      await ctx.db.patch("users", user._id, { activeSession: state });
    } else {
      await ctx.db.insert("users", {
        telegramId: telegramId,
        ...(state !== undefined ? { activeSession: state } : {}),
        skillVector: {
          grammar: 0,
          vocabulary: 0,
          listening: 0,
          reading: 0,
          speaking: 0,
        },
      });
    }
  },
});


/**
 * Обновить состояние drill-машины пользователя.
 * Создаёт пользователя если не существует.
 */
export const dev_updateDrillState = mutation({
  args: {
    telegramId: v.string(),
    drillState: v.optional(v.string()),
  },
  handler: async (ctx, { telegramId, drillState }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();

    if (user) {
      await ctx.db.patch("users", user._id, { drillState });
    } else {
      await ctx.db.insert("users", {
        telegramId,
        ...(drillState !== undefined ? { drillState } : {}),
        skillVector: {
          grammar: 0,
          vocabulary: 0,
          listening: 0,
          reading: 0,
          speaking: 0,
        },
      });
    }
  },
});

/**
 * Кешировать Telegram file_id для изображения вопроса.
 * Вызывается из QuestionManager после первой отправки фото.
 */
export const cacheTelegramFileId = internalMutation({
  args: {
    questionId: v.id("questions"),
    telegramFileId: v.optional(v.string()),
  },
  handler: async (ctx, { questionId, telegramFileId }) => {
    await ctx.db.patch("questions", questionId, { telegramFileId });
  },
});

/**
 * Устанавливает webhook с корректным allowed_updates (включая message_reaction).
 * Вызывать после деплоя или при смене окружения.
 */
export const setupWebhook = action({
  args: {},
  handler: async () => {
    const path = env.ENVIRONMENT === "production"
      ? "/4b798ca0-025b-410d-bce4-46efc89e0785"
      : "/dev";
    const url = `${env.CONVEX_SITE_URL}${path}`;

    const response = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          allowed_updates: [
            "message",
            "callback_query",
            "message_reaction",
          ],
        }),
      },
    );

    const webhookResult = await response.json();

    // Установить команды меню бота
    const commandsResponse = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/setMyCommands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "start", description: "Начать отвечать на вопросы" },
            { command: "stop", description: "Остановить бота" },
            { command: "help", description: "Показать справку" },
          ],
        }),
      },
    );
    const commandsResult = await commandsResponse.json();

    return { webhook: webhookResult, commands: commandsResult } as {
      webhook: { ok: boolean; description: string };
      commands: { ok: boolean; description: string };
    };
  },
});

/**
 * DEBUG ONLY: Удаляет все документы из указанных таблиц (по умолчанию — все).
 * Используется при миграциях схемы в разработке.
 */
export const debugClearAll = mutation({
  args: {
    tables: v.optional(
      v.array(v.union(
        v.literal("users"),
        v.literal("questions"),
        v.literal("answerLog"),
      ))
    ),
  },
  handler: async (ctx, { tables }) => {
    const targets = tables ?? ["users", "questions", "answerLog"];
    const results: string[] = [];

    for (const table of targets) {
      const docs = await ctx.db.query(table).collect();
      // eslint-disable-next-line @convex-dev/explicit-table-ids
      await Promise.all(docs.map(doc => ctx.db.delete(doc._id)));
      results.push(`${table}: удалено ${docs.length}`);
    }

    return results.join("\n");
  },
});
