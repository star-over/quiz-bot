# Focus Slots Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Convex DB integration from `focusSlots.ts` into a testable `SlotFillerDeps` adapter, making `fillSlot`, `initSlots`, and `updateAfterAnswer` testable with stub adapters.

**Architecture:** Create `focusSlotsImpl.ts` (deep module with pure async functions), `focusSlotsAdapter.ts` (`createSlotFillerDeps` implementation), and `focusSlotsTypes.ts` (interfaces). Keep `focusSlots.ts` as thin Convex wrappers for backward-compatible internal API paths. Test `focusSlotsImpl.ts` via stub adapter in `tests/unit/focusSlots.test.ts`.

**Tech Stack:** TypeScript, Convex, Vitest

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/focusSlots/focusSlotsTypes.ts` | `SlotFillerDeps` interface, row types (`UserRow`, `MasteryRow`, `KcRow`, `UserPatch`) |
| `convex/focusSlots/focusSlotsAdapter.ts` | `createSlotFillerDeps(ctx)` — Convex DB implementation of the interface |
| `convex/focusSlots/focusSlotsImpl.ts` | Deep module: `fillSlot`, `initSlots`, `updateAfterAnswer`. Zero Convex imports. |
| `convex/focusSlots/focusSlots.ts` | Thin Convex wrappers: `internalMutation`/`internalQuery` that create adapter and call `focusSlotsImpl.ts` |
| `convex/focusSlots/focusSlotsPure.ts` | Unchanged. Pure functions already tested. |
| `tests/unit/focusSlots.test.ts` | Stub adapter + tests for all 6 fallback paths, initSlots, updateAfterAnswer |

---

## Task 1: Create `focusSlotsTypes.ts`

**Files:**
- Create: `convex/focusSlots/focusSlotsTypes.ts`

- [ ] **Step 1: Write types**

```ts
import type { FocusSlot } from "./focusSlotsPure";

export interface UserRow {
  _id: string;
  telegramId: string;
  focusSlots?: FocusSlot[];
  curriculumPointer?: number;
  lastAnsweredAt?: number;
}

export interface MasteryRow {
  kcId: string;
  known: number;
  halfLife: number;
  lastSeen: number;
  nextReviewAt: number;
  consolidated: boolean;
  seenCount: number;
}

export interface KcRow {
  kcId: string;
  sortOrder: number;
}

export interface UserPatch {
  focusSlots?: FocusSlot[];
  curriculumPointer?: number;
  lastAnsweredAt?: number;
}

export interface SlotFillerDeps {
  getUser(telegramUserId: string): Promise<UserRow | null>;
  updateUser(userId: string, patch: UserPatch): Promise<void>;

  getActivePool(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getDueReview(userId: string, now: number, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getEarlyReview(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getFreshKcs(userId: string, now: number, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getFragileConsolidated(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getRandomConsolidated(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getMastery(userId: string, kcId: string): Promise<MasteryRow | null>;

  getKcCatalogWindow(pointer: number, limit: number): Promise<KcRow[]>;
  getAllKcCatalog(limit: number): Promise<KcRow[]>;
  getKcById(kcId: string): Promise<KcRow | null>;

  getSeenKcIds(userId: string): Promise<string[]>;
  getKcIdsWithQuestions(): Promise<Set<string>>;
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/focusSlots/focusSlotsTypes.ts
git commit -m "types(focusSlots): SlotFillerDeps interface and row types"
```

---

## Task 2: Create `focusSlotsAdapter.ts`

**Files:**
- Create: `convex/focusSlots/focusSlotsAdapter.ts`

- [ ] **Step 1: Implement adapter**

```ts
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { SlotFillerDeps, UserRow, MasteryRow, KcRow } from "./focusSlotsTypes";

const MS_PER_DAY = 86_400_000;

function filterExclude<T extends { kcId: string }>(
  rows: T[],
  excludeKcIds: string[],
  questionsSet: Set<string>,
): T[] {
  return rows.filter((r) => !excludeKcIds.includes(r.kcId) && questionsSet.has(r.kcId));
}

export function createSlotFillerDeps(ctx: QueryCtx | MutationCtx): SlotFillerDeps {
  let _questionsSet: Set<string> | undefined;

  async function questionsSet(): Promise<Set<string>> {
    if (!_questionsSet) {
      const links = await ctx.db.query("questionKcs").take(1000);
      _questionsSet = new Set(links.map((l) => l.kcId));
    }
    return _questionsSet;
  }

  return {
    async getUser(telegramUserId: string): Promise<UserRow | null> {
      return await ctx.db
        .query("users")
        .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramUserId))
        .first();
    },

    async updateUser(userId: string, patch) {
      await ctx.db.patch("users", userId as any, patch as any);
    },

    async getActivePool(userId, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_nextReview", (q) =>
          q.eq("telegramUserId", userId).eq("nextReviewAt", 0),
        )
        .filter((q) => q.eq(q.field("consolidated"), false))
        .take(50);
      return filterExclude(rows as MasteryRow[], excludeKcIds, qs);
    },

    async getDueReview(userId, now, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_nextReview", (q) =>
          q.eq("telegramUserId", userId).lte("nextReviewAt", now),
        )
        .filter((q) => q.eq(q.field("consolidated"), false))
        .take(50);
      return filterExclude(rows as MasteryRow[], excludeKcIds, qs);
    },

    async getEarlyReview(userId, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        .filter((q) =>
          q.and(q.gte(q.field("known"), 0.7), q.eq(q.field("consolidated"), false)),
        )
        .take(50);
      return filterExclude(rows as MasteryRow[], excludeKcIds, qs);
    },

    async getFreshKcs(userId, now, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        .filter((q) =>
          q.and(
            q.gte(q.field("lastSeen"), now - 7 * MS_PER_DAY),
            q.lt(q.field("seenCount"), 5),
          ),
        )
        .take(50);
      return filterExclude(rows as MasteryRow[], excludeKcIds, qs);
    },

    async getFragileConsolidated(userId, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        .filter((q) => q.eq(q.field("consolidated"), true))
        .take(50);
      return filterExclude(rows as MasteryRow[], excludeKcIds, qs);
    },

    async getRandomConsolidated(userId, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        .filter((q) => q.eq(q.field("consolidated"), true))
        .take(100);
      return filterExclude(rows as MasteryRow[], excludeKcIds, qs);
    },

    async getMastery(userId, kcId) {
      return await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) =>
          q.eq("telegramUserId", userId).eq("kcId", kcId),
        )
        .unique();
    },

    async getKcCatalogWindow(pointer, limit) {
      return await ctx.db
        .query("kcCatalog")
        .withIndex("by_sortOrder", (q) => q.gt("sortOrder", pointer))
        .take(limit);
    },

    async getAllKcCatalog(limit) {
      return await ctx.db.query("kcCatalog").take(limit);
    },

    async getKcById(kcId) {
      return await ctx.db
        .query("kcCatalog")
        .withIndex("by_kcId", (q) => q.eq("kcId", kcId))
        .unique();
    },

    async getSeenKcIds(userId) {
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        .collect();
      return rows.map((r) => r.kcId);
    },

    async getKcIdsWithQuestions() {
      return questionsSet();
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/focusSlots/focusSlotsAdapter.ts
git commit -m "feat(focusSlots): createSlotFillerDeps adapter"
```

---

## Task 3: Create `focusSlotsImpl.ts`

**Files:**
- Create: `convex/focusSlots/focusSlotsImpl.ts`

- [ ] **Step 1: Implement deep module**

```ts
import type { FocusSlot } from "./focusSlotsPure";
import {
  initSlots as initSlotsPure,
  pickSlot,
  chooseRefillRole,
  EXIT_STREAK,
} from "./focusSlotsPure";
import type { SlotFillerDeps, UserRow, MasteryRow, KcRow } from "./focusSlotsTypes";

function isNonEmpty<T>(arr: readonly T[]): arr is readonly [T, ...T[]] {
  return arr.length > 0;
}

function randomElement<T>(arr: readonly [T, ...T[]]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function slotFromKc(kcId: string, role: FocusSlot["role"], now: number): FocusSlot {
  return { kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
}

function sortByKnownAsc(a: MasteryRow, b: MasteryRow): number {
  return a.known - b.known;
}

function sortByPriorityDesc(a: MasteryRow, b: MasteryRow, now: number): number {
  // computePriority from bktPure: 0.5 * need + 0.5 * urgency
  // Inline to avoid importing bktPure here (keep impl dependency-free)
  const needA = 1 - a.known;
  const needB = 1 - b.known;
  const urgencyA = Math.min(1, (now - a.lastSeen) / (a.halfLife * 86_400_000));
  const urgencyB = Math.min(1, (now - b.lastSeen) / (b.halfLife * 86_400_000));
  const pa = 0.5 * needA + 0.5 * urgencyA;
  const pb = 0.5 * needB + 0.5 * urgencyB;
  return pb - pa;
}

export async function fillSlot({
  deps,
  telegramUserId,
  role,
  occupiedKcIds,
  now,
}: {
  deps: SlotFillerDeps;
  telegramUserId: string;
  role: "drill" | "new" | "review";
  occupiedKcIds: string[];
  now: number;
}): Promise<FocusSlot | null> {
  const excludeOpts = { excludeKcIds: occupiedKcIds };

  if (role === "drill") {
    const active = await deps.getActivePool(telegramUserId, excludeOpts);
    if (isNonEmpty(active)) {
      active.sort(sortByKnownAsc);
      const pick = randomElement(active);
      return slotFromKc(pick.kcId, role, now);
    }

    const due = await deps.getDueReview(telegramUserId, now, excludeOpts);
    if (isNonEmpty(due)) {
      due.sort((a, b) => sortByPriorityDesc(a, b, now));
      const pick = randomElement(due);
      return slotFromKc(pick.kcId, role, now);
    }

    return fillSlot({ deps, telegramUserId, role: "review", occupiedKcIds, now });
  }

  if (role === "new") {
    const user = await deps.getUser(telegramUserId);
    const pointer = user?.curriculumPointer ?? 0;

    const window = await deps.getKcCatalogWindow(pointer, 10);
    const seenIds = new Set(await deps.getSeenKcIds(telegramUserId));
    const qs = await deps.getKcIdsWithQuestions();

    const candidates = window.filter(
      (k) => !seenIds.has(k.kcId) && !occupiedKcIds.includes(k.kcId) && qs.has(k.kcId),
    );
    if (isNonEmpty(candidates)) {
      const pick = randomElement(candidates);
      return slotFromKc(pick.kcId, role, now);
    }

    const extended = await deps.getAllKcCatalog(200);
    const extendedCandidates = extended.filter(
      (k) => !seenIds.has(k.kcId) && !occupiedKcIds.includes(k.kcId) && qs.has(k.kcId),
    );
    if (isNonEmpty(extendedCandidates)) {
      const pick = randomElement(extendedCandidates);
      return slotFromKc(pick.kcId, role, now);
    }

    return fillSlot({ deps, telegramUserId, role: "review", occupiedKcIds, now });
  }

  // role === "review"
  const early = await deps.getEarlyReview(telegramUserId, excludeOpts);
  if (isNonEmpty(early)) {
    early.sort(sortByKnownAsc);
    const pick = randomElement(early);
    return slotFromKc(pick.kcId, role, now);
  }

  const fresh = await deps.getFreshKcs(telegramUserId, now, excludeOpts);
  if (isNonEmpty(fresh)) {
    fresh.sort((a, b) => sortByPriorityDesc(a, b, now));
    const pick = randomElement(fresh);
    return slotFromKc(pick.kcId, role, now);
  }

  const fragile = await deps.getFragileConsolidated(telegramUserId, excludeOpts);
  if (isNonEmpty(fragile)) {
    fragile.sort((a, b) => a.halfLife - b.halfLife);
    const pick = randomElement(fragile);
    return slotFromKc(pick.kcId, role, now);
  }

  const randomCons = await deps.getRandomConsolidated(telegramUserId, excludeOpts);
  if (isNonEmpty(randomCons)) {
    const pick = randomElement(randomCons);
    return slotFromKc(pick.kcId, role, now);
  }

  const user = await deps.getUser(telegramUserId);
  const pointer = user?.curriculumPointer ?? 0;
  const wideWindow = await deps.getKcCatalogWindow(pointer, 50);
  const seenIds = new Set(await deps.getSeenKcIds(telegramUserId));
  const qs = await deps.getKcIdsWithQuestions();

  const unseen = wideWindow.filter(
    (k) => !seenIds.has(k.kcId) && !occupiedKcIds.includes(k.kcId) && qs.has(k.kcId),
  );
  if (isNonEmpty(unseen)) {
    const pick = randomElement(unseen);
    return slotFromKc(pick.kcId, role, now);
  }

  const any = await deps.getAllKcCatalog(100);
  const anyCandidates = any.filter(
    (k) => !occupiedKcIds.includes(k.kcId) && qs.has(k.kcId),
  );
  if (isNonEmpty(anyCandidates)) {
    const pick = randomElement(anyCandidates);
    return slotFromKc(pick.kcId, "review", now);
  }

  return null;
}

export async function initSlots({
  deps,
  telegramUserId,
  now,
}: {
  deps: SlotFillerDeps;
  telegramUserId: string;
  now: number;
}): Promise<FocusSlot[]> {
  const user = await deps.getUser(telegramUserId);
  if (!user) throw new Error(`User ${telegramUserId} not found`);

  const existing = user.focusSlots ?? [];
  const kcIds = existing.map((s) => s.kcId);

  const masteryMap = new Map<string, MasteryRow>();
  for (const kcId of kcIds) {
    const m = await deps.getMastery(telegramUserId, kcId);
    if (m) masteryMap.set(kcId, m);
  }

  const qs = await deps.getKcIdsWithQuestions();
  const kept = initSlotsPure({ existingSlots: existing, masteryMap, now }).filter((s) =>
    qs.has(s.kcId),
  );

  const roles: readonly ("drill" | "new" | "review")[] = ["drill", "drill", "new", "review"];
  const filled: (FocusSlot | undefined)[] = [...kept];

  for (let i = 0; i < roles.length; i++) {
    if (filled[i]) continue;
    const role = roles[i];
    const occupiedKcIds = filled.flatMap((s) => (s ? [s.kcId] : []));
    const slot = await fillSlot({ deps, telegramUserId, role, occupiedKcIds, now });
    if (slot) filled[i] = slot;
  }

  const finalSlots = filled.filter((s): s is FocusSlot => s !== undefined);

  const patch: { focusSlots: FocusSlot[]; curriculumPointer?: number } = {
    focusSlots: finalSlots,
  };

  const newSlotKcIds = finalSlots.filter((s) => s.role === "new").map((s) => s.kcId);
  if (newSlotKcIds.length > 0) {
    const newKcs = await Promise.all(newSlotKcIds.map((kcId) => deps.getKcById(kcId)));
    const maxSortOrder = newKcs
      .filter((kc): kc is KcRow => kc !== null)
      .reduce((max, kc) => Math.max(max, kc.sortOrder), user.curriculumPointer ?? 0);
    if (maxSortOrder > (user.curriculumPointer ?? 0)) {
      patch.curriculumPointer = maxSortOrder;
    }
  }

  await deps.updateUser(user._id, patch);
  return finalSlots;
}

export async function updateAfterAnswer({
  deps,
  telegramUserId,
  kcId,
  isCorrect,
  now,
}: {
  deps: SlotFillerDeps;
  telegramUserId: string;
  kcId: string;
  isCorrect: boolean;
  now: number;
}): Promise<void> {
  const user = await deps.getUser(telegramUserId);
  if (!user) return;

  const slots = user.focusSlots ?? [];
  const idx = slots.findIndex((s) => s.kcId === kcId);
  if (idx === -1) return;

  const slot = slots[idx];
  if (!slot) return;

  slot.totalAnswers += 1;
  if (isCorrect) {
    slot.correctStreak += 1;
  } else {
    slot.correctStreak = 0;
  }

  const mastery = await deps.getMastery(telegramUserId, kcId);

  const shouldExit = slot.correctStreak >= EXIT_STREAK || (mastery?.consolidated ?? false);
  if (shouldExit) {
    slots.splice(idx, 1);

    const remainingKcIds = slots.map((s) => s.kcId);
    const remainingMasteryMap = new Map<string, MasteryRow>();
    for (const id of remainingKcIds) {
      const m = await deps.getMastery(telegramUserId, id);
      if (m) remainingMasteryMap.set(id, m);
    }

    const refillRole = chooseRefillRole({
      slots,
      masteryMap: remainingMasteryMap,
      now,
      defaultRole: slot.role,
    });

    const filled = await fillSlot({
      deps,
      telegramUserId,
      role: refillRole,
      occupiedKcIds: remainingKcIds,
      now,
    });
    if (filled) slots.push(filled);

    if (refillRole === "new" && mastery && mastery.known >= 0.7) {
      const kc = await deps.getKcById(kcId);
      if (kc && (user.curriculumPointer ?? 0) < kc.sortOrder) {
        await deps.updateUser(user._id, { curriculumPointer: kc.sortOrder });
      }
    }
  }

  await deps.updateUser(user._id, { focusSlots: slots, lastAnsweredAt: now });
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/focusSlots/focusSlotsImpl.ts
git commit -m "feat(focusSlots): extract deep module with fillSlot, initSlots, updateAfterAnswer"
```

---

## Task 4: Rewrite `focusSlots.ts` wrappers

**Files:**
- Modify: `convex/focusSlots/focusSlots.ts`

- [ ] **Step 1: Replace content with thin wrappers**

```ts
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { createSlotFillerDeps } from "./focusSlotsAdapter";
import { initSlots, fillSlot, updateAfterAnswer } from "./focusSlotsImpl";
import { pickSlot } from "./focusSlotsPure";
import type { FocusSlot } from "./focusSlotsPure";

export const initSlotsMutation = internalMutation({
  args: {
    telegramUserId: v.string(),
    now: v.number(),
  },
  handler: async (ctx, { telegramUserId, now }) => {
    const deps = createSlotFillerDeps(ctx);
    return await initSlots({ deps, telegramUserId, now });
  },
});

export const pickSlotQuery = internalQuery({
  args: {
    telegramUserId: v.string(),
    excludedKcIds: v.array(v.string()),
  },
  handler: async (ctx, { telegramUserId, excludedKcIds }) => {
    const deps = createSlotFillerDeps(ctx);
    const user = await deps.getUser(telegramUserId);
    if (!user?.focusSlots) return null;

    const slots = user.focusSlots.filter((s: FocusSlot) => !excludedKcIds.includes(s.kcId));
    const kcIds = slots.map((s: FocusSlot) => s.kcId);

    const masteryMap = new Map();
    for (const kcId of kcIds) {
      const m = await deps.getMastery(telegramUserId, kcId);
      if (m) masteryMap.set(kcId, m);
    }

    const result = pickSlot({ slots, masteryMap, now: Date.now() });
    return result ? { kcId: result.kcId, role: result.role } : null;
  },
});

export const updateAfterAnswer = internalMutation({
  args: {
    telegramUserId: v.string(),
    kcId: v.string(),
    isCorrect: v.boolean(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const deps = createSlotFillerDeps(ctx);
    await updateAfterAnswer({ deps, ...args });
  },
});
```

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Expected: All existing tests pass. If failures, debug before proceeding.

- [ ] **Step 3: Commit**

```bash
git add convex/focusSlots/focusSlots.ts
git commit -m "refactor(focusSlots): thin Convex wrappers over deep module"
```

---

## Task 5: Create stub adapter

**Files:**
- Create: `tests/unit/focusSlots.test.ts`

- [ ] **Step 1: Write stub adapter**

```ts
import type { SlotFillerDeps, UserRow, MasteryRow, KcRow } from "../../convex/focusSlots/focusSlotsTypes";

export function createStubDeps(overrides?: Partial<SlotFillerDeps>): SlotFillerDeps {
  return {
    getUser: async () => null,
    updateUser: async () => {},
    getActivePool: async () => [],
    getDueReview: async () => [],
    getEarlyReview: async () => [],
    getFreshKcs: async () => [],
    getFragileConsolidated: async () => [],
    getRandomConsolidated: async () => [],
    getMastery: async () => null,
    getKcCatalogWindow: async () => [],
    getAllKcCatalog: async () => [],
    getKcById: async () => null,
    getSeenKcIds: async () => [],
    getKcIdsWithQuestions: async () => new Set(),
    ...overrides,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/unit/focusSlots.test.ts
git commit -m "test(focusSlots): stub adapter for SlotFillerDeps"
```

---

## Task 6: Write `fillSlot` fallback tests

**Files:**
- Modify: `tests/unit/focusSlots.test.ts`

- [ ] **Step 1: Add drill path tests**

```ts
import { describe, it, expect } from "vitest";
import { fillSlot } from "../../convex/focusSlots/focusSlotsImpl";
import { createStubDeps } from "./focusSlots.test";

const now = 1_000_000;

function m(kcId: string, overrides?: Partial<MasteryRow>): MasteryRow {
  return {
    kcId,
    known: 0.5,
    halfLife: 4,
    lastSeen: now,
    nextReviewAt: 0,
    consolidated: false,
    seenCount: 1,
    ...overrides,
  };
}

describe("fillSlot drill role", () => {
  it("active pool hit → returns drill slot", async () => {
    const deps = createStubDeps({
      getActivePool: async () => [m("a", { known: 0.3 })],
      getKcIdsWithQuestions: async () => new Set(["a"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "drill", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("a");
    expect(result?.role).toBe("drill");
  });

  it("active empty, due review hit → returns drill slot", async () => {
    const deps = createStubDeps({
      getActivePool: async () => [],
      getDueReview: async () => [m("b", { known: 0.4 }),
      getKcIdsWithQuestions: async () => new Set(["b"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "drill", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("b");
    expect(result?.role).toBe("drill");
  });

  it("active empty, due empty → falls back to review path (early review)", async () => {
    const deps = createStubDeps({
      getActivePool: async () => [],
      getDueReview: async () => [],
      getEarlyReview: async () => [m("c", { known: 0.8 })],
      getKcIdsWithQuestions: async () => new Set(["c"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "drill", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("c");
    expect(result?.role).toBe("review");
  });
});
```

- [ ] **Step 2: Add new path tests**

```ts
describe("fillSlot new role", () => {
  it("curriculum window hit → returns new slot", async () => {
    const deps = createStubDeps({
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [{ kcId: "n1", sortOrder: 1 }],
      getSeenKcIds: async () => [],
      getKcIdsWithQuestions: async () => new Set(["n1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "new", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("n1");
    expect(result?.role).toBe("new");
  });

  it("window empty, extended fallback hit → returns new slot", async () => {
    const deps = createStubDeps({
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [],
      getAllKcCatalog: async () => [{ kcId: "n2", sortOrder: 2 }],
      getSeenKcIds: async () => [],
      getKcIdsWithQuestions: async () => new Set(["n2"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "new", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("n2");
    expect(result?.role).toBe("new");
  });

  it("window empty, extended empty → falls back to review", async () => {
    const deps = createStubDeps({
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [],
      getAllKcCatalog: async () => [],
      getSeenKcIds: async () => [],
      getEarlyReview: async () => [m("r1")],
      getKcIdsWithQuestions: async () => new Set(["r1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "new", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("r1");
    expect(result?.role).toBe("review");
  });
});
```

- [ ] **Step 3: Add review path tests**

```ts
describe("fillSlot review role cascade", () => {
  it("early review hit", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [m("e1", { known: 0.75 })],
      getKcIdsWithQuestions: async () => new Set(["e1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("e1");
  });

  it("early empty, fresh hit", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [],
      getFreshKcs: async () => [m("f1", { lastSeen: now - 1 * 86_400_000, seenCount: 2 })],
      getKcIdsWithQuestions: async () => new Set(["f1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("f1");
  });

  it("early empty, fresh empty, fragile hit", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [],
      getFreshKcs: async () => [],
      getFragileConsolidated: async () => [m("g1", { consolidated: true, halfLife: 8 })],
      getKcIdsWithQuestions: async () => new Set(["g1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("g1");
  });

  it("all consolidated empty, wide window unseen hit", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [],
      getFreshKcs: async () => [],
      getFragileConsolidated: async () => [],
      getRandomConsolidated: async () => [],
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [{ kcId: "w1", sortOrder: 5 }],
      getSeenKcIds: async () => [],
      getKcIdsWithQuestions: async () => new Set(["w1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("w1");
  });

  it("all empty → returns null", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [],
      getFreshKcs: async () => [],
      getFragileConsolidated: async () => [],
      getRandomConsolidated: async () => [],
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [],
      getAllKcCatalog: async () => [],
      getSeenKcIds: async () => [],
      getKcIdsWithQuestions: async () => new Set(),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/focusSlots.test.ts
```

Expected: PASS for all fillSlot tests.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/focusSlots.test.ts
git commit -m "test(focusSlots): fillSlot fallback paths"
```

---

## Task 7: Write `initSlots` tests

**Files:**
- Modify: `tests/unit/focusSlots.test.ts`

- [ ] **Step 1: Add tests**

```ts
import { initSlots } from "../../convex/focusSlots/focusSlotsImpl";

describe("initSlots", () => {
  it("filters consolidated slots and refills", async () => {
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 0, totalAnswers: 1, enteredAt: now },
            { kcId: "b", role: "drill", correctStreak: 3, totalAnswers: 3, enteredAt: now },
          ],
          curriculumPointer: 0,
        } as UserRow),
      getMastery: async (_uid, kcId) => {
        if (kcId === "a")
          return m("a", { consolidated: false });
        if (kcId === "b")
          return m("b", { consolidated: true });
        return null;
      },
      getKcIdsWithQuestions: async () => new Set(["a", "new1"]),
      getActivePool: async () => [m("new1", { known: 0.3 })],
    });

    const result = await initSlots({ deps, telegramUserId: "u1", now });
    expect(result.map((s) => s.kcId)).toContain("a");
    expect(result.map((s) => s.kcId)).toContain("new1");
    expect(result.length).toBe(2); // a kept + 1 filled (drill slot 2)
  });

  it("bumps curriculumPointer for new slots", async () => {
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [],
          curriculumPointer: 0,
        } as UserRow),
      getKcIdsWithQuestions: async () => new Set(["n1"]),
      getKcCatalogWindow: async () => [{ kcId: "n1", sortOrder: 5 }],
      getSeenKcIds: async () => [],
      getKcById: async (kcId) => (kcId === "n1" ? { kcId: "n1", sortOrder: 5 } : null),
      updateUser: async (_uid, patch) => {
        expect(patch.curriculumPointer).toBe(5);
      },
    });

    await initSlots({ deps, telegramUserId: "u1", now });
  });

  it("throws when user not found", async () => {
    const deps = createStubDeps({ getUser: async () => null });
    await expect(initSlots({ deps, telegramUserId: "u1", now })).rejects.toThrow("not found");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/focusSlots.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/focusSlots.test.ts
git commit -m "test(focusSlots): initSlots logic"
```

---

## Task 8: Write `updateAfterAnswer` tests

**Files:**
- Modify: `tests/unit/focusSlots.test.ts`

- [ ] **Step 1: Add tests**

```ts
import { updateAfterAnswer } from "../../convex/focusSlots/focusSlotsImpl";

describe("updateAfterAnswer", () => {
  it("wrong answer → streak 0, slot stays", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 2, totalAnswers: 2, enteredAt: now },
          ],
        } as UserRow),
      getMastery: async () => m("a", { consolidated: false }),
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
    });

    await updateAfterAnswer({ deps, telegramUserId: "u1", kcId: "a", isCorrect: false, now });
    const slots = capturedPatch?.focusSlots as FocusSlot[];
    expect(slots[0].correctStreak).toBe(0);
    expect(slots[0].totalAnswers).toBe(3);
  });

  it("correct x3 → exit + refill with default role", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 2, totalAnswers: 2, enteredAt: now },
          ],
        } as UserRow),
      getMastery: async () => m("a", { consolidated: false }),
      getActivePool: async () => [m("b", { known: 0.3 })],
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
      getKcIdsWithQuestions: async () => new Set(["b"]),
    });

    await updateAfterAnswer({ deps, telegramUserId: "u1", kcId: "a", isCorrect: true, now });
    const slots = capturedPatch?.focusSlots as FocusSlot[];
    expect(slots.length).toBe(1);
    expect(slots[0].kcId).toBe("b");
    expect(slots[0].role).toBe("drill");
  });

  it("consolidated mastery → exit + refill", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 0, totalAnswers: 1, enteredAt: now },
          ],
        } as UserRow),
      getMastery: async () => m("a", { consolidated: true }),
      getActivePool: async () => [m("b", { known: 0.3 })],
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
      getKcIdsWithQuestions: async () => new Set(["b"]),
    });

    await updateAfterAnswer({ deps, telegramUserId: "u1", kcId: "a", isCorrect: true, now });
    const slots = capturedPatch?.focusSlots as FocusSlot[];
    expect(slots[0].kcId).toBe("b");
  });

  it("all active above 0.85 → chooseRefillRole returns new", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 3, totalAnswers: 3, enteredAt: now },
            { kcId: "b", role: "review", correctStreak: 0, totalAnswers: 1, enteredAt: now },
          ],
          curriculumPointer: 0,
        } as UserRow),
      getMastery: async (_uid, kcId) => {
        // b is active with known 0.90
        if (kcId === "b") return m("b", { known: 0.9, halfLife: 64 });
        return null;
      },
      getKcCatalogWindow: async () => [{ kcId: "n1", sortOrder: 1 }],
      getSeenKcIds: async () => [],
      getKcById: async () => null,
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
      getKcIdsWithQuestions: async () => new Set(["n1"]),
    });

    await updateAfterAnswer({ deps, telegramUserId: "u1", kcId: "a", isCorrect: true, now });
    const slots = capturedPatch?.focusSlots as FocusSlot[];
    const newSlot = slots.find((s) => s.kcId === "n1");
    expect(newSlot?.role).toBe("new");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/focusSlots.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/focusSlots.test.ts
git commit -m "test(focusSlots): updateAfterAnswer logic"
```

---

## Task 9: Verify integration with `answerFlowAdapter.ts`

**Files:**
- Read-only: `convex/questions/answerFlowAdapter.ts`

- [ ] **Step 1: Confirm API paths unchanged**

Ensure `answerFlowAdapter.ts` still calls:
- `internal.focusSlots.focusSlots.initSlotsMutation`
- `internal.focusSlots.focusSlots.pickSlotQuery`
- `internal.focusSlots.focusSlots.updateAfterAnswer`

These paths must resolve because `focusSlots.ts` still exports them.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass. No compilation errors from Convex (`npx convex dev` or `npx convex codegen`).

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(focusSlots): verify integration with answerFlowAdapter"
```

---

## Task 10: Final cleanup and self-review

- [ ] **Step 1: Check for dead code**

Scan `convex/focusSlots/focusSlots.ts` for any leftover old implementations. Should only contain thin wrappers.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Fix any issues.

- [ ] **Step 3: Final commit**

```bash
git commit -m "refactor(focusSlots): Candidate 2 — deep module + adapter + tests complete"
```

---

## Plan Self-Review

**1. Spec coverage:**
- `SlotFillerDeps` interface → Task 1
- `createSlotFillerDeps` → Task 2
- `fillSlot` with 6 fallback paths → Task 3 + Task 6
- `initSlots` with curriculum pointer bump → Task 3 + Task 7
- `updateAfterAnswer` with exit/refill → Task 3 + Task 8
- Thin wrappers preserving API paths → Task 4
- Error handling (user not found, empty set) → Task 7 tests

**2. Placeholder scan:** No TBD, no "implement later", all code blocks contain complete implementation.

**3. Type consistency:**
- `UserRow`, `MasteryRow`, `KcRow`, `UserPatch` defined in Task 1 and used consistently throughout.
- `FocusSlot` imported from `focusSlotsPure.ts` everywhere.
- `SlotFillerDeps` methods match between Task 1 (interface), Task 2 (adapter), Task 3 (impl), Task 5 (stub).
