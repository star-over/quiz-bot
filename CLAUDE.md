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
- `make validate-seed` — validate seed data (JSON structure, refs, uniqueness)
- `make seed` — validate + upload images to Convex Storage + seed DB with questions
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
- `seed/` — JSON seed data and images for the database
- `seed/images/` — question images (PNG, 800×800, source of truth for Convex Storage)

### State Machine Persistence

XState machine snapshots are serialized to JSON and stored in the `users.activeMachineState` field. The quiz answer callback handler (`quizAnswer.ts`) rehydrates the machine from the snapshot, sends an event, and persists the new state. States tagged with `"persist"` are the persistence points (`awaitingAnswer`, `displayingFeedback`).

### Database Schema (`convex/schema.ts`)

Three tables: `users` (with skillVector and persisted machine state), `questions` (with IRT parameters, answers array, indexed `random` field for O(1) random selection, optional `imageStorageId` for photos, and `telegramFileId` cache), `answerLog` (answer history with before/after skill vectors).

### Custom Bot Context

`BotContext` (in `convex/bot/context.ts`) extends grammY's `Context` with a `convex: ActionCtx` property, giving all handlers access to Convex queries/mutations/actions.

### Seed Process

`make seed` runs a custom Node.js script (`seed/seed.mjs`), not `convex import`. The script:
1. Validates `seed/questions.json` via `seed/validate.mjs`
2. Uploads images from `seed/images/` to Convex Storage (getting `storageId` per file)
3. Deletes all existing questions **and their Storage files** (clean replace, no orphans)
4. Inserts all questions with `imageStorageId` linked to uploaded images

Convex-side functions are in `convex/seed.ts` (public action + mutation, called via `ConvexHttpClient`).

Seed JSON format: each question has a stable numeric `id` (seed-only, not stored in DB) and optional `image` field (filename in `seed/images/`).

### Question Images

- **Format**: PNG (avoids double JPEG compression by Telegram)
- **Size**: 800×800 bounding box (matches Telegram's `x` PhotoSize variant displayed inline in chat)
- **Storage**: Convex Storage (flat blob store, no folders). `imageStorageId` in question document → Storage file
- **Telegram caching**: `telegramFileId` field caches Telegram's `file_id` after first send. Falls back to Storage URL if cache is stale. `QuestionManager.start()` handles the 3-level fallback: `telegramFileId` → `imageStorageId` URL → text-only
- **Feedback editing**: `isPhoto` flag in machine context determines `editMessageCaption` vs `editMessageText`. If caption > 1024 chars, explanation is sent as a separate message.

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
