# Focus Slots Integration: QuestionManager + answerLog + Testing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить Focus Slots к QuestionManager, обогатить answerLog kcIds, написать интеграционные тесты.

**Architecture:** QuestionManager.next() вызывает Focus Slots для выбора KC, затем запрашивает вопрос по KC. handleAnswer/handleSkip обновляют слоты. answerLog получает kcIds.

**Tech Stack:** TypeScript, Convex, Vitest

**Prerequisites:** Планы `2026-05-03-schema-cleanup.md` и `2026-05-03-focus-slots-core.md` должны быть выполнены.

---

## File Structure

### Modified files
- `convex/questions/questionManager.ts` — интеграция Focus Slots в next(), handleAnswer, handleSkip
- `convex/answerLog.ts` — добавить kcIds в logAnswer/logSkip

### New files
- `tests/integration/focusSlots.test.ts` — интеграционный тест

---

## Task 1: Update QuestionManager.next() to use Focus Slots

**Files:**
- Modify: `convex/questions/questionManager.ts`

- [ ] **Step 1: Replace next() implementation**

Заменить метод `next()` (строки ~331-356):

```typescript
async next(): Promise<void> {
  const user = await this.ctx.runQuery(internal.users.getByTelegramId, {
    telegramId: this.telegramId,
  });

  if (!user?.drillSnapshot) return;
  const parsedDrill = safeParseSnapshot(user.drillSnapshot);
  if (!parsedDrill.success) {
    await this.ctx.runMutation(internal.users.updateDrillSnapshot, {
      telegramId: this.telegramId,
    });
    return;
  }
  const drillSnapshot = parsedDrill.snapshot as { value?: string };
  if (drillSnapshot.value !== "questioning") return;

  const now = Date.now();
  const needInit = !user.focusSlots || !user.lastAnsweredAt || (now - user.lastAnsweredAt > 30 * 60 * 1000);

  let slots = user.focusSlots ?? [];
  if (needInit) {
    slots = await this.ctx.runMutation(internal.focusSlots.initSlotsMutation, {
      telegramUserId: this.telegramId,
      now,
    });
  }

  if (slots.length === 0) return;

  const occupiedKcIds = slots.map((s) => s.kcId);
  let slot = await this.ctx.runQuery(internal.focusSlots.pickSlotQuery, {
    telegramUserId: this.telegramId,
    excludedKcIds: occupiedKcIds,
  });

  if (!slot) {
    // All slots at exit threshold — force re-init
    slots = await this.ctx.runMutation(internal.focusSlots.initSlotsMutation, {
      telegramUserId: this.telegramId,
      now,
    });
    if (slots.length === 0) return;
    const newOccupied = slots.map((s) => s.kcId);
    slot = await this.ctx.runQuery(internal.focusSlots.pickSlotQuery, {
      telegramUserId: this.telegramId,
      excludedKcIds: newOccupied,
    });
    if (!slot) return;
  }

  const question = await this.ctx.runQuery(internal.questions.getRandomQuestionForKc, {
    kcId: slot.kcId,
    random: Math.random(),
  });

  if (question) await this.start(question);
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/questions/questionManager.ts
git commit -m "feat(question-manager): integrate Focus Slots into next()"
```

---

## Task 2: Update handleAnswer and handleSkip to update Focus Slots

**Files:**
- Modify: `convex/questions/questionManager.ts`

- [ ] **Step 1: Add focusSlots update in handleAnswer**

После блока `updateMastery` (строки ~211-217):

```typescript
// 5. Обновить уровень знания по KC вопроса (BKT-F)
const masteryResults = await this.ctx.runMutation(internal.userMastery.updateMastery, {
  telegramUserId: this.telegramId,
  questionId: context.questionId as Id<"questions">,
  isCorrect,
  respondedAt,
});

// 5.5 Обновить Focus Slots (streak, exit, fill)
const kcIds = masteryResults.map((r) => r.kcId);
for (const kcId of kcIds) {
  await this.ctx.runMutation(internal.focusSlots.updateAfterAnswer, {
    telegramUserId: this.telegramId,
    kcId,
    isCorrect,
    now: respondedAt,
  });
}
```

- [ ] **Step 2: Add focusSlots update in handleSkip**

После блока `updateMastery` в `handleSkip()` (строки ~287-293):

```typescript
// 4. Обновить уровень знания по KC вопроса (BKT-F, isCorrect=false для пропуска)
const masteryResults = await this.ctx.runMutation(internal.userMastery.updateMastery, {
  telegramUserId: this.telegramId,
  questionId: context.questionId as Id<"questions">,
  isCorrect: false,
  respondedAt,
});

// 4.5 Обновить Focus Slots
const kcIds = masteryResults.map((r) => r.kcId);
for (const kcId of kcIds) {
  await this.ctx.runMutation(internal.focusSlots.updateAfterAnswer, {
    telegramUserId: this.telegramId,
    kcId,
    isCorrect: false,
    now: respondedAt,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add convex/questions/questionManager.ts
git commit -m "feat(question-manager): update focus slots on answer and skip"
```

---

## Task 3: Add kcIds to answerLog

**Files:**
- Modify: `convex/answerLog.ts`

- [ ] **Step 1: Update logAnswer args**

В `logAnswer` mutation, добавить в `args`:
```typescript
kcIds: v.optional(v.array(v.string())),
```

В `ctx.db.insert`, добавить:
```typescript
kcIds: args.kcIds,
```

- [ ] **Step 2: Update logSkip args**

Аналогично для `logSkip`:
```typescript
kcIds: v.optional(v.array(v.string())),
```

```typescript
kcIds: args.kcIds,
```

- [ ] **Step 3: Commit**

```bash
git add convex/answerLog.ts
git commit -m "feat(answer-log): add kcIds field to logAnswer and logSkip"
```

---

## Task 4: Pass kcIds from QuestionManager to answerLog

**Files:**
- Modify: `convex/questions/questionManager.ts`

- [ ] **Step 1: Pass kcIds in handleAnswer**

В `handleAnswer`, в блоке `logAnswer` (после фокус-слот обновления):

```typescript
await this.ctx.runMutation(internal.answerLog.logAnswer, {
  telegramUserId: this.telegramId,
  questionId: context.questionId as Id<"questions">,
  selectedChoiceId: choiceId,
  isCorrect,
  choicesCount: context.choices.length,
  selectedPosition: selectedIndex + 1,
  correctPosition: correctIndex + 1,
  shownAt: context.shownAt,
  respondedAt,
  chatId: this.chatId,
  messageId: context.messageId,
  kcIds,
});
```

- [ ] **Step 2: Pass kcIds in handleSkip**

В `handleSkip`, в блоке `logSkip`:

```typescript
await this.ctx.runMutation(internal.answerLog.logSkip, {
  telegramUserId: this.telegramId,
  questionId: context.questionId as Id<"questions">,
  choicesCount: context.choices.length,
  correctPosition: correctIndex + 1,
  shownAt: context.shownAt,
  respondedAt,
  chatId: this.chatId,
  messageId: context.messageId,
  kcIds,
});
```

- [ ] **Step 3: Commit**

```bash
git add convex/questions/questionManager.ts
git commit -m "feat(question-manager): pass kcIds to answerLog"
```

---

## Task 5: Integration test for Focus Slots lifecycle

**Files:**
- Create: `tests/integration/focusSlots.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect } from "vitest";
import { initSlots, pickSlot, shouldExit } from "../../convex/focusSlots/focusSlotsPure";

const MS_PER_DAY = 86_400_000;

describe("Focus Slots end-to-end", () => {
  it("full lifecycle: init → pick → answer → exit", () => {
    const now = Date.now();

    // Simulate existing slots after a session
    const existing = [
      { kcId: "grammar/present_simple", role: "drill" as const, correctStreak: 2, totalAnswers: 4, enteredAt: now },
      { kcId: "vocab/cat", role: "new" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
    ];

    const mastery = new Map([
      ["grammar/present_simple", { kcId: "grammar/present_simple", known: 0.75, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
      ["vocab/cat", { kcId: "vocab/cat", known: 0.20, halfLife: 1, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 1 }],
    ]);

    // initSlots keeps both (not exited, not consolidated)
    const afterInit = initSlots({ existingSlots: existing, masteryMap: mastery, now });
    expect(afterInit.length).toBe(2);

    // pickSlot selects weakest: vocab/cat (known=0.20)
    const selected = pickSlot({ slots: afterInit, masteryMap: mastery, now });
    expect(selected?.kcId).toBe("vocab/cat");

    // User answers correctly — streak becomes 1
    const updatedSlot = { ...selected!, correctStreak: 1, totalAnswers: 2 };
    expect(shouldExit({ correctStreak: updatedSlot.correctStreak, consolidated: false })).toBe(false);

    // Two more correct answers → exit
    const exitedSlot = { ...updatedSlot, correctStreak: 3, totalAnswers: 4 };
    expect(shouldExit({ correctStreak: exitedSlot.correctStreak, consolidated: false })).toBe(true);
  });

  it("timeout removes completed slots during init", () => {
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
npx vitest run tests/integration/focusSlots.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/focusSlots.test.ts
git commit -m "test(integration): focus slots lifecycle"
```

---

## Task 6: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
npm test
```

- [ ] **Step 2: Fix any failures**

- [ ] **Step 3: Final commit**

```bash
git commit -m "test: full suite passes with Focus Slots integration" --allow-empty
```

---

## Self-Review

- [ ] **Spec coverage:** QuestionManager.next() (Task 1) ✓, handleAnswer/handleSkip updates (Task 2) ✓, kcIds in answerLog (Task 3-4) ✓, integration tests (Task 5) ✓
- [ ] **Placeholder scan:** None
- [ ] **Type consistency:** `kcIds` used consistently as `v.optional(v.array(v.string()))` in schema and `string[]` in code
