# Design: User Mastery Bridge Deepening (Candidate 3)

> Date: 2026-05-06
> Status: Design Approved
> Related: `docs/architecture-review-2026-05-06.md` Candidate 3

---

## 1. Goal

Transform `convex/userMastery.ts` from an untested, mixed-concern DB bridge into a **deep module** with clear seams, full unit-test coverage, and explicit error handling.

---

## 2. Problem Statement

`convex/userMastery.ts` (151 lines) contains an `updateMastery` mutation — an untested bridge between BKT-F math (`bktPure.ts`) and Convex DB writes.

**Current issues:**
- **Zero unit tests** on the bridge logic, despite `bktPure.ts` having 347 lines of tests.
- **Infinity workaround** inlined twice (existing + new KC branches): `Number.isFinite(output.nextReviewAt) ? output.nextReviewAt : 32503680000000`.
- **Conditional `before` field**: `MasteryUpdateEntry.before?` is only present for existing KC. The contract is implicit — consumers must know that `undefined` means "new KC".
- **Silent no-op on missing question**: `ctx.db.get("questions", questionId)` returns `null` → silently returns `[]`. Callers cannot distinguish "question deleted" from "question has no KCs".
- **Duplicated existing/new branches**: ~30 lines each, 80% copy-paste. Differs only in `before` presence and `patch` vs `insert`.

---

## 3. Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Module pattern** | Full deep module (impl + adapter + types + thin wrappers) | Follows established project pattern (`focusSlots/`, `answerFlow`). Maximizes testability and locality. |
| **`before` for new KC** | Always present, set to initial state (`known=0.10, halfLife=1.0`) | Explicit contract. Debug footer shows full before→after picture for all KCs. |
| **Question not found** | `throw Error` | Invariant violation. `questionId` comes from a machine snapshot saved at delivery time. If the question vanished, something is fundamentally broken (e.g. re-seed during active session). Fail fast. |
| **Question without KCs** | `return []` | Valid edge case. The question exists but has no KC assignments. BKT-F does not apply, but answer logging and feedback still work. |
| **Infinity serialization** | Helper `safeNextReviewAt()` inside `userMasteryImpl.ts` | Keeps adapter "dumb" (pure DB proxy). The domain concern ("Infinity is not serializable") lives in the domain module, but concentrated in 1 function instead of 2 inline copies. |
| **`seenCount`** | Keep and increment | Used by `focusSlotsAdapter.ts:getFreshKcs` (filter `seenCount < 5`). Not dead data. |

---

## 4. Module Boundaries

```
convex/userMastery/
  userMasteryTypes.ts    — MasteryDeps seam, row types, MasteryUpdateEntry
  userMasteryImpl.ts     — Deep module: updateMastery(), getMasteryForKcs()
  userMasteryAdapter.ts  — createMasteryDeps(ctx): MasteryDeps
  userMastery.ts         — Thin Convex wrappers (internalQuery / internalMutation)

tests/unit/userMastery.test.ts — Unit tests with stub adapter
```

### 4.1 `userMasteryTypes.ts`

Exports:
- `MasteryRow` — full DB row shape
- `MasteryPatch` — partial row for `patchMastery`
- `MasteryInsert` — full row for `insertMastery`
- `MasteryUpdateEntry` — result shape (`before` is **required**)
- `MasteryDeps` — seam interface with 5 methods

### 4.2 `userMasteryImpl.ts`

Exports:
- `updateMastery({ deps, telegramUserId, questionId, isCorrect, respondedAt }): Promise<MasteryUpdateEntry[]>`
- `getMasteryForKcs({ deps, telegramUserId, kcIds }): Promise<Array<{ kcId, known, halfLife, consolidated }>>`

Internal helper:
- `safeNextReviewAt(nextReviewAt: number): number` — `Infinity` → `SENTINEL_MAX_DATE`

### 4.3 `userMasteryAdapter.ts`

Export:
- `createMasteryDeps(ctx: QueryCtx | MutationCtx): MasteryDeps`

Pure DB proxy. No domain logic. No Infinity handling.

### 4.4 `userMastery.ts`

Two thin wrappers preserving backward-compatible API paths:
- `getMasteryForKcs` — `internalQuery`
- `updateMastery` — `internalMutation`

---

## 5. Interface (MasteryDeps)

```ts
export interface MasteryDeps {
  getQuestion(questionId: Id<"questions">): Promise<Doc<"questions"> | null>;
  getQuestionKcs(questionId: Id<"questions">): Promise<Array<{ kcId: string; isPrimary: boolean }>>;
  getMastery(telegramUserId: string, kcId: string): Promise<MasteryRow | null>;
  patchMastery(_id: Id<"userMastery">, patch: MasteryPatch): Promise<void>;
  insertMastery(row: MasteryInsert): Promise<Id<"userMastery">>;
}
```

---

## 6. Data Flow

### 6.1 `updateMastery`

1. `deps.getQuestion(questionId)` → if `null`, throw.
2. Extract `slip`, `choicesCount`, `isExposure`.
3. `deps.getQuestionKcs(questionId)` → if `[]`, return `[]`.
4. For each `qkc` in `questionKcs`:
   - `deps.getMastery(telegramUserId, qkc.kcId)`
   - **Existing:**
     - `before = { known: existing.known, halfLife: existing.halfLife }`
     - `output = bktUpdate({ known, halfLife, lastSeen, now: respondedAt, isCorrect, choicesCount, slip, isPrimary, consolidated, isExposure })`
     - `nextReviewAt = safeNextReviewAt(output.nextReviewAt)`
     - `deps.patchMastery(existing._id, { known, halfLife, lastSeen: respondedAt, nextReviewAt, consolidated, seenCount: existing.seenCount + 1 })`
     - `results.push({ kcId, consolidated, before, after: { known, halfLife } })`
   - **New:**
     - `initial = createInitialMastery({ now: respondedAt })`
     - `before = { known: initial.known, halfLife: initial.halfLife }`
     - `output = bktUpdate({ known: initial.known, halfLife: initial.halfLife, lastSeen: respondedAt, now: respondedAt, ... })`
     - `nextReviewAt = safeNextReviewAt(output.nextReviewAt)`
     - `deps.insertMastery({ telegramUserId, kcId, known, halfLife, lastSeen: respondedAt, nextReviewAt, consolidated, seenCount: 1 })`
     - `results.push({ kcId, consolidated, before, after: { known, halfLife } })`
5. Return `results`.

### 6.2 `getMasteryForKcs`

1. `Promise.all(kcIds.map(kcId => deps.getMastery(telegramUserId, kcId)))`
2. Filter out `null` entries.
3. Map to `{ kcId, known, halfLife, consolidated }`.

---

## 7. Error Handling

| Scenario | Behavior |
|---|---|
| Question not found | `throw new Error("Question ${questionId} not found")` |
| Question has no KCs | `return []` |
| DB write failure | Propagated naturally by Convex runtime |

Error from `updateMastery` propagates through `answerFlowAdapter.ts` → `answerFlow.ts` `processResponse`. No try/catch is added — this is a catastrophic invariant violation that should not be silently swallowed.

---

## 8. Testing Strategy

### 8.1 Stub Adapter

```ts
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
```

### 8.2 Test Cases

| # | Test | Validates |
|---|---|---|
| 1 | New KC | `before = { known: 0.10, halfLife: 1.0 }`, `insertMastery` called with `seenCount: 1` |
| 2 | Existing KC | `before = existing values`, `patchMastery` called, `seenCount` incremented |
| 3 | Infinity → sentinel | Consolidated KC: `patchMastery` receives `nextReviewAt = SENTINEL_MAX_DATE` |
| 4 | Question not found | Throws `Error` |
| 5 | Question without KCs | Returns `[]`, no DB writes |
| 6 | Multiple KCs | Array with N entries, one per KC |
| 7 | Secondary KC | `bktUpdate` called with `isPrimary: false` |
| 8 | Exposure mode | `bktUpdate` called with `isExposure: true` |
| 9 | Consolidated + correct | `patchMastery` with unchanged `known`/`halfLife`, updated `lastSeen` |
| 10 | `getMasteryForKcs` | Filters nulls, correct field mapping |

**Scope boundary:** We do NOT re-test BKT math (exact known/halfLife values) — that is covered by `bktPure.test.ts`. We verify correct delegation (args passed to `bktUpdate`) and bridge behavior (DB ops, shape, errors).

---

## 9. Breaking Changes

1. **`MasteryResult.before`** in `convex/questions/answerFlowTypes.ts` becomes **required** (was optional).
2. **`answerFlow.ts`** removes the `mastery?.before ?` guard in debug footer construction.
3. **`tests/unit/answerFlow.test.ts`** updates mock `MasteryResult` objects to always include `before`.

All other call sites (`answerFlowAdapter.ts`, integration tests) remain unchanged — the API surface of `internal.userMastery.updateMastery` and `internal.userMastery.getMasteryForKcs` is preserved.

---

## 10. Implementation Notes

- **File creation order:** `userMasteryTypes.ts` → `userMasteryImpl.ts` → `userMasteryAdapter.ts` → update `userMastery.ts` → `tests/unit/userMastery.test.ts` → update `answerFlowTypes.ts` + `answerFlow.ts` + `answerFlow.test.ts`.
- **Convex wrapper signatures** must remain identical to preserve backward-compatible internal API paths.
- **Adapter stays "dumb"** — no domain logic, no Infinity handling, no conditional logic. Pure DB proxy.
- **Impl stays "pure"** — no Convex imports, no `ctx.db` references. Only depends on `MasteryDeps` and `bktPure.ts`.
