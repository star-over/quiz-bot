// Запросы для работы с викторинами
import { internalQuery } from "../../_generated/server";
import { v } from "convex/values";

export const getQuizById = internalQuery({
  args: {
    quizId: v.id("quizzes"),
  },
  handler: async (ctx, { quizId }) => {
    const quiz = await ctx.db.get("quizzes", quizId);
    return quiz;
  },
});

export const getQuizWithQuestions = internalQuery({
  args: {
    quizId: v.id("quizzes"),
  },
  handler: async (ctx, { quizId }) => {
    // Получаем викторину
    const quiz = await ctx.db.get("quizzes", quizId);
    if (!quiz) {
      throw new Error(`Quiz with id ${quizId} not found`);
    }

    // Получаем вопросы викторины
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();

    // Для каждого вопроса получаем варианты ответов
    const questionsWithOptions = await Promise.all(
      questions.map(async (question) => {
        const options = await ctx.db
          .query("options")
          .withIndex("by_question", (q) => q.eq("questionId", question._id))
          .collect();

        // Сортируем варианты ответов по полю order
        const sortedOptions = options.sort((a, b) => (a.order || 0) - (b.order || 0));

        return {
          ...question,
          options: sortedOptions,
        };
      })
    );

    return {
      ...quiz,
      questions: questionsWithOptions,
    };
  },
});

export const getUserQuizzes = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit = 10 }) => {
    const quizzes = await ctx.db
      .query("quizzes")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .order("desc")
      .take(limit);

    return quizzes;
  },
});
