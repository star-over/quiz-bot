# Архитектура для сложного Telegram бота на Convex

## 1. Структура каталогов

```
convex/
├── _generated/                 # Автоматически сгенерированные файлы Convex
├── bot/                        # Основная логика бота
│   ├── handlers/               # Обработчики сообщений
│   │   ├── commands/           # Обработчики команд
│   │   ├── messages/            # Обработчики сообщений
│   │   └── callbacks/           # Обработчики callback-запросов
│   ├── services/               # Сервисы бота
│   ├── models/                  # Модели данных
│   └── utils/                  # Вспомогательные функции
├── database/                    # Схемы базы данных и миграции
├── modules/                    # Модули функциональности
│   ├── users/                  # Модуль пользователей
│   ├── quizzes/                # Модуль викторин
│   └── analytics/              # Модуль аналитики
├── shared/                     # Общие типы и утилиты
└── schema.ts                   # Основная схема базы данных
```

## 2. Компоненты архитектуры

### 2.1. Структура базы данных

```typescript
// convex/database/schema.ts
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
});
```

### 2.2. Модульная структура функций

```
convex/modules/
├── users/
│   ├── queries.ts              # Запросы пользователей
│   ├── mutations.ts            # Мутации пользователей
│   └── actions.ts              # Действия пользователей
├── quizzes/
│   ├── queries.ts              # Запросы викторин
│   ├── mutations.ts            # Мутации викторин
│   └── actions.ts              # Действия викторин
└── analytics/
    ├── queries.ts              # Запросы аналитики
    ├── mutations.ts            # Мутации аналитики
    └── actions.ts              # Действия аналитики
```

### 2.3. Структура обработчиков бота

```
convex/bot/handlers/
├── commands/
│   ├── start.ts                # Обработчик /start
│   ├── help.ts                 # Обработчик /help
│   ├── quiz.ts                 # Обработчик /quiz
│   └── stats.ts                # Обработчик /stats
├── messages/
│   ├── text.ts                 # Обработчик текстовых сообщений
│   └── media.ts                # Обработчик медиа сообщений
└── callbacks/
    ├── quizAnswer.ts           # Обработчик ответов на вопросы
    └── navigation.ts           # Обработчик навигационных кнопок
```

## 3. Рекомендации по масштабированию

1. **Разделение по модулям**: Каждая функциональность должна быть в отдельном модуле
2. **Использование internal функций**: Для внутренних вызовов использовать internalQuery/internalMutation
3. **Индексы базы данных**: Создавать индексы для часто используемых запросов
4. **Кэширование**: Использовать кэширование для часто запрашиваемых данных
5. **Очереди задач**: Для длительных операций использовать очереди задач
6. **Мониторинг**: Внедрить систему логирования и мониторинга

## 4. Пример организации функций

```typescript
// convex/modules/users/queries.ts
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
      .first();
    return user;
  },
});
```

```typescript
// convex/modules/users/mutations.ts
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";

export const createUser = internalMutation({
  args: {
    telegramId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", {
      telegramId: args.telegramId,
      firstName: args.firstName,
      lastName: args.lastName,
      username: args.username,
      isPremium: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    });
    return userId;
  },
});
```

## 5. Паттерны проектирования

1. **Модульность**: Каждый модуль отвечает за свою область функциональности
2. **Разделение уровней**: Четкое разделение между обработчиками, сервисами и моделями
3. **Инкапсуляция данных**: Доступ к данным только через определенные функции
4. **Типизация**: Использование TypeScript для строгой типизации
5. **Тестирование**: Возможность модульного тестирования каждого компонента
