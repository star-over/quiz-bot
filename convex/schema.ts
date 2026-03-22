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
    // Telegram-профиль (синхронизируется через profileKey)
    telegramId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    languageCode: v.optional(v.string()),
    profileKey: v.string(),

    // Контекст чата
    chatId: v.number(),

    // Временные метки
    createdAt: v.number(),

    // XState-снапшоты
    questionSnapshot: v.optional(v.string()),
    drillSnapshot: v.optional(v.string()),
  })
    .index("by_telegramId", ["telegramId"])
    .index("by_chatId", ["chatId"]),

  // Профиль навыков (IRT)
  skillProfiles: defineTable({
    userId: v.id("users"),
    skillVector: skillVector,
  }).index("by_userId", ["userId"]),

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

    seedId: v.optional(v.number()),
    random: v.number(),
  })
    .index("by_random", ["random"])
    .index("by_seedId", ["seedId"]),

  // Лог ответов
  answerLog: defineTable({
    // Что произошло
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    skipped: v.boolean(),               // true = пропуск, false = ответ
    selectedChoiceId: v.number(),       // стабильный id из choices[].id, -1 при пропуске
    isCorrect: v.boolean(),             // false при пропуске

    // Контекст выбора
    choicesCount: v.number(),
    selectedPosition: v.number(),       // 1-based, позиция на экране после shuffle, -1 при пропуске
    correctPosition: v.number(),        // 1-based, позиция правильного ответа после shuffle

    // Когда
    shownAt: v.number(),                // timestamp показа вопроса
    respondedAt: v.number(),            // timestamp ответа или пропуска

    // Telegram context
    chatId: v.number(),
    messageId: v.number(),

    // User feedback
    reactions: v.optional(v.array(v.string())),
  })
    .index("by_user", ["telegramUserId"])
    .index("by_user_question", ["telegramUserId", "questionId"])
    .index("by_question", ["questionId"])
    .index("by_chatId_messageId", ["chatId", "messageId"]),

}, { schemaValidation: true });
