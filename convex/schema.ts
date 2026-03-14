import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const skillVector = v.object({
  grammar: v.number(),
  vocabulary: v.number(),
  listening: v.number(),
  reading: v.number(),
  speaking: v.number(),
});

export default defineSchema({
  // Пользователи
  users: defineTable({
    telegramId: v.string(),
    // ... (другие поля пользователя)
    skillVector: skillVector,
    activeMachineState: v.optional(v.string()),
  }).index("by_telegramId", ["telegramId"]),

  // Вопросы (теперь с ответами внутри)
  questions: defineTable({
    text: v.string(),
    irtParameters: v.object({
      difficulty: v.number(),
      discriminability: v.number(),
      guessing: v.number(),
      slip: v.number(),
      weights: skillVector,
    }),
    // Вложенный массив вариантов ответов
    answers: v.array(
      v.object({
        text: v.string(),
        score: v.number(), // 0 для неверного, 1 для верного, и т.д.
      })
    ),
    // Поле для эффективного случайного выбора
    random: v.number(),
  }).index("by_random", ["random"]),

  // Лог ответов
  answerLog: defineTable({
    userId: v.id("users"),
    questionId: v.id("questions"),
    isCorrect: v.boolean(),
    answeredAt: v.number(),
    // Индекс выбранного пользователем варианта в массиве 'answers'
    selectedAnswerIndex: v.number(), 
    skillVectorBefore: skillVector,
    skillVectorAfter: skillVector,
  }).index("by_user", ["userId"]),

}, { schemaValidation: true });
