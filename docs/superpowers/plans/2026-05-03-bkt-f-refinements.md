# BKT-F Refinements: HL_MAX + Smooth Deconsolidation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Внести два ограниченных улучшения в ядро BKT-F: верхний bound half-life и плавную де-консолидацию.

**Architecture:** Чистые функции в `bktPure.ts`. Независимые изменения, не требуют schema changes или других подсистем.

**Tech Stack:** TypeScript, Vitest

---

## File Structure

### Modified files
- `convex/bkt/bktPure.ts` — добавить HL_MAX, заменить фиксированную де-консолидацию на пропорциональную
- `tests/unit/bktPure.test.ts` — обновить/добавить тесты

---

## Task 1: HL_MAX bound для half-life

**Files:**
- Modify: `convex/bkt/bktPure.ts`
- Test: `tests/unit/bktPure.test.ts`

- [ ] **Step 1: Write failing test**

В `tests/unit/bktPure.test.ts`, в describe("half-life"):
```typescript
it("half-life не превышает HL_MAX (365 дней)", () => {
  const result = bktUpdate({
    ...BASE_INPUT,
    halfLife: 200,
    isCorrect: true,
  });
  expect(result.halfLife).toBe(365);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/bktPure.test.ts -t "HL_MAX"
```
Expected: FAIL — `Expected: 365, Received: 400`

- [ ] **Step 3: Add HL_MAX constant и применить bound**

В `convex/bkt/bktPure.ts`, после `HL_MIN`:
```typescript
/** Максимальный half-life (дни). Потолок для роста при успехе. */
const HL_MAX = 365;
```

Изменить `updateHalfLife`:
```typescript
function updateHalfLife({
  halfLife,
  isCorrect,
}: {
  halfLife: number;
  isCorrect: boolean;
}): number {
  if (isCorrect) return Math.min(HL_MAX, halfLife * HL_MULTIPLIER_CORRECT);
  return Math.max(HL_MIN, halfLife * HL_MULTIPLIER_WRONG);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/bktPure.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/bkt/bktPure.ts tests/unit/bktPure.test.ts
git commit -m "feat(bkt): cap half-life at 365 days"
```

---

## Task 2: Плавная де-консолидация

**Files:**
- Modify: `convex/bkt/bktPure.ts`
- Test: `tests/unit/bktPure.test.ts`

- [ ] **Step 1: Write failing test**

В `tests/unit/bktPure.test.ts`, заменить тест consolidated + wrong:
```typescript
it("неправильный ответ → плавная де-консолидация", () => {
  const result = bktUpdate({ ...consolidated, isCorrect: false });

  // known = max(0.50, 0.96 * 0.70) = 0.672
  expect(result.known).toBeCloseTo(0.672, 2);
  // hl = max(4.0, 128 * 0.25) = 32
  expect(result.halfLife).toBe(32);
  expect(result.consolidated).toBe(false);
  expect(result.nextReviewAt).toBe(0);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/bktPure.test.ts -t "плавная де-консолидация"
```
Expected: FAIL — expected 0.672, got 0.60

- [ ] **Step 3: Удалить фиксированные константы и заменить на формулу**

В `convex/bkt/bktPure.ts`:
1. Удалить:
```typescript
// УДАЛИТЬ эти строки:
const DECONSOLIDATION_KNOWN = 0.60;
const DECONSOLIDATION_HL = 4.0;
```

2. Изменить ветку де-консолидации в `bktUpdate`:
```typescript
// Ветка 2: consolidated + ошибка → плавная де-консолидация
if (consolidated && !isCorrect) {
  const newKnown = Math.max(0.50, known * 0.70);
  const newHl = Math.max(4.0, halfLife * 0.25);
  return { known: newKnown, halfLife: newHl, nextReviewAt: 0, consolidated: false };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/bktPure.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/bkt/bktPure.ts tests/unit/bktPure.test.ts
git commit -m "feat(bkt): smooth deconsolidation proportional to half-life"
```

---

## Self-Review

- [ ] **Spec coverage:** HL_MAX (Task 1) ✓, smooth deconsolidation (Task 2) ✓
- [ ] **Placeholder scan:** None
- [ ] **Type consistency:** `updateHalfLife` signature unchanged, `bktUpdate` returns same type
