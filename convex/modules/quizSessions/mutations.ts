// Мутации для работы с сессиями викторин
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";

export const startQuizSession = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    userId: v.id("users"),
  },
  handler: async (ctx, { quizId, userId }) => {
    // Проверяем, существует ли викторина
    const quiz = await ctx.db.get("quizzes", quizId);
    if (!quiz) {
      throw new Error(`Quiz with id ${quizId} not found`);
    }

    // Создаем новую сессию викторины
    const sessionId = await ctx.db.insert("quizSessions", {
      quizId,
      userId,
      startedAt: Date.now(),
    });

    return sessionId;
  },
});

export const finishQuizSession = internalMutation({
  args: {
    sessionId: v.id("quizSessions"),
    score: v.number(),
  },
  handler: async (ctx, { sessionId, score }) => {
    // Проверяем, существует ли сессия
    const session = await ctx.db.get("quizSessions", sessionId);
    if (!session) {
      throw new Error(`Quiz session with id ${sessionId} not found`);
    }

    // Обновляем сессию с результатами
    await ctx.db.patch("quizSessions", sessionId, {
      finishedAt: Date.now(),
      score,
    });
  },
});

export const recordUserAnswer = internalMutation({
  args: {
    sessionId: v.id("quizSessions"),
    questionId: v.id("questions"),
    optionId: v.id("options"),
    isCorrect: v.boolean(),
  },
  handler: async (ctx, { sessionId, questionId, optionId, isCorrect }) => {
    // Проверяем, существует ли сессия
    const session = await ctx.db.get("quizSessions", sessionId);
    if (!session) {
      throw new Error(`Quiz session with id ${sessionId} not found`);
    }

    // Записываем ответ пользователя
    await ctx.db.insert("userAnswers", {
      sessionId,
      questionId,
      optionId,
      isCorrect,
      answeredAt: Date.now(),
    });
  },
});
