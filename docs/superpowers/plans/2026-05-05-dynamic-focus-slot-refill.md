# Dynamic Focus Slot Refill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `updateAfterAnswer` dynamically choose `"new"` role for refilling focus slots when active KC reach a mastery threshold, instead of blindly reusing the exiting slot's role.

**Architecture:** Add a threshold constant and a pure `chooseRefillRole` function that inspects active slots' current `known` levels. If the weakest active KC is above the threshold, any exiting slot is refilled with `"new"` (bringing fresh curriculum KC). Otherwise the original slot role is preserved. This breaks the infinite consolidated-KC loop in review slots.

**Tech Stack:** TypeScript, Convex, Vitest

---

## File Map

| File | Responsibility |
|---|---|
| `convex/focusSlots/focusSlotsPure.ts` | Pure functions, constants, types. Will host `NEW_KC_KNOWN_THRESHOLD` and `chooseRefillRole`. |
| `convex/focusSlots/focusSlots.ts` | Convex mutations. `updateAfterAnswer` will call `chooseRefillRole` before `fillSlot`. |
| `tests/unit/focusSlotsPure.test.ts` | Unit tests for pure functions. Will add tests for `chooseRefillRole`. |

---

### Task 1: Add threshold constant and `chooseRefillRole` pure function

**Files:**
- Modify: `convex/focusSlots/focusSlotsPure.ts`
- Test: `tests/unit/focusSlotsPure.test.ts`

- [ ] **Step 1: Write the failing test**

Add two test cases to `tests/unit/focusSlotsPure.test.ts`:

```typescript
import {
  computeCurrentKnown,
  shouldExit,
  pickSlot,
  initSlots,
  EXIT_STREAK,
  NEW_KC_KNOWN_THRESHOLD,
  chooseRefillRole,
} from "../../convex/focusSlots/focusSlotsPure";
```

```typescript
describe("chooseRefillRole", () => {
  const now = Date.now();

  it("returns 'new' when all active slots are above threshold", () => {
    const slots = [
      { kcId: "a", role: "review" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
      { kcId: "b", role: "review" as const, correctStreak: 0, totalAnswers: 2, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.90, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 1 }],
      ["b", { kcId: "b", known: 0.92, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
    ]);

    const result = chooseRefillRole({ slots, masteryMap: mastery, now, defaultRole: "review" });
    expect(result).toBe("new");
  });

  it("returns defaultRole when weakest active slot is below threshold", () => {
    const slots = [
      { kcId: "a", role: "review" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
      { kcId: "b", role: "review" as const, correctStreak: 0, totalAnswers: 2, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.90, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 1 }],
      ["b", { kcId: "b", known: 0.50, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
    ]);

    const result = chooseRefillRole({ slots, masteryMap: mastery, now, defaultRole: "review" });
    expect(result).toBe("review");
  });

  it("ignores consolidated slots when computing min known", () => {
    const slots = [
      { kcId: "a", role: "review" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
      { kcId: "b", role: "review" as const, correctStreak: 0, totalAnswers: 2, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.20, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: true, seenCount: 1 }],
      ["b", { kcId: "b", known: 0.92, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
    ]);

    const result = chooseRefillRole({ slots, masteryMap: mastery, now, defaultRole: "review" });
    expect(result).toBe("new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/focusSlotsPure.test.ts`

Expected: FAIL with `chooseRefillRole is not defined` or `NEW_KC_KNOWN_THRESHOLD is not defined`.

- [ ] **Step 3: Implement constant and function**

In `convex/focusSlots/focusSlotsPure.ts`, add after `SLOT_TIMEOUT_MS`:

```typescript
export const NEW_KC_KNOWN_THRESHOLD = 0.85;
```

Add after `initSlots` function:

```typescript
export function chooseRefillRole({
  slots,
  masteryMap,
  now,
  defaultRole,
}: {
  slots: FocusSlot[];
  masteryMap: Map<string, UserMasteryEntry>;
  now: number;
  defaultRole: "drill" | "new" | "review";
}): "drill" | "new" | "review" {
  const active = slots.filter(
    (s) =>
      !shouldExit({
        correctStreak: s.correctStreak,
        consolidated: masteryMap.get(s.kcId)?.consolidated ?? false,
      })
  );

  if (active.length === 0) return defaultRole;

  const minKnown = Math.min(
    ...active.map((s) => {
      const m = masteryMap.get(s.kcId);
      return computeCurrentKnown({
        known: m?.known ?? 0,
        halfLife: m?.halfLife ?? 1,
        lastSeen: m?.lastSeen ?? now,
        now,
      });
    })
  );

  if (minKnown >= NEW_KC_KNOWN_THRESHOLD) {
    return "new";
  }

  return defaultRole;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/focusSlotsPure.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/focusSlots/focusSlotsPure.ts tests/unit/focusSlotsPure.test.ts
git commit -m "feat(focus-slots): add NEW_KC_KNOWN_THRESHOLD and chooseRefillRole"
```

---

### Task 2: Wire `chooseRefillRole` into `updateAfterAnswer`

**Files:**
- Modify: `convex/focusSlots/focusSlots.ts`

- [ ] **Step 1: Import `chooseRefillRole` and build expected mutation patch**

At the top of `convex/focusSlots/focusSlots.ts`, add `chooseRefillRole` to the existing import from `./focusSlotsPure`:

```typescript
import { initSlots, pickSlot, type FocusSlot, EXIT_STREAK, chooseRefillRole } from "./focusSlotsPure";
```

- [ ] **Step 2: Replace hardcoded role in `updateAfterAnswer`**

In `updateAfterAnswer`, find the block:

```typescript
    const shouldExitSlot = slot.correctStreak >= EXIT_STREAK || (mastery?.consolidated ?? false);
    if (shouldExitSlot) {
      slots.splice(idx, 1);
      const filled = await fillSlot({
        ctx,
        telegramUserId,
        role: slot.role,
        occupiedKcIds: slots.map((s) => s.kcId),
        now,
      });
```

Replace with:

```typescript
    const shouldExitSlot = slot.correctStreak >= EXIT_STREAK || (mastery?.consolidated ?? false);
    if (shouldExitSlot) {
      slots.splice(idx, 1);

      // Determine whether we are ready to introduce a new KC
      const remainingSlots = slots;
      const remainingKcIds = remainingSlots.map((s) => s.kcId);
      const remainingMasteryMap = await getMasteryMap({ ctx, telegramUserId, kcIds: remainingKcIds });
      const refillRole = chooseRefillRole({
        slots: remainingSlots,
        masteryMap: remainingMasteryMap,
        now,
        defaultRole: slot.role,
      });

      const filled = await fillSlot({
        ctx,
        telegramUserId,
        role: refillRole,
        occupiedKcIds: remainingKcIds,
        now,
      });
```

- [ ] **Step 3: Type-check and deploy**

Run: `npx convex dev --once`

Expected: Type-check passes, functions deploy successfully.

- [ ] **Step 4: Commit**

```bash
git add convex/focusSlots/focusSlots.ts
git commit -m "feat(focus-slots): use chooseRefillRole in updateAfterAnswer"
```

---

### Task 3: Regression test the integration

**Files:**
- Modify: `tests/integration/focusSlots.test.ts`

- [ ] **Step 1: Add integration test simulating consolidated-slot exit + new refill**

Append to `tests/integration/focusSlots.test.ts`:

```typescript
describe("chooseRefillRole integration", () => {
  it("when active KC are strong enough, exiting review slot becomes new", () => {
    const now = Date.now();
    const existing = [
      { kcId: "grammar/present_simple", role: "review" as const, correctStreak: 0, totalAnswers: 4, enteredAt: now },
      { kcId: "grammar/be", role: "review" as const, correctStreak: 0, totalAnswers: 4, enteredAt: now },
      { kcId: "grammar/past", role: "review" as const, correctStreak: 3, totalAnswers: 6, enteredAt: now },
    ];
    const mastery = new Map([
      ["grammar/present_simple", { kcId: "grammar/present_simple", known: 0.95, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
      ["grammar/be", { kcId: "grammar/be", known: 0.90, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
      ["grammar/past", { kcId: "grammar/past", known: 0.99, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: true, seenCount: 6 }],
    ]);

    // Simulate init removing the consolidated slot
    const afterInit = initSlots({ existingSlots: existing, masteryMap: mastery, now });
    expect(afterInit.length).toBe(2);
    expect(afterInit.find((s) => s.kcId === "grammar/past")).toBeUndefined();

    // The remaining active slots are both above threshold (0.85)
    const refillRole = chooseRefillRole({ slots: afterInit, masteryMap: mastery, now, defaultRole: "review" });
    expect(refillRole).toBe("new");
  });

  it("when weakest active KC is below threshold, keep default role", () => {
    const now = Date.now();
    const existing = [
      { kcId: "grammar/present_simple", role: "review" as const, correctStreak: 0, totalAnswers: 4, enteredAt: now },
      { kcId: "grammar/be", role: "review" as const, correctStreak: 0, totalAnswers: 4, enteredAt: now },
    ];
    const mastery = new Map([
      ["grammar/present_simple", { kcId: "grammar/present_simple", known: 0.95, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
      ["grammar/be", { kcId: "grammar/be", known: 0.50, halfLife: 2, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
    ]);

    const refillRole = chooseRefillRole({ slots: existing, masteryMap: mastery, now, defaultRole: "review" });
    expect(refillRole).toBe("review");
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/integration/focusSlots.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/focusSlots.test.ts
git commit -m "test(focus-slots): add chooseRefillRole integration tests"
```

---

### Task 4: Clean up temporary analytics file

**Files:**
- Delete: `convex/analytics.ts`

- [ ] **Step 1: Remove analytics.ts**

```bash
rm convex/analytics.ts
```

- [ ] **Step 2: Deploy without analytics**

Run: `npx convex dev --once`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add convex/analytics.ts
git commit -m "chore: remove temporary analytics file"
```

---

## Spec Coverage

| Requirement | Task |
|---|---|
| Threshold extracted to a centralized constant | Task 1 — `NEW_KC_KNOWN_THRESHOLD` in `focusSlotsPure.ts` |
| Refill role chosen dynamically based on KC mastery | Task 2 — `updateAfterAnswer` calls `chooseRefillRole` before `fillSlot` |
| Unit tests for pure logic | Task 1 — 3 test cases in `focusSlotsPure.test.ts` |
| Integration tests for end-to-end behavior | Task 3 — 2 test cases in `focusSlots.test.ts` |

## Placeholder Scan

- No TBD/TODO/fill-in-details placeholders.
- All code blocks contain complete, copy-pasteable content.
- Type signatures match between `focusSlotsPure.ts` and call site in `focusSlots.ts`.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-dynamic-focus-slot-refill.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
