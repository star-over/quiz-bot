# Решения по схеме данных и архитектуре

> Зафиксированы в сессии 2026-03-15

---

## Форматирование текста в сообщениях

**Решение**: `@evermake/tgx` (npm: `@telegum/tgx`) — JSX рантайм специально для Telegram.

- Синтаксис: `.tsx` файлы с JSX компонентами
- Output: HTML string + `parse_mode: "HTML"`
- Типизация ограничена только Telegram-допустимыми тегами — защита от случайного использования `<div>` и т.д.
- tsconfig: `"jsxImportSource": "@telegum/tgx"`

Все шаблоны сообщений — `.tsx` компоненты в `convex/bot/templates/`.

---

## Хранение форматированного текста в БД

**Решение**: Хранить Telegram HTML напрямую в текстовых полях БД.

```
seed JSON (Telegram HTML) → валидация → Convex DB → JSX raw insert → parse_mode: "HTML"
```

### Валидация при сидировании

Используется `parse_html()` из `@telegraf/entity`:

| Поле | Валидация |
|---|---|
| `questions.prompt` | validateTelegramHtml() |
| `questions.explanation` | validateTelegramHtml() |
| `questions.options[].content` | validateTelegramHtml() |
| `questions.options[].explanation` | validateTelegramHtml() |
| `questions.options[].id` | уникальность в рамках вопроса |
| Текст кнопок клавиатуры | always plain text — только номер опции |

---

## Схема таблицы questions

```typescript
questions: defineTable({
  prompt: v.string(),                          // Telegram HTML — текст вопроса
  explanation: v.optional(v.string()),         // Telegram HTML — общее объяснение (fallback)
  skillVector: v.optional(v.record(v.string(), v.number())), // TODO: проработать позже

  options: v.array(v.object({
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
| `answers` | `options` | варианты выбора, не все являются правильными ответами |
| `options[].text` | `options[].content` | богаче чем text, намекает на форматирование |

### options[].content — Telegram HTML

Варианты ответов отображаются в **теле сообщения** (поддерживает HTML, любая длина). На кнопках инлайн-клавиатуры — только порядковый номер (1, 2, 3...) как прокси. Причина: Telegram кнопки не поддерживают HTML и имеют ограничение по длине.

### options[].id — целочисленный стабильный ID

Нужен для `answerLog` — хранить какой именно вариант выбрал пользователь. Стабилен при перестановке опций (в отличие от индекса массива). Генерируется как инкремент, никогда не переиспользуется. Уникальность проверяется при валидации seed данных.

### options[].score — number, не boolean

Задел на будущие типы вопросов: ordering, matching — частичный балл (0.25, 0.5, ...). Сейчас используется 0 | 1.

### explanation — двухуровневый

- `question.explanation` — общее (fallback когда у всех вариантов одинаковое объяснение)
- `options[].explanation` — специфичное (override для конкретного варианта)
- Логика: `selectedOption.explanation ?? question.explanation`

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
