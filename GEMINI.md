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

Use the `Makefile` for running common tasks.

```bash
make dev
```

This command starts the Convex development server, which watches for file changes and automatically updates your backend.

### Running the Telegram bot

The bot is run as part of the Convex backend via HTTP actions that process Telegram webhooks. Ensure your environment variables (like `BOT_TOKEN`) are set up in your Convex project settings.

### Linting

```bash
make lint
```

## Development Conventions

### Backend
- Backend logic is located in the `convex/` directory.
- The database schema is defined in `convex/schema.ts`.
- Backend functions (queries, mutations, and actions) are defined in `.ts` files within the `convex/` directory, primarily in the `modules` subdirectory.

### Telegram Bot
- The core bot integration with Convex is in `convex/http.ts` and `convex/telegramBot.ts`.
- The main bot initialization and routing is in `convex/bot/index.ts`.
- Specific handlers for commands, messages, and callbacks are located in `convex/bot/handlers/`.
- The [grammy](https://grammy.dev) framework is used for bot development.

### State Management
- [XState](https://xstate.js.org/) is included as a dependency, suggesting that complex state management for the bot's conversations will be handled using state machines.

### Validation
- [Zod](https://zod.dev/) is included for data validation, which should be used to validate incoming data from Telegram and in the Convex functions.

## Project Vision & Core Concepts

 This section outlines the conceptual framework for the language-learning quiz bot, based on the detailed project specification provided.

### 1. High-Level Goal & Principles
- **Goal:** An adaptive Telegram bot for language learning.
- **Principle:** Every question is a test and a lesson ("Testing Effect").
- **Interaction:** Limited to buttons and voice messages (no text input).

### 2. The Rating Engine: Multi-Dimensional IRT/Elo Model
The core of the system is a formal psychometric model that replaces earlier heuristic approaches.

*   **User Model (Ability Vector `θ`):** A user's knowledge is a vector of abilities across different skills:
    `θ = (θ_Grammar, θ_Vocabulary, θ_Listening, ...)`

*   **Question Model (IRT Parameters):** Each question `i` is defined by a set of parameters:
    *   `d_i`: Difficulty (a scalar).
    *   `w_i`: Weight Vector (`w_iG, w_iV, ...`), defining how much the question tests each skill.
    *   `a_i`: Discriminability (how well the question distinguishes between users of similar ability).
    *   `c_i`: Guessing probability.
    *   `s_i`: Slip probability (chance of a random error by a proficient user).

*   **Core Formula (Probability):** The probability of a user with ability `θ` answering question `i` correctly is given by a multi-dimensional Item Response Theory (IRT) formula:
    `P_i(θ) = c_i + (1 - c_i - s_i) * σ(a_i * (Σ(w_ij * θ_j) - d_i))`
    where `σ(x)` is the logistic sigmoid function.

*   **Core Formula (Learning Update):** After a user gives an answer `r` (1 for correct, 0 for incorrect), each component of their ability vector is updated using a multi-dimensional Elo-like rule:
    `θ_j_new = θ_j_old + K * w_ij * (r - P_i(θ_old))`
    where `K` is the learning rate. This targets the update to the skills relevant to the question.

### 3. Adaptive Algorithm
The next question is chosen to maximize learning by targeting the "zone of proximal development."
*   **Selection Criterion:** The system selects the question `i` that minimizes the distance from a target success probability (e.g., 75%): `min |P_i(θ) - 0.75|`.
*   **Balancing:** The selection can be weighted to prioritize underdeveloped skills.

### 4. Content & Calibration Strategy
*   **Initial Calibration:** The initial parameters for new questions can be estimated using various methods, including the previously discussed "AI Personas" approach.
*   **Ongoing Calibration (Two-Sided Elo):** The system can continuously refine a question's difficulty (`d_i`) after each user response using a similar Elo-update rule, allowing the question bank to self-correct over time.
*   **Periodic Recalibration:** At larger intervals, the parameters for the entire question bank can be re-calculated using standard IRT methods (e.g., Maximum Likelihood Estimation) on the accumulated user response data.

### 5. State Management Architecture: Hierarchical State Machines
To manage the quiz flow, we will use a hierarchical (parent/child) state machine architecture powered by XState. This choice is driven by the need for both modularity and the ability to persist the state of in-progress questions.

*   **High-Level Machine ("Оркестратор"):**
    *   **Role:** Acts as a high-level manager of the quiz session.
    *   **Responsibilities:**
        1.  **Selects Question:** Chooses the next question based on the user's ability vector `θ` and the adaptive algorithm.
        2.  **Invokes Child Machine:** Based on the question's type, it invokes (spawns) the appropriate child machine (e.g., `singleChoiceQuestionMachine`).
        3.  **Persistence:** It is responsible for saving the state of the active child machine to the Convex database. When a user returns, it rehydrates the child machine from the saved state.
        4.  **Updates Rating:** After the child machine completes its work and returns a result (`isCorrect`), the orchestrator calls the Convex mutation to update the user's ability vector `θ`.

*   **Low-Level Machines ("Умные Исполнители"):**
    *   **Role:** A dedicated machine exists for each question type (e.g., `singleChoiceQuestionMachine`). It acts as a self-contained "mini-application" for its question type.
    *   **Responsibilities:**
        1.  **Manages Interaction:** Handles the full UI flow for its question type, including sending messages, updating them, and processing user input (button clicks).
        2.  **Handles Side Effects:** All Telegram API calls related to the question are performed within this machine.
        3.  **Evaluates Answer:** Determines if the user's answer is correct based on the data it received.
        4.  **Returns Result:** Upon completion, it returns a simple, standardized result (e.g., `{ isCorrect: true, selectedOptionId: "someId" }`) to the parent orchestrator.

*   **Architectural Trade-Off:** This "Smart Child" model was deliberately chosen. It simplifies the orchestrator and, crucially, provides a clean model for state persistence (only the child machine's state needs to be saved). This comes at the accepted cost of making the child machines "impure" (containing side effects) and thus more complex to test in isolation.

## Development Learnings & Conventions

This section documents key findings and established workflows discovered during development.

### 1. Toolchain & Configuration (`Makefile`, `tsconfig`, `eslint`)
*   **Local Binaries:** The `Makefile` must use `npx` (e.g., `npx tsc`, `npx eslint`) to ensure it runs the project-local versions of tools specified in `package.json`, avoiding conflicts with globally installed versions.
*   **TypeScript Config:** The project uses a root `tsconfig.json` and a `convex/tsconfig.json`. The `convex` config must `extend` the root one to ensure consistency.
*   **ESLint Ignores:** This project uses a modern flat `eslint.config.mjs`. To ignore files (like the `dist` directory), the `ignores` property must be used, as `.eslintignore` is deprecated and ignored.
*   **Linter as a Guard:** "Expensive" commands in the `Makefile` (like `dev`, `predev`, `prod`) are dependent on the `lint` target. This prevents deploying or running code that doesn't pass type checks.

### 2. Convex Platform Notes
*   **Query Caching:** Convex aggressively caches the results of `query` functions that take no arguments. To ensure a function with non-deterministic behavior (like one using `Math.random()`) is re-executed every time, it **must** accept a dummy argument that changes with each call (e.g., `args: { dummy: v.any() }`).
*   **Breaking Schema Changes & Data Migration:**
    *   The `npx convex dev` command validates existing database data against the new schema in `schema.ts` **before** pushing new function code.
    *   This creates a **deadlock** if you have existing data that's incompatible with a new, required field. You cannot push a migration function to fix the data, because the push is blocked by the validation failure.
    *   **Solution for Dev:** The only way to break this deadlock in a development environment is to **manually delete the offending documents** from the table via the Convex Dashboard before running `dev`/`deploy`.
*   **Data Seeding:**
    *   The `npx convex import` command is suitable for seeding data from JSON/JSONL files.
    *   For relational data (e.g., questions and options in separate tables), a seeder **mutation** is required to link them correctly.
    *   For our denormalized schema, `npx convex import --table questions --replace` is the correct approach. The `--replace` flag is crucial to avoid schema validation errors with old data.
    *   A `make seed` command has been created that chains schema sync (`predev`) and data import for a robust workflow.

### 3. Preferred Workflow
*   **Red-to-Green:** The user prefers to see a test or linter fail ("Red") before the fix is implemented to ensure the toolchain is working correctly. Once the fix is applied, the process should run successfully ("Green").
*   **Makefile Driven:** Common tasks like linting, seeding, and testing should be encapsulated in `Makefile` targets.
