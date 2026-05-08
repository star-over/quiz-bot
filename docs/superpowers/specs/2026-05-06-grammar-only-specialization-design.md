# Специализация бота на английской грамматике

> Дата: 2026-05-06
> Статус: спецификация утверждена

## Цель

Сузить концепцию бота до исключительной специализации на английской грамматике (A1–B2). Удалить из проекта, документации и KC-каталога всё, что относится к лексике (vocab), коллокациям (collocation) и правописанию (spelling). Зафиксировать в документации, что KC = grammar rule.

## Мотивация

На текущем этапе бот пытается покрывать 4 категории KC: grammar, vocab, collocation, spelling. Это размывает фокус продукта и усложняет генерацию вопросов. Специализация исключительно на грамматике даёт:
- Чёткую позиционировку: «бот для грамматики английского».
- Единую методологию генерации: EGP + Murphy, без смешивания словарных карточек и коллокаций.
- Упрощение BKT-F трекинга: один тип сущности — grammar rule.

## Что удаляем

### Данные

- **`seed/generation/data/kc-catalog.jsonl`** — все записи с `category` ∈ {`vocab`, `collocation`, `spelling`} (159 + 38 + 37 = 234 записи). Остаётся 138 grammar KC. `sortOrder` пересчитывается в непрерывный ряд 1..138.

### Документация

| Файл | Действие |
|------|----------|
| `docs/kc-catalog.md` | Удалить разделы «Лексика — vocab», «Коллокации — collocation», «Правописание — spelling». Обновить сводную таблицу (только grammar). Обновить методологию |
| `CLAUDE.md` | «KC — минимальная единица знания (grammar rule, word, collocation, spelling)» → «KC — минимальная единица знания (grammar rule)». Добавить явную фразу о специализации на грамматике |
| `docs/architecture.md` | Описание `kcCatalog` → «grammar KC A1–B2». Убрать упоминания 4 категорий |
| `docs/kc-granularity.md` | Пример `vocab/give_up` → `grammar/modality/can_ability`. Убрать «vocab, spelling — простые KC (leaf = branch)» |
| `docs/bkt-f-implementation-plan.md` | Удалить строки/разделы про vocab/spelling/collocation в таксономии, todo, примерах |
| `docs/schema-decisions.md` | Уточнить описание под текущую схему |
| `docs/knowledge-tracing-research.md` | Примеры `vocab/food` → grammar KC |
| `docs/question-type-diversity-research.md` | Упоминание vocabulary learning → убрать или заменить на grammar |
| `docs/scq-only-strategy.md` | Упоминание vocabulary → убрать |
| `docs/superpowers/plans/2026-05-03-focus-slots-integration.md` | Обновить упоминания если есть |
| `docs/superpowers/plans/2026-05-03-schema-cleanup.md` | Обновить упоминания если есть |

### Код: типы и схемы

| Файл | Действие |
|------|----------|
| `convex/schema.ts` | `v.union(v.literal("grammar"), v.literal("vocab"), ...)` → `v.literal("grammar")` |
| `convex/seed.ts` | Аналогично — убрать `v.literal("vocab")`, `v.literal("collocation")`, `v.literal("spelling")` |
| `seed/generation/schemas.ts` | `z.enum(["grammar", "vocab", "collocation", "spelling"])` → `z.enum(["grammar"])`. Regex `kcIdRegex` → `^grammar\/.+` |

### Тесты

| Файл | Действие |
|------|----------|
| `tests/unit/seedSchemas.test.ts` | Фикстуры `vocab/give_up` → `grammar/present_time/be_am_is_are`. Проверка невалидного `category: "vocab"` → `category: "invalid"` |
| `tests/unit/buildDebugFooter.test.ts` | `spelling/receive` → `grammar/past_time/past_simple_regular`; `vocab/go` → `grammar/present_time/present_simple` |
| `tests/integration/botHandleUpdate.test.ts` | `spelling/receive` → `grammar/past_time/past_simple_regular` |
| `tests/integration/focusSlots.test.ts` | `vocab/cat` → `grammar/present_time/be_am_is_are` |

## Что НЕ трогаем

- **`seed/generation/output/questions.json`** — уже содержит только grammar-вопросы.
- **`seed/generation/data/generated/`** — уже содержит только grammar-артефакты.
- **Алгоритмы BKT-F, Focus Slots, Drill Lifecycle** — логика не меняется, меняется только входные данные.

## Критерии завершённости

- [ ] `kc-catalog.jsonl` содержит только 138 grammar KC с непрерывным sortOrder.
- [ ] `docs/kc-catalog.md` описывает только grammar.
- [ ] `CLAUDE.md` и `docs/architecture.md` содержат явную формулировку о грамматической специализации.
- [ ] `convex/schema.ts`, `convex/seed.ts`, `seed/generation/schemas.ts` допускают только `category: "grammar"`.
- [ ] Все тесты проходят (`make lint && make test`).
- [ ] Ни в одном .md-файле в `docs/` не осталось упоминаний vocab/collocation/spelling как категорий KC.
