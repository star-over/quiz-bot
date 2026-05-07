# Решения по схеме данных и архитектуре

> Зафиксированы в сессии 2026-03-15

---

## Принципы проектирования данных

Общие принципы, применимые ко всем таблицам:

- **Сырые наблюдения, не производные** — хранить timestamps (`shownAt`, `respondedAt`), а не вычисленные значения (`durationMs`). Производные вычисляются при запросе.
- **Натуральные ключи домена** — `telegramUserId` вместо внутренних Convex `_id`. Данные переживают пересоздание документов.
- **Без optional полей в логах** — для отсутствующих значений использовать sentinel-значения (`-1`, `false`) с полем-дискриминатором (`skipped: boolean`).
- **Разные домены — разные таблицы** — `answerLog` хранит академические данные успеваемости (правильность, время, позиция). Реакции (`userReactions`) и свободный текст (`userMessages`) — отдельные таблицы, т.к. это разные типы событий с разным жизненным циклом.

---

## Форматирование текста в сообщениях

**Решение**: Telegram HTML строится как plain string в коде хендлеров (`convex/questions/questionManager.ts`). Отправка через `parse_mode: "HTML"`.

---

## Хранение форматированного текста в БД

**Решение**: Хранить Telegram HTML напрямую в текстовых полях БД.

```
seed JSON (Telegram HTML) → валидация → Convex DB → plain string → parse_mode: "HTML"
```

### Валидация при сидировании

Текущая валидация (`seed/validate.mjs`) — структурная: проверяет типы, непустые строки, уникальность ID. HTML-формат не валидируется (см. бэклог).

---

## Схема таблицы questions

```typescript
questions: defineTable({
  prompt: v.string(),                          // Telegram HTML — текст вопроса
  explanation: v.optional(v.string()),         // Telegram HTML — общее объяснение (fallback)
  skillVector: v.optional(v.record(v.string(), v.number())), // TODO: проработать позже

  choices: v.array(v.object({
    id: v.number(),                            // стабильный целочисленный ID (не индекс!)
    content: v.string(),                       // Telegram HTML — отображается в теле сообщения
    score: v.number(),                         // 0|1, number (не boolean) — задел на частичный балл
    explanation: v.optional(v.string()),       // Telegram HTML — специфичное (override общего)
    pin: v.optional(v.union(                   // закрепление позиции при перемешивании
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
})
.index("by_random", ["random"]),
```

---

## Обоснование ключевых решений

### Нейминг

| Было | Стало | Почему |
|---|---|---|
| `questions.text` | `prompt` | точнее отражает роль — "побуждает к ответу" |
| `answers` | `choices` | варианты выбора, не все являются правильными ответами |
| `choices[].text` | `choices[].content` | богаче чем text, намекает на форматирование |

### choices[].content — Telegram HTML

Варианты ответов отображаются в **теле сообщения** (поддерживает HTML, любая длина). На кнопках инлайн-клавиатуры — только порядковый номер (1, 2, 3...) как прокси. Причина: Telegram кнопки не поддерживают HTML и имеют ограничение по длине.

### primaryKcId в answerLog — денормализация для индексации

**Проблема:** `kcIds` — массив `string[]`. Convex не поддерживает индексы по массивам. `getRecentAnswersForKc` загружала все записи юзера (`collect()`) и фильтровала в JS — O(n) RAM/CPU.

**Решение:** Денормализовать `primaryKcId = kcIds[0]` (первый KC, который является primary для вопроса). Индекс `by_user_primaryKc: ["telegramUserId", "primaryKcId"]`.

**Почему достаточно primary:** `getRecentAnswersForKc` вызывается для `slot.kcId`, который является primary KC слота. Secondary KC в `kcIds` редки и не критичны для dedup-логики.

**Альтернатива:** Отдельная таблица `answerLogKcs` (M:M) — 100% точность, но 2× writes + миграция. Отклонено как overkill.

### choices[].id — целочисленный стабильный ID

Нужен для `answerLog` — хранить какой именно вариант выбрал пользователь. Стабилен при перестановке (в отличие от индекса массива). Генерируется как инкремент, никогда не переиспользуется. Уникальность проверяется при валидации seed данных.

### choices[].score — number, не boolean

Задел на будущие типы вопросов: ordering, matching — частичный балл (0.25, 0.5, ...). Сейчас используется 0 | 1.

### explanation — двухуровневый

- `question.explanation` — общее (fallback когда у всех вариантов одинаковое объяснение)
- `choices[].explanation` — специфичное (override для конкретного варианта)
- Логика: `selectedChoice.explanation ?? question.explanation`

### skillVector — заглушка

Вынесен из `irtParameters` на верхний уровень. Текущая структура (grammar/vocabulary/...) слишком груба — будет сильно переработана. Хранится как `v.optional(v.record(v.string(), v.number()))` чтобы не потерять из фокуса.

### irtParameters — 4PL модель, осознанно

В seed данных — заглушки. В продакшене параметры калибруются через LLM: нейросеть отвечает на вопросы при разных уровнях → fit 4PL → реальные параметры.

---

## Отложено на потом

- **Мультиязычность** — сложная тема, пока не проработана
- **Метаданные** (tags, level, language) — не проработана система оценки знаний
- **Детальная проработка skillVector** — будет гораздо сложнее текущей структуры
- **Валидация "хотя бы одно explanation заполнено"** — добавить позже
