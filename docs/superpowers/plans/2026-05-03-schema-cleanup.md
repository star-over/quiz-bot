# Schema Changes + Cleanup: skillProfiles Removal & Data Model Prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить схему данных для Focus Slots, удалить мёртвый legacy-код, добавить seenCount и kcIds.

**Architecture:** Schema-first изменения. `focusSlots` и `lastAnsweredAt` в `users`, `seenCount` в `userMastery`, `kcIds` в `answerLog`. Удаление создания `skillProfiles`.

**Tech Stack:** TypeScript, Convex, Vitest

---

## File Structure

### Modified files
- `convex/schema.ts` — новые поля в users, userMastery, answerLog
- `convex/users.ts` — удалить insert skillProfiles
- `convex/userMastery.ts` — инкремент seenCount, возврат kcIds
- `convex/seed.ts` — backfill mutation для seenCount

---

## Task 1: Remove skillProfiles creation

**Files:**
- Modify: `convex/users.ts:60-84`

- [ ] **Step 1: Remove skillProfiles insert block**

В `convex/users.ts`, внутри `ensureUser`, удалить:
```typescript
// УДАЛИТЬ блок целиком (строки ~72-84):
// Начальный профиль навыков
await ctx.db.insert("skillProfiles", {
  userId,
  skillVector: {
    grammar: 0,
    writing: 0,
    listening: 0,
    reading: 0,
    speaking: 0,
  },
});
```

- [ ] **Step 2: Verify no compile errors**

```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/users.ts
git commit -m "chore: stop creating skillProfiles for new users"
```

---

## Task 2: Update Convex schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add focusSlots и lastAnsweredAt в users**

После `curriculumPointer`:
```typescript
focusSlots: v.optional(v.array(v.object({
  kcId:          v.string(),
  role:          v.union(v.literal("drill"), v.literal("new"), v.literal("review")),
  correctStreak: v.number(),
  totalAnswers:  v.number(),
  enteredAt:     v.number(),
}))),
lastAnsweredAt: v.optional(v.number()),
```

- [ ] **Step 2: Add seenCount в userMastery**

После `consolidated`:
```typescript
seenCount: v.number(),
```

- [ ] **Step 3: Add kcIds в answerLog**

После `messageId`:
```typescript
kcIds: v.optional(v.array(v.string())),
```

- [ ] **Step 4: Regenerate Convex types**

```bash
npx convex codegen
```

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/_generated/
git commit -m "feat(schema): focusSlots, lastAnsweredAt, seenCount, kcIds"
```

---

## Task 3: Update userMastery to track seenCount

**Files:**
- Modify: `convex/userMastery.ts`

- [ ] **Step 1: Increment seenCount on existing records**

В `updateMastery`, блок `if (existing)`:
```typescript
await ctx.db.patch("userMastery", existing._id, {
  known: output.known,
  halfLife: output.halfLife,
  lastSeen: respondedAt,
  nextReviewAt,
  consolidated: output.consolidated,
  seenCount: existing.seenCount + 1,
});
```

- [ ] **Step 2: Set seenCount=1 on new records**

В блоке `else` (новый KC):
```typescript
await ctx.db.insert("userMastery", {
  telegramUserId,
  kcId: qkc.kcId,
  known: output.known,
  halfLife: output.halfLife,
  lastSeen: respondedAt,
  nextReviewAt,
  consolidated: output.consolidated,
  seenCount: 1,
});
```

- [ ] **Step 3: Commit**

```bash
git add convex/userMastery.ts
git commit -m "feat(mastery): track seenCount per KC"
```

---

## Task 4: Backfill seenCount for existing userMastery records

**Files:**
- Modify: `convex/seed.ts`

- [ ] **Step 1: Add backfill mutation**

В `convex/seed.ts` (или новый файл `convex/migrations.ts` если предпочтительнее):
```typescript
export const backfillSeenCount = internalMutation({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("userMastery").collect();
    for (const entry of entries) {
      if (entry.seenCount === undefined) {
        await ctx.db.patch("userMastery", entry._id, { seenCount: 1 });
      }
    }
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/seed.ts
git commit -m "feat(migration): backfill seenCount for existing userMastery"
```

---

## Self-Review

- [ ] **Spec coverage:** skillProfiles removal (Task 1) ✓, schema changes (Task 2) ✓, seenCount (Task 3) ✓, backfill (Task 4) ✓
- [ ] **Placeholder scan:** None
- [ ] **Type consistency:** `seenCount: v.number()` matches `seenCount: 1` insert and `seenCount + 1` patch
