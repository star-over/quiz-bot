# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build/Lint/Test Commands
- `make dev` - Start Convex development server with dashboard
- `make bot` - Run the Telegram bot using tsx
- `make lint` - Type check Convex functions and lint all files
- `make logs` - View convex logs
- `make predev` - Pre-development setup (used internally by convex)
- `make help` - Show available Make commands

## Code Style Guidelines
- TypeScript with strict settings: exactOptionalPropertyTypes, noUncheckedIndexedAccess
- ES modules with "type": "module" in package.json
- Unused variables should be prefixed with _ to be ignored by ESLint
- Convex functions use internalQuery/internalMutation/internalAction patterns
- Telegram bot uses grammyjs framework with dotenv for configuration

## Project Specifics
- Convex backend in /convex with auto-generated code in /convex/_generated
- Telegram bot implementation in /telegram
- Environment variables loaded via dotenv in telegram/bot.ts
- Convex schema validation enabled in convex/schema.ts
- Makefile provides all primary commands (preferred over npm scripts)
