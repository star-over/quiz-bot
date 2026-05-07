# User Mastery Bridge Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `convex/userMastery.ts` into a deep module (types + impl + adapter + thin wrappers) with full unit-test coverage, explicit error handling, and a required `before` field.

**Architecture:** Follow the established project pattern used by `focusSlots/` and `answerFlow/`. Split into `userMasteryTypes.ts` (seam), `userMasteryImpl.ts` (pure policy), `userMasteryAdapter.ts` (dumb DB proxy), and thin wrappers in `userMastery.ts`.

**Tech Stack:** TypeScript, Convex, Vitest, XState (only for answerFlow tests)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `convex/userMastery/userMasteryTypes.ts` | Create | Seam interface `MasteryDeps`, row types, `MasteryUpdateEntry` |
| `convex/userMastery/userMasteryImpl.ts` | Create | Deep module: `updateMastery()`, `getMasteryForKcs()`, `safeNextReviewAt()` |
| `convex/userMastery/userMasteryAdapter.ts` | Create | `createMasteryDeps(ctx)` — pure Convex DB proxy |
| `convex/userMastery.ts` | Rewrite | Thin wrappers: `internalQuery(getMasteryForKcs)`, `internalMutation(updateMastery)` |
| `convex/questions/answerFlowTypes.ts` | Modify | `MasteryResult.before` becomes required |
| `convex/questions/answerFlow.ts` | Modify | Remove `mastery?.before` guard in debug footer |
| `tests/unit/userMastery.test.ts` | Create | 8 unit tests with stub adapter |
| `tests/unit/answerFlow.test.ts` | Modify | Add `before` to mock `MasteryResult` objects |

---

## Task 1: Create `convex/userMastery/userMasteryTypes.ts`

**Files:**
- Create: `convex/userMastery/userMasteryTypes.ts`

- [ ] **Step 1: Write the types file**

```ts
import type { Doc, Id } from "../_generated/dataModel";

export interface MasteryRow {
  _id: Id<"userMastery">;
  telegramUserId: string;
  kcId: string;
  known: number;
  halfLife: number;
  lastSeen: number;
  nextReviewAt: number;
  consolidated: boolean;
  seenCount: number;
}

export interface MasteryPatch {
  known?: number;
  halfLife?: number;
  lastSeen?: number;
  nextReviewAt?: number;
  consolidated?: boolean;
  seenCount?: number;
}

export interface MasteryInsert {
  telegramUserId: string;
  kcId: string;
  known: number;
  halfLife: number;
  lastSeen: number;
  nextReviewAt: number;
  consolidated: boolean;
  seenCount: number;
}

export interface MasteryUpdateEntry {
  kcId: string;
  consolidated: boolean;
  before: { known: number; halfLife: number };
  after: { known: number; halfLife: number };
}

export interface MasteryDeps {
  getQuestion(questionId: Id<"questions">): Promise<Doc<"questions"> | null>;
  getQuestionKcs(questionId: Id<"questions">): Promise<Array<{ kcId: string; isPrimary: boolean }>>;
  getMastery(telegramUserId: string, kcId: string): Promise<MasteryRow | null>;
  patchMastery(_id: Id<"userMastery">, patch: MasteryPatch): Promise<void>;
  insertMastery(row: MasteryInsert): Promise<Id<"userMastery">>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit convex/userMastery/userMasteryTypes.ts`

Expected: No errors (may need `skipLibCheck` or project tsconfig; `npx convex dev` also works)

Alternative: `npx convex dev --once` to regenerate types and verify.

- [ ] **Step 3: Commit**

```bash
git add convex/userMastery/userMasteryTypes.ts
git commit -m "feat(userMastery): add seam types and MasteryDeps interface"
```

---

## Task 2: Create `convex/userMastery/userMasteryImpl.ts`

**Files:**
- Create: `convex/userMastery/userMasteryImpl.ts`

- [ ] **Step 1: Write the implementation file**

```ts
import { bktUpdate, createInitialMastery } from "../bkt/bktPure";
import type { Id } from "../_generated/dataModel";
import type {
  MasteryDeps,
  MasteryInsert,
  MasteryUpdateEntry,
} from "./userMasteryTypes";

const SENTINEL_MAX_DATE = 32503680000000;

function safeNextReviewAt(nextReviewAt: number): number {
  return Number.isFinite(nextReviewAt) ? nextReviewAt : SENTINEL_MAX_DATE;
}

export async function updateMastery({
  deps,
  telegramUserId,
  questionId,
  isCorrect,
  respondedAt,
}: {
  deps: MasteryDeps;
  telegramUserId: string;
  questionId: Id<"questions">;
  isCorrect: boolean;
  respondedAt: number;
}): Promise<MasteryUpdateEntry[]> {
  const question = await deps.getQuestion(questionId);
  if (!question) {
    throw new Error(`Question ${questionId} not found`);
  }

  const slip = question.slip;
  const choicesCount = question.choices.length;
  const isExposure = question.choiceType === "yes_no";

  const questionKcs = await deps.getQuestionKcs(questionId);
  if (questionKcs.length === 0) {
    return [];
  }

  const results: MasteryUpdateEntry[] = [];

  for (const qkc of questionKcs) {
    const existing = await deps.getMastery(telegramUserId, qkc.kcId);

    if (existing) {
      const before = { known: existing.known, halfLife: existing.halfLife };
      const output = bktUpdate({
        known: existing.known,
        halfLife: existing.halfLife,
        lastSeen: existing.lastSeen,
        now: respondedAt,
        isCorrect,
        choicesCount,
        slip,
        isPrimary: qkc.isPrimary,
        consolidated: existing.consolidated,
        isExposure,
      });
      const nextReviewAt = safeNextReviewAt(output.nextReviewAt);
      await deps.patchMastery(existing._id, {
        known: output.known,
        halfLife: output.halfLife,
        lastSeen: respondedAt,
        nextReviewAt,
        consolidated: output.consolidated,
        seenCount: existing.seenCount + 1,
      });
      results.push({
        kcId: qkc.kcId,
        consolidated: output.consolidated,
        before,
        after: { known: output.known, halfLife: output.halfLife },
      });
    } else {
      const initial = createInitialMastery({ now: respondedAt });
      const before = { known: initial.known, halfLife: initial.halfLife };
      const output = bktUpdate({
        known: initial.known,
        halfLife: initial.halfLife,
        lastSeen: respondedAt,
        now: respondedAt,
        isCorrect,
        choicesCount,
        slip,
        isPrimary: qkc.isPrimary,
        consolidated: false,
        isExposure,
      });
      const nextReviewAt = safeNextReviewAt(output.nextReviewAt);
      const row: MasteryInsert = {
        telegramUserId,
        kcId: qkc.kcId,
        known: output.known,
        halfLife: output.halfLife,
        lastSeen: respondedAt,
        nextReviewAt,
        consolidated: output.consolidated,
        seenCount: 1,
      };
      await deps.insertMastery(row);
      results.push({
        kcId: qkc.kcId,
        consolidated: output.consolidated,
        before,
        after: { known: output.known, halfLife: output.halfLife },
      });
    }
  }

  return results;
}

export async function getMasteryForKcs({
  deps,
  telegramUserId,
  kcIds,
}: {
  deps: Pick<MasteryDeps, "getMastery">;
  telegramUserId: string;
  kcIds: string[];
}): Promise<
  Array<{ kcId: string; known: number; halfLife: number; consolidated: boolean }>
> {
  const entries = await Promise.all(
    kcIds.map(async (kcId) => {
      const entry = await deps.getMastery(telegramUserId, kcId);
      return entry
        ? {
            kcId: entry.kcId,
            known: entry.known,
            halfLife: entry.halfLife,
            consolidated: entry.consolidated,
          }
        : null;
    }),
  );
  return entries.filter(
    (e): e is NonNullable<typeof e> => e !== null,
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx convex dev --once`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add convex/userMastery/userMasteryImpl.ts
git commit -m "feat(userMastery): add deep module with updateMastery and getMasteryForKcs"
```

---

## Task 3: Create `convex/userMastery/userMasteryAdapter.ts`

**Files:**
- Create: `convex/userMastery/userMasteryAdapter.ts`

- [ ] **Step 1: Write the adapter file**

```ts
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type {
  MasteryDeps,
  MasteryPatch,
  MasteryInsert,
} from "./userMasteryTypes";

export function createMasteryDeps(
  ctx: QueryCtx | MutationCtx,
): MasteryDeps {
  return {
    async getQuestion(questionId) {
      return await ctx.db.get("questions", questionId);
    },

    async getQuestionKcs(questionId) {
      const rows = await ctx.db
        .query("questionKcs")
        .withIndex("by_question", (q) => q.eq("questionId", questionId))
        .collect();
      return rows.map((r) => ({ kcId: r.kcId, isPrimary: r.isPrimary }));
    },

    async getMastery(telegramUserId, kcId) {
      return await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) =>
          q.eq("telegramUserId", telegramUserId).eq("kcId", kcId),
        )
        .unique();
    },

    async patchMastery(_id, patch) {
      await (ctx.db as MutationCtx["db"]).patch(
        "userMastery",
        _id,
        patch as Partial<Omit<Doc<"userMastery">, "_id" | "_creationTime">>,
      );
    },

    async insertMastery(row) {
      return await (ctx.db as MutationCtx["db"]).insert("userMastery", row);
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx convex dev --once`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add convex/userMastery/userMasteryAdapter.ts
git commit -m "feat(userMastery): add Convex adapter for MasteryDeps"
```

---

## Task 4: Rewrite `convex/userMastery.ts` as Thin Wrappers

**Files:**
- Modify: `convex/userMastery.ts`

- [ ] **Step 1: Replace the entire file content**

```ts
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { createMasteryDeps } from "./userMastery/userMasteryAdapter";
import {
  updateMastery as updateMasteryImpl,
  getMasteryForKcs as getMasteryForKcsImpl,
} from "./userMastery/userMasteryImpl";

export const getMasteryForKcs = internalQuery({
  args: {
    telegramUserId: v.string(),
    kcIds: v.array(v.string()),
  },
  handler: async (ctx, { telegramUserId, kcIds }) => {
    const deps = createMasteryDeps(ctx);
    return await getMasteryForKcsImpl({ deps, telegramUserId, kcIds });
  },
});

export const updateMastery = internalMutation({
  args: {
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    isCorrect: v.boolean(),
    respondedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const deps = createMasteryDeps(ctx);
    return await updateMasteryImpl({ deps, ...args });
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx convex dev --once`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add convex/userMastery.ts
git commit -m "refactor(userMastery): rewrite as thin wrappers over deep module"
```

---

## Task 5: Update `convex/questions/answerFlowTypes.ts`

**Files:**
- Modify: `convex/questions/answerFlowTypes.ts`

- [ ] **Step 1: Make `before` required in `MasteryResult`**

Find the `MasteryResult` interface (around line 17) and change it from:

```ts
export interface MasteryResult {
  kcId: string;
  consolidated: boolean;
  before?: { known: number; halfLife: number };
  after: { known: number; halfLife: number };
}
```

To:

```ts
export interface MasteryResult {
  kcId: string;
  consolidated: boolean;
  before: { known: number; halfLife: number };
  after: { known: number; halfLife: number };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx convex dev --once`

Expected: No type errors (yet — answerFlow.ts still compiles because optional → required is a widening for consumers).

- [ ] **Step 3: Commit**

```bash
git add convex/questions/answerFlowTypes.ts
git commit -m "refactor(answerFlow): MasteryResult.before is now required"
```

---

## Task 6: Update `convex/questions/answerFlow.ts`

**Files:**
- Modify: `convex/questions/answerFlow.ts` (around line 249-251)

- [ ] **Step 1: Simplify debug footer construction**

Find this block (around line 248-252):

```ts
        return {
          kcId,
          cefrLevel: catalog?.cefrLevel ?? "?",
          ...(mastery ? { consolidated: mastery.consolidated } : {}),
          ...(mastery?.before ? { masteryBefore: mastery.before } : {}),
          ...(mastery?.after ? { masteryAfter: mastery.after } : {}),
        };
```

Replace with:

```ts
        return {
          kcId,
          cefrLevel: catalog?.cefrLevel ?? "?",
          ...(mastery
            ? {
                consolidated: mastery.consolidated,
                masteryBefore: mastery.before,
                masteryAfter: mastery.after,
              }
            : {}),
        };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx convex dev --once`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add convex/questions/answerFlow.ts
git commit -m "refactor(answerFlow): simplify mastery debug footer, before is always present"
```

---

## Task 7: Create `tests/unit/userMastery.test.ts`

**Files:**
- Create: `tests/unit/userMastery.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, vi } from "vitest";
import {
  updateMastery,
  getMasteryForKcs,
} from "../../convex/userMastery/userMasteryImpl";
import type { MasteryDeps, MasteryRow } from "../../convex/userMastery/userMasteryTypes";
import type { Id } from "../../convex/_generated/dataModel";

function createStubDeps(overrides: Partial<MasteryDeps> = {}): MasteryDeps {
  return {
    getQuestion: vi.fn().mockResolvedValue(null),
    getQuestionKcs: vi.fn().mockResolvedValue([]),
    getMastery: vi.fn().mockResolvedValue(null),
    patchMastery: vi.fn().mockResolvedValue(undefined),
    insertMastery: vi.fn().mockResolvedValue("m1" as Id<"userMastery">),
    ...overrides,
  };
}

const baseQuestion = {
  _id: "q1" as Id<"questions">,
  prompt: "Test?",
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

function createExistingMastery(overrides?: Partial<MasteryRow>): MasteryRow {
  return {
    _id: "m1" as Id<"userMastery">,
    telegramUserId: "u1",
    kcId: "kc1",
    known: 0.5,
    halfLife: 4,
    lastSeen: 1_000_000,
    nextReviewAt: 0,
    consolidated: false,
    seenCount: 3,
    ...overrides,
  };
}

const now = 2_000_000;

describe("updateMastery", () => {
  it("new KC → before = initial, after = post-bkt, insertMastery called", async () => {
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([{ kcId: "kc1", isPrimary: true }]),
      getMastery: vi.fn().mockResolvedValue(null),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results).toHaveLength(1);
    expect(results[0].kcId).toBe("kc1");
    expect(results[0].before).toEqual({ known: 0.1, halfLife: 1.0 });
    expect(results[0].after.known).toBeGreaterThan(0.1);
    expect(deps.insertMastery).toHaveBeenCalledOnce();
    const inserted = vi.mocked(deps.insertMastery).mock.calls[0][0];
    expect(inserted.seenCount).toBe(1);
    expect(inserted.telegramUserId).toBe("u1");
  });

  it("existing KC → before + after, patchMastery called, seenCount incremented", async () => {
    const existing = createExistingMastery();
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([{ kcId: "kc1", isPrimary: true }]),
      getMastery: vi.fn().mockResolvedValue(existing),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results).toHaveLength(1);
    expect(results[0].before).toEqual({ known: 0.5, halfLife: 4 });
    expect(results[0].after.known).not.toBe(0.5);
    expect(deps.patchMastery).toHaveBeenCalledOnce();
    const patched = vi.mocked(deps.patchMastery).mock.calls[0][1];
    expect(patched.seenCount).toBe(4);
    expect(patched.lastSeen).toBe(now);
  });

  it("Infinity nextReviewAt → sentinel date in patch/insert", async () => {
    // KC that will become consolidated after this correct answer → nextReviewAt = Infinity
    const existing = createExistingMastery({
      known: 0.96,
      halfLife: 60,
      consolidated: false,
    });
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([{ kcId: "kc1", isPrimary: true }]),
      getMastery: vi.fn().mockResolvedValue(existing),
    });

    await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    const patched = vi.mocked(deps.patchMastery).mock.calls[0][1];
    expect(patched.nextReviewAt).toBe(32503680000000);
  });

  it("question not found → throws Error", async () => {
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(null),
    });

    await expect(
      updateMastery({
        deps,
        telegramUserId: "u1",
        questionId: "q1" as Id<"questions">,
        isCorrect: true,
        respondedAt: now,
      }),
    ).rejects.toThrow("Question q1 not found");
  });

  it("question without KCs → returns [], no DB writes", async () => {
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([]),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results).toEqual([]);
    expect(deps.patchMastery).not.toHaveBeenCalled();
    expect(deps.insertMastery).not.toHaveBeenCalled();
  });

  it("multiple KCs → processes all, returns array with entries", async () => {
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([
        { kcId: "kc1", isPrimary: true },
        { kcId: "kc2", isPrimary: false },
      ]),
      getMastery: vi.fn().mockImplementation((_uid, kcId) => {
        if (kcId === "kc1") return createExistingMastery({ kcId: "kc1" });
        return null;
      }),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.kcId)).toContain("kc1");
    expect(results.map((r) => r.kcId)).toContain("kc2");
    expect(deps.patchMastery).toHaveBeenCalledOnce();
    expect(deps.insertMastery).toHaveBeenCalledOnce();
  });

  it("consolidated + correct → patch with unchanged known/halfLife, updated lastSeen", async () => {
    const existing = createExistingMastery({
      known: 0.99,
      halfLife: 128,
      consolidated: true,
    });
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([{ kcId: "kc1", isPrimary: true }]),
      getMastery: vi.fn().mockResolvedValue(existing),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results[0].before.known).toBe(0.99);
    expect(results[0].after.known).toBe(0.99);
    expect(results[0].before.halfLife).toBe(128);
    expect(results[0].after.halfLife).toBe(128);
    const patched = vi.mocked(deps.patchMastery).mock.calls[0][1];
    expect(patched.lastSeen).toBe(now);
    expect(patched.seenCount).toBe(4);
  });
});

describe("getMasteryForKcs", () => {
  it("filters nulls and maps fields correctly", async () => {
    const deps = createStubDeps({
      getMastery: vi.fn().mockImplementation((_uid, kcId) => {
        if (kcId === "kc1") return createExistingMastery({ kcId: "kc1" });
        return null;
      }),
    });

    const results = await getMasteryForKcs({
      deps,
      telegramUserId: "u1",
      kcIds: ["kc1", "kc2"],
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      kcId: "kc1",
      known: 0.5,
      halfLife: 4,
      consolidated: false,
    });
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npx vitest run tests/unit/userMastery.test.ts`

Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/userMastery.test.ts
git commit -m "test(userMastery): add 8 unit tests with stub adapter"
```

---

## Task 8: Update `tests/unit/answerFlow.test.ts`

**Files:**
- Modify: `tests/unit/answerFlow.test.ts` (around line 80)

- [ ] **Step 1: Add `before` to the mock MasteryResult**

Find this block (around line 80-82):

```ts
      updateMastery: vi.fn().mockResolvedValue([
        { kcId: "kc1", consolidated: false, after: { known: 0.5, halfLife: 2 } },
      ]),
```

Replace with:

```ts
      updateMastery: vi.fn().mockResolvedValue([
        { kcId: "kc1", consolidated: false, before: { known: 0.3, halfLife: 1 }, after: { known: 0.5, halfLife: 2 } },
      ]),
```

- [ ] **Step 2: Run answerFlow tests**

Run: `npx vitest run tests/unit/answerFlow.test.ts`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/answerFlow.test.ts
git commit -m "test(answerFlow): add before to mock MasteryResult for required field"
```

---

## Task 9: Run All Tests & Final Verification

- [ ] **Step 1: Run full unit test suite**

Run: `npx vitest run tests/unit/`

Expected: All tests pass (userMastery.test.ts + answerFlow.test.ts + focusSlots.test.ts + focusSlotsPure.test.ts + bktPure.test.ts).

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/integration/`

Expected: All tests pass.

- [ ] **Step 3: Verify Convex compiles**

Run: `npx convex dev --once`

Expected: No type errors, no build errors.

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "feat(userMastery): Candidate 3 complete — User Mastery Bridge deepening

- Extracted deep module: userMasteryImpl.ts
- Added seam interface: MasteryDeps in userMasteryTypes.ts
- Added Convex adapter: userMasteryAdapter.ts
- Rewrote userMastery.ts as thin wrappers
- MasteryResult.before is now required (always present)
- 8 unit tests with stub adapter covering new/existing/Infinity/errors/multi-KC
- Updated answerFlow tests for new required field"
```

---

## Self-Review Checklist

After completing all tasks, verify:

1. **Spec coverage:**
   - [ ] `userMasteryTypes.ts` created with `MasteryDeps` seam
   - [ ] `userMasteryImpl.ts` has `updateMastery` and `getMasteryForKcs`
   - [ ] `safeNextReviewAt` helper handles Infinity
   - [ ] `userMasteryAdapter.ts` is a pure DB proxy
   - [ ] `userMastery.ts` is thin wrappers only
   - [ ] `before` is required in `MasteryResult`
   - [ ] `answerFlow.ts` simplified debug footer
   - [ ] Tests cover: new KC, existing KC, Infinity, question not found, no KCs, multi-KC, consolidated+correct, getMasteryForKcs

2. **No placeholders:** Every step has actual code, commands, and expected output.

3. **Type consistency:** `MasteryUpdateEntry.before` is required everywhere. `MasteryResult.before` matches.
