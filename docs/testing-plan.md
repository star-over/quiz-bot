# План внедрения тестирования

## Контекст

Проект — адаптивный Telegram quiz-бот (grammY + Convex + XState v5 + Zod 4 + TypeScript strict). Сейчас тестов нет — только `make lint` (tsc + eslint) и ручные `make test-query` / `make test-mutation`. Цель — выстроить пирамиду тестирования поэтапно, от дешёвого к дорогому.

---

## Этап 0: Усиление статического анализа ✅

- [x] Переписать ESLint на нативный flat config (`tseslint.config()`) — убран FlatCompat
- [x] Апгрейд до `strictTypeChecked` + `stylisticTypeChecked`
- [x] Добавить error-правила: `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`, `eqeqeq`
- [x] Добавить warn-правила: `consistent-type-imports`, `no-non-null-assertion`, `no-unnecessary-condition`, `restrict-template-expressions`, `no-implicit-coercion`, `prefer-nullish-coalescing`, `array-type`, `consistent-type-definitions`
- [x] tsconfig: добавить `verbatimModuleSyntax`, `erasableSyntaxOnly`, `forceConsistentCasingInFileNames`, `noFallthroughCasesInSwitch`, `moduleDetection: "force"`. Убрать `isolatedModules`.
- [x] Обновить зависимости: установить `typescript-eslint`, удалить `@eslint/eslintrc`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
- [x] Исправить все error'ы: `import type` (9 файлов), parameter properties → explicit fields, `type` → `interface`, `Array<T>` → `T[]`, пустой `.catch()`
- [x] `make lint` — 0 errors, 18 warnings (все стилистические)

**Файлы:** `eslint.config.mjs`, `tsconfig.json`, `package.json`, `convex/questions/answerFlow.ts`, `convex/bot/keyboard.ts`, `convex/machines/types.ts`, `convex/bot/handlers/commands/stop.ts` + 9 файлов с `import type`

---

## Этап 1: Инфраструктура тестирования ✅

- [x] `npm install -D vitest`
- [x] Создать `vitest.config.ts`
- [x] Создать структуру папок `tests/unit/`, `tests/fixtures/`
- [x] Создать fixtures: `tests/fixtures/choices.ts`, `tests/fixtures/contexts.ts`, `tests/fixtures/updates.ts`
- [x] Добавить `make test` и `make test-watch` в Makefile
- [x] Добавить `make lint-fix` в Makefile
- [x] `make test` запускается (smoke test)

**Новые файлы:** `vitest.config.ts`, `tests/fixtures/*.ts`, `tests/unit/smoke.test.ts`
**Модифицируемые:** `package.json`, `Makefile`

---

## Этап 2: Рефакторинг — изоляция чистых функций ✅

- [x] Создать `convex/bot/handlers/callbacks/callbackParser.ts` — извлечь парсинг callback_data
- [x] Обновить `callbackRouter.ts` — использовать `parseCallbackData()`
- [x] Создать `convex/questions/questionPure.ts` — `checkAnswer`, `getExplanation`, `buildFeedbackText`
- [x] Обновить `answerFlow.ts` — делегировать в `questionPure.ts`
- [x] Конвертировать все проектные функции на объектные параметры: `profileKey`, `makeSingleChoiceKeyboard`, `makeYesNoKeyboard`, конструктор `QuestionManager`, `showFeedback`, `trySendPhoto`
- [x] `make lint` — 0 errors, 0 warnings, `max-warnings` снижен до 0
- [x] `make test` — зелёный

**Новые файлы:** `convex/bot/handlers/callbacks/callbackParser.ts`, `convex/questions/questionPure.ts`
**Модифицируемые:** `callbackRouter.ts`, `answerFlow.ts`, `users.ts`, `keyboard.ts`, `start.ts`, `test.ts`, `eslint.config.mjs`, `Makefile`

---

## Этап 3: Unit-тесты чистых функций ✅

- [x] `tests/unit/keyboard.test.ts` (9 тестов) — canUseInlineLabels, makeSingleChoiceKeyboard, makeYesNoKeyboard
- [x] `tests/unit/checkAnswer.test.ts` (3 теста) — правильный/неправильный/несуществующий choiceId
- [x] `tests/unit/buildFeedbackText.test.ts` (6 тестов) — результат, маркировка, omitExplanation
- [x] `tests/unit/getExplanation.test.ts` (5 тестов) — fallback, skipped
- [x] `tests/unit/parseCallback.test.ts` (8 тестов) — QA/YN/skip формат, невалидные данные
- [x] `tests/unit/profileKey.test.ts` (5 тестов) — все поля, optional, уникальность
- [x] `tests/unit/envValidator.test.ts` (5 тестов) — happy path, missing vars, invalid enum
- [x] `make test` — 45 тестов, все зелёные
- [x] `make lint` — 0 errors, 0 warnings

**Новые файлы:** `tests/unit/*.test.ts` (7 файлов)

---

## Этап 4: Тесты XState-машин ✅

- [x] `tests/machines/drillMachine.test.ts` (6 тестов) — idle→questioning, STOP→idle, re-entry, idle+STOP, snapshot round-trip
- [x] `tests/machines/singleChoiceQuestion.test.ts` (10 тестов) — happy path, skip path, context updates, persist tag, snapshot round-trip, finish state
- [x] `make test` — 60 тестов, все зелёные
- [x] `make lint` — 0 errors, 0 warnings

**Новые файлы:** `tests/machines/*.test.ts` (2 файла)

---

## Этап 5: Integration-тесты (grammY handleUpdate + transformer) ✅

- [x] `tests/helpers/botTestHarness.ts` — transformer перехватывает API-вызовы, mock Convex context, инъекция convex, registerHandlers
- [x] `tests/integration/botHandleUpdate.test.ts` (8 тестов):
  - /help → sendMessage со справкой
  - /stop → сообщение об остановке, удаление вопроса при активной сессии
  - /start → ensureUser + updateDrillSnapshot
  - callback_query answer/skip → answerCallbackQuery
  - invalid callback → alert
- [x] `tests/fixtures/updates.ts` — автоматический `bot_command` entity для команд
- [x] `make test` — 68 тестов, все зелёные
- [x] `make lint` — 0 errors, 0 warnings

**Новые файлы:** `tests/helpers/botTestHarness.ts`, `tests/integration/botHandleUpdate.test.ts`

---

## Этап 6: Seed validation — переход на Zod ✅

- [x] `seed/schemas.ts` — Zod-схемы: `choiceSchema`, `questionSchema`, `questionsArraySchema` с refinements (уникальность id/random, cross-field логика choiceType)
- [x] `seed/validate.ts` — замена `validate.mjs`, запуск через `tsx`, Zod + проверка файлов изображений
- [x] Удалён `seed/validate.mjs`
- [x] `tests/unit/seedSchemas.test.ts` (20 тестов):
  - Валидный вопрос, id не целое, пустой prompt, невалидный choiceType
  - Менее 2 вариантов, нет правильного, single+2 correct, yes_no+3
  - random >= 1, random < 0, IRT нечисловое
  - Дубликаты choice.id, choice.content, score не 0/1
  - Массив: дубликат question.id, дубликат random, пустой массив
- [x] `make validate-seed` — ✅
- [x] `make test` — 88 тестов, все зелёные
- [x] `make lint` — 0 errors, 0 warnings

**Новые файлы:** `seed/schemas.ts`, `seed/validate.ts`, `tests/unit/seedSchemas.test.ts`
**Удалённые:** `seed/validate.mjs`
**Модифицируемые:** `Makefile`

---

## Верификация (после каждого этапа)

1. `make lint` — проходит без ошибок
2. `make test` (с этапа 1) — все тесты зелёные
3. `make dev` — бот работает (регрессия)
4. `make validate-seed` — seed-валидация работает (с этапа 6)
