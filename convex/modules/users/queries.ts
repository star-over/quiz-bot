// Запросы для работы с пользователями
import { internalQuery } from "../../_generated/server";
import { v } from "convex/values";

export const getUserByTelegramId = internalQuery({
  args: {
    telegramId: v.string(),
  },
  handler: async (ctx, { telegramId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .unique();
    return user;
  },
});

export const getUserById = internalQuery({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, { id }) => {
    const user = await ctx.db.get("users", id);
    return user;
  },
});

export const getUserStats = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    // Получаем пользователя
    const user = await ctx.db.get("users", userId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    // Подсчитываем количество пройденных викторин
    const quizSessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Подсчитываем количество правильных ответов
    let correctAnswers = 0;
    for (const session of quizSessions) {
      const sessionCorrectAnswers = await ctx.db
        .query("userAnswers")
        .filter((q) =>
          q.and(
            q.eq(q.field("sessionId"), session._id),
            q.eq(q.field("isCorrect"), true)
          )
        )
        .collect();
      correctAnswers += sessionCorrectAnswers.length;
    }

    return {
      totalQuizzes: quizSessions.length,
      correctAnswers: correctAnswers,
      accuracy: quizSessions.length > 0
        ? Math.round((correctAnswers / quizSessions.length) * 100)
        : 0,
    };
  },
});
