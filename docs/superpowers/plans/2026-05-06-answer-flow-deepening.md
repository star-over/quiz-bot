# Answer Flow Deepening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить 532-строковый класс `QuestionManager` в глубокий модуль `answerFlow.ts` с чистыми функциями `processResponse`/`deliverQuestion` и типизированным адаптером `AnswerFlowDeps`.

**Architecture:** Глубокий модуль скрывает 10+ шагов оркестрации (загрузка сессии → XState → BKT-F → Focus Slots → фидбек → логирование → следующий вопрос) за двумя функциями. Адаптер `AnswerFlowDeps` — шов между политикой (deep module) и механизмом (Convex + Telegram). `handleAnswer`/`handleSkip` → единый `processResponse` с дискриминантом. `logAnswer`/`logSkip` → единый `logResponse`.

**Tech Stack:** TypeScript, Convex, grammY, XState v5, Vitest

---

## File Structure

### Created files
- `convex/questions/answerFlowTypes.ts` — интерфейс `AnswerFlowDeps` и все доменные типы
- `convex/questions/answerFlowAdapter.ts` — реализация `AnswerFlowDeps` через Convex internal queries/mutations + Telegram API
- `convex/questions/answerFlow.ts` — глубокий модуль: `processResponse`, `deliverQuestion`
- `tests/unit/answerFlow.test.ts` — unit-тесты со stub-адаптером

### Modified files
- `convex/answerLog.ts` — добавить `logResponse` (unified dispatcher)
- `convex/bot/handlers/callbacks/callbackRouter.ts` — `processResponse` вместо `QuestionManager`
- `convex/bot/handlers/commands/start.ts` — `advanceDrill` + `deliverQuestion`
- `convex/bot/handlers/commands/test.ts` — `advanceDrill` + `deliverQuestion`
- `convex/development.ts` — обновить комментарий (больше не вызывается из `QuestionManager`)
- `docs/architecture.md` — обновить ссылки с `QuestionManager` на `answerFlow`
- `docs/testing-plan.md` — обновить ссылки с `QuestionManager` на `answerFlow`

### Deleted files
- `convex/questions/questionManager.ts` — класс полностью заменён

---

## Task 1: Создать `answerFlowTypes.ts`

**Files:**
- Create: `convex/questions/answerFlowTypes.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { InlineKeyboard } from "grammy";
import type { Doc, Id } from "../_generated/dataModel";

export type AnswerEvent =
  | { type: "answer"; choiceId: number }
  | { type: "skip" };

export interface QuestionSession {
  snapshot: unknown;
}

export interface DisplayedMessage {
  messageId: number;
  isPhoto: boolean;
}

export interface MasteryResult {
  kcId: string;
  consolidated: boolean;
  before?: { known: number; halfLife: number };
  after: { known: number; halfLife: number };
}

export interface CatalogEntry {
  kcId: string;
  cefrLevel: string;
}

export interface MasteryEntry {
  kcId: string;
  known: number;
  halfLife: number;
  consolidated: boolean;
}

export interface AnswerFlowDeps {
  loadQuestionSession(args: { telegramUserId: string }): Promise<QuestionSession | null>;
  saveQuestionSession(args: { telegramUserId: string; session: QuestionSession | null }): Promise<void>;

  loadQuestion(args: { questionId: Id<"questions"> }): Promise<Doc<"questions"> | null>;

  updateMastery(args: {
    telegramUserId: string;
    questionId: Id<"questions">;
    isCorrect: boolean;
    respondedAt: number;
  }): Promise<MasteryResult[]>;

  updateFocusSlots(args: {
    telegramUserId: string;
    kcId: string;
    isCorrect: boolean;
    now: number;
  }): Promise<void>;

  logResponse(args: {
    telegramUserId: string;
    questionId: Id<"questions">;
    skipped: boolean;
    selectedChoiceId?: number;
    isCorrect?: boolean;
    choicesCount: number;
    selectedPosition?: number;
    correctPosition: number;
    shownAt: number;
    respondedAt: number;
    chatId: number;
    messageId: number;
    kcIds: string[];
  }): Promise<void>;

  displayQuestion(args: {
    chatId: number;
    text: string;
    keyboard: InlineKeyboard;
    photo?: {
      telegramFileId?: string;
      imageStorageId?: Id<"_storage">;
      questionId: Id<"questions">;
    };
  }): Promise<DisplayedMessage>;

  displayFeedback(args: {
    chatId: number;
    messageId: number;
    isPhoto: boolean;
    text: string;
    compactText: string;
    explanation?: string;
  }): Promise<void>;

  deleteQuestionMessage(args: { chatId: number; messageId: number }): Promise<void>;

  advanceDrill(args: { telegramUserId: string; now: number }): Promise<Doc<"questions"> | null>;

  loadKcCatalog(args: { kcIds: string[] }): Promise<CatalogEntry[]>;
  loadMasteryForKcs(args: { telegramUserId: string; kcIds: string[] }): Promise<MasteryEntry[]>;
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc -p convex --noEmit
```
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add convex/questions/answerFlowTypes.ts
git commit -m "feat(answerFlow): add AnswerFlowDeps interface and domain types"
```

---

## Task 2: Добавить unified `logResponse` mutation

**Files:**
- Modify: `convex/answerLog.ts`

- [ ] **Step 1: Add `logResponse` mutation**

В `convex/answerLog.ts`, после `logSkip`:

```typescript
/**
 * Унифицированное логирование ответа или пропуска.
 * Диспетчеризует в ту же таблицу answerLog с дискриминантом skipped.
 */
export const logResponse = internalMutation({
  args: {
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    skipped: v.boolean(),
    selectedChoiceId: v.optional(v.number()),
    isCorrect: v.optional(v.boolean()),
    choicesCount: v.number(),
    selectedPosition: v.optional(v.number()),
    correctPosition: v.number(),
    shownAt: v.number(),
    respondedAt: v.number(),
    chatId: v.number(),
    messageId: v.number(),
    kcIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (args.skipped) {
      await ctx.db.insert("answerLog", {
        ...args,
        selectedChoiceId: -1,
        isCorrect: false,
        selectedPosition: -1,
      });
    } else {
      await ctx.db.insert("answerLog", { ...args });
    }
  },
});
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc -p convex --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/answerLog.ts
git commit -m "feat(answerLog): add unified logResponse mutation"
```

---

## Task 3: Реализовать `answerFlowAdapter.ts`

**Files:**
- Create: `convex/questions/answerFlowAdapter.ts`

- [ ] **Step 1: Создать файл с imports и constructor**

```typescript
import type { Api, InlineKeyboard } from "grammy";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

import {
  safeParseSnapshot,
  truncateTelegramText,
  truncateTelegramCaption,
} from "./questionPure";
import type {
  AnswerFlowDeps,
  CatalogEntry,
  DisplayedMessage,
  MasteryEntry,
  MasteryResult,
  QuestionSession,
} from "./answerFlowTypes";

export function createAnswerFlowAdapter({
  ctx,
  bot,
  chatId,
}: {
  ctx: ActionCtx;
  bot: Api;
  chatId: number;
}): AnswerFlowDeps {
  return {
    // methods implemented in subsequent steps
  } as AnswerFlowDeps;
}
```

- [ ] **Step 2: Implement session persistence methods**

Внутри `return { ... }`:

```typescript
async loadQuestionSession({ telegramUserId }): Promise<QuestionSession | null> {
  const user = await ctx.runQuery(internal.users.getByTelegramId, {
    telegramId: telegramUserId,
  });
  if (!user?.questionSnapshot) return null;
  return { snapshot: JSON.parse(user.questionSnapshot) };
},

async saveQuestionSession({ telegramUserId, session }): Promise<void> {
  await ctx.runMutation(internal.users.updateQuestionSnapshot, {
    telegramId: telegramUserId,
    ...(session ? { questionSnapshot: JSON.stringify(session.snapshot) } : {}),
  });
},

async loadQuestion({ questionId }): Promise<Doc<"questions"> | null> {
  return await ctx.runQuery(internal.queries.getQuestionById, { questionId });
},
```

- [ ] **Step 3: Implement domain operation methods**

```typescript
async updateMastery(args): Promise<MasteryResult[]> {
  return await ctx.runMutation(internal.userMastery.updateMastery, args);
},

async updateFocusSlots(args): Promise<void> {
  await ctx.runMutation(internal.focusSlots.focusSlots.updateAfterAnswer, args);
},

async logResponse(args): Promise<void> {
  await ctx.runMutation(internal.answerLog.logResponse, args);
},
```

- [ ] **Step 4: Implement display methods**

```typescript
async displayQuestion({
  chatId: cid,
  text,
  keyboard,
  photo,
}): Promise<DisplayedMessage> {
  const sendOpts = {
    reply_markup: keyboard,
    parse_mode: "HTML" as const,
  };

  if (photo?.telegramFileId && text.length <= 1024) {
    try {
      const result = await bot.sendPhoto(cid, photo.telegramFileId, {
        caption: truncateTelegramCaption(text),
        ...sendOpts,
      });
      return { messageId: result.message_id, isPhoto: true };
    } catch {
      // Cache stale — fall through
    }
  }

  if (photo?.imageStorageId && text.length <= 1024) {
    const imageUrl = await ctx.storage.getUrl(photo.imageStorageId);
    if (imageUrl) {
      try {
        const result = await bot.sendPhoto(cid, imageUrl, {
          caption: truncateTelegramCaption(text),
          ...sendOpts,
        });
        const fileId = result.photo.at(-1)?.file_id;
        if (fileId) {
          await ctx.runMutation(internal.development.cacheTelegramFileId, {
            questionId: photo.questionId,
            telegramFileId: fileId,
          });
        }
        return { messageId: result.message_id, isPhoto: true };
      } catch {
        // URL unavailable — fall through
      }
    }
  }

  const result = await bot.sendMessage(
    cid,
    truncateTelegramText(text),
    sendOpts,
  );
  return { messageId: result.message_id, isPhoto: false };
},

async displayFeedback({
  chatId: cid,
  messageId,
  isPhoto,
  text,
  compactText,
  explanation,
}): Promise<void> {
  const editOpts = {
    reply_markup: { inline_keyboard: [] as [] },
    parse_mode: "HTML" as const,
  };

  if (isPhoto) {
    const fullCaption = truncateTelegramCaption(text);
    if (fullCaption.length <= 1024) {
      await bot.editMessageCaption(cid, messageId, {
        caption: fullCaption,
        ...editOpts,
      });
    } else {
      const compactCaption = truncateTelegramCaption(compactText);
      await bot.editMessageCaption(cid, messageId, {
        caption: compactCaption,
        ...editOpts,
      });
      if (explanation) {
        await bot.sendMessage(cid, truncateTelegramText(explanation), {
          parse_mode: "HTML",
        });
      }
    }
  } else {
    await bot.editMessageText(
      cid,
      messageId,
      truncateTelegramText(text),
      { ...editOpts },
    );
  }
},

async deleteQuestionMessage({ chatId: cid, messageId }): Promise<void> {
  await bot.deleteMessage(cid, messageId).catch(() => {
    // Already deleted — ignore
  });
},
```

- [ ] **Step 5: Implement `advanceDrill`**

```typescript
async advanceDrill({ telegramUserId, now }): Promise<Doc<"questions"> | null> {
  const user = await ctx.runQuery(internal.users.getByTelegramId, {
    telegramId: telegramUserId,
  });
  if (!user?.drillSnapshot) return null;

  const parsedDrill = safeParseSnapshot(user.drillSnapshot);
  if (!parsedDrill.success) {
    await ctx.runMutation(internal.users.updateDrillSnapshot, {
      telegramId: telegramUserId,
    });
    return null;
  }
  const drillSnapshot = parsedDrill.snapshot as { value?: string };
  if (drillSnapshot.value !== "questioning") return null;

  const needInit =
    !user.focusSlots?.length ||
    !user.lastAnsweredAt ||
    now - user.lastAnsweredAt > 30 * 60 * 1000;

  let slots = user.focusSlots ?? [];
  if (needInit) {
    slots = await ctx.runMutation(
      internal.focusSlots.focusSlots.initSlotsMutation,
      { telegramUserId, now },
    );
  }
  if (slots.length === 0) return null;

  const triedKcIds = new Set<string>();
  let attempts = 0;
  const maxAttempts = (slots.length + 2) * 2;

  while (attempts < maxAttempts) {
    attempts++;

    const slot = await ctx.runQuery(
      internal.focusSlots.focusSlots.pickSlotQuery,
      { telegramUserId, excludedKcIds: Array.from(triedKcIds) },
    );

    if (!slot) {
      slots = await ctx.runMutation(
        internal.focusSlots.focusSlots.initSlotsMutation,
        { telegramUserId, now },
      );
      if (slots.length === 0) return null;
      triedKcIds.clear();
      continue;
    }

    const recentAnswers = await ctx.runQuery(
      internal.answerLog.getRecentAnswersForKc,
      { telegramUserId, kcId: slot.kcId, limit: 3 },
    );
    const excludedQuestionIds = recentAnswers.map((a) => a.questionId);

    const question = await ctx.runQuery(
      internal.questions.queries.getRandomQuestionForKc,
      {
        kcId: slot.kcId,
        random: Math.random(),
        ...(excludedQuestionIds.length > 0
          ? { excludedQuestionIds }
          : {}),
      },
    );

    if (question) return question;
    triedKcIds.add(slot.kcId);
  }

  return null;
},
```

- [ ] **Step 6: Implement debug data methods**

```typescript
async loadKcCatalog({ kcIds }): Promise<CatalogEntry[]> {
  return await ctx.runQuery(internal.kcCatalog.getCatalogEntries, { kcIds });
},

async loadMasteryForKcs({
  telegramUserId,
  kcIds,
}): Promise<MasteryEntry[]> {
  const entries = await ctx.runQuery(internal.userMastery.getMasteryForKcs, {
    telegramUserId,
    kcIds,
  });
  return entries.map((e) => ({
    kcId: e.kcId,
    known: e.known,
    halfLife: e.halfLife,
    consolidated: e.consolidated,
  }));
},
```

- [ ] **Step 7: Verify compilation**

```bash
npx tsc -p convex --noEmit
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add convex/questions/answerFlowAdapter.ts
git commit -m "feat(answerFlow): implement AnswerFlowDeps adapter"
```

---

## Task 4: Реализовать глубокий модуль `answerFlow.ts`

**Files:**
- Create: `convex/questions/answerFlow.ts`
- Test: `tests/unit/answerFlow.test.ts`

### Task 4a: `deliverQuestion`

- [ ] **Step 1: Write failing test for `deliverQuestion`**

В `tests/unit/answerFlow.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createActor } from "xstate";
import { scqMachine } from "../../convex/machines/scqMachine";
import { deliverQuestion } from "../../convex/questions/answerFlow";
import type { AnswerFlowDeps, DisplayedMessage } from "../../convex/questions/answerFlowTypes";

function stubDeps(overrides: Partial<AnswerFlowDeps> = {}): AnswerFlowDeps {
  return {
    loadQuestionSession: vi.fn().mockResolvedValue(null),
    saveQuestionSession: vi.fn().mockResolvedValue(undefined),
    loadQuestion: vi.fn().mockResolvedValue(null),
    updateMastery: vi.fn().mockResolvedValue([]),
    updateFocusSlots: vi.fn().mockResolvedValue(undefined),
    logResponse: vi.fn().mockResolvedValue(undefined),
    displayQuestion: vi.fn().mockResolvedValue({ messageId: 100, isPhoto: false }),
    displayFeedback: vi.fn().mockResolvedValue(undefined),
    deleteQuestionMessage: vi.fn().mockResolvedValue(undefined),
    advanceDrill: vi.fn().mockResolvedValue(null),
    loadKcCatalog: vi.fn().mockResolvedValue([]),
    loadMasteryForKcs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("deliverQuestion", () => {
  const baseQuestion = {
    _id: "q1" as any,
    prompt: "Test?",
    explanation: "Because.",
    choices: [
      { id: 1, content: "A", score: 1, explanation: "Right" },
      { id: 2, content: "B", score: 0 },
    ],
    choiceType: "single" as const,
    slip: 0.1,
    seedId: 42,
    kcs: ["kc1"],
    telegramFileId: undefined,
    imageStorageId: undefined,
  };

  it("отправляет вопрос и сохраняет сессию", async () => {
    const deps = stubDeps();
    await deliverQuestion({
      deps,
      telegramUserId: "123",
      chatId: 456,
      question: baseQuestion as any,
    });

    expect(deps.displayQuestion).toHaveBeenCalledOnce();
    expect(deps.saveQuestionSession).toHaveBeenCalledOnce();
    const saved = (deps.saveQuestionSession as any).mock.calls[0][0];
    expect(saved.telegramUserId).toBe("123");
    expect(saved.session).toBeDefined();
  });

  it("удаляет старое сообщение если есть активная сессия", async () => {
    const snapshot = await makeScqSnapshot();
    const deps = stubDeps({
      loadQuestionSession: vi.fn().mockResolvedValue({ snapshot }),
    });

    await deliverQuestion({
      deps,
      telegramUserId: "123",
      chatId: 456,
      question: baseQuestion as any,
    });

    expect(deps.deleteQuestionMessage).toHaveBeenCalledWith({ chatId: 456, messageId: 99 });
  });
});

async function makeScqSnapshot(): Promise<unknown> {
  const actor = createActor(scqMachine, {
    input: {
      questionId: "q1",
      prompt: "Test?",
      explanation: undefined,
      choices: [{ id: 1, content: "A", isCorrect: true }],
    },
  });
  actor.start();
  actor.send({ type: "MESSAGE_SENT", messageId: 99, isPhoto: false, shownAt: Date.now() });
  return actor.getSnapshot();
}
```

- [ ] **Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/answerFlow.test.ts -t "deliverQuestion"
```
Expected: FAIL — `deliverQuestion` not defined (or import error)

- [ ] **Step 3: Implement `deliverQuestion`**

В `convex/questions/answerFlow.ts`:

```typescript
import { createActor } from "xstate";
import type { Doc, Id } from "../_generated/dataModel";
import { scqMachine } from "../machines/scqMachine";
import {
  buildDebugFooter,
  safeParseSnapshot,
  type KcDebugEntry,
} from "./questionPure";
import {
  canUseInlineLabels,
  makeSingleChoiceKeyboard,
  makeYesNoKeyboard,
} from "../bot/keyboard";
import type { AnswerFlowDeps } from "./answerFlowTypes";

export async function deliverQuestion({
  deps,
  telegramUserId,
  chatId,
  question,
}: {
  deps: AnswerFlowDeps;
  telegramUserId: string;
  chatId: number;
  question: Doc<"questions">;
}): Promise<void> {
  // 1. Delete old message if exists
  const session = await deps.loadQuestionSession({ telegramUserId });
  if (session) {
    const parsed = safeParseSnapshot(
      typeof session.snapshot === "string"
        ? session.snapshot
        : JSON.stringify(session.snapshot),
    );
    if (parsed.success) {
      const old = parsed.snapshot as { context?: { messageId?: number } };
      if (old.context?.messageId) {
        await deps.deleteQuestionMessage({
          chatId,
          messageId: old.context.messageId,
        });
      }
    }
  }

  // 2. Prepare choices
  const choices = question.choices.map((choice) => ({
    id: choice.id,
    content: choice.content,
    isCorrect: choice.score === 1,
    explanation: choice.explanation,
  }));

  // 3. Build keyboard and text
  let keyboard;
  let messageText: string;

  if (question.choiceType === "yes_no") {
    keyboard = makeYesNoKeyboard({ choices, questionId: question._id });
    messageText = question.prompt;
  } else {
    const useInlineLabels = canUseInlineLabels(choices);
    keyboard = makeSingleChoiceKeyboard({
      choices,
      questionId: question._id,
      useInlineLabels,
    });
    messageText = useInlineLabels
      ? question.prompt
      : [
          question.prompt,
          "",
          choices.map((choice, i) => `${i + 1}. ${choice.content}`).join("\n"),
        ].join("\n");
  }

  // 4. Debug footer (dev mode)
  const isDevMode = process.env.ENVIRONMENT === "development";
  if (isDevMode && question.kcs && question.kcs.length > 0) {
    const [catalogEntries, masteryEntries] = await Promise.all([
      deps.loadKcCatalog({ kcIds: question.kcs }),
      deps.loadMasteryForKcs({ telegramUserId, kcIds: question.kcs }),
    ]);

    const masteryMap = new Map(masteryEntries.map((m) => [m.kcId, m]));
    const kcs: KcDebugEntry[] = question.kcs.map((kcId) => {
      const catalog = catalogEntries.find((c) => c.kcId === kcId);
      const mastery = masteryMap.get(kcId);
      return {
        kcId,
        cefrLevel: catalog?.cefrLevel ?? "?",
        ...(mastery
          ? {
              consolidated: mastery.consolidated,
              masteryBefore: {
                known: mastery.known,
                halfLife: mastery.halfLife,
              },
            }
          : {}),
      };
    });

    const footer = buildDebugFooter({
      seedId: question.seedId,
      slip: question.slip,
      choicesCount: question.choices.length,
      isExposure: question.choiceType === "yes_no",
      kcs,
    });
    messageText = `${messageText}\n\n${footer}`;
  }

  // 5. Display question
  const displayed = await deps.displayQuestion({
    chatId,
    text: messageText,
    keyboard,
    photo:
      question.telegramFileId || question.imageStorageId
        ? {
            telegramFileId: question.telegramFileId,
            imageStorageId: question.imageStorageId,
            questionId: question._id,
          }
        : undefined,
  });

  // 6. Start machine and persist
  const actor = createActor(scqMachine, {
    input: {
      questionId: question._id,
      prompt: question.prompt,
      explanation: question.explanation,
      choices,
    },
  });
  actor.start();
  actor.send({
    type: "MESSAGE_SENT",
    messageId: displayed.messageId,
    isPhoto: displayed.isPhoto,
    shownAt: Date.now(),
  });

  await deps.saveQuestionSession({
    telegramUserId,
    session: { snapshot: actor.getSnapshot() },
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/answerFlow.test.ts -t "deliverQuestion"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/questions/answerFlow.ts tests/unit/answerFlow.test.ts
git commit -m "feat(answerFlow): implement deliverQuestion with tests"
```

### Task 4b: `processResponse`

- [ ] **Step 6: Write failing test for `processResponse`**

Добавить в `tests/unit/answerFlow.test.ts`:

```typescript
import { processResponse } from "../../convex/questions/answerFlow";

describe("processResponse", () => {
  const baseSnapshot = await makeScqSnapshot();

  it("обрабатывает правильный ответ", async () => {
    const deps = stubDeps({
      loadQuestionSession: vi.fn().mockResolvedValue({ snapshot: baseSnapshot }),
      updateMastery: vi.fn().mockResolvedValue([
        { kcId: "kc1", consolidated: false, after: { known: 0.5, halfLife: 2 } },
      ]),
      advanceDrill: vi.fn().mockResolvedValue(null),
    });

    await processResponse({
      deps,
      telegramUserId: "123",
      chatId: 456,
      event: { type: "answer", choiceId: 1 },
    });

    expect(deps.updateMastery).toHaveBeenCalledOnce();
    expect(deps.updateFocusSlots).toHaveBeenCalledOnce();
    expect(deps.displayFeedback).toHaveBeenCalledOnce();
    expect(deps.logResponse).toHaveBeenCalledOnce();
    expect(deps.saveQuestionSession).toHaveBeenCalledWith({
      telegramUserId: "123",
      session: null,
    });
  });

  it("обрабатывает пропуск", async () => {
    const deps = stubDeps({
      loadQuestionSession: vi.fn().mockResolvedValue({ snapshot: baseSnapshot }),
      updateMastery: vi.fn().mockResolvedValue([]),
      advanceDrill: vi.fn().mockResolvedValue(null),
    });

    await processResponse({
      deps,
      telegramUserId: "123",
      chatId: 456,
      event: { type: "skip" },
    });

    expect(deps.logResponse).toHaveBeenCalledOnce();
    const logArgs = (deps.logResponse as any).mock.calls[0][0];
    expect(logArgs.skipped).toBe(true);
    expect(logArgs.selectedChoiceId).toBeUndefined();
  });

  it("ничего не делает при отсутствии сессии", async () => {
    const deps = stubDeps();
    await processResponse({
      deps,
      telegramUserId: "123",
      chatId: 456,
      event: { type: "answer", choiceId: 1 },
    });

    expect(deps.updateMastery).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run test to verify failure**

```bash
npx vitest run tests/unit/answerFlow.test.ts -t "processResponse"
```
Expected: FAIL — `processResponse` not defined

- [ ] **Step 8: Implement `processResponse`**

Добавить в `convex/questions/answerFlow.ts`:

```typescript
import { checkAnswer, buildFeedbackText, getExplanation, safeParseSnapshot } from "./questionPure";
import type { AnswerEvent, AnswerFlowDeps } from "./answerFlowTypes";

export async function processResponse({
  deps,
  telegramUserId,
  chatId,
  event,
}: {
  deps: AnswerFlowDeps;
  telegramUserId: string;
  chatId: number;
  event: AnswerEvent;
}): Promise<void> {
  const respondedAt = Date.now();

  // 1. Load session
  const session = await deps.loadQuestionSession({ telegramUserId });
  if (!session) return;

  // 2. Parse snapshot
  const sessionString =
    typeof session.snapshot === "string"
      ? session.snapshot
      : JSON.stringify(session.snapshot);
  const parseResult = safeParseSnapshot(sessionString);
  if (!parseResult.success) {
    await deps.saveQuestionSession({ telegramUserId, session: null });
    return;
  }

  const persistedSnapshot = parseResult.snapshot as never;
  const actor = createActor(scqMachine, {
    snapshot: persistedSnapshot,
    input: (parseResult.snapshot as { context: never }).context,
  });
  actor.start();

  // 3. Send event
  if (event.type === "answer") {
    actor.send({ type: "ANSWER_SELECTED", choiceId: event.choiceId });
  } else {
    actor.send({ type: "SKIPPED" });
  }
  const context = actor.getSnapshot().context;

  // 4. Check answer
  const isCorrect =
    event.type === "answer"
      ? checkAnswer({ choices: context.choices, selectedChoiceId: event.choiceId })
      : false;

  // 5. Update mastery
  const masteryResults = await deps.updateMastery({
    telegramUserId,
    questionId: context.questionId as Id<"questions">,
    isCorrect,
    respondedAt,
  });

  // 6. Update focus slots
  const kcIds = masteryResults.map((r) => r.kcId);
  for (const kcId of kcIds) {
    await deps.updateFocusSlots({
      telegramUserId,
      kcId,
      isCorrect,
      now: respondedAt,
    });
  }

  // 7. Show feedback
  const skipped = event.type === "skip";
  const feedbackText = buildFeedbackText({ context, isCorrect, skipped });
  const compactFeedbackText = buildFeedbackText({
    context,
    isCorrect,
    skipped,
    omitExplanation: true,
  });
  const explanationText = getExplanation({ context, skipped });

  let debugFooter: string | undefined;
  const isDevMode = process.env.ENVIRONMENT === "development";
  if (isDevMode && context.shownAt !== undefined) {
    const question = await deps.loadQuestion({
      questionId: context.questionId as Id<"questions">,
    });
    if (question?.kcs && question.kcs.length > 0) {
      const catalogEntries = await deps.loadKcCatalog({ kcIds: question.kcs });
      const masteryMap = new Map(masteryResults.map((m) => [m.kcId, m]));
      const kcs = question.kcs.map((kcId) => {
        const catalog = catalogEntries.find((c) => c.kcId === kcId);
        const mastery = masteryMap.get(kcId);
        return {
          kcId,
          cefrLevel: catalog?.cefrLevel ?? "?",
          ...(mastery ? { consolidated: mastery.consolidated } : {}),
          ...(mastery?.before ? { masteryBefore: mastery.before } : {}),
          ...(mastery?.after ? { masteryAfter: mastery.after } : {}),
        };
      });

      debugFooter = buildDebugFooter({
        seedId: question.seedId,
        slip: question.slip,
        choicesCount: question.choices.length,
        isExposure: question.choiceType === "yes_no",
        kcs,
        elapsedMs: respondedAt - context.shownAt,
      });
    }
  }

  await deps.displayFeedback({
    chatId,
    messageId: context.messageId!,
    isPhoto: context.isPhoto ?? false,
    text: debugFooter ? `${feedbackText}\n\n${debugFooter}` : feedbackText,
    compactText: debugFooter
      ? `${compactFeedbackText}\n\n${debugFooter}`
      : compactFeedbackText,
    explanation: explanationText,
  });

  // 8. Machine: feedback shown → finish
  actor.send({ type: "FEEDBACK_SHOWN" });

  // 9. Log response
  const selectedIndex = context.choices.findIndex(
    (c) => c.id === context.selectedChoiceId,
  );
  const correctIndex = context.choices.findIndex((c) => c.isCorrect);
  if (context.shownAt !== undefined && context.messageId !== undefined) {
    await deps.logResponse({
      telegramUserId,
      questionId: context.questionId as Id<"questions">,
      skipped,
      ...(event.type === "answer"
        ? {
            selectedChoiceId: event.choiceId,
            isCorrect,
            selectedPosition: selectedIndex + 1,
          }
        : {}),
      choicesCount: context.choices.length,
      correctPosition: correctIndex + 1,
      shownAt: context.shownAt,
      respondedAt,
      chatId,
      messageId: context.messageId,
      kcIds,
    });
  }

  // 10. Clear session and advance drill
  await deps.saveQuestionSession({ telegramUserId, session: null });

  const nextQuestion = await deps.advanceDrill({ telegramUserId, now: respondedAt });
  if (nextQuestion) {
    await deliverQuestion({ deps, telegramUserId, chatId, question: nextQuestion });
  }
}
```

- [ ] **Step 9: Run tests**

```bash
npx vitest run tests/unit/answerFlow.test.ts
```
Expected: PASS (all 5 tests)

- [ ] **Step 10: Commit**

```bash
git add convex/questions/answerFlow.ts tests/unit/answerFlow.test.ts
git commit -m "feat(answerFlow): implement processResponse with tests"
```

---

## Task 5: Мигрировать `callbackRouter.ts`

**Files:**
- Modify: `convex/bot/handlers/callbacks/callbackRouter.ts`

- [ ] **Step 1: Replace `QuestionManager` with `processResponse`**

```typescript
import { Composer } from "grammy";
import type { BotContext } from "../../context";
import { processResponse } from "../../../questions/answerFlow";
import { createAnswerFlowAdapter } from "../../../questions/answerFlowAdapter";
import { parseCallbackData } from "./callbackParser";

const composer = new Composer<BotContext>();

composer.on("callback_query:data", async (ctx) => {
  const parsed = parseCallbackData({ data: ctx.callbackQuery.data });
  const telegramId = ctx.from.id.toString();
  const chatId = ctx.chat?.id;

  if (!chatId) return ctx.answerCallbackQuery();

  if (parsed === null) {
    return ctx.answerCallbackQuery({ text: "Некорректные данные кнопки.", show_alert: true });
  }

  const deps = createAnswerFlowAdapter({
    ctx: ctx.convex,
    bot: ctx.api,
    chatId,
  });

  await processResponse({
    deps,
    telegramUserId: telegramId,
    chatId,
    event:
      parsed.type === "answer"
        ? { type: "answer", choiceId: parsed.choiceId }
        : { type: "skip" },
  });

  return ctx.answerCallbackQuery();
});

export default composer;
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc -p convex --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/bot/handlers/callbacks/callbackRouter.ts
git commit -m "refactor(callbacks): use answerFlow instead of QuestionManager"
```

---

## Task 6: Мигрировать `start.ts`

**Files:**
- Modify: `convex/bot/handlers/commands/start.ts`

- [ ] **Step 1: Replace `QuestionManager` with `advanceDrill` + `deliverQuestion`**

```typescript
import { Composer } from "grammy";
import { createActor } from "xstate";
import type { BotContext } from "../../context";
import { internal } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";
import { deliverQuestion } from "../../../questions/answerFlow";
import { createAnswerFlowAdapter } from "../../../questions/answerFlowAdapter";

const composer = new Composer<BotContext>();

composer.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from || !ctx.chat.id) return;

  const telegramId = from.id.toString();
  const chatId = ctx.chat.id;

  await ctx.convex.runMutation(internal.users.ensureUser, {
    telegramId,
    firstName: from.first_name,
    ...(from.last_name !== undefined ? { lastName: from.last_name } : {}),
    ...(from.username !== undefined ? { username: from.username } : {}),
    ...(from.language_code !== undefined ? { languageCode: from.language_code } : {}),
    chatId,
  });

  const user = await ctx.convex.runQuery(internal.users.getByTelegramId, {
    telegramId,
  });

  const drillActor = user?.drillSnapshot
    ? createActor(drillMachine, { snapshot: JSON.parse(user.drillSnapshot) })
    : createActor(drillMachine);
  drillActor.start();
  drillActor.send({ type: "START" });

  await ctx.convex.runMutation(internal.users.updateDrillSnapshot, {
    telegramId,
    drillSnapshot: JSON.stringify(drillActor.getSnapshot()),
  });

  const deps = createAnswerFlowAdapter({ ctx: ctx.convex, bot: ctx.api, chatId });
  const nextQuestion = await deps.advanceDrill({ telegramUserId: telegramId, now: Date.now() });
  if (nextQuestion) {
    await deliverQuestion({ deps, telegramUserId: telegramId, chatId, question: nextQuestion });
  }
});

export default composer;
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc -p convex --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/bot/handlers/commands/start.ts
git commit -m "refactor(start): use answerFlow adapter and deliverQuestion"
```

---

## Task 7: Мигрировать `test.ts`

**Files:**
- Modify: `convex/bot/handlers/commands/test.ts`

- [ ] **Step 1: Replace `QuestionManager` with `deliverQuestion`**

```typescript
import { Composer } from "grammy";
import { createActor } from "xstate";
import type { BotContext } from "../../context";
import { api, internal } from "../../../_generated/api";
import { drillMachine } from "../../../machines/drillMachine";
import { deliverQuestion } from "../../../questions/answerFlow";
import { createAnswerFlowAdapter } from "../../../questions/answerFlowAdapter";

const composer = new Composer<BotContext>();

composer.command("test", async (ctx) => {
  const from = ctx.from;
  if (!from || !ctx.chat.id) return;

  const telegramId = from.id.toString();
  const chatId = ctx.chat.id;
  const args = ctx.match.trim();

  if (!args) {
    await ctx.reply("Укажите номер вопроса: /test 21");
    return;
  }

  const seedId = parseInt(args, 10);
  if (isNaN(seedId)) {
    await ctx.reply("Номер вопроса должен быть числом: /test 21");
    return;
  }

  const question = await ctx.convex.runQuery(api.queries.getQuestionBySeedId, {
    seedId,
  });
  if (!question) {
    await ctx.reply(`Вопрос #${seedId} не найден.`);
    return;
  }

  await ctx.convex.runMutation(internal.users.ensureUser, {
    telegramId,
    firstName: from.first_name,
    ...(from.last_name !== undefined ? { lastName: from.last_name } : {}),
    ...(from.username !== undefined ? { username: from.username } : {}),
    ...(from.language_code !== undefined ? { languageCode: from.language_code } : {}),
    chatId,
  });

  const user = await ctx.convex.runQuery(internal.users.getByTelegramId, {
    telegramId,
  });

  const drillActor = user?.drillSnapshot
    ? createActor(drillMachine, { snapshot: JSON.parse(user.drillSnapshot) })
    : createActor(drillMachine);
  drillActor.start();

  if (drillActor.getSnapshot().value === "idle") {
    drillActor.send({ type: "START" });
    await ctx.convex.runMutation(internal.users.updateDrillSnapshot, {
      telegramId,
      drillSnapshot: JSON.stringify(drillActor.getSnapshot()),
    });
  }

  const deps = createAnswerFlowAdapter({ ctx: ctx.convex, bot: ctx.api, chatId });
  await deliverQuestion({ deps, telegramUserId: telegramId, chatId, question });
});

export default composer;
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc -p convex --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/bot/handlers/commands/test.ts
git commit -m "refactor(test): use answerFlow adapter and deliverQuestion"
```

---

## Task 8: Удалить `questionManager.ts` и обновить документацию

**Files:**
- Delete: `convex/questions/questionManager.ts`
- Modify: `convex/development.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/testing-plan.md`

- [ ] **Step 1: Delete `questionManager.ts`**

```bash
git rm convex/questions/questionManager.ts
```

- [ ] **Step 2: Update `development.ts` comment**

В `convex/development.ts`, строка 6-7:
```typescript
/**
 * Кешировать Telegram file_id для изображения вопроса.
 * Вызывается из answerFlowAdapter после первой отправки фото.
 */
```

- [ ] **Step 3: Update `docs/architecture.md`**

Заменить строку 25:
```
`answerFlow.deliverQuestion()` — точка входа для подачи следующего вопроса. Проверяет drill state, инициализирует или обновляет Focus Slots, выбирает KC через `pickSlot`, находит случайный вопрос для этого KC через `getRandomQuestionForKc`, вызывает `deliverQuestion()`. Вызывается из `processResponse()`, `/start` и `/test`.
```

Строка 67-68:
```
Бизнес-логика вопросов, извлечённая из `answerFlow` для тестируемости:
```

Строка 86:
```
`convex/userMastery.ts` — Convex mutation `updateMastery`: загружает вопрос + questionKcs, вызывает `bktUpdate` для каждого KC, инкрементирует `seenCount`, возвращает `MasteryUpdateEntry[]` (before/after) для debug footer в `answerFlow`.
```

Строка 109-111:
```
**Интеграция в `answerFlow`**:
- `advanceDrill()` инициализирует слоты при таймауте 30 мин, выбирает слот через `pickSlot`, находит вопрос через `getRandomQuestionForKc`
- `processResponse()` обновляет BKT-F (`updateMastery`), затем обновляет Focus Slots (`updateAfterAnswer`)
```

Строка 155:
```
- **Telegram caching**: `telegramFileId` field caches Telegram's `file_id` after first send. Falls back to Storage URL if cache is stale. `answerFlowAdapter.displayQuestion()` handles the 3-level fallback: `telegramFileId` → `imageStorageId` URL → text-only
```

- [ ] **Step 4: Update `docs/testing-plan.md`**

Строка 20:
```
**Файлы:** `eslint.config.mjs`, `tsconfig.json`, `package.json`, `convex/questions/answerFlow.ts`, `convex/bot/keyboard.ts`, `convex/machines/types.ts`, `convex/bot/handlers/commands/stop.ts` + 9 файлов с `import type`
```

Строка 44-45:
```
- [x] Создать `convex/questions/questionPure.ts` — `checkAnswer`, `getExplanation`, `buildFeedbackText`
- [x] Обновить `answerFlow.ts` — делегировать в `questionPure.ts`
```

Строка 49:
```
**Модифицируемые:** `callbackRouter.ts`, `answerFlow.ts`, `users.ts`, `keyboard.ts`, `start.ts`, `test.ts`, `eslint.config.mjs`, `Makefile`
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove QuestionManager, update docs references"
```

---

## Task 9: Запустить полный набор тестов

**Files:**
- All modified files

- [ ] **Step 1: Run lint**

```bash
make lint
```
Expected: PASS (0 errors, 0 warnings)

- [ ] **Step 2: Run unit + integration tests**

```bash
make test
```
Expected: PASS (all existing tests + new answerFlow tests)

- [ ] **Step 3: Run coverage**

```bash
make test-coverage
```
Expected: New files appear in coverage report

- [ ] **Step 4: Commit**

```bash
git commit -m "test: add answerFlow tests, all green" --allow-empty
```

---

## Self-Review

- [ ] **Spec coverage:**
  - `AnswerFlowDeps` interface (Task 1) ✓
  - Unified `logResponse` (Task 2) ✓
  - Adapter with all methods (Task 3) ✓
  - `deliverQuestion` with tests (Task 4a) ✓
  - `processResponse` with tests (Task 4b) ✓
  - `callbackRouter.ts` migration (Task 5) ✓
  - `start.ts` migration (Task 6) ✓
  - `test.ts` migration (Task 7) ✓
  - `questionManager.ts` deletion + doc updates (Task 8) ✓
  - Full test suite green (Task 9) ✓

- [ ] **Placeholder scan:** None found

- [ ] **Type consistency:**
  - `AnswerEvent` used consistently across `answerFlowTypes.ts`, `answerFlow.ts`, `callbackRouter.ts`
  - `DisplayedMessage` returned by `displayQuestion`, consumed by `deliverQuestion`
  - `MasteryResult` returned by `updateMastery`, consumed by `processResponse`
  - `logResponse` args match `logAnswer`/`logSkip` schema + `skipped` discriminant

- [ ] **ADR check:** No conflicts with existing ADRs (ADRs don't exist yet)
