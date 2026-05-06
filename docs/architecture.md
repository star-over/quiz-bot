# Архитектура

Детальное описание компонентов системы. Краткий обзор — в [CLAUDE.md](../CLAUDE.md).

## Request Flow

1. Telegram sends webhook POST to Convex HTTP endpoint (`convex/http.ts`)
2. Path is `/dev` in development, a UUID path in production
3. `convex/telegramBot.ts` creates a **fresh Bot instance per request** (prevents context leakage between calls)
4. Convex `ActionCtx` is injected into grammY context as `grammyCtx.convex`
5. Handlers are registered via Composer pattern and process the update

## Custom Bot Context

`BotContext` (in `convex/bot/context.ts`) extends grammY's `Context` with a `convex: ActionCtx` property, giving all handlers access to Convex queries/mutations/actions.

## Drill Loop

Бесконечная подача вопросов: `/start` → вопрос → ответ/пропуск → следующий вопрос → ...

Управляется `drillMachine` (XState, 2 состояния: `idle`, `questioning`). Drill state персистируется в `users.drillSnapshot`. `/stop` останавливает drill и удаляет неотвеченный вопрос.

**Инвариант**: в каждый момент времени в чате не более одного сообщения с inline-кнопками. Любое событие, порождающее новое сообщение с кнопками, сначала удаляет предыдущее неотвеченное.

`answerFlowAdapter.advanceDrill()` — точка входа для подачи следующего вопроса. Проверяет drill state, инициализирует или обновляет Focus Slots, выбирает KC через `pickSlot`, находит случайный вопрос для этого KC через `getRandomQuestionForKc`, возвращает вопрос. Вызывается из `processResponse()` и `/start`.

## State Machine Persistence

Два уровня XState-машин:
- **`drillMachine`** (`users.drillSnapshot`) — жизненный цикл drill (idle/questioning)
- **`scqMachine`** (`users.questionSnapshot`) — жизненный цикл одного вопроса (SCQ = Single Choice Question)

XState machine snapshots are serialized to JSON. The quiz answer callback handler rehydrates the question machine from the snapshot, sends an event, and persists the new state. States tagged with `"persist"` are the persistence points (`awaitingAnswer`, `displayingFeedback`). Machine context includes `shownAt` timestamp (set via `MESSAGE_SENT` event) for answer log timing.

## Database Schema (`convex/schema.ts`)

Таблицы:
- `users` — Telegram profile (diff-based sync через `profileKey`), XState-снапшоты (`questionSnapshot`, `drillSnapshot`), `curriculumPointer` (sortOrder последнего введённого KC), `focusSlots` (4 слота: 2 drill + 1 new + 1 review), `lastAnsweredAt` (timestamp для определения таймаута сессии)
- `skillProfiles` — legacy IRT skill vector (больше не создаётся для новых пользователей, таблица оставлена для совместимости)
- `questions` — вопросы с полем `slip` (вероятность ошибки при знании), `kcs` (KC IDs, денормализация), `random` (O(1) выбор), `imageStorageId`, `telegramFileId`, `seedId`
- `answerLog` — академический лог ответов с `kcIds` (KC вопроса на момент ответа)
- `userReactions` — emoji-реакции на сообщения бота
- `userMessages` — лог текстовых сообщений пользователя
- `kcCatalog` — каталог KC (A1–B2): `kcId`, `category`, `cefrLevel`, `sortOrder`, `random`, `description`
- `questionKcs` — M:M связь вопросов и KC: `questionId`, `kcId`, `isPrimary`
- `userMastery` — состояние знания пользователя по KC: `known`, `halfLife`, `lastSeen`, `nextReviewAt`, `consolidated`, `seenCount`

## Answer Log (`convex/answerLog.ts`)

Академический лог успеваемости — данные о правильности ответов и связанных KC. Ключевые решения:
- **`telegramUserId`** вместо Convex `userId` — натуральные ключи домена (Telegram), не зависит от пересоздания документов в Convex
- **`shownAt` + `respondedAt`** — два явных timestamp, duration вычисляется как разница
- **`skipped: boolean`** — дискриминатор; при пропуске sentinel-значения: `selectedChoiceId = -1`, `isCorrect = false`, `selectedPosition = -1`
- **`kcIds`** — денормализация KC вопроса для аналитики и per-KC калибровки
- Две мутации: `logAnswer` (ответ), `logSkip` (пропуск, инкапсулирует sentinel-значения)

## User Reactions (`convex/userReactions.ts`)

Реакции пользователей на любые сообщения бота. Одна запись на сообщение (`chatId + messageId`). Telegram присылает полный текущий набор реакций — перезаписываем. Пустой массив (пользователь убрал все) — удаляем запись. Одна мутация: `upsertReaction`.

## User Messages (`convex/userMessages.ts`)

Лог всех текстовых сообщений, отправленных пользователем боту. Хранится для будущего анализа паттернов. Логируются через middleware в `text.ts` до обработки. Одна мутация: `logMessage`.

## Pure Functions (`convex/questions/questionPure.ts`)

Бизнес-логика вопросов, извлечённая из `answerFlow` для тестируемости:
- `checkAnswer({ choices, selectedChoiceId })` — проверка правильности ответа
- `getExplanation({ context, skipped })` — выбор explanation (choice-level → question-level fallback)
- `buildFeedbackText({ context, isCorrect, skipped, omitExplanation })` — текст фидбека с маркировкой ✅/❌
- `buildDebugFooter({ seedId, slip, choicesCount, isExposure, kcs, elapsedMs })` — отладочный блок (dev mode) с Telegram HTML: guess, slip, mastery before→after, half-life, consolidated/exposure флаги

Callback-парсинг: `convex/bot/handlers/callbacks/callbackParser.ts` — `parseCallbackData({ data })`.

## BKT-F Knowledge Tracing (`convex/bkt/bktPure.ts`)

Ядро оценки знаний — чистые функции без side-эффектов:
- `bktUpdate({ known, halfLife, lastSeen, now, isCorrect, choicesCount, slip, isPrimary, consolidated, isExposure })` — 4 шага: забывание → Байес → обучение → обновление half-life. Возвращает `{ known, halfLife, nextReviewAt, consolidated }`.
- `computePriority({ known, halfLife, lastSeen, now })` — формула `0.5 × need + 0.5 × urgency` для ранжирования KC при заполнении слотов.
- `createInitialMastery({ now })` — начальные значения для нового KC (PRIOR=0.10, HALF_LIFE=1.0).

**Exposure mode** (yes_no вопросы): GUESS=0.50 даёт слабый диагностический сигнал, основной эффект через отдельные LEARN-значения (`LEARN_CORRECT_EXPOSURE=0.15`, `LEARN_WRONG_EXPOSURE=0.10`). Флаг `isExposure` передаётся в `bktUpdate()`.

**Консолидация**: known >= 0.95 И halfLife >= 64 дней → KC заморожен. Half-life ограничен сверху 365 днями (`HL_MAX`). Де-консолидация при ошибке — плавная: `known = max(0.50, known × 0.70)`, `halfLife = max(4.0, halfLife × 0.25)`.

`convex/userMastery.ts` — Convex mutation `updateMastery`: загружает вопрос + questionKcs, вызывает `bktUpdate` для каждого KC, инкрементирует `seenCount`, возвращает `MasteryUpdateEntry[]` (before/after) для debug footer в `answerFlow`.

## Focus Slots (`convex/focusSlots/`)

Drill-ориентированный слой выбора вопросов поверх BKT-F.

**Чистые функции** (`focusSlotsPure.ts`):
- `computeCurrentKnown({ known, halfLife, lastSeen, now })` — текущий known с учётом забывания
- `shouldExit({ correctStreak, consolidated })` — условие выхода KC из слота (streak >= 3 или consolidated)
- `pickSlot({ slots, masteryMap, now })` — выбор слота с минимальным currentKnown среди активных
- `initSlots({ existingSlots, masteryMap, now })` — фильтрация exit/timeout/consolidated слотов
- `chooseRefillRole({ slots, masteryMap, now, defaultRole })` — динамический выбор роли при refill: если все активные слоты выше `NEW_KC_KNOWN_THRESHOLD` (0.85), возвращает `"new"`, иначе `defaultRole`

**Convex интеграция** (`focusSlots.ts`):
- `initSlotsMutation` — инициализация/пересоздание 4 слотов с заполнением через `fillSlot`
- `pickSlotQuery` — выбор следующего KC среди не-занятых слотов
- `updateAfterAnswer` — обновление streak, totalAnswers, exit при достижении порога, динамический выбор роли refill через `chooseRefillRole`, заполнение слота

**Алгоритм `fillSlot`** — каскад приоритетов:
- Роль `drill`: active pool (known < 0.70) → due for review → fallback в `review`
- Роль `new`: окно курикулума (10 KC после `curriculumPointer`) → fallback в `review`
- Роль `review`: раннее повторение → свежие KC → хрупкие consolidated → случайный consolidated

**Интеграция в `answerFlow`**:
- `advanceDrill()` инициализирует слоты при таймауте 30 мин, выбирает слот через `pickSlot`, находит вопрос через `getRandomQuestionForKc`
- `processResponse()` обновляет BKT-F (`updateMastery`), затем обновляет Focus Slots (`updateAfterAnswer`)

## Seed Process

`make seed` runs a custom Node.js script (`seed/generation/seed.mjs`), not `convex import`. The script:
1. Validates `seed/generation/data/kc-catalog.jsonl` и `seed/generation/output/questions.json` via Zod schemas (`seed/generation/schemas.ts`, запуск через `tsx seed/generation/validate.ts`). Включает cross-reference: каждый KC из `questions[*].kcs` должен существовать в kc-catalog.
2. Seeds `kcCatalog` table из `seed/generation/data/kc-catalog.jsonl` (с генерацией `random` на лету)
3. Uploads images from `seed/generation/images/` to Convex Storage (getting `storageId` per file)
4. Deletes all existing questions **and their Storage files** (clean replace, no orphans)
5. Inserts all questions with `imageStorageId` linked to uploaded images; returns `{ seedId, convexId }[]` mapping
6. Seeds `questionKcs` table из `questions[*].kcs` (первый KC = `isPrimary: true`)

Convex-side functions are in `convex/seed.ts`: `generateUploadUrl`, `replaceKcCatalog`, `replaceQuestions`, `replaceQuestionKcs`, `clearKcMastery`, `backfillSeenCount`.

Seed файлы: `seed/generation/data/kc-catalog.jsonl` (JSONL), `seed/generation/output/questions.json` (массив вопросов). Каждый вопрос имеет стабильный `id` (→ `seedId` в БД, используется `/test <id>`), поле `kcs: string[]` с KC IDs, и `slip`.

## Question Generation Pipeline

Генерация вопросов через LLM: `seed/generation/src/` — TS-скрипты, запускаемые через `npx tsx`.

**Поток**: генерация (несколько LLM) → рецензия (Claude Sonnet 4) → компиляция → seed.

`make gen` → `make gen-review` → `make gen-compile` → `make seed`

- `seed/generation/src/generate.ts` — CLI генерации (`make gen MODEL=... KC=...`)
- `seed/generation/src/review.ts` — CLI рецензии через Claude Sonnet 4 (`make gen-review KC=...`)
- `seed/generation/src/compile.ts` — сборка `seed/generation/output/questions.json` из `seed/generation/data/generated/` (`make gen-compile`)
- `seed/generation/src/prompt.ts` — загрузка промпт-шаблона из `seed/generation/prompts/question-generation.md`
- `seed/generation/src/review-prompt.ts` — сборка промпта для рецензента
- `seed/generation/src/llm.ts` — fetch-обёртка для Anthropic/OpenAI/NVIDIA API
- `seed/generation/src/existing.ts` — чтение summary для дедупликации (EXISTING_QUESTIONS)
- `seed/generation/src/llm-schemas.ts` — Zod-схемы для валидации ответов LLM
- `seed/generation/src/review-schemas.ts` — Zod-схемы для валидации ответа рецензента
- `seed/generation/src/constants.ts` — slug'и авторов, лимиты, пути

Плоская файловая структура: KC ID `grammar/future/going_to` → имя файла `grammar--future--going_to` (слэши → `--`). Все артефакты в `seed/generation/data/generated/`: сырая генерация `{kcId}.jsonl`, после рецензии `{kcId}.review.jsonl`, заметки `{kcId}.notes.md`.

Каждый вопрос содержит метаданные: `author` (slug персоны), `llmModel` (ID модели), `summary` (для дедупликации), `generatedAt` (ISO timestamp). После рецензии добавляется `reviewNote`.

## Question Images

- **Format**: PNG (avoids double JPEG compression by Telegram)
- **Size**: 800×800 bounding box (matches Telegram's `x` PhotoSize variant displayed inline in chat)
- **Storage**: Convex Storage (flat blob store, no folders). `imageStorageId` in question document → Storage file
- **Telegram caching**: `telegramFileId` field caches Telegram's `file_id` after first send. Falls back to Storage URL if cache is stale. `answerFlowAdapter.displayQuestion()` handles the 3-level fallback: `telegramFileId` → `imageStorageId` URL → text-only
- **Feedback editing**: `isPhoto` flag in machine context determines `editMessageCaption` vs `editMessageText`. If caption > 1024 chars, explanation is sent as a separate message.
