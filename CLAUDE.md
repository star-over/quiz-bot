# CLAUDE.md

## Project Overview

Adaptive Telegram quiz bot, **teaching English**. Audience — Russian speakers. BKT-F (Bayesian Knowledge Tracing with Forgetting) per-KC tracking. KC (Knowledge Component) — минимальная единица знания (grammar rule, word, collocation, spelling).

Seed data/questions — only **English language learning**.

**Stack**: Convex (backend-as-a-service) + grammY (Telegram bot) + XState v5 (state machines) + Zod v4 (validation) + TypeScript (strict)

## Commands

Primary commands in Makefile. Use `make` over npm scripts.

- `make dev` — Convex dev server (lint first)
- `make lint` — type-check (`tsc -p convex`) + ESLint (`--max-warnings 0`)
- `make lint-fix` — ESLint autofix
- `make test` — Vitest (unit + machine + integration)
- `make test-watch` — Vitest watch
- `make test-coverage` — Vitest + coverage
- `make gen` — генерация вопросов LLM (`MODEL= KC= LEVEL= AUTHORS= MAX=`)
- `make gen-dry` — план генерации без LLM
- `make gen-review` — рецензия через Claude Sonnet 4 (`KC= LEVEL= CATEGORY=`)
- `make gen-review-dry` — план рецензии без LLM
- `make gen-compile` — собрать `seed/generation/output/questions.json` из `seed/generation/data/generated/` (`.review.jsonl` приоритет, fallback `.jsonl`)
- `make gen-stats` — статистика вопросов
- `make seed-validate` — validate via Zod (`tsx seed/generation/validate.ts`)
- `make seed` — validate + upload images + seed DB
- `make codegen` — regenerate Convex API types
- `make logs` — stream Convex logs
- `make debug-clear` — [DEBUG] clear all tables
- `make setup-webhook` — Telegram webhook (раз после деплоя/смены окружения)
- `make prod` — lint + deploy production

## Workflow

After code: `make lint-fix` → fix warnings → `make lint` → `make test`.

**Git branches**: This is a solo-developer project. Commit directly to `master`. No feature branches needed.

## Key Directories

- `convex/bot/handlers/commands/` — `/start`, `/help`, `/test`, `/stop` (grammY Composers)
- `convex/bot/handlers/messages/` — text handlers
- `convex/bot/handlers/callbacks/` — inline button callbacks (quiz answers, reactions)
- `convex/bkt/` — BKT-F: `bktPure.ts` (pure functions)
- `convex/focusSlots/` — Focus Slots: `focusSlotsPure.ts` (pure functions), `focusSlots.ts` (Convex queries/mutations)
- `convex/machines/` — XState v5 machines, question flows
- `convex/_generated/` — auto-generated Convex types (NO edit)
- `seed/` — JSON seed data + images
- `seed/generation/` — question generation pipeline (LLM)

## Code Style

- Strict TS: `verbatimModuleSyntax`, `erasableSyntaxOnly`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- ES Modules (`"type": "module"`)
- Project functions use **object arguments** `({ param1, param2 })` — `max-params: 2` catches 3+ positional (Convex `(ctx, args)` / `.map(item, i)` — exceptions)
- Unused vars prefix `_`
- Convex: `internalQuery`/`internalMutation`/`internalAction` patterns
- Handler order: callbacks before text handlers (`convex/bot/index.ts`)
- Env vars validated Zod at startup (`convex/bot/envValidator.ts`)
- ESLint: `error` = bugs (breaks build), `warn` = style/autofix. `--max-warnings 0` in CI.
- Comments/commits in Russian

## Testing

**Framework**: Vitest — unit, machine, integration.

```
tests/
├── unit/           — pure function tests (bktPure, questionPure, parseCallback, seedSchemas, etc.)
├── machines/       — XState machine tests (drillMachine, scqMachine): transitions, snapshot round-trip
├── integration/    — grammY bot tests via handleUpdate + API transformer
├── fixtures/       — factory functions (choices, contexts, Telegram updates)
└── helpers/        — botTestHarness (transformer intercepts outgoing API calls, mock Convex context)
```

Patterns: pure extraction (`*Pure.ts`), grammY API transformer (no network), mock Convex ctx (`vi.fn()`), XState snapshot round-trip, Zod `safeParse()` seed validation.

## Gotchas

- **Convex queries deterministic** — `Math.random()` in query = same value. Generate random in actions, pass as args.
- **Convex actions: all fetches directly awaited** — XState `fromPromise` invisible to Convex promise tracking. Extract side effects, `await` in handler.
- **Telegram `callback_data`** — 64 bytes max. Use `qa:<id>:<index>`, not JSON/UUIDs.
- **`internalAction`/`internalMutation` not callable externally** — server code only. Seed и т.п. — public `action`/`mutation`.
- **Convex Storage** — flat blob, no folders. Organize via document refs.
- **XState v5**: add `types` to `createMachine` for TS. Use `({ event })` not `(_, event: any)` (v4). Use `waitFor(actor, predicate)` not `actor.subscribe` async. I/O actors = noop stubs — real I/O in Convex handler.
- **Handler order** — callbacks before text (`convex/bot/index.ts`), иначе callbacks проглатываются.
- **One inline-keyboard msg** — перед новым сообщением с кнопками удалить предыдущее неотвеченное.

## DO NOT

- Edit `convex/_generated/` — use `make codegen`
- Use `convex import` — only `make seed`
- Skip lint/test — `make lint && make test` after every change
- Add non-English-learning questions
- Use `Math.random()` in Convex queries

## Environment Variables

Set in Convex dashboard (not `.env`):

- `BOT_TOKEN` — Telegram bot token
- `ENVIRONMENT` — `"development"` / `"production"`
- `CONVEX_CLOUD_URL` — Convex WebSocket URL
- `CONVEX_SITE_URL` — Convex HTTP Actions URL

## Documentation

Архитектура: `docs/architecture.md`

Docs в `docs/`:
- `backlog.md` — бэклог
- `bkt-f-implementation-plan.md` — план BKT-F
- `testing-plan.md` — план тестирования
- `schema-decisions.md` — решения по схеме БД
- `focus-slots-design.md` — Focus Slots (drill-выбор вопросов)
- `scq-only-strategy.md` — SCQ-only стратегия
- `knowledge-tracing-research.md` — исследование алгоритмов знаний
- `question-type-diversity-research.md` — типы вопросов
- `question-generation-prompt.md` — промпт генерации
- `question-authors.md` — персоны авторов
- `kc-catalog.md` — каталог KC
- `kc-granularity.md` — грануляция KC: leaf/branch дерево, критерий отделимости, cross-pollination
- `archive/` — устаревшие docs