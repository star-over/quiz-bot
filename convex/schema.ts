// Схема базы данных для Quiz Bot
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Пользователи
  users: defineTable({
    telegramId: v.string(),
    username: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    languageCode: v.optional(v.string()),
    isPremium: v.boolean(),
    createdAt: v.number(),
    lastActiveAt: v.number(),
  }).index("by_telegramId", ["telegramId"]),

  // Викторины
  quizzes: defineTable({
    title: v.string(),
    description: v.string(),
    creatorId: v.id("users"),
    isPublic: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_creator", ["creatorId"]),

  // Вопросы
  questions: defineTable({
    quizId: v.id("quizzes"),
    text: v.string(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_quiz", ["quizId"]),

  // Варианты ответов
  options: defineTable({
    questionId: v.id("questions"),
    text: v.string(),
    isCorrect: v.boolean(),
    order: v.number(),
  }).index("by_question", ["questionId"]),

  // Сессии викторин
  quizSessions: defineTable({
    quizId: v.id("quizzes"),
    userId: v.id("users"),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    score: v.optional(v.number()),
  }).index("by_user", ["userId"])
    .index("by_quiz", ["quizId"]),

  // Ответы пользователей
  userAnswers: defineTable({
    sessionId: v.id("quizSessions"),
    questionId: v.id("questions"),
    optionId: v.id("options"),
    isCorrect: v.boolean(),
    answeredAt: v.number(),
  }).index("by_session", ["sessionId"])
    .index("by_question", ["questionId"]),

  // Аналитика
  analytics: defineTable({
    userId: v.id("users"),
    eventType: v.string(),
    payload: v.any(),
    timestamp: v.number(),
  }).index("by_user", ["userId"])
    .index("by_event", ["eventType"]),
}, { schemaValidation: true });
