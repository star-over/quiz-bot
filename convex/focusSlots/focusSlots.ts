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
  ctx, telegramUserId, role, occupiedKcIds, now,
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
