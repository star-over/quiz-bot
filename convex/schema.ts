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

    // BKT-F курикулум
    curriculumPointer: v.optional(v.number()),  // sortOrder последнего введённого KC
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

    slip: v.number(),  // вероятность ошибиться при знании [0,1]

    kcs: v.optional(v.array(v.string())),  // KC IDs; дублирует questionKcs для удобства
    seedId: v.optional(v.number()),
    random: v.number(),

    // Метаданные генерации
    author: v.optional(v.string()),       // slug автора-персоны (methodist, trap, ...)
    llmModel: v.optional(v.string()),     // ID модели LLM (claude-sonnet-4-5-20250514, ...)
    summary: v.optional(v.string()),      // краткое описание вопроса (для дедупликации)
    generatedAt: v.optional(v.string()),  // ISO timestamp генерации
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
  })
    .index("by_user", ["telegramUserId"])
    .index("by_user_question", ["telegramUserId", "questionId"])
    .index("by_question", ["questionId"]),

  // Реакции пользователей на сообщения бота
  userReactions: defineTable({
    telegramUserId: v.string(),
    chatId:         v.number(),
    messageId:      v.number(),
    reactions:      v.array(v.string()),  // текущий полный набор эмодзи
    updatedAt:      v.number(),
  })
    .index("by_chatId_messageId", ["chatId", "messageId"])
    .index("by_user",             ["telegramUserId"]),

  // Текстовые сообщения пользователей боту
  userMessages: defineTable({
    telegramUserId:    v.string(),
    chatId:            v.number(),
    messageId:         v.number(),
    text:              v.string(),
    sentAt:            v.number(),
    replyToMessageId:  v.optional(v.number()),  // id сообщения бота, на которое отвечает пользователь
  })
    .index("by_user",   ["telegramUserId"])
    .index("by_chatId", ["chatId"]),

  // Каталог KC (Knowledge Components)
  kcCatalog: defineTable({
    kcId:        v.string(),   // "grammar/present_time/be_am_is_are"
    category:    v.union(
      v.literal("grammar"),
      v.literal("vocab"),
      v.literal("collocation"),
      v.literal("spelling"),
    ),
    cefrLevel:   v.union(
      v.literal("A1"), v.literal("A2"),
      v.literal("B1"), v.literal("B2"),
    ),
    sortOrder:   v.number(),   // глобальная позиция в курикулуме
    random:      v.number(),   // [0,1) — для O(1) случайного выбора
    description: v.optional(v.string()),
  })
    .index("by_kcId",        ["kcId"])
    .index("by_cefr_random", ["cefrLevel", "random"])
    .index("by_sortOrder",   ["sortOrder"]),

  // M:M связь вопросов и KC
  questionKcs: defineTable({
    questionId: v.id("questions"),
    kcId:       v.string(),
    isPrimary:  v.boolean(),   // true = первый KC в kcs[]; false = вторичный
  })
    .index("by_question", ["questionId"])
    .index("by_kc",       ["kcId"]),

  // Состояние знания пользователя по KC (BKT-F)
  userMastery: defineTable({
    telegramUserId: v.string(),   // натуральный ключ (консистентно с answerLog)
    kcId:           v.string(),
    known:          v.number(),   // P(Known) на момент lastSeen [0,1]
    halfLife:       v.number(),   // дней до снижения вдвое
    lastSeen:       v.number(),   // timestamp последней практики (ms)
    nextReviewAt:   v.number(),   // timestamp когда known упадёт до 0.5 (0 = всегда активен)
    consolidated:   v.boolean(),
  })
    .index("by_user_kc",         ["telegramUserId", "kcId"])
    .index("by_user_nextReview", ["telegramUserId", "nextReviewAt"]),

}, { schemaValidation: true });
