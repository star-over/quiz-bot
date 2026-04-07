# CLAUDE.md

## Project Overview

Adaptive Telegram quiz bot for **teaching English**. Target audience — Russian speakers learning English. Uses BKT-F (Bayesian Knowledge Tracing with Forgetting) for per-KC knowledge tracking. Each KC (Knowledge Component) — минимальная тестируемая единица знания (grammar rule, word, collocation, spelling).

All seed data and questions must be about **English language learning**.

**Stack**: Convex (backend-as-a-service) + grammY (Telegram bot framework) + XState v5 (state machines) + Zod v4 (validation) + TypeScript (strict)

## Commands

All primary commands are in the Makefile. Use `make` over npm scripts.

- `make dev` — start Convex dev server (runs lint first)
- `make lint` — TypeScript type-check (`tsc -p convex`) + ESLint (`--max-warnings 0`)
- `make lint-fix` — ESLint autofix
- `make test` — run Vitest (unit + machine + integration tests)
- `make test-watch` — Vitest in watch mode
- `make test-coverage` — run Vitest with coverage report
- `make gen` — генерация вопросов через LLM (`MODEL= KC= LEVEL= AUTHORS= MAX=`)
- `make gen-dry` — показать план генерации без вызова LLM
- `make gen-review` — рецензия вопросов через Claude Sonnet 4 (`KC= LEVEL= CATEGORY=`)
- `make gen-review-dry` — показать план рецензии без вызова LLM
- `make gen-compile` — собрать `seed/questions.json` из `seed/generated/` (`.review.jsonl` приоритет, fallback `.jsonl`)
- `make gen-stats` — статистика сгенерированных вопросов
- `make seed-validate` — validate seed data via Zod schemas (`tsx seed/validate.ts`)
- `make seed` — validate + upload images to Convex Storage + seed DB with questions
- `make codegen` — regenerate Convex API type definitions
- `make logs` — stream Convex server logs
- `make debug-clear` — [DEBUG] clear all tables (users, questions, answerLog)
- `make setup-webhook` — настроить Telegram webhook (один раз после деплоя или смены окружения)
- `make prod` — lint + deploy to production

## Workflow

After writing code: `make lint-fix` → fix remaining warnings → `make lint` → `make test`.

## Key Directories

- `convex/bot/handlers/commands/` — `/start`, `/help`, `/test`, `/stop` command handlers (grammY Composers)
- `convex/bot/handlers/messages/` — text message handlers
- `convex/bot/handlers/callbacks/` — inline button callback handlers (quiz answers, reactions)
- `convex/bkt/` — BKT-F algorithm: `bktPure.ts` (pure functions)
- `convex/machines/` — XState v5 state machines for question flows
- `convex/_generated/` — auto-generated Convex API types (DO NOT edit)
- `seed/` — JSON seed data and images for the database
- `seed/gen/` — question generation pipeline (LLM scripts)

## Code Style

- Strict TypeScript: `verbatimModuleSyntax`, `erasableSyntaxOnly`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- ES Modules (`"type": "module"` in package.json)
- Project-defined functions use **object arguments** `({ param1, param2 })` — enforced by convention, `max-params: 2` catches 3+ positional (Convex `(ctx, args)` and `.map(item, i)` are framework exceptions)
- Prefix unused variables with `_`
- Convex functions: use `internalQuery`/`internalMutation`/`internalAction` patterns
- Handler registration order matters: callback handlers must be registered before text message handlers (`convex/bot/index.ts`)
- Environment variables validated with Zod at startup (`convex/bot/envValidator.ts`)
- ESLint: `error` = real bugs (breaks build), `warn` = style/autofixable. `--max-warnings 0` enforced in CI.
- Comments and commit messages are in Russian

## Testing

**Framework**: Vitest — unit, machine, integration tests.

```
tests/
├── unit/           — pure function tests (bktPure, questionPure, parseCallback, seedSchemas, etc.)
├── machines/       — XState machine tests (drillMachine, scqMachine): transitions, snapshot round-trip
├── integration/    — grammY bot tests via handleUpdate + API transformer
├── fixtures/       — factory functions (choices, contexts, Telegram updates)
└── helpers/        — botTestHarness (transformer intercepts outgoing API calls, mock Convex context)
```

Key patterns: pure function extraction (`*Pure.ts`), grammY API transformer (no network), mock Convex context (`vi.fn()` stubs), XState snapshot round-trip, Zod `safeParse()` for seed validation.

## Gotchas

- **Convex queries must be deterministic** — `Math.random()` inside a query always returns the same value. Generate random values in actions and pass as arguments.
- **Convex actions require all fetches to be directly awaited** — XState actors running `fromPromise` with network calls are invisible to Convex's promise tracking. Extract side effects out of the machine and `await` them directly in the handler.
- **Telegram `callback_data` limit** — 64 bytes max. Use compact formats like `qa:<id>:<index>`, not JSON with UUIDs.
- **`internalAction`/`internalMutation` not callable from external scripts** — доступны только серверному коду. Для seed и т.п. нужны public `action`/`mutation`.
- **Convex Storage** — плоское blob-хранилище без папок. Организация только через ссылки в документах.
- **XState v5**: always add `types` to `createMachine` for TS inference. Use `({ event })` syntax, not `(_, event: any)` (v4). Use `waitFor(actor, predicate)` instead of `actor.subscribe` with async callbacks. Machine actors that do I/O should be noop stubs — do actual I/O outside the machine in the Convex handler.
- **Handler registration order** — callback handlers before text message handlers (`convex/bot/index.ts`), иначе callbacks будут тихо проглатываться.
- **One inline-keyboard message at a time** — инвариант: перед отправкой нового сообщения с кнопками удалить предыдущее неотвеченное.

## DO NOT

- Edit `convex/_generated/` — auto-generated, use `make codegen`
- Use `convex import` — seed only through `make seed` (custom script)
- Skip lint/test — `make lint && make test` after every change
- Add questions not about English learning
- Use `Math.random()` in Convex queries

## Environment Variables

Set in Convex dashboard (not `.env` for deployed functions):

- `BOT_TOKEN` — Telegram bot token
- `ENVIRONMENT` — `"development"` or `"production"`
- `CONVEX_CLOUD_URL` — Convex WebSocket URL
- `CONVEX_SITE_URL` — Convex HTTP Actions URL

## Documentation

Детальная архитектура: `docs/architecture.md`

Проектная документация в `docs/`:
- `backlog.md` — бэклог (отложенные задачи, планируемые фичи)
- `bkt-f-implementation-plan.md` — план внедрения BKT-F
- `testing-plan.md` — план внедрения тестирования
- `schema-decisions.md` — решения по схеме БД и обоснования
- `focus-slots-design.md` — drill-ориентированный выбор вопросов (Focus Slots)
- `scq-only-strategy.md` — стратегия SCQ-only с гипотезой отбора
- `knowledge-tracing-research.md` — исследование алгоритмов оценки знаний
- `question-type-diversity-research.md` — исследование типов вопросов
- `question-generation-prompt.md` — промпт генерации вопросов
- `question-authors.md` — персоны авторов для генерации
- `kc-catalog.md` — описание каталога KC
- `archive/` — устаревшие документы (для справки)
