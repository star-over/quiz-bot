# Адаптивный выбор вопросов: Focus Slots + BKT-F refinements

> **Дата:** 2026-05-03
> **Статус:** draft, ожидает review

## 1. Цель

Заменить случайный выбор вопроса (`getRandomQuestion`) на адаптивный drill-ориентированный механизм **Focus Slots** поверх существующей системы BKT-F. В рамках задачи также внести ограниченные улучшения в ядро BKT-F и удалить мёртвый legacy-код.

## 2. Scope — что входит

| # | Компонент | Описание |
|---|-----------|----------|
| 2.1 | **Focus Slots** | Состояние слотов в `users`, алгоритмы `initSlots()`, `fillSlot()`, `kcExit()`, `nextQuestion()` |
| 2.2 | **QuestionManager.next()** | Интеграция Focus Slots вместо `getRandomQuestion` |
| 2.3 | **BKT-F: HL_MAX** | Верхний bound для `halfLife` (365 дней) |
| 2.4 | **BKT-F: плавная де-консолидация** | Пропорциональный сброс вместо фиксированных `0.60 / 4.0` |
| 2.5 | **BKT-F: kcIds в answerLog** | Денормализация `kcIds` в лог для аналитики |
| 2.6 | **Cleanup: skillProfiles** | Удалить создание `skillProfiles` для новых пользователей |

## 3. Scope — что НЕ входит

- Per-KC калибровка параметров (LEARN, SLIP, PRIOR) — требует данных
- FSRS-миграция — отложена до накопления ~10K ответов
- Адаптивный GUESS / `displayCount` — отложено по `backlog.md`
- Задержка перед следующим вопросом — отложено по `backlog.md`
- Защита от повторов вопросов внутри KC (`lastShownAt`) — отдельная задача
- Визуальный прогресс слотов для пользователя — отдельная задача

## 4. Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  Telegram Bot                                               │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │ QuestionManager │───→│ next()                       │   │
│  │                 │    │  ├─ initSlots()  если таймаут│   │
│  │                 │    │  ├─ pickSlot()  min(known)   │   │
│  │                 │    │  └─ fillSlot()  при exit     │   │
│  └─────────────────┘    └──────────────────────────────┘   │
│           │                                                 │
│           ↓                                                 │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │ Convex DB       │    │ users.focusSlots[]           │   │
│  │                 │    │ userMastery (BKT-F state)    │   │
│  │                 │    │ kcCatalog + questionKcs      │   │
│  └─────────────────┘    └──────────────────────────────┘   │
│           ↑                                                 │
│           │                                                 │
│  ┌─────────────────┐                                       │
│  │ BKT-F Core      │  bktUpdate(), computePriority()        │
│  └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

**Принцип:** BKT-F остаётся без изменений в части обновления `known/halfLife`. Focus Slots — чистый слой выбора, который читает `userMastery` и решает, какой KC показать следующим.

## 5. Детальный дизайн

### 5.1. Схема данных

#### `users` — новые поля

```typescript
focusSlots: v.optional(v.array(v.object({
  kcId:          v.string(),
  role:          v.union(v.literal("drill"), v.literal("new"), v.literal("review")),
  correctStreak: v.number(),
  totalAnswers:  v.number(),
  enteredAt:     v.number(),
}))),
lastAnsweredAt: v.optional(v.number()),
```

#### `answerLog` — новое поле

```typescript
kcIds: v.optional(v.array(v.string())),  // KC вопроса на момент ответа
```

#### `userMastery` — новое поле

```typescript
seenCount: v.number(),  // сколько раз встречался (всего, не только в слоте)
```

`seenCount` инкрементируется в `updateMastery` при каждом ответе. Используется для тира 5 (свежие KC) и аналитики.

---

### 5.2. Focus Slots: алгоритмы

#### Параметры (константы в коде)

| Параметр | Значение | Обоснование |
|----------|----------|-------------|
| `SLOT_COUNT` | 4 | 2 drill + 1 new + 1 review |
| `EXIT_STREAK` | 3 | Достаточно для уверенности, не утомляет |
| `SLOT_TIMEOUT_MS` | 30 мин | Сессия определяется мягко |
| `HL_MAX` | 365 дней | Верхний bound half-life |

#### `initSlots({ user, now })`

```
1. Если focusSlots отсутствуют ИЛИ now - lastAnsweredAt > SLOT_TIMEOUT_MS:
   → создать пустой массив, перейти к заполнению

2. Для каждого существующего слота:
   a. Загрузить userMastery для kcId
   b. Если consolidated → убрать из слота
   c. Если correctStreak >= EXIT_STREAK И now - enteredAt > SLOT_TIMEOUT_MS → убрать
   d. Иначе оставить (незавершённый drill)

3. Заполнить пустые слоты через fillSlot() с ролями:
   Слот 0: drill
   Слот 1: drill
   Слот 2: new
   Слот 3: review
```

#### `fillSlot({ role, telegramUserId, now })`

**Роль `drill`:**
```
1. Active pool: userMastery WHERE known < 0.70 AND NOT consolidated
   → сортировка: min(currentKnown), исключая kcId уже в слотах
2. Due for review: userMastery WHERE nextReviewAt <= now AND NOT consolidated
   → сортировка: max(computePriority), исключая уже в слотах
3. Fallback → fillSlot({ role: "review" })
```

**Роль `new`:**
```
1. Окно курикулума: kcCatalog WHERE sortOrder > curriculumPointer
   → первые 10 записей, исключая те, что уже есть в userMastery
   → случайный выбор из окна
2. Fallback → fillSlot({ role: "review" })
```

**Роль `review` — каскад:**
```
Тир 4: Раннее повторение
  userMastery WHERE NOT consolidated AND known >= 0.70
  → min(currentKnown), исключая уже в слотах

Тир 5: Свежие KC (углубление)
  lastSeen в последние 7 дней, totalAnswers < 5 (агрегируем из answerLog? нет, нет поля)
  → max(computePriority)
  
Тир 6: Хрупкие consolidated
  consolidated = true → min(halfLife)

Тир 7 (fallback): Случайный consolidated
  Любой consolidated KC, random
```

> **Примечание:** Тир 5 требует `totalAnswers` per KC per user. В текущей схеме `userMastery` нет `totalAnswers`. Решение: добавить `seenCount` в `userMastery` (не в слот, а в постоянное состояние). Это полезно и для аналитики.

#### Дополнение: `seenCount` в `userMastery`

```typescript
// Добавить в userMastery схему:
seenCount: v.number(),  // сколько раз встречался (всего, не только в слоте)
```

Обновление: `seenCount++` в `updateMastery` при каждом ответе.

#### `pickSlot({ focusSlots, userMasteryMap })`

```
1. Среди слотов с correctStreak < EXIT_STREAK:
   → выбрать слот с min(currentKnown по userMastery)
2. Если все слоты имеют streak >= EXIT_STREAK:
   → kcExit() на самом старом (min enteredAt)
   → fillSlot() для освободившегося
   → повторить pickSlot()
```

#### `kcExit({ slot, userMastery })`

Условия выхода (любое из):
- `correctStreak >= EXIT_STREAK`
- `consolidated === true`
- Таймаут при `initSlots()`

При выходе слот освобождается, `fillSlot()` с той же ролью.

**Ошибка в слоте:** сбрасывает `correctStreak = 0`. KC остаётся в слоте.

---

### 5.3. Интеграция с QuestionManager

#### `QuestionManager.next()` — новая реализация

```typescript
async next(): Promise<void> {
  // 1. Проверить drill state (как сейчас)
  // 2. Получить user с focusSlots и curriculumPointer
  const user = await ctx.runQuery(internal.users.getByTelegramId, ...);
  
  // 3. Определить, нужна ли инициализация слотов
  const now = Date.now();
  const needInit = !user.focusSlots || !user.lastAnsweredAt || (now - user.lastAnsweredAt > SLOT_TIMEOUT_MS);
  
  // 4. Если needInit → вызвать initSlots mutation
  let slots = user.focusSlots ?? [];
  if (needInit) {
    slots = await ctx.runMutation(internal.focusSlots.initSlots, { telegramUserId, now });
  }
  
  // 5. Выбрать слот
  const occupiedKcIds = slots.map(s => s.kcId);
  const slot = await ctx.runQuery(internal.focusSlots.pickSlot, { telegramUserId, excludedKcIds: occupiedKcIds });
  
  // 6. Найти случайный вопрос для KC
  const question = await ctx.runQuery(internal.questions.getRandomQuestionForKc, { kcId: slot.kcId, random: Math.random() });
  
  // 7. Показать вопрос
  if (question) await this.start(question);
}
```

#### Обновление `lastAnsweredAt`

`lastAnsweredAt` обновляется в `handleAnswer()` и `handleSkip()` после успешного ответа/пропуска.

#### Обновление `focusSlots` после ответа

В `handleAnswer()` после `updateMastery`:
```
1. Найти слот с kcId вопроса
2. Если found:
   - isCorrect ? correctStreak++ : correctStreak = 0
   - totalAnswers++
3. Если correctStreak >= EXIT_STREAK или consolidated:
   - kcExit() + fillSlot()
4. Сохранить обновлённые слоты
```

Это можно делать либо в `QuestionManager`, либо в отдельной mutation. Предпочтительнее — отдельная mutation `updateFocusSlotsAfterAnswer` для тестируемости.

---

### 5.4. Convex queries/mutations (новые)

#### `focusSlots/initSlots` (internalMutation)

```typescript
args: { telegramUserId: v.string(), now: v.number() }
returns: FocusSlot[]
```

#### `focusSlots/pickSlot` (internalQuery)

```typescript
args: { telegramUserId: v.string(), excludedKcIds: v.array(v.string()) }
returns: { kcId: string, role: string } | null
```

`excludedKcIds` — KC, которые уже присутствуют в других слотах (чтобы избежать дубликатов).

#### `focusSlots/updateAfterAnswer` (internalMutation)

```typescript
args: {
  telegramUserId: v.string(),
  kcId: v.string(),
  isCorrect: v.boolean(),
  now: v.number(),
}
returns: FocusSlot[]
```

#### `questions/getRandomQuestionForKc` (internalQuery)

```typescript
args: { kcId: v.string(), random: v.number() }
returns: Doc<"questions"> | null
```
Использует индекс `questionKcs.by_kc` → случайный вопрос среди связанных.

---

### 5.5. BKT-F Refinements

#### 5.5.1. HL_MAX = 365 дней

В `updateHalfLife()` после `×2.0`:
```typescript
return Math.min(HL_MAX, halfLife * HL_MULTIPLIER_CORRECT);
```

Константа `HL_MAX = 365` добавляется в `bktPure.ts`.

#### 5.5.2. Плавная де-консолидация

Заменить фиксированные `DECONSOLIDATION_KNOWN = 0.60` и `DECONSOLIDATION_HL = 4.0` на:
```typescript
const known = Math.max(0.50, existingKnown * 0.70);
const halfLife = Math.max(4.0, existingHalfLife * 0.25);
```

При ошибке на consolidated KC с `HL=1024` → `HL=256`, `known=0.672`. При `HL=64` → `HL=16`, `known=0.672`.

#### 5.5.3. kcIds в answerLog

В `handleAnswer()` и `handleSkip()` добавить `kcIds` в аргументы `logAnswer` / `logSkip`. В `updateMastery` возвращать `kcIds` (уже есть `questionKcs`).

---

### 5.6. Cleanup: skillProfiles

В `convex/users.ts`, `ensureUser` — удалить создание `skillProfiles`. Таблицу оставить для существующих данных, но новые пользователи не получают запись.

---

## 6. Data Flow

```
User отвечает на вопрос
  → handleAnswer()
    → updateMastery()          // BKT-F: обновляет known/halfLife
    → logAnswer({ kcIds })     // enriched answerLog
    → updateFocusSlotsAfterAnswer()  // streak++, exit?
    → next()
      → initSlots()?           // если таймаут
      → pickSlot()             // выбрать KC
      → getRandomQuestionForKc(kcId) // найти вопрос
      → start(question)        // показать в Telegram
```

## 7. Error Handling

| Сценарий | Обработка |
|----------|-----------|
| Нет вопросов для KC | Fallback: pickSlot() снова (следующий по приоритету). Если совсем нет — случайный consolidated |
| Все KC consolidated | Тир 7 fallback — случайный consolidated KC |
| Пустой курикулум (все KC введены) | Роль `new` → fallback в `review` |
| Corrupted focusSlots | initSlots() пересоздаёт с нуля |
| `now < lastSeen` (clock skew) | `deltaDays <= 0` — забывание не применяется (существующая защита) |

## 8. Testing Strategy

### Unit tests (`tests/unit/`)

- `focusSlotsPure.test.ts` — чистые функции: `pickSlot()`, `shouldExit()`, `assignRoles()`
- `bktPure.test.ts` — дополнить тестами на HL_MAX и плавную де-консолидацию

### Integration tests (`tests/integration/`)

- `focusSlots.integration.test.ts` — полный цикл: init → answer → streak → exit → fill

### Machine tests (`tests/machines/`)

- Не требуются — Focus Slots не меняет XState-машины

## 9. Метрики

После внедрения измерять:
- **Questions per KC per session** — целевое значение 2–4 (drill-эффект)
- **Time to consolidation** — медиана ответов до `consolidated=true`
- **Distribution of slot roles** — баланс drill/new/review
- **Exit streak reach rate** — % слотов, достигших streak=3

## 10. Решения по открытым вопросам

1. **`getRandomQuestionForKc`** — использовать `.collect()` по `questionKcs.by_kc` + `Math.random()` для выбора из массива. `random` field в `questionKcs` не нужен — массивы вопросов per KC невелики (5–8 штук).
2. **`seenCount`** — денормализация в `userMastery`. Обновляется атомарно в `updateMastery`.
3. **`curriculumPointer`** — обновляется при `kcExit()` из `new`-слота, если `known >= 0.70`. Если `known < 0.70` — KC остаётся в active pool, но курикулумный указатель не двигается (повторное введение не требуется).
