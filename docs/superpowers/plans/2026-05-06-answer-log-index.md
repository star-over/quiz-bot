# Answer Log Indexed Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace O(n) `collect()` + JS filter in `getRecentAnswersForKc` with an O(log n) Convex indexed query by denormalizing `primaryKcId` into `answerLog`.

**Architecture:** Add `primaryKcId` (first element of `kcIds`) to `answerLog` rows and index it as `by_user_primaryKc: ["telegramUserId", "primaryKcId"]`. Rewrite `getRecentAnswersForKc` to query this index with `.take(limit)` instead of loading all user answers into memory. This is sufficient because `getRecentAnswersForKc` is always called for a `slot.kcId`, which is the primary KC of questions in that slot.

**Tech Stack:** Convex (schema + queries/mutations), TypeScript, Vitest

---

### Task 1: Add `primaryKcId` to schema and index

**Files:**
- Modify: `convex/schema.ts:93-117`

- [ ] **Step 1: Add `primaryKcId` field and index to `answerLog`**

```ts
  // Лог ответов
  answerLog: defineTable({
    // Что произошло
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    skipped: v.boolean(),
    selectedChoiceId: v.number(),
    isCorrect: v.boolean(),

    // Контекст выбора
    choicesCount: v.number(),
    selectedPosition: v.number(),
    correctPosition: v.number(),

    // Когда
    shownAt: v.number(),
    respondedAt: v.number(),

    // Telegram context
    chatId: v.number(),
    messageId: v.number(),
    kcIds: v.optional(v.array(v.string())),
    primaryKcId: v.optional(v.string()),  // ← ADD THIS LINE
  })
    .index("by_user", ["telegramUserId"])
    .index("by_user_question", ["telegramUserId", "questionId"])
    .index("by_question", ["questionId"])
    .index("by_user_primaryKc", ["telegramUserId", "primaryKcId"]),  // ← ADD THIS LINE
```

- [ ] **Step 2: Commit schema change**

```bash
git add convex/schema.ts
git commit -m "schema(answerLog): add primaryKcId and by_user_primaryKc index"
```

---

### Task 2: Update `answerLog` mutations to write `primaryKcId`

**Files:**
- Modify: `convex/answerLog.ts`

- [ ] **Step 1: Update `logAnswer` args and insert**

Replace the `logAnswer` handler (lines 23-25) with:

```ts
  handler: async (ctx, args) => {
    await ctx.db.insert("answerLog", {
      ...args,
      skipped: false,
      primaryKcId: args.kcIds?.[0],
    });
  },
```

- [ ] **Step 2: Update `logSkip` insert**

Replace the `logSkip` handler (lines 44-52) with:

```ts
  handler: async (ctx, args) => {
    await ctx.db.insert("answerLog", {
      ...args,
      skipped: true,
      selectedChoiceId: -1,
      isCorrect: false,
      selectedPosition: -1,
      primaryKcId: args.kcIds?.[0],
    });
  },
```

- [ ] **Step 3: Update `logResponse` to derive `primaryKcId`**

In `logResponse` handler (lines 75-113), after building `base`, add `primaryKcId` to both insert calls.

Replace lines 86-87:
```ts
      ...(args.kcIds ? { kcIds: args.kcIds } : {}),
```

With:
```ts
      ...(args.kcIds ? { kcIds: args.kcIds } : {}),
      primaryKcId: args.kcIds?.[0],
```

Both `insert("answerLog", { ...base, skipped: true, ... })` calls now include `primaryKcId`.

- [ ] **Step 4: Commit**

```bash
git add convex/answerLog.ts
git commit -m "feat(answerLog): write primaryKcId on log mutations"
```

---

### Task 3: Rewrite `getRecentAnswersForKc` to use indexed query

**Files:**
- Modify: `convex/answerLog.ts:121-135`

- [ ] **Step 1: Replace query body**

```ts
export const getRecentAnswersForKc = internalQuery({
  args: {
    telegramUserId: v.string(),
    kcId: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, { telegramUserId, kcId, limit }) => {
    const answers = await ctx.db
      .query("answerLog")
      .withIndex("by_user_primaryKc", (q) =>
        q.eq("telegramUserId", telegramUserId).eq("primaryKcId", kcId),
      )
      .order("desc")
      .take(limit);

    return answers.map((a) => ({ questionId: a.questionId, shownAt: a.shownAt }));
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/answerLog.ts
git commit -m "perf(answerLog): index getRecentAnswersForKc by primaryKcId"
```

---

### Task 4: Update `AnswerFlowDeps` type to include `primaryKcId`

**Files:**
- Modify: `convex/questions/answerFlowTypes.ts:56-70`

- [ ] **Step 1: Add `primaryKcId` to `logResponse` args**

```ts
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
    primaryKcId?: string;  // ← ADD THIS LINE
  }): Promise<void>;
```

- [ ] **Step 2: Commit**

```bash
git add convex/questions/answerFlowTypes.ts
git commit -m "types(answerFlow): add primaryKcId to logResponse deps"
```

---

### Task 5: Update `answerFlow.ts` to pass `primaryKcId`

**Files:**
- Modify: `convex/questions/answerFlow.ts:292-309`

- [ ] **Step 1: Add `primaryKcId` to `logResponse` call**

In `processResponse`, find the `await deps.logResponse({ ... })` call (around line 292). Add `primaryKcId: kcIds[0],` after `kcIds,`.

The call should look like:

```ts
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
      primaryKcId: kcIds[0],  // ← ADD THIS LINE
    });
```

- [ ] **Step 2: Commit**

```bash
git add convex/questions/answerFlow.ts
git commit -m "feat(answerFlow): pass primaryKcId to logResponse"
```

---

### Task 6: Update unit tests

**Files:**
- Modify: `tests/unit/answerFlow.test.ts`

- [ ] **Step 1: Verify tests still compile and pass**

The `stubDeps` already has `logResponse` as a `vi.fn()` mock, so it accepts any args including the new `primaryKcId`. No test code changes are required — the mock is permissive.

Run tests:

```bash
npx vitest run tests/unit/answerFlow.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 2: Add assertion for `primaryKcId` in existing test**

In the "обрабатывает правильный ответ" test (around line 96), add an assertion after `expect(deps.logResponse).toHaveBeenCalledOnce()`:

```ts
    expect(deps.logResponse).toHaveBeenCalledOnce();
    const logCall = (deps.logResponse as any).mock.calls[0][0];
    expect(logCall.primaryKcId).toBe("kc1");
```

Note: the mock returns `updateMastery` with `[{ kcId: "kc1", ... }]`, so `kcIds` becomes `["kc1"]` and `primaryKcId` should be `"kc1"`.

- [ ] **Step 3: Run tests again**

```bash
npx vitest run tests/unit/answerFlow.test.ts
```

Expected: all 5 tests pass, including the new assertion.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/answerFlow.test.ts
git commit -m "test(answerFlow): assert primaryKcId passed to logResponse"
```

---

### Task 7: Deploy schema and run full test suite

- [ ] **Step 1: Deploy schema to Convex**

```bash
npx convex dev --once
```

Expected: schema deploys without errors.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit any final changes**

```bash
git commit -m "deploy: answerLog primaryKcId index" || echo "nothing to commit"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- Schema change with `primaryKcId` field ✅ (Task 1)
- Index `by_user_primaryKc` ✅ (Task 1)
- Mutations write `primaryKcId` ✅ (Task 2)
- Query uses index instead of collect+filter ✅ (Task 3)
- Types updated ✅ (Task 4)
- `answerFlow.ts` passes `primaryKcId` ✅ (Task 5)
- Tests updated ✅ (Task 6)

**2. Placeholder scan:**
- No TBD/TODO/fill-in-later found.
- All code blocks contain exact code.
- All file paths are exact.

**3. Type consistency:**
- `primaryKcId` is `v.optional(v.string())` in schema, `?: string` in TypeScript type, `args.kcIds?.[0]` in mutations — consistent.
- `getRecentAnswersForKc` query uses `"by_user_primaryKc"` which matches schema index name.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-answer-log-index.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
