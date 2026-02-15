# Project Overview

This is a TypeScript project that uses the [Convex](https://convex.dev) backend-as-a-service platform to create a Telegram quiz bot. The bot's logic will be written in TypeScript and will interact with the Convex database. The project also includes [grammy](https://grammy.dev), a framework for building Telegram bots.

## Building and Running

### Prerequisites
- Node.js and npm
- A Convex account and project
- A Telegram bot token

### Installation

```bash
npm install
```

### Running the development server

```bash
npm run dev
```

This command starts the Convex development server, which watches for file changes and automatically updates your backend.

### Running the Telegram bot

*TODO: Add instructions for running the Telegram bot. This will likely involve setting the bot token as an environment variable and running a script with `ts-node` or similar.*

### Linting

```bash
npm run lint
```

## Development Conventions

### Backend
- Backend logic is located in the `convex/` directory.
- Database schema is defined in `convex/schema.ts`.
- Backend functions (queries, mutations, and actions) are defined in `.ts` files within the `convex/` directory.

### Telegram Bot
- The Telegram bot code will be located in the `telegram/` directory.
- The main bot file is `telegram/bot.ts`.
- The [grammy](https://grammy.dev) framework is used for bot development.

### State Management
- [XState](https://xstate.js.org/) is included as a dependency, suggesting that complex state management for the bot's conversations will be handled using state machines.

### Validation
- [Zod](https://zod.dev/) is included for data validation, which should be used to validate incoming data from Telegram and in the Convex functions.
