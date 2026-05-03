# Security Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rate limiting, input length validation, safe snapshot parsing, and runtime message-length guards to prevent DoS, data corruption, and user lock-in.

**Architecture:** Pure helper functions (testable with Vitest) handle policy logic (rate-limit math, safe JSON parse, text truncation). Convex internal mutations persist rate-limit state. grammY middleware applies throttling before command/callback handlers. QuestionManager uses guards at every Telegram API boundary.

**Tech Stack:** TypeScript, Convex, grammY, Vitest, Zod

---

## File Structure

| File | Responsibility |
|------|---------------|
| `convex/schema.ts` | Add `rateLimits` table |
| `convex/rateLimits.ts` | Internal mutation to read/write rate-limit window |
| `convex/bot/rateLimitPure.ts` | Pure function `computeRateLimitDecision` — business logic |
| `convex/bot/rateLimit.ts` | grammY middleware that calls Convex mutation and blocks/throttles |
| `convex/bot/index.ts` | Register rate-limit middleware before handlers |
| `seed/schemas.ts` | Zod `.max(4096)` on all Telegram HTML strings |
| `convex/bot/handlers/messages/text.ts` | Truncate incoming text to 4096 before logging |
| `convex/questions/questionPure.ts` | Add `safeParseSnapshot` and `truncateTelegramText` |
| `convex/questions/questionManager.ts` | Wrap all `JSON.parse` with safe helper; truncate texts before Telegram API calls |
| `tests/unit/rateLimitPure.test.ts` | Unit tests for rate-limit logic |
| `tests/unit/safeParseSnapshot.test.ts` | Unit tests for safe JSON.parse wrapper |
| `tests/unit/truncateTelegramText.test.ts` | Unit tests for text truncation |
| `tests/unit/telegramHtml.test.ts` | Extend with length-validation cases |

---

## Task 1: Rate Limiting (per-telegramId throttle)

**Files:**
- Create: `convex/bot/rateLimitPure.ts`
- Create: `convex/rateLimits.ts`
- Create: `convex/bot/rateLimit.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/bot/index.ts`
- Test: `tests/unit/rateLimitPure.test.ts`

### Step 1: Write failing tests for pure rate-limit logic

Create `tests/unit/rateLimitPure.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeRateLimitDecision } from "../../convex/bot/rateLimitPure";

describe("computeRateLimitDecision", () => {
  const windowMs = 10_000;
  const maxRequests = 3;

  it("allows first request and starts window", () => {
    const now = 1_000_000;
    const result = computeRateLimitDecision({ now, existing: null, windowMs, maxRequests });
    expect(result.allowed).toBe(true);
    expect(result.windowStart).toBe(now);
    expect(result.count).toBe(1);
  });

  it("allows up to maxRequests inside window", () => {
    const now = 1_000_000;
    const existing = { windowStart: now, count: 2 };
    const result = computeRateLimitDecision({ now, existing, windowMs, maxRequests });
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
  });

  it("blocks request beyond maxRequests inside window", () => {
    const now = 1_000_000;
    const existing = { windowStart: now, count: 3 };
    const result = computeRateLimitDecision({ now, existing, windowMs, maxRequests });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(windowMs);
  });

  it("resets window after it expires", () => {
    const now = 1_000_000;
    const existing = { windowStart: now - windowMs - 1, count: 99 };
    const result = computeRateLimitDecision({ now, existing, windowMs, maxRequests });
    expect(result.allowed).toBe(true);
    expect(result.windowStart).toBe(now);
    expect(result.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/rateLimitPure.test.ts -v`

Expected: FAIL with "function not defined" or import error.

- [ ] **Step 3: Implement pure rate-limit logic**

Create `convex/bot/rateLimitPure.ts`:

```typescript
export interface RateLimitState {
  windowStart: number;
  count: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  windowStart: number;
  count: number;
  retryAfterMs?: number;
}

export function computeRateLimitDecision({
  now,
  existing,
  windowMs,
  maxRequests,
}: {
  now: number;
  existing: RateLimitState | null;
  windowMs: number;
  maxRequests: number;
}): RateLimitDecision {
  if (!existing || now - existing.windowStart > windowMs) {
    return { allowed: true, windowStart: now, count: 1 };
  }

  if (existing.count < maxRequests) {
    return { allowed: true, windowStart: existing.windowStart, count: existing.count + 1 };
  }

  const retryAfterMs = Math.max(0, existing.windowStart + windowMs - now);
  return { allowed: false, windowStart: existing.windowStart, count: existing.count, retryAfterMs };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/rateLimitPure.test.ts -v`

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/rateLimitPure.test.ts convex/bot/rateLimitPure.ts
git commit -m "feat(rate-limit): pure decision logic with tests"
```

- [ ] **Step 6: Add rateLimits table to Convex schema**

Modify `convex/schema.ts`, insert before closing `});`:

```typescript
  // Rate limiting (sliding window per user)
  rateLimits: defineTable({
    telegramId: v.string(),
    windowStart: v.number(),
    count: v.number(),
  })
    .index("by_telegramId", ["telegramId"]),
```

- [ ] **Step 7: Implement Convex mutation for rate-limit check**

Create `convex/rateLimits.ts`:

```typescript
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { computeRateLimitDecision } from "./bot/rateLimitPure";

export const checkRateLimit = internalMutation({
  args: {
    telegramId: v.string(),
    windowMs: v.number(),
    maxRequests: v.number(),
  },
  handler: async (ctx, { telegramId, windowMs, maxRequests }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();

    const decision = computeRateLimitDecision({
      now,
      existing: existing ? { windowStart: existing.windowStart, count: existing.count } : null,
      windowMs,
      maxRequests,
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        windowStart: decision.windowStart,
        count: decision.count,
      });
    } else {
      await ctx.db.insert("rateLimits", {
        telegramId,
        windowStart: decision.windowStart,
        count: decision.count,
      });
    }

    return { allowed: decision.allowed, retryAfterMs: decision.retryAfterMs ?? 0 };
  },
});
```

- [ ] **Step 8: Implement grammY rate-limit middleware**

Create `convex/bot/rateLimit.ts`:

```typescript
import { Composer } from "grammy";
import type { BotContext } from "./context";
import { internal } from "../_generated/api";

const composer = new Composer<BotContext>();

const WINDOW_MS = 10_000; // 10 seconds
const MAX_REQUESTS = 5;   // 5 interactions per window

composer.use(async (ctx, next) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return next(); // no identity — pass through (rare)

  const result = await ctx.convex.runMutation(internal.rateLimits.checkRateLimit, {
    telegramId,
    windowMs: WINDOW_MS,
    maxRequests: MAX_REQUESTS,
  });

  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({
        text: `Слишком много запросов. Подождите ${seconds} с.`,
        show_alert: true,
      });
    } else {
      await ctx.reply(`Слишком много запросов. Подождите ${seconds} с.`);
    }
    return;
  }

  return next();
});

export default composer;
```

- [ ] **Step 9: Wire middleware into bot handler registration**

Modify `convex/bot/index.ts` (add import and `bot.use` before other handlers):

```typescript
// ... existing imports ...
import rateLimitMiddleware from "./rateLimit";

export const registerHandlers = (bot: Bot<BotContext>) => {
  // Rate limit first
  bot.use(rateLimitMiddleware);

  // ... existing handlers ...
};
```

- [ ] **Step 10: Run lint and typecheck**

Run: `make lint`

Expected: No errors from `tsc -p convex` and `eslint`.

- [ ] **Step 11: Commit**

```bash
git add convex/schema.ts convex/rateLimits.ts convex/bot/rateLimit.ts convex/bot/index.ts
git commit -m "feat(rate-limit): per-telegramId throttle via Convex + grammY middleware"
```

---

## Task 2: Input Length Guards (Zod + Runtime)

**Files:**
- Modify: `seed/schemas.ts`
- Modify: `convex/bot/handlers/messages/text.ts`
- Test: `tests/unit/telegramHtml.test.ts`

- [ ] **Step 1: Write failing test for length validation**

Append to `tests/unit/telegramHtml.test.ts` (after last `});`):

```typescript
describe("длина строки", () => {
  it("prompt > 4096 символов — ошибка", async () => {
    const { questionSchema } = await import("../../seed/schemas");
    const result = questionSchema.safeParse({
      id: 1,
      choiceType: "single",
      prompt: "a".repeat(4097),
      choices: [
        { id: 1, content: "A", score: 1 },
        { id: 2, content: "B", score: 0 },
      ],
      slip: 0.05,
      random: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it("choice.content > 4096 символов — ошибка", async () => {
    const { questionSchema } = await import("../../seed/schemas");
    const result = questionSchema.safeParse({
      id: 1,
      choiceType: "single",
      prompt: "Valid",
      choices: [
        { id: 1, content: "b".repeat(4097), score: 1 },
        { id: 2, content: "B", score: 0 },
      ],
      slip: 0.05,
      random: 0.5,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/telegramHtml.test.ts -v`

Expected: 2 new tests FAIL (length validation not yet applied).

- [ ] **Step 3: Add `.max(4096)` to Zod Telegram HTML schemas**

Modify `seed/schemas.ts`:

Replace:
```typescript
export const telegramHtml = z.string().refine(
  (val) => validateTelegramHtml({ html: val }).length === 0,
  (val) => ({ message: validateTelegramHtml({ html: val }).join("; ") }),
);
```

With:
```typescript
export const telegramHtml = z.string().max(4096).refine(
  (val) => validateTelegramHtml({ html: val }).length === 0,
  (val) => ({ message: validateTelegramHtml({ html: val }).join("; ") }),
);
```

Also replace `telegramHtmlOptional` definition with:
```typescript
const telegramHtmlOptional = z.string().max(4096).refine(
  (val) => validateTelegramHtml({ html: val }).length === 0,
  (val) => ({ message: validateTelegramHtml({ html: val }).join("; ") }),
).optional();
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/telegramHtml.test.ts -v`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add seed/schemas.ts tests/unit/telegramHtml.test.ts
git commit -m "feat(validation): cap Telegram HTML strings at 4096 chars in Zod schema"
```

- [ ] **Step 6: Truncate incoming user messages before logging**

Modify `convex/bot/handlers/messages/text.ts` (the `message:text` middleware block):

```typescript
const MAX_MESSAGE_LENGTH = 4096;

composer.on("message:text", async (ctx, next) => {
  const replyToMessageId = ctx.message.reply_to_message?.message_id;
  const text = ctx.message.text.slice(0, MAX_MESSAGE_LENGTH);
  await ctx.convex.runMutation(internal.userMessages.logMessage, {
    telegramUserId: String(ctx.from.id),
    chatId: ctx.chat.id,
    messageId: ctx.message.message_id,
    text,
    sentAt: ctx.message.date * 1000,
    ...(replyToMessageId !== undefined && { replyToMessageId }),
  });
  await next();
});
```

- [ ] **Step 7: Run lint**

Run: `make lint`

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add convex/bot/handlers/messages/text.ts
git commit -m "feat(validation): truncate incoming text messages to 4096 before logging"
```

---

## Task 3: Safe Snapshot Parsing (Graceful Degradation)

**Files:**
- Modify: `convex/questions/questionPure.ts`
- Modify: `convex/questions/questionManager.ts`
- Test: `tests/unit/safeParseSnapshot.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/safeParseSnapshot.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { safeParseSnapshot } from "../../convex/questions/questionPure";

describe("safeParseSnapshot", () => {
  it("parses valid JSON", () => {
    const obj = { value: "questioning", context: { messageId: 42 } };
    const result = safeParseSnapshot(JSON.stringify(obj));
    expect(result.success).toBe(true);
    expect(result.snapshot).toEqual(obj);
  });

  it("returns failure for invalid JSON", () => {
    const result = safeParseSnapshot("{broken");
    expect(result.success).toBe(false);
    expect(result.snapshot).toBeUndefined();
  });

  it("returns failure for null input", () => {
    const result = safeParseSnapshot(undefined);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/safeParseSnapshot.test.ts -v`

Expected: FAIL — function not exported yet.

- [ ] **Step 3: Implement safeParseSnapshot**

Append to `convex/questions/questionPure.ts`:

```typescript
export function safeParseSnapshot(input: string | undefined): { success: true; snapshot: unknown } | { success: false } {
  if (!input) return { success: false };
  try {
    return { success: true, snapshot: JSON.parse(input) };
  } catch {
    return { success: false };
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/safeParseSnapshot.test.ts -v`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/questions/questionPure.ts tests/unit/safeParseSnapshot.test.ts
git commit -m "feat(resilience): safeParseSnapshot helper with tests"
```

- [ ] **Step 6: Replace all raw JSON.parse in QuestionManager**

Modify `convex/questions/questionManager.ts`:

1. Add import:
```typescript
import { safeParseSnapshot } from "./questionPure";
```

2. In `start()` (~line 59), replace:
```typescript
const old = JSON.parse(user.questionSnapshot) as { context?: { messageId?: number } };
```
With:
```typescript
const parseOld = safeParseSnapshot(user.questionSnapshot);
if (!parseOld.success) {
  await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
    telegramId: this.telegramId,
  });
} else {
  const old = parseOld.snapshot as { context?: { messageId?: number } };
  if (old.context?.messageId) { ... }
}
```

Actually, restructure the block fully:

```typescript
    if (user?.questionSnapshot) {
      const parsed = safeParseSnapshot(user.questionSnapshot);
      if (parsed.success) {
        const old = parsed.snapshot as { context?: { messageId?: number } };
        if (old.context?.messageId) {
          await this.bot.deleteMessage(this.chatId, old.context.messageId).catch(() => {
            // Сообщение уже удалено — игнорируем
          });
        }
      } else {
        // Corrupted snapshot — reset to avoid lock-in
        await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
          telegramId: this.telegramId,
        });
      }
    }
```

3. In `handleAnswer()` (~line 179), replace:
```typescript
const persistedSnapshot = JSON.parse(user.questionSnapshot);
```
With:
```typescript
const parseResult = safeParseSnapshot(user.questionSnapshot);
if (!parseResult.success) {
  await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
    telegramId: this.telegramId,
  });
  return;
}
const persistedSnapshot = parseResult.snapshot;
```

4. In `handleSkip()` (~line 251), do the identical replacement.

5. In `next()` (~line 313), replace:
```typescript
const drillSnapshot = JSON.parse(user.drillSnapshot) as { value?: string };
```
With:
```typescript
const parsedDrill = safeParseSnapshot(user.drillSnapshot);
if (!parsedDrill.success) {
  await this.ctx.runMutation(internal.users.updateDrillSnapshot, {
    telegramId: this.telegramId,
  });
  return;
}
const drillSnapshot = parsedDrill.snapshot as { value?: string };
```

*Note:* If `internal.users.updateDrillSnapshot` does not exist yet, create it in `convex/users.ts` (it likely already exists alongside `updateQuestionSnapshot`).

- [ ] **Step 7: Run lint and tests**

Run: `make lint && make test`

Expected: No type errors; all existing + new tests pass.

- [ ] **Step 8: Commit**

```bash
git add convex/questions/questionManager.ts convex/questions/questionPure.ts tests/unit/safeParseSnapshot.test.ts
git commit -m "feat(resilience): guard all snapshot parses with safeParseSnapshot + auto-reset"
```

---

## Task 4: Runtime Message-Length Guards

**Files:**
- Modify: `convex/questions/questionPure.ts`
- Modify: `convex/questions/questionManager.ts`
- Test: `tests/unit/truncateTelegramText.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/truncateTelegramText.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { truncateTelegramText } from "../../convex/questions/questionPure";

describe("truncateTelegramText", () => {
  it("returns short text unchanged", () => {
    expect(truncateTelegramText("hello", 10)).toBe("hello");
  });

  it("truncates long text with ellipsis", () => {
    const text = "a".repeat(100);
    expect(truncateTelegramText(text, 10)).toBe("a".repeat(7) + "...");
  });

  it("respects 4096 limit by default", () => {
    const text = "b".repeat(5000);
    const result = truncateTelegramText(text);
    expect(result.length).toBe(4096);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles exact-length text", () => {
    const text = "c".repeat(4096);
    expect(truncateTelegramText(text).length).toBe(4096);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/truncateTelegramText.test.ts -v`

Expected: FAIL — function not exported.

- [ ] **Step 3: Implement truncateTelegramText**

Append to `convex/questions/questionPure.ts`:

```typescript
const TELEGRAM_MAX_TEXT = 4096;
const TELEGRAM_MAX_CAPTION = 1024;
const ELLIPSIS = "...";

export function truncateTelegramText(text: string, maxLength: number = TELEGRAM_MAX_TEXT): string {
  if (text.length <= maxLength) return text;
  const cutAt = maxLength - ELLIPSIS.length;
  return text.slice(0, Math.max(0, cutAt)) + ELLIPSIS;
}

export function truncateTelegramCaption(text: string): string {
  return truncateTelegramText(text, TELEGRAM_MAX_CAPTION);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/truncateTelegramText.test.ts -v`

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/questions/questionPure.ts tests/unit/truncateTelegramText.test.ts
git commit -m "feat(validation): truncateTelegramText helpers with tests"
```

- [ ] **Step 6: Apply guards in QuestionManager**

Modify `convex/questions/questionManager.ts`:

1. Add import:
```typescript
import { truncateTelegramText, truncateTelegramCaption } from "./questionPure";
```

2. In `start()`, after building `messageText` (before `sendOpts`), add:
```typescript
messageText = truncateTelegramText(messageText);
```

3. In `trySendPhoto()`, before calling `sendPhoto`, add:
```typescript
const safeCaption = truncateTelegramCaption(caption);
```
And pass `safeCaption` instead of `caption`.

4. In `showFeedback()`, before `editMessageCaption`, add:
```typescript
const safeCaption = truncateTelegramCaption(fullFeedback);
```
And pass it. For the compact fallback path too.

5. In `showFeedback()`, before `editMessageText`, add:
```typescript
const safeText = truncateTelegramText(withFooter(buildFeedbackText({ context, isCorrect, skipped })));
```
And pass `safeText`.

6. In `showFeedback()`, before the explanation `sendMessage`, add:
```typescript
const safeExplanation = truncateTelegramText(explanationText);
```

- [ ] **Step 7: Run lint and tests**

Run: `make lint && make test`

Expected: Clean.

- [ ] **Step 8: Commit**

```bash
git add convex/questions/questionManager.ts convex/questions/questionPure.ts
git commit -m "feat(validation): enforce Telegram length limits at every API boundary"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Rate limiting per-telegramId — Task 1 (`rateLimitPure`, `rateLimits.ts`, middleware, schema).
- ✅ Input sanitization / length limits — Task 2 (Zod `.max(4096)`), Task 4 (runtime truncation for caption 1024 & text 4096).
- ✅ Graceful degradation (safe snapshot parse + auto-reset) — Task 3 (`safeParseSnapshot` in all 4 locations).
- ✅ User message length guard — Task 2 Step 6 (`text.ts` truncate before DB insert).

**2. Placeholder scan:**
- No "TBD", "TODO", "implement later", "add appropriate error handling".
- Every step contains exact file path, exact code block, exact command, expected output.

**3. Type consistency:**
- `safeParseSnapshot` returns `{ success: true; snapshot: unknown } | { success: false }` — used consistently with `parsed.success` checks.
- `truncateTelegramText(text, maxLength?)` and `truncateTelegramCaption(text)` signatures match usage in QuestionManager.
- `computeRateLimitDecision` args and return type match usage in `convex/rateLimits.ts`.

**4. Gaps:**
- `updateDrillSnapshot` mutation assumed to exist in `convex/users.ts`. If missing, the implementing agent must add it (mirror of `updateQuestionSnapshot` but for `drillSnapshot`). A note is included in Step 6 of Task 3.
- No runtime validation of `drillSnapshot` JSON structure beyond parse safety. This is intentional (YAGNI) — parse failure is the only known lock-in vector.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-03-security-improvements.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
