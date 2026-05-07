# Архитектурный обзор — найденное трение и deepening opportunities

> Дата: 2026-05-06
> Автор: improve-codebase-architecture skill session
> Статус: Candidate 1–2 выполнены, остальные — открыты
> Использовать для: продолжения рефакторинга в новых сессиях без повторного обхода кодовой базы

---

## Как использовать этот документ

Этот файл — результат полного обхода кодовой базы quiz-bot с позиции improve-codebase-architecture skill. Перед началом работы в новой сессии:

1. Прочитать этот файл целиком
2. Прочитать `CONTEXT.md` — глоссарий доменных терминов
3. Выбрать кандидата из таблицы ниже
4. Перейти к детальному описанию кандидата
5. Приступить к grilling loop / планированию / реализации

**Не проводить повторный обход codebase** — он уже выполнен и зафиксирован здесь.

---

## Глоссарий архитектурных терминов

Используемые в этом документе термины (из [LANGUAGE.md] — если не существует, создать при первом использовании):

- **Module** — всё с интерфейсом и реализацией (функция, класс, файл, package)
- **Interface** — всё, что вызывающий должен знать: типы, инварианты, ошибки, порядок
- **Implementation** — код внутри модуля
- **Depth** — leverage на интерфейсе: много поведения за маленьким интерфейсом
- **Shallow** — интерфейс почти так же сложен, как реализация
- **Seam** — место, где живёт интерфейс; точка, через которую поведение можно изменить без правки in-place
- **Adapter** — конкретная реализация интерфейса на seam
- **Leverage** — что получает вызывающий от глубины модуля
- **Locality** — что получает maintainer: изменения, баги, знание сконцентрированы в одном месте
- **Deletion test** — представить удаление модуля. Если сложность исчезает — модуль был pass-through. Если сложность появляется в N вызывающих — модуль оправдывал существование.

---

## Сводная таблица кандидатов

| # | Приоритет | Модуль / Seam | Проблема | Тесты | Статус | Файлы |
|---|---|---|---|---|---|---|
| 1 | 🔴 Высокий | `QuestionManager` → `answerFlow` | God class 532 строк, untested, duplication handleAnswer/handleSkip | 0 | ✅ **Решено** | `convex/questions/questionManager.ts` (удалён) |
| 2 | 🔴 Высокий | `focusSlots.ts` | Untested cascade fillSlot, 6 fallback-путей, O(n) запросы | 19 | ✅ **Решено** | `convex/focusSlots/focusSlots.ts` (wrappers), `focusSlotsImpl.ts`, `focusSlotsAdapter.ts`, `focusSlotsTypes.ts` |
| 3 | 🔴 Высокий | `userMastery.ts` | Untested bridge BKT→DB, `Infinity` workaround, условный `before` | 0 | ❌ Открыто | `convex/userMastery.ts` |
| 4 | 🔴 Высокий | `getRecentAnswersForKc` | Full collect + JS filter, нет индекса `by_user_kc` | 0 | ❌ Открыто | `convex/answerLog.ts` |
| 5 | 🟡 Средний | `seed/generate.ts` + `review.ts` | ~100 строк duplication | N/A | ❌ Открыто | `seed/generation/src/generate.ts`, `review.ts` |
| 6 | 🟡 Средний | Drill activation | Дублирование в `start.ts` + `test.ts`, raw `JSON.parse` | 0 | ❌ Открыто | `convex/bot/handlers/commands/start.ts`, `test.ts`, `stop.ts` |
| 7 | 🟡 Средний | `development.ts` | Hidden side effect on import через `validateEnvVars()` | 0 | ❌ Открыто | `convex/development.ts` |
| 8 | 🟢 Низкий | `scqMachine` | Shallow module, 4 состояния, почти никакой логики | ✅ | ❌ Открыто | `convex/machines/scqMachine.ts` |
| 9 | 🟢 Низкий | Coverage | Broken V8 coverage mapping → null% для всех convex-файлов | N/A | ❌ Открыто | `coverage/coverage-final.json` |
| 10 | 🟢 Низкий | `context.ts`, `types.ts` | Shallow type-only модули | N/A | ❌ Открыто | `convex/bot/context.ts`, `convex/machines/types.ts` |

---

## Candidate 1: QuestionManager → Answer Flow ✅ РЕШЕНО

### Файлы
- **Удалён:** `convex/questions/questionManager.ts` (532 строки)
- **Созданы:** `convex/questions/answerFlow.ts`, `answerFlowAdapter.ts`, `answerFlowTypes.ts`
- **Созданы тесты:** `tests/unit/answerFlow.test.ts`
- **Изменены:** `convex/answerLog.ts`, `convex/bot/handlers/callbacks/callbackRouter.ts`, `convex/bot/handlers/commands/start.ts`, `convex/bot/handlers/commands/test.ts`
- **Обновлены docs:** `docs/architecture.md`, `docs/testing-plan.md`, `convex/development.ts`

### Проблема
`QuestionManager` — god class, смешивал 4 слоя:
1. Telegram I/O (`sendPhoto`, `sendMessage`, `editMessageCaption`, `deleteMessage`)
2. XState оркестрация (`scqMachine` lifecycle)
3. Answer Flow (`handleAnswer`/`handleSkip`: парсинг → проверка → mastery → slots → feedback → log → next)
4. Question Delivery (`start()`: подготовка текста, keyboard, debug footer, photo fallback)

`handleAnswer` (88 строк) и `handleSkip` (82 строки) — ~80% копипасты. Отличия: `isCorrect`, `skipped`, `logAnswer` vs `logSkip`.

Zero тестов на интеграцию. Real bugs (race snapshot parsing, incorrect mutation args, photo fallback race) скрывались в orchestration code.

### Решение
Глубокий модуль `answerFlow.ts` с двумя функциями:
- `processResponse({ deps, telegramUserId, chatId, event })` — весь answer flow за 1 вызов
- `deliverQuestion({ deps, telegramUserId, chatId, question })` — подготовка и отправка вопроса

Крупный адаптер `AnswerFlowDeps` на шве между политикой (deep module) и механизмом (Convex + Telegram). Реализация — `answerFlowAdapter.ts`.

Объединены:
- `handleAnswer`/`handleSkip` → `processResponse` с `AnswerEvent` дискриминантом
- `logAnswer`/`logSkip` → `logResponse` с `skipped: boolean` дискриминантом

### Локальность
Баг в answer flow теперь живёт в 1 файле (`answerFlow.ts`), не bouncing между `callbackRouter.ts` → `QuestionManager` → `userMastery.ts` → `focusSlots.ts` → `answerLog.ts`.

### Leverage
Вызывающий передаёт 1 event (`{ type: "answer", choiceId }` или `{ type: "skip" }`), модуль выполняет 10+ шагов оркестрации.

### Тесты
5 unit-тестов со stub-адаптером:
- `deliverQuestion` отправляет вопрос и сохраняет сессию
- `deliverQuestion` удаляет старое сообщение при активной сессии
- `processResponse` обрабатывает правильный ответ
- `processResponse` обрабатывает пропуск
- `processResponse` ничего не делает без сессии

---

## Candidate 2: Focus Slots DB Integration ✅ РЕШЕНО

### Файлы
- **Переписан:** `convex/focusSlots/focusSlots.ts` (~370 → ~39 строк, thin wrappers)
- **Созданы:** `convex/focusSlots/focusSlotsImpl.ts` (deep module, 316 строк), `focusSlotsAdapter.ts` (153 строки), `focusSlotsTypes.ts` (42 строки)
- **Созданы тесты:** `tests/unit/focusSlots.test.ts` (19 тестов)
- **Изменён:** `convex/focusSlots/focusSlotsPure.ts` (экспорт `MS_PER_DAY`)

### Проблема
`fillSlot` — ~170-строчная async функция с deeply nested cascading fallback. `initSlotsMutation` смешивал инициализацию слотов, обновление `curriculumPointer` и role filling. **Zero integration tests.**

### Решение
Глубокий **Slot Filler module** (`focusSlotsImpl.ts`) с интерфейсом через `SlotFillerDeps`:
- `fillSlot({ deps, telegramUserId, role, occupiedKcIds, now })` — каскад 6 путей
- `initSlots({ deps, telegramUserId, now })` — инициализация + refill + bump curriculumPointer
- `updateAfterAnswer({ deps, telegramUserId, kcId, isCorrect, now })` — streak → exit → refill
- `pickSlotForUser({ deps, telegramUserId, excludedKcIds, now })` — выбор слота

`focusSlotsAdapter.ts` — реализация `SlotFillerDeps` через Convex `QueryCtx`/`MutationCtx`.

`focusSlots.ts` — тонкие wrappers (`internalMutation`/`internalQuery`), сохраняющие пути API для `answerFlowAdapter.ts`.

### Локальность
Баг в cascade fallbacks теперь живёт в 1 файле (`focusSlotsImpl.ts`), не bouncing между `answerFlowAdapter.ts` → `focusSlots.ts` → `userMastery.ts`.

### Leverage
Вызывающий передаёт `deps` + 3–5 параметров, модуль выполняет 6+ шагов каскада.

### Тесты
19 unit-тестов со stub-адаптером:
- `fillSlot` — все 6 fallback-путей (drill: active → due → review; new: window → extended → review; review: early → fresh → fragile → random → wide window → any → null)
- `initSlots` — фильтрация consolidated, bump curriculumPointer, user not found
- `updateAfterAnswer` — wrong answer retention, correct×3 exit, consolidated exit, chooseRefillRole → "new"

### Остаточный техдолг
- `.collect()` в `getSeenKcIds` — inherited, требует schema-изменения (Candidate 4)
- `.take(1000)` в `getKcIdsWithQuestions` — inherited
- `.filter()` в adapter — необходимы из-за отсутствия composite indexes по `known`/`consolidated`/`lastSeen`

---

## Candidate 3: User Mastery Bridge 🔴 ОТКРЫТО

### Файлы
- `convex/userMastery.ts` (52-151 строки)
- `convex/bkt/bktPure.ts` (344 строки, 347 строк тестов — отлично)
- `tests/unit/bktPure.test.ts`

### Проблема
`updateMastery` — untested bridge между BKT-F math и Convex DB writes.

Что делает:
1. Загружает question → `questionKcs`
2. Loop over KC:
   - Load existing mastery (или `createInitialMastery`)
   - Call `bktUpdate`
   - `Infinity` workaround: `Number.isFinite(output.nextReviewAt) ? output.nextReviewAt : 32503680000000`
   - Write back via `ctx.db.patch` / `ctx.db.insert`
3. Returns `MasteryUpdateEntry[]` with conditional `before` field (only for existing mastery)

**Real bugs скрыты здесь:**
- `before` field shape — conditional. Consumed by `QuestionManager.buildFeedbackDebugFooter()` (now `answerFlow.ts`). Контракт неявный.
- `Infinity` serialization edge case
- `seenCount` инкрементируется, но нигде не используется — dead data?
- Null handling: `question` may be `null` after `ctx.db.get`, но `updateMastery` returns `[]` — silent no-op

### Deletion test
Удалить `userMastery.ts` — BKT math остаётся, но DB bridge logic переедет в callers. **Модуль оправдывает существование.**

### Предлагаемое решение
Глубокий **Mastery Update Engine** с интерфейсом:
```ts
updateMastery({ questionId, isCorrect, respondedAt }): Promise<MasteryUpdateEntry[]>
```

DB reads/writes, `Infinity` workaround, `before`/`after` shape — internal concerns. `seenCount` increment — тоже internal.

### Тесты
Нужны тесты с in-memory DB adapter:
- New KC → `before` отсутствует, `after` присутствует
- Existing KC → `before` + `after`
- `Infinity` edge case → serialized to ~3000-01-01
- Question not found → `[]`
- Secondary KC → `LEARN × 0.5`
- Exposure mode (yes_no) → отдельные LEARN-константы

---

## Candidate 4: Answer Log Query Anti-Pattern 🔴 ОТКРЫТО

### Файлы
- `convex/answerLog.ts` — `getRecentAnswersForKc`

### Проблема
```ts
const answers = await ctx.db
  .query("answerLog")
  .withIndex("by_user", (q) => q.eq("telegramUserId", telegramUserId))
  .collect();
const filtered = answers.filter((a) => a.kcIds?.includes(kcId));
return filtered.slice(-limit).map(...);
```

Загружает **все** answer log entries для пользователя, фильтрует в JS. Для активного пользователя с тысячами ответов — O(n) память и CPU **на каждый вопрос**.

Нет индекса `by_user_kc`.

### Fix
Добавить индекс `by_user_kc` в `convex/schema.ts`:
```ts
.index("by_user_kc", ["telegramUserId", "kcIds"])
```

Или, если Convex не поддерживает array index directly, денормализовать: добавить `primaryKcId` (первый KC вопроса) в `answerLog` и индексировать по нему.

---

## Candidate 5: Seed Generation Duplication 🟡 ОТКРЫТО

### Файлы
- `seed/generation/src/generate.ts`
- `seed/generation/src/review.ts`

### Проблема
~100 строк дублирования:

| Функция | generate.ts | review.ts |
|---|---|---|
| `loadKcCatalog()` | ✅ lines 72-76 | ✅ lines 54-58 |
| `filterKcs()` | ✅ lines 78-96 | ✅ lines 60-78 |
| `parseJsonFromLlm()` | ✅ lines 100-104 | ✅ lines 119-123 |
| `escapeAmpersands()` | ✅ lines 107-110 | ✅ lines 125-128 |
| `sanitizeHtmlFields()` | ✅ lines 113-128 | ✅ lines 130-145 |
| `validateHtmlFields()` | ✅ lines 131-166 | ✅ lines 147-167 |
| `KcEntry` interface | ✅ lines 64-70 | ✅ lines 46-52 |

**Deletion test:** удалить `review.ts` — ~80 строк unique logic переедут в `generate.ts` или shared module. Остальное — duplication.

### Предлагаемое решение
Shared `seed/generation/src/shared.ts` с:
- `loadKcCatalog()`
- `filterKcs()`
- `parseJsonFromLlm()`
- `sanitizeHtmlFields()`
- `validateHtmlFields()`

Оба скрипта импортируют shared module.

---

## Candidate 6: Drill Activation Duplication 🟡 ОТКРЫТО

### Файлы
- `convex/bot/handlers/commands/start.ts`
- `convex/bot/handlers/commands/test.ts`
- `convex/bot/handlers/commands/stop.ts`

### Проблема
`start.ts` и `test.ts` содержат ~25 строк одинаковой drill-активации:
1. `ensureUser`
2. `getByTelegramId`
3. `createActor(drillMachine)` + `send(START)`
4. `updateDrillSnapshot`

`stop.ts` тоже парсит `drillSnapshot`, но с **raw `JSON.parse()`** вместо `safeParseSnapshot`:
```ts
const old = JSON.parse(user.questionSnapshot) as { context?: { messageId?: number } };
```
Если snapshot corrupted — `JSON.parse` throws. `answerFlow.ts` обрабатывает это gracefully через `safeParseSnapshot`.

### Предлагаемое решение
Глубокий **Drill Lifecycle module** с интерфейсом:
```ts
activateDrill({ userId }): Promise<void>
deactivateDrill({ userId }): Promise<void>
isDrilling({ userId }): Promise<boolean>
```

Snapshot serialization, actor lifecycle, `safeParseSnapshot` guard — живут внутри.

### Тесты
- Corrupted drill snapshot → graceful reset
- Idle → START → questioning
- Questioning → STOP → idle
- Snapshot round-trip

---

## Candidate 7: Hidden Side Effect on Import 🟡 ОТКРЫТО

### Файлы
- `convex/development.ts`
- `convex/bot/index.ts`

### Проблема
```ts
// convex/development.ts
import { env } from "./bot/index";
```

`bot/index.ts` (line 17):
```ts
export const env = validateEnvVars();
```

`validateEnvVars()` вызывается при **загрузке модуля**. Любой import `development.ts` — прямой или транзитивный — триггерит env validation.

**Почему это ломает тесты:** `botHandleUpdate.test.ts` вынужден ставить `process.env` **до** импорта бота:
```ts
process.env.CONVEX_CLOUD_URL = "https://test.convex.cloud";
// ...then import
const { createTestBot } = await import("../helpers/botTestHarness");
```

Если кто-то добавит import выше — тест сломается.

### Fix
Lazy evaluation:
```ts
// bot/index.ts
let _env: ReturnType<typeof validateEnvVars> | undefined;
export function getEnv() {
  if (!_env) _env = validateEnvVars();
  return _env;
}
```

Или use lazy singleton pattern.

---

## Candidate 8: scqMachine — Shallow Module 🟢 ОТКРЫТО

### Файлы
- `convex/machines/scqMachine.ts` (73 строки)
- `convex/machines/types.ts` (17 строк)

### Проблема
4 состояния (`displayingQuestion` → `awaitingAnswer` → `displayingFeedback` → `finish`), почти никакой логики — только `assign`. Интерфейс (4 события, 4 состояния, 7 полей контекста) почти так же сложен, как реализация.

**Deletion test:** заменить на типизированный snapshot с runtime invariant'ами:
```ts
interface QuestionSession {
  questionId: string;
  messageId: number;
  isPhoto: boolean;
  shownAt: number;
  selectedChoiceId?: number;
}
```

+ guard-функции для проверки валидных переходов.

**Контраргумент:** консистентность с `drillMachine` ("всё состояние в машинах"). `drillMachine` оправдан (idle/questioning + START/STOP), `scqMachine` — transaction log.

### Решение
Оставить как есть для консистентности, но пометить как **intentionally shallow** в комментарии. Не трогать без пересмотра всего state management подхода.

---

## Candidate 9: Broken Coverage Report 🟢 ОТКРЫТО

### Файлы
- `coverage/coverage-final.json`
- `vitest.config.ts`

### Проблема
`coverage/coverage-final.json` показывает `null%` для **всех** convex-файлов, хотя тесты явно импортируют и exercise их.

Причина: V8 coverage provider неправильно мапит transpiled test imports обратно на source files. Convex-файлы компилируются через особый pipeline, и source maps не выстроены.

### Fix
Исследовать vitest coverage provider config:
- `coverage.provider: 'v8'` → `coverage.provider: 'istanbul'`?
- `coverage.include` / `coverage.exclude`?
- Source map generation для `convex/` директории?

---

## Candidate 10: Shallow Type-Only Modules 🟢 ОТКРЫТО

### Файлы
- `convex/bot/context.ts` (11 строк) — `BotContext = Context & { convex: ActionCtx }`
- `convex/machines/types.ts` (17 строк) — `SCQContext` interface

### Проблема
Файлы существуют только для type alias / interface. Forces file hop для понимания контекста. `SCQContext` imported by `machines/` и `questions/questionPure.ts`.

**Deletion test:** удалить `context.ts` — type alias переедёт в callers (5+ файлов). Не концентрирует сложность, а разбрасывает. **Shallow, но justified** — shared type.

`types.ts` — `SCQContext`. Можно inline в `scqMachine.ts` или `answerFlowTypes.ts`.

### Решение
Низкий приоритет. Можно объединить `types.ts` в `scqMachine.ts` или `answerFlowTypes.ts`, но не критично.

---

## Рекомендации по порядку исполнения

### Если цель — покрыть untested integration code (максимум ROI)
1. **Candidate 3** (`userMastery.ts`) — изолирован, быстро тестируется, критичен для данных
2. **Candidate 4** (`getRecentAnswersForKc`) — однострочный fix, big performance win

### Если цель — устранить duplication
4. **Candidate 5** (seed generation) — mechanical, low risk
5. **Candidate 6** (drill activation) — medium risk, touches 3 handlers

### Если цель — устранить fragility
6. **Candidate 7** (env validation side effect) — breaks tests silently
7. **Candidate 9** (coverage) — blocks quality signal

---

## Контекстные файлы

- **Глоссарий домена:** `CONTEXT.md` — Answer Flow, Question Delivery, Question Session, Drill Lifecycle, Telegram Display Adapter, Answer Flow Adapter
- **Архитектурные решения:** `docs/architecture.md` — request flow, drill loop, state machine persistence, schema decisions
- **Решения по схеме:** `docs/schema-decisions.md` — натуральные ключи, sentinel values, разделение таблиц
- **План реализации (Candidate 1):** `docs/superpowers/plans/2026-05-06-answer-flow-deepening.md`

---

## Чеклист для следующей сессии

Перед выбором кандидата:
- [ ] Прочитать этот файл
- [ ] Прочитать `CONTEXT.md`
- [ ] Прочитать `docs/architecture.md`
- [ ] Выбрать кандидата из таблицы выше
- [ ] Перейти к детальному описанию кандидата в этом файле
- [ ] Прочитать указанные файлы
- [ ] Начать grilling loop / writing-plans / реализацию

**Не проводить повторный codebase exploration.**
