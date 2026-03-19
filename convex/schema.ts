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
    activeSession: v.optional(v.string()),
  }).index("by_telegramId", ["telegramId"]),

  // Вопросы
  questions: defineTable({
    choiceType: v.union(                         // тип взаимодействия
      v.literal("single"),
      v.literal("multiple"),
      v.literal("yes_no"),
    ),
    prompt: v.string(),                          // Telegram HTML — текст вопроса
    explanation: v.optional(v.string()),         // Telegram HTML — общее объяснение (fallback)
    audioStorageId: v.optional(v.id("_storage")),  // аудио-контент вопроса
    imageStorageId: v.optional(v.id("_storage")),  // изображение вопроса
    telegramFileId: v.optional(v.string()),          // кеш Telegram file_id для изображения
    skillVector: v.optional(v.record(v.string(), v.number())),

    choices: v.array(v.object({
      id: v.number(),                            // стабильный целочисленный ID
      content: v.string(),                       // Telegram HTML — отображается в теле сообщения
      score: v.number(),                         // 0 | 1 (задел на частичный балл)
      explanation: v.optional(v.string()),       // Telegram HTML — специфичное объяснение (override)
      pin: v.optional(v.union(
        v.literal("first"),
        v.literal("last")
      )),
    })),

    irtParameters: v.object({
      difficulty: v.number(),       // b параметр 4PL
      discriminability: v.number(), // a параметр 4PL
      guessing: v.number(),         // c параметр 4PL (нижняя асимптота)
      slip: v.number(),             // d параметр 4PL (верхняя асимптота)
    }),

    random: v.number(),
  }).index("by_random", ["random"]),

  // Лог ответов
  answerLog: defineTable({
    userId: v.id("users"),
    questionId: v.id("questions"),
    isCorrect: v.boolean(),
    answeredAt: v.number(),
    selectedChoiceId: v.number(),  // стабильный id из choices[].id
    skillVectorBefore: skillVector,
    skillVectorAfter: skillVector,
  }).index("by_user", ["userId"]),

}, { schemaValidation: true });
