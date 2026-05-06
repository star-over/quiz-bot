# Focus Slots Deepening — Design Spec

> Date: 2026-05-06
> Candidate: 2 (focusSlots.ts DB integration)
> Status: Design approved, ready for implementation plan

---

## Problem

`convex/focusSlots/focusSlots.ts` (~370 lines) mixes Convex DB integration with business policy. `fillSlot` is a ~170-line async function with 6 deeply nested fallback paths. Zero integration tests — `focusSlotsPure.test.ts` covers only pure functions.

**Concrete issues:**
- Untested cascade: active pool → due review → early review → fresh → fragile consolidated → random consolidated → wide window → any KC
- `initSlotsMutation` mixes slot initialization, curriculum pointer update, and role filling
- `updateAfterAnswer` mixes streak logic, exit detection, refill role selection, and curriculum pointer bump
- O(n) queries: `.collect()` on `userMastery`, `.take(1000)` on `questionKcs`

**Deletion test:** Removing `focusSlots.ts` would scatter cascade complexity across N callers. Module justifies existence but is shallow.

---

## Design Goal

Deep **Slot Filler module** with a single seam:

```ts
fillSlot({ deps, telegramUserId, role, occupiedKcIds, now }): Promise<FocusSlot | null>
```

All DB queries are internal to the seam. Tested via stub adapter injecting fake DB responses.

---

## Architecture

### `SlotFillerDeps` Interface

All Convex I/O lives behind this interface. The real adapter implements it with `QueryCtx` / `MutationCtx`. Tests implement it with in-memory stubs.

```ts
interface SlotFillerDeps {
  // User
  getUser(telegramUserId: string): Promise<UserRow | null>;
  updateUser(userId: string, patch: UserPatch): Promise<void>;

  // Mastery queries (each filters by occupiedKcIds and questionsSet internally)
  getActivePool(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getDueReview(userId: string, now: number, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getEarlyReview(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getFreshKcs(userId: string, now: number, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getFragileConsolidated(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getRandomConsolidated(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getMastery(userId: string, kcId: string): Promise<MasteryRow | null>;

  // KC catalog
  getKcCatalogWindow(pointer: number, limit: number): Promise<KcRow[]>;
  getAllKcCatalog(limit: number): Promise<KcRow[]>;
  getKcById(kcId: string): Promise<KcRow | null>;

  // Cross-cutting
  getSeenKcIds(userId: string): Promise<string[]>;
  getKcIdsWithQuestions(): Promise<Set<string>>;
}
```

**Design note:** `excludeKcIds` is passed to every mastery query so the adapter can filter at the DB level where possible. The pure `fillSlot` does not filter results itself.

### Row Types

```ts
interface UserRow {
  _id: string;
  telegramId: string;
  focusSlots?: FocusSlot[];
  curriculumPointer?: number;
  lastAnsweredAt?: number;
}

interface MasteryRow {
  kcId: string;
  known: number;
  halfLife: number;
  lastSeen: number;
  nextReviewAt: number;
  consolidated: boolean;
  seenCount: number;
}

interface KcRow {
  kcId: string;
  sortOrder: number;
}

interface UserPatch {
  focusSlots?: FocusSlot[];
  curriculumPointer?: number;
  lastAnsweredAt?: number;
}
```

---

## Module Structure

| File | Purpose |
|---|---|
| `convex/focusSlots/focusSlotsTypes.ts` | `SlotFillerDeps`, row types, `UserPatch` |
| `convex/focusSlots/focusSlots.ts` | Deep module: `initSlots`, `fillSlot`, `updateAfterAnswer`. No Convex imports except types. |
| `convex/focusSlots/focusSlotsAdapter.ts` | `createSlotFillerDeps(ctx)` — Convex implementation |
| `convex/focusSlots/focusSlotsPure.ts` | Unchanged. Pure functions: `initSlots`, `pickSlot`, `chooseRefillRole`, `computeCurrentKnown` |
| `tests/unit/focusSlots.test.ts` | Integration tests with stub adapter |

### Changed Files

- `convex/focusSlots/focusSlots.ts` — rewrite: extract DB calls into adapter, keep policy
- `convex/focusSlots/focusSlotsPure.ts` — no changes
- `convex/questions/answerFlowAdapter.ts` — replace inline slot calls with `createSlotFillerDeps` + `initSlots` / `pickSlot` / `updateAfterAnswer`

---

## Data Flow

### `fillSlot` Cascade

```
role = "drill":
  deps.getActivePool() → candidates?
    sort by known asc → randomElement → return slot
  deps.getDueReview(now) → candidates?
    sort by priority desc → randomElement → return slot
  fallback: fillSlot({ role: "review" })

role = "new":
  deps.getUser() → curriculumPointer
  deps.getKcCatalogWindow(pointer, 10) → candidates?
    filter: unseen, not occupied, has questions → randomElement → return slot
  deps.getAllKcCatalog(200) → extended candidates?
    same filter → randomElement → return slot
  fallback: fillSlot({ role: "review" })

role = "review":
  deps.getEarlyReview() → candidates?
    sort by known asc → randomElement → return slot
  deps.getFreshKcs(now) → candidates?
    sort by priority desc → randomElement → return slot
  deps.getFragileConsolidated() → candidates?
    sort by halfLife asc → randomElement → return slot
  deps.getRandomConsolidated() → candidates?
    randomElement → return slot
  deps.getUser() → pointer
  deps.getKcCatalogWindow(pointer, 50) + deps.getSeenKcIds() → unseen candidates?
    randomElement → return slot
  deps.getAllKcCatalog(100) → any candidates?
    randomElement → return slot (role forced to "review")
  return null
```

### `initSlots`

1. `deps.getUser()` → load user row
2. `deps.getKcIdsWithQuestions()` → questionsSet
3. `deps.getMastery()` for each existing slot KC → masteryMap
4. `initSlotsPure({ existingSlots, masteryMap, now })` → kept slots
5. For each empty position in `[drill, drill, new, review]`:
   - `fillSlot({ deps, role, occupiedKcIds: filled.map(...), now })`
6. If any "new" slot added:
   - `deps.getKcById()` for each new KC
   - Compute `maxSortOrder` → `patch.curriculumPointer`
7. `deps.updateUser()` → persist

### `updateAfterAnswer`

1. `deps.getUser()` → load user + slots
2. Find slot by `kcId`, increment `totalAnswers`, update `correctStreak`
3. `deps.getMastery(userId, kcId)` → check consolidated
4. `shouldExitSlot` = `streak >= EXIT_STREAK || mastery?.consolidated`
5. If exit:
   - Remove slot from array
   - `deps.getMastery()` for remaining slots → remainingMasteryMap
   - `chooseRefillRole({ slots, masteryMap: remainingMasteryMap, now, defaultRole: slot.role })`
   - `fillSlot({ deps, role: refillRole, occupiedKcIds, now })`
   - If refillRole === "new" && mastery.known >= 0.70:
     - `deps.getKcById(kcId)` → bump `curriculumPointer`
6. `deps.updateUser()` → persist slots + `lastAnsweredAt`

---

## Error Handling

| Condition | Behavior |
|---|---|
| User not found in `initSlots` | Throw — caller must ensure user exists |
| User not found in `updateAfterAnswer` | Silent return (defensive) |
| Empty question set | `fillSlot` returns `null`; caller shows "no questions" |
| Mastery not found in `updateAfterAnswer` | `shouldExitSlot` checks `mastery?.consolidated` → treats as non-consolidated |
| Duplicate KC in slots | `occupiedKcIds` passed to `fillSlot` prevents duplicates |
| Corrupted slot shape | `initSlotsPure` filters via `shouldExit` + consolidated check; defaults handle missing mastery |

---

## Testing Strategy

### Stub Adapter

```ts
function createStubDeps(overrides?: Partial<SlotFillerDeps>): SlotFillerDeps
```

Default: all methods return empty arrays / null / empty Set. Override specific methods to inject fake data.

### `fillSlot` Tests — All 6 Fallback Paths

| # | Role | Setup | Expected |
|---|---|---|---|
| 1 | drill | active pool has entries | returns active pool KC, role="drill" |
| 2 | drill | active empty, due has entries | returns due KC, role="drill" |
| 3 | drill | active empty, due empty | recurses to review path |
| 4 | new | window has unseen KC | returns window KC, role="new" |
| 5 | new | window empty, extended has KC | returns extended KC, role="new" |
| 6 | new | window empty, extended empty | recurses to review path |
| 7 | review | early has entries | returns early KC |
| 8 | review | early empty, fresh has entries | returns fresh KC |
| 9 | review | early empty, fresh empty, fragile has entries | returns fragile KC |
| 10 | review | all consolidated empty | wide window → any KC |
| 11 | review | all empty | returns `null` |

### `initSlots` Tests

- Consolidated slot filtered out, active kept
- Exit streak slot filtered out
- 2 survive + 2 refill → verify roles order `[drill, drill, new, review]`
- New slot bumps `curriculumPointer`

### `updateAfterAnswer` Tests

- Wrong answer → streak 0, slot stays
- Correct × 3 → exit + refill with default role
- Consolidated mastery → exit + refill
- All remaining active above 0.85 → `chooseRefillRole` returns "new"

---

## Performance Notes (Non-Goals for This Refactor)

The following are **documented** but not fixed in this change:

- `getKcIdsWithQuestions` uses `.take(1000)` — arbitrary limit. Fix: query all or cache.
- `new` role path calls `.collect()` on `userMastery` — loads all user mastery rows. Fix: add `by_user_seen` index or denormalize seen flag.
- `getRandomQuestionForKc` does DB-level randomization via `random` field — already O(1).

These require schema/index changes and belong to Candidate 4 or a separate performance pass.

---

## Migration

1. Create `focusSlotsTypes.ts` with interfaces.
2. Create `focusSlotsAdapter.ts` with `createSlotFillerDeps`.
3. Rewrite `focusSlots.ts` — move `fillSlot`, `initSlotsMutation` logic, `updateAfterAnswer` into exported async functions.
4. Update `answerFlowAdapter.ts` — import new functions + adapter.
5. Write `tests/unit/focusSlots.test.ts`.
6. Run existing tests + new tests.
7. Delete old inline code from `focusSlots.ts` once adapter wiring confirmed.

---

## Spec Self-Review

- **Placeholders:** None. All interfaces fully typed.
- **Consistency:** `SlotFillerDeps` mirrors `AnswerFlowDeps` pattern. Pure layer (`focusSlotsPure.ts`) untouched.
- **Scope:** Single module deepening. No schema changes. No performance fixes.
- **Ambiguity:** `excludeKcIds` passed to adapter — adapter filters, not pure code. Explicit.
