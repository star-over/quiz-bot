// Мутации для работы с пользователями
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";

export const createUser = internalMutation({
  args: {
    telegramId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    languageCode: v.optional(v.string()),
    isPremium: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Проверяем, существует ли пользователь с таким telegramId
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (existingUser) {
      // Если пользователь существует, обновляем его данные
      await ctx.db.patch("users", existingUser._id, {
        firstName: args.firstName,
        lastName: args.lastName,
        username: args.username,
        languageCode: args.languageCode,
        isPremium: args.isPremium,
        lastActiveAt: Date.now(),
      });

      return existingUser._id;
    } else {
      // Если пользователь не существует, создаем нового
      const userId = await ctx.db.insert("users", {
        telegramId: args.telegramId,
        firstName: args.firstName,
        lastName: args.lastName,
        username: args.username,
        languageCode: args.languageCode,
        isPremium: args.isPremium,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });

      return userId;
    }
  },
});

export const updateUserLastActive = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch("users", userId, {
      lastActiveAt: Date.now(),
    });
  },
});
