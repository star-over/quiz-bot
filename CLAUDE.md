# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Adaptive Telegram quiz bot for **teaching English**. Target audience — people learning English (primarily Russian speakers). Uses IRT (Item Response Theory) with multi-dimensional Elo rating to adapt question difficulty based on user skill vectors (grammar, vocabulary, listening, reading, speaking).

All seed data (`seed/questions.json`) and example questions must be about **English language learning** — grammar, vocabulary, spelling, phrasal verbs, etc. Questions may be written in Russian (for Russian-speaking learners) or in English.

**Stack**: Convex (backend-as-a-service) + grammY (Telegram bot framework) + XState v5 (state machines) + Zod v4 (validation) + TypeScript (strict)

## Commands

All primary commands are in the Makefile. Use `make` over npm scripts.

- `make dev` — start Convex dev server (runs lint first)
- `make lint` — TypeScript type-check (`tsc -p convex`) + ESLint
- `make seed` — seed DB with questions from `seed/questions.json`
- `make test-query` — run `queries:getRandomQuestion` via Convex CLI
- `make test-mutation` — run `mutations:startQuiz` via Convex CLI
- `make codegen` — regenerate Convex API type definitions
- `make logs` — stream Convex server logs
- `make prod` — lint + deploy to production

There is no test suite. Testing is done via `make test-query` / `make test-mutation` which invoke Convex functions directly.

## Architecture

### Request Flow

1. Telegram sends webhook POST to Convex HTTP endpoint (`convex/http.ts`)
2. Path is `/dev` in development, a UUID path in production
3. `convex/telegramBot.ts` creates a **fresh Bot instance per request** (prevents context leakage between calls)
4. Convex `ActionCtx` is injected into grammY context as `grammyCtx.convex`
5. Handlers are registered via Composer pattern and process the update

### Key Directories

- `convex/bot/handlers/commands/` — `/start`, `/help`, `/test` command handlers (grammY Composers)
- `convex/bot/handlers/messages/` — text message handlers
- `convex/bot/handlers/callbacks/` — inline button callback handlers (quiz answers)
- `convex/machines/` — XState v5 state machines for question flows
- `convex/_generated/` — auto-generated Convex API types (do not edit)
- `seed/` — JSON seed data for the database

### State Machine Persistence

XState machine snapshots are serialized to JSON and stored in the `users.activeMachineState` field. The quiz answer callback handler (`quizAnswer.ts`) rehydrates the machine from the snapshot, sends an event, and persists the new state. States tagged with `"persist"` are the persistence points (`awaitingAnswer`, `displayingFeedback`).

### Database Schema (`convex/schema.ts`)

Three tables: `users` (with skillVector and persisted machine state), `questions` (with IRT parameters, answers array, and indexed `random` field for O(1) random selection), `answerLog` (answer history with before/after skill vectors).

### Custom Bot Context

`BotContext` (in `convex/bot/context.ts`) extends grammY's `Context` with a `convex: ActionCtx` property, giving all handlers access to Convex queries/mutations/actions.

## Code Style

- Strict TypeScript: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` enabled
- ES Modules (`"type": "module"` in package.json)
- Prefix unused variables with `_`
- Convex functions: use `internalQuery`/`internalMutation`/`internalAction` patterns
- Handler registration order matters: callback handlers must be registered before text message handlers (`convex/bot/index.ts`)
- Environment variables validated with Zod at startup (`convex/bot/envValidator.ts`)
- Comments and commit messages are in Russian

## Environment Variables

Set in Convex dashboard (not `.env` for deployed functions):

- `BOT_TOKEN` — Telegram bot token
- `ENVIRONMENT` — `"development"` or `"production"`
- `CONVEX_CLOUD_URL` — Convex WebSocket URL
- `CONVEX_SITE_URL` — Convex HTTP Actions URL
