# Focus Slots Core: Pure Functions + Convex Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать подсистему Focus Slots: чистые функции выбора слотов и Convex queries/mutations для их управления.

**Architecture:** Слой поверх BKT-F. `focusSlotsPure.ts` — математика. `focusSlots.ts` — Convex-интеграция. `getRandomQuestionForKc` — выбор вопроса по KC.

**Tech Stack:** TypeScript, Convex, Vitest

**Prerequisites:** План `2026-05-03-schema-cleanup.md` должен быть выполнен (схема с `focusSlots`, `seenCount`).

---

## File Structure

### New files
- `convex/focusSlots/focusSlotsPure.ts` — чистые функции
- `convex/focusSlots/focusSlots.ts` — Convex queries/mutations
- `tests/unit/focusSlotsPure.test.ts` — unit tests

### Modified files
- `convex/questions/queries.ts` — `getRandomQuestionForKc`

---

## Task 1: Create focusSlotsPure.ts with constants and types

**Files:**
- Create: `convex/focusSlots/focusSlotsPure.ts`

- [ ] **Step 1: Create file**

```typescript
// convex/focusSlots/focusSlotsPure.ts
// Чистые функции Focus Slots — без side-эффектов, без Convex-зависимостей.

export const SLOT_COUNT = 4;
export const EXIT_STREAK = 3;
export const SLOT_TIMEOUT_MS = 30 * 60 * 1000; // 30 минут

export interface FocusSlot {
  kcId: string;
  role: "drill" | "new" | "review";
  correctStreak: number;
  totalAnswers: number;
  enteredAt: number;
}

export interface UserMasteryEntry {
  kcId: string;
  known: number;
  halfLife: number;
  lastSeen: number;
  nextReviewAt: number;
  consolidated: boolean;
  seenCount: number;
}

const MS_PER_DAY = 86_400_000;

export function computeCurrentKnown({
  known,
  halfLife,
  lastSeen,
  now,
}: {
  known: number;
  halfLife: number;
  lastSeen: number;
  now: number;
}): number {
  const deltaDays = (now - lastSeen) / MS_PER_DAY;
  if (deltaDays <= 0) return known;
  return known * Math.pow(2, -deltaDays / halfLife);
}

export function shouldExit({
  correctStreak,
  consolidated,
}: {
  correctStreak: number;
  consolidated: boolean;
}): boolean {
  return correctStreak >= EXIT_STREAK || consolidated;
}

export function pickSlot({
  slots,
  masteryMap,
  now,
}: {
  slots: FocusSlot[];
  masteryMap: Map<string, UserMasteryEntry>;
  now: number;
}): FocusSlot | null {
  const active = slots.filter((s) =>
    !shouldExit({
      correctStreak: s.correctStreak,
      consolidated: masteryMap.get(s.kcId)?.consolidated ?? false,
    })
  );
  if (active.length === 0) return null;

  active.sort((a, b) => {
    const mA = masteryMap.get(a.kcId);
    const mB = masteryMap.get(b.kcId);
    const knownA = computeCurrentKnown({
      known: mA?.known ?? 0,
      halfLife: mA?.halfLife ?? 1,
      lastSeen: mA?.lastSeen ?? now,
      now,
    });
    const knownB = computeCurrentKnown({
      known: mB?.known ?? 0,
      halfLife: mB?.halfLife ?? 1,
      lastSeen: mB?.lastSeen ?? now,
      now,
    });
    return knownA - knownB;
  });

  return active[0];
}

export function initSlots({
  existingSlots,
  masteryMap,
  now,
}: {
  existingSlots: FocusSlot[];
  masteryMap: Map<string, UserMasteryEntry>;
  now: number;
}): FocusSlot[] {
  return existingSlots.filter((s) => {
    const m = masteryMap.get(s.kcId);
    if (!m) return false;
    if (m.consolidated) return false;
    if (s.correctStreak >= EXIT_STREAK && now - s.enteredAt > SLOT_TIMEOUT_MS)
      return false;
    return true;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/focusSlots/focusSlotsPure.ts
git commit -m "feat(focus-slots): pure functions with computeCurrentKnown, pickSlot, initSlots"
```

---

## Task 2: Unit tests for focusSlotsPure

**Files:**
- Create: `tests/unit/focusSlotsPure.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  computeCurrentKnown,
  shouldExit,
  pickSlot,
  initSlots,
  EXIT_STREAK,
} from "../../convex/focusSlots/focusSlotsPure";

const MS_PER_DAY = 86_400_000;

describe("computeCurrentKnown", () => {
  it("Δt=0 → known без изменений", () => {
    expect(computeCurrentKnown({ known: 0.80, halfLife: 4, lastSeen: 1000, now: 1000 })).toBe(0.80);
  });

  it("через 1 half-life → known падает вдвое", () => {
    expect(
      computeCurrentKnown({ known: 0.80, halfLife: 4, lastSeen: 0, now: 4 * MS_PER_DAY })
    ).toBeCloseTo(0.40, 2);
  });
});

describe("shouldExit", () => {
  it("correctStreak >= EXIT_STREAK → true", () => {
    expect(shouldExit({ correctStreak: EXIT_STREAK, consolidated: false })).toBe(true);
  });

  it("consolidated → true", () => {
    expect(shouldExit({ correctStreak: 0, consolidated: true })).toBe(true);
  });

  it("low streak and not consolidated → false", () => {
    expect(shouldExit({ correctStreak: 2, consolidated: false })).toBe(false);
  });
});

describe("pickSlot", () => {
  const now = Date.now();
  const slots = [
    { kcId: "a", role: "drill" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
    { kcId: "b", role: "drill" as const, correctStreak: 1, totalAnswers: 2, enteredAt: now },
  ];
  const mastery = new Map([
    ["a", { kcId: "a", known: 0.30, halfLife: 2, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 1 }],
    ["b", { kcId: "b", known: 0.80, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
  ]);

  it("выбирает слот с min(currentKnown)", () => {
    const result = pickSlot({ slots, masteryMap: mastery, now });
    expect(result?.kcId).toBe("a");
  });

  it("все exit → возвращает null", () => {
    const allExit = slots.map((s) => ({ ...s, correctStreak: EXIT_STREAK }));
    const result = pickSlot({ slots: allExit, masteryMap: mastery, now });
    expect(result).toBeNull();
  });
});

describe("initSlots", () => {
  it("сбрасывает exit-слоты и оставляет активные", () => {
    const now = Date.now();
    const existing = [
      { kcId: "a", role: "drill" as const, correctStreak: 3, totalAnswers: 3, enteredAt: now - 31 * 60 * 1000 },
      { kcId: "b", role: "drill" as const, correctStreak: 1, totalAnswers: 2, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.95, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 3 }],
      ["b", { kcId: "b", known: 0.50, halfLife: 2, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
    ]);

    const result = initSlots({ existingSlots: existing, masteryMap, now });
    expect(result.length).toBe(1);
    expect(result[0].kcId).toBe("b");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/focusSlotsPure.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/focusSlotsPure.test.ts
git commit -m "test(focus-slots): unit tests for pure functions"
```

---

## Task 3: Create Convex focusSlots.ts with mutations and queries

**Files:**
- Create: `convex/focusSlots/focusSlots.ts`

- [ ] **Step 1: Create file with helpers**

```typescript
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { computePriority } from "../bkt/bktPure";
import { initSlots, pickSlot, type FocusSlot, EXIT_STREAK } from "./focusSlotsPure";

const MS_PER_DAY = 86_400_000;

async function getMasteryMap(ctx: any, telegramUserId: string, kcIds: string[]) {
  const results = await Promise.all(
    kcIds.map((kcId) =>
      ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q: any) =>
          q.eq("telegramUserId", telegramUserId).eq("kcId", kcId)
        )
        .unique()
    )
  );
  const map = new Map();
  for (let i = 0; i < kcIds.length; i++) {
    if (results[i]) map.set(kcIds[i], results[i]);
  }
  return map;
}

async function fillSlot({
  ctx,
  telegramUserId,
  role,
  occupiedKcIds,
  now,
}: {
  ctx: any;
  telegramUserId: string;
  role: "drill" | "new" | "review";
  occupiedKcIds: string[];
  now: number;
}): Promise<FocusSlot | null> {
  if (role === "drill") {
    const active = await ctx.db
      .query("userMastery")
      .withIndex("by_user_nextReview", (q: any) =>
        q.eq("telegramUserId", telegramUserId).eq("nextReviewAt", 0)
      )
      .filter((q: any) => q.eq(q.field("consolidated"), false))
      .take(50);

    const candidates = active.filter((m: any) => !occupiedKcIds.includes(m.kcId));
    if (candidates.length > 0) {
      candidates.sort((a: any, b: any) => a.known - b.known);
      const pick = candidates[0];
      return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
    }

    const due = await ctx.db
      .query("userMastery")
      .withIndex("by_user_nextReview", (q: any) =>
        q.eq("telegramUserId", telegramUserId).lte("nextReviewAt", now)
      )
      .filter((q: any) => q.eq(q.field("consolidated"), false))
      .take(50);

    const dueCandidates = due.filter((m: any) => !occupiedKcIds.includes(m.kcId));
    if (dueCandidates.length > 0) {
      dueCandidates.sort((a: any, b: any) => {
        const pa = computePriority({ known: a.known, halfLife: a.halfLife, lastSeen: a.lastSeen, now });
        const pb = computePriority({ known: b.known, halfLife: b.halfLife, lastSeen: b.lastSeen, now });
        return pb - pa;
      });
      const pick = dueCandidates[0];
      return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
    }

    return fillSlot({ ctx, telegramUserId, role: "review", occupiedKcIds, now });
  }

  if (role === "new") {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q: any) => q.eq("telegramId", telegramUserId))
      .first();
    const pointer = user?.curriculumPointer ?? 0;

    const window = await ctx.db
      .query("kcCatalog")
      .withIndex("by_sortOrder", (q: any) => q.gt("sortOrder", pointer))
      .take(10);

    const seen = await ctx.db
      .query("userMastery")
      .withIndex("by_user_kc", (q: any) => q.eq("telegramUserId", telegramUserId))
      .collect();
    const seenIds = new Set(seen.map((s: any) => s.kcId));

    const candidates = window.filter(
      (k: any) => !seenIds.has(k.kcId) && !occupiedKcIds.includes(k.kcId)
    );
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
    }

    return fillSlot({ ctx, telegramUserId, role: "review", occupiedKcIds, now });
  }

  // role === "review"
  const early = await ctx.db
    .query("userMastery")
    .withIndex("by_user_kc", (q: any) => q.eq("telegramUserId", telegramUserId))
    .filter((q: any) => q.gte(q.field("known"), 0.70).eq(q.field("consolidated"), false))
    .take(50);

  const earlyCandidates = early.filter((m: any) => !occupiedKcIds.includes(m.kcId));
  if (earlyCandidates.length > 0) {
    earlyCandidates.sort((a: any, b: any) => a.known - b.known);
    const pick = earlyCandidates[0];
    return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
  }

  const fresh = await ctx.db
    .query("userMastery")
    .withIndex("by_user_kc", (q: any) => q.eq("telegramUserId", telegramUserId))
    .filter((q: any) =>
      q.gte(q.field("lastSeen"), now - 7 * MS_PER_DAY).lt(q.field("seenCount"), 5)
    )
    .take(50);

  const freshCandidates = fresh.filter((m: any) => !occupiedKcIds.includes(m.kcId));
  if (freshCandidates.length > 0) {
    freshCandidates.sort((a: any, b: any) => {
      const pa = computePriority({ known: a.known, halfLife: a.halfLife, lastSeen: a.lastSeen, now });
      const pb = computePriority({ known: b.known, halfLife: b.halfLife, lastSeen: b.lastSeen, now });
      return pb - pa;
    });
    const pick = freshCandidates[0];
    return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
  }

  const fragile = await ctx.db
    .query("userMastery")
    .withIndex("by_user_kc", (q: any) => q.eq("telegramUserId", telegramUserId))
    .filter((q: any) => q.eq(q.field("consolidated"), true))
    .take(50);

  const fragileCandidates = fragile.filter((m: any) => !occupiedKcIds.includes(m.kcId));
  if (fragileCandidates.length > 0) {
    fragileCandidates.sort((a: any, b: any) => a.halfLife - b.halfLife);
    const pick = fragileCandidates[0];
    return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
  }

  const allConsolidated = await ctx.db
    .query("userMastery")
    .withIndex("by_user_kc", (q: any) => q.eq("telegramUserId", telegramUserId))
    .filter((q: any) => q.eq(q.field("consolidated"), true))
    .take(100);

  const fallback = allConsolidated.filter((m: any) => !occupiedKcIds.includes(m.kcId));
  if (fallback.length > 0) {
    const pick = fallback[Math.floor(Math.random() * fallback.length)];
    return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
  }

  return null;
}
```

- [ ] **Step 2: Add initSlots mutation**

```typescript
export const initSlotsMutation = internalMutation({
  args: {
    telegramUserId: v.string(),
    now: v.number(),
  },
  handler: async (ctx, { telegramUserId, now }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramUserId))
      .first();
    if (!user) throw new Error(`User ${telegramUserId} not found`);

    const existing = user.focusSlots ?? [];
    const kcIds = existing.map((s: FocusSlot) => s.kcId);
    const masteryMap = await getMasteryMap(ctx, telegramUserId, kcIds);

    const kept = initSlots({ existingSlots: existing, masteryMap, now });

    const roles: Array<"drill" | "new" | "review"> = ["drill", "drill", "new", "review"];
    const filled: FocusSlot[] = [...kept];

    for (let i = 0; i < roles.length; i++) {
      if (filled[i]) continue;
      const newSlot = await fillSlot({
        ctx,
        telegramUserId,
        role: roles[i],
        occupiedKcIds: filled.map((s) => s.kcId),
        now,
      });
      if (newSlot) filled[i] = newSlot;
    }

    await ctx.db.patch(user._id, { focusSlots: filled });
    return filled;
  },
});
```

- [ ] **Step 3: Add pickSlot query**

```typescript
export const pickSlotQuery = internalQuery({
  args: {
    telegramUserId: v.string(),
    excludedKcIds: v.array(v.string()),
  },
  handler: async (ctx, { telegramUserId, excludedKcIds }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramUserId))
      .first();
    if (!user?.focusSlots) return null;

    const slots = user.focusSlots.filter((s: FocusSlot) => !excludedKcIds.includes(s.kcId));
    const kcIds = slots.map((s: FocusSlot) => s.kcId);
    const masteryMap = await getMasteryMap(ctx, telegramUserId, kcIds);

    const now = Date.now();
    const result = pickSlot({ slots, masteryMap, now });
    return result ? { kcId: result.kcId, role: result.role } : null;
  },
});
```

- [ ] **Step 4: Add updateAfterAnswer mutation**

```typescript
export const updateAfterAnswer = internalMutation({
  args: {
    telegramUserId: v.string(),
    kcId: v.string(),
    isCorrect: v.boolean(),
    now: v.number(),
  },
  handler: async (ctx, { telegramUserId, kcId, isCorrect, now }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramUserId))
      .first();
    if (!user) throw new Error(`User ${telegramUserId} not found`);

    const slots = user.focusSlots ?? [];
    const idx = slots.findIndex((s: FocusSlot) => s.kcId === kcId);
    if (idx === -1) return slots;

    const slot = { ...slots[idx] };
    slot.correctStreak = isCorrect ? slot.correctStreak + 1 : 0;
    slot.totalAnswers += 1;

    const mastery = await ctx.db
      .query("userMastery")
      .withIndex("by_user_kc", (q) =>
        q.eq("telegramUserId", telegramUserId).eq("kcId", kcId)
      )
      .unique();

    const shouldExitSlot = slot.correctStreak >= EXIT_STREAK || mastery?.consolidated || false;

    let newSlots: FocusSlot[];
    if (shouldExitSlot) {
      const without = slots.filter((_: any, i: number) => i !== idx);
      const occupied = without.map((s: FocusSlot) => s.kcId);
      const filled = await fillSlot({
        ctx,
        telegramUserId,
        role: slot.role,
        occupiedKcIds: occupied,
        now,
      });
      newSlots = filled ? [...without, filled] : without;
    } else {
      newSlots = slots.map((s: FocusSlot, i: number) => (i === idx ? slot : s));
    }

    await ctx.db.patch(user._id, { focusSlots: newSlots, lastAnsweredAt: now });
    return newSlots;
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add convex/focusSlots/focusSlots.ts
git commit -m "feat(focus-slots): Convex mutations initSlots, pickSlot, updateAfterAnswer"
```

---

## Task 4: Add getRandomQuestionForKc query

**Files:**
- Modify: `convex/questions/queries.ts`

- [ ] **Step 1: Add query**

```typescript
export const getRandomQuestionForKc = internalQuery({
  args: {
    kcId: v.string(),
    random: v.number(),
  },
  handler: async (ctx, { kcId, random }): Promise<Doc<"questions"> | null> => {
    const links = await ctx.db
      .query("questionKcs")
      .withIndex("by_kc", (q) => q.eq("kcId", kcId))
      .collect();

    if (links.length === 0) return null;

    const pick = links[Math.floor(random * links.length)];
    return await ctx.db.get("questions", pick.questionId);
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/questions/queries.ts
git commit -m "feat(questions): getRandomQuestionForKc query"
```

---

## Self-Review

- [ ] **Spec coverage:** initSlots (Task 3) ✓, pickSlot (Task 3) ✓, updateAfterAnswer (Task 3) ✓, fillSlot cascade (Task 3) ✓, getRandomQuestionForKc (Task 4) ✓
- [ ] **Placeholder scan:** None
- [ ] **Type consistency:** `FocusSlot` interface used consistently across pure functions and Convex code
