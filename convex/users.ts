import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * Собирает profileKey из полей Telegram-профиля.
 * Одно строковое сравнение вместо четырёх — быстрый short-circuit
 * при отсутствии изменений (99.9% запросов).
 */
export function profileKey({
  firstName,
  lastName,
  username,
  languageCode,
}: {
  firstName: string;
  lastName?: string | undefined;
  username?: string | undefined;
  languageCode?: string | undefined;
}): string {
  return `${firstName}\0${lastName ?? ""}\0${username ?? ""}\0${languageCode ?? ""}`;
}

/**
 * Получить пользователя по telegramId.
 */
export const getByTelegramId = internalQuery({
  args: { telegramId: v.string() },
  handler: async (ctx, { telegramId }): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();
  },
});

/**
 * Создать или синхронизировать пользователя из Telegram-контекста.
 * - Создаёт пользователя + skillProfile при первом взаимодействии
 * - При повторных вызовах — сравнивает profileKey, пишет в БД только при изменении
 */
export const ensureUser = internalMutation({
  args: {
    telegramId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    languageCode: v.optional(v.string()),
    chatId: v.number(),
  },
  handler: async (ctx, args) => {
    const { telegramId, firstName, lastName, username, languageCode, chatId } = args;
    const key = profileKey({ firstName, lastName, username, languageCode });

    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();

    if (!user) {
      // Новый пользователь
      await ctx.db.insert("users", {
        telegramId,
        firstName,
        ...(lastName !== undefined ? { lastName } : {}),
        ...(username !== undefined ? { username } : {}),
        ...(languageCode !== undefined ? { languageCode } : {}),
        profileKey: key,
        chatId,
        createdAt: Date.now(),
      });

      return;
    }

    // Существующий пользователь — проверяем profileKey
    if (user.profileKey === key) return; // Ничего не изменилось

    // Редкий случай: профиль обновился
    await ctx.db.patch("users", user._id, {
      firstName,
      ...(lastName !== undefined ? { lastName } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(languageCode !== undefined ? { languageCode } : {}),
      profileKey: key,
    });
  },
});

/**
 * Обновить снапшот question-машины.
 * undefined — очистить снапшот.
 */
export const updateQuestionSnapshot = internalMutation({
  args: {
    telegramId: v.string(),
    questionSnapshot: v.optional(v.string()),
  },
  handler: async (ctx, { telegramId, questionSnapshot }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();
    if (!user) throw new Error(`Пользователь ${telegramId} не найден`);

    await ctx.db.patch("users", user._id, { questionSnapshot });
  },
});

/**
 * Обновить снапшот drill-машины.
 * undefined — очистить снапшот.
 */
export const updateDrillSnapshot = internalMutation({
  args: {
    telegramId: v.string(),
    drillSnapshot: v.optional(v.string()),
  },
  handler: async (ctx, { telegramId, drillSnapshot }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();
    if (!user) throw new Error(`Пользователь ${telegramId} не найден`);

    await ctx.db.patch("users", user._id, { drillSnapshot });
  },
});
