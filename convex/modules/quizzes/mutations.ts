// Мутации для работы с викторинами
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";

export const createQuiz = internalMutation({
  args: {
    title: v.string(),
    description: v.string(),
    creatorId: v.id("users"),
    isPublic: v.boolean(),
    questions: v.array(
      v.object({
        text: v.string(),
        order: v.number(),
        options: v.array(
          v.object({
            text: v.string(),
            isCorrect: v.boolean(),
            order: v.number(),
          })
        ),
      })
    ),
  },
  handler: async (ctx, { title, description, creatorId, isPublic, questions }) => {
    // Создаем викторину
    const quizId = await ctx.db.insert("quizzes", {
      title,
      description,
      creatorId,
      isPublic,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Создаем вопросы и варианты ответов
    for (const question of questions) {
      const questionId = await ctx.db.insert("questions", {
        quizId,
        text: question.text,
        order: question.order,
        createdAt: Date.now(),
      });

      // Создаем варианты ответов для вопроса
      for (const option of question.options) {
        await ctx.db.insert("options", {
          questionId,
          text: option.text,
          isCorrect: option.isCorrect,
          order: option.order,
        });
      }
    }

    return quizId;
  },
});

export const updateQuiz = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, { quizId, title, description, isPublic }) => {
    // Проверяем, существует ли викторина
    const quiz = await ctx.db.get("quizzes", quizId);
    if (!quiz) {
      throw new Error(`Quiz with id ${quizId} not found`);
    }

    // Обновляем викторину
    await ctx.db.patch("quizzes", quizId, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(isPublic !== undefined && { isPublic }),
      updatedAt: Date.now(),
    });
  },
});
