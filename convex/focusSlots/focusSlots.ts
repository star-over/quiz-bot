import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { computePriority } from "../bkt/bktPure";
import { initSlots, pickSlot, type FocusSlot, EXIT_STREAK } from "./focusSlotsPure";

const MS_PER_DAY = 86_400_000;

function isNonEmpty<T>(arr: readonly T[]): arr is readonly [T, ...T[]] {
  return arr.length > 0;
}

async function getMasteryMap({ ctx, telegramUserId, kcIds }: { ctx: QueryCtx; telegramUserId: string; kcIds: string[] }) {
  const results = await Promise.all(
    kcIds.map((kcId) =>
      ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) =>
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
  ctx: QueryCtx;
  telegramUserId: string;
  role: "drill" | "new" | "review";
  occupiedKcIds: string[];
  now: number;
}): Promise<FocusSlot | null> {
  if (role === "drill") {
    const active = await ctx.db
      .query("userMastery")
      .withIndex("by_user_nextReview", (q) =>
        q.eq("telegramUserId", telegramUserId).eq("nextReviewAt", 0)
      )
      .filter((q) => q.eq(q.field("consolidated"), false))
      .take(50);

    const candidates = active.filter((m) => !occupiedKcIds.includes(m.kcId));
    if (isNonEmpty(candidates)) {
      candidates.sort((a, b) => a.known - b.known);
      const pick = candidates[0];
      return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
    }

    const due = await ctx.db
      .query("userMastery")
      .withIndex("by_user_nextReview", (q) =>
        q.eq("telegramUserId", telegramUserId).lte("nextReviewAt", now)
      )
      .filter((q) => q.eq(q.field("consolidated"), false))
      .take(50);

    const dueCandidates = due.filter((m) => !occupiedKcIds.includes(m.kcId));
    if (isNonEmpty(dueCandidates)) {
      dueCandidates.sort((a, b) => {
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
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramUserId))
      .first();
    const pointer = user?.curriculumPointer ?? 0;

    const window = await ctx.db
      .query("kcCatalog")
      .withIndex("by_sortOrder", (q) => q.gt("sortOrder", pointer))
      .take(10);

    const seen = await ctx.db
      .query("userMastery")
      .withIndex("by_user_kc", (q) => q.eq("telegramUserId", telegramUserId))
      .collect();
    const seenIds = new Set(seen.map((s) => s.kcId));

    const candidates = window.filter(
      (k) => !seenIds.has(k.kcId) && !occupiedKcIds.includes(k.kcId)
    );
    if (isNonEmpty(candidates)) {
      const pick = candidates[0];
      return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
    }

    return fillSlot({ ctx, telegramUserId, role: "review", occupiedKcIds, now });
  }

  const early = await ctx.db
    .query("userMastery")
    .withIndex("by_user_kc", (q) => q.eq("telegramUserId", telegramUserId))
    .filter((q) => q.and(q.gte(q.field("known"), 0.70), q.eq(q.field("consolidated"), false)))
    .take(50);

  const earlyCandidates = early.filter((m) => !occupiedKcIds.includes(m.kcId));
  if (isNonEmpty(earlyCandidates)) {
    earlyCandidates.sort((a, b) => a.known - b.known);
    const pick = earlyCandidates[0];
    return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
  }

  const fresh = await ctx.db
    .query("userMastery")
    .withIndex("by_user_kc", (q) => q.eq("telegramUserId", telegramUserId))
    .filter((q) =>
      q.and(q.gte(q.field("lastSeen"), now - 7 * MS_PER_DAY), q.lt(q.field("seenCount"), 5))
    )
    .take(50);

  const freshCandidates = fresh.filter((m) => !occupiedKcIds.includes(m.kcId));
  if (isNonEmpty(freshCandidates)) {
    freshCandidates.sort((a, b) => {
      const pa = computePriority({ known: a.known, halfLife: a.halfLife, lastSeen: a.lastSeen, now });
      const pb = computePriority({ known: b.known, halfLife: b.halfLife, lastSeen: b.lastSeen, now });
      return pb - pa;
    });
    const pick = freshCandidates[0];
    return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
  }

  const fragile = await ctx.db
    .query("userMastery")
    .withIndex("by_user_kc", (q) => q.eq("telegramUserId", telegramUserId))
    .filter((q) => q.eq(q.field("consolidated"), true))
    .take(50);

  const fragileCandidates = fragile.filter((m) => !occupiedKcIds.includes(m.kcId));
  if (isNonEmpty(fragileCandidates)) {
    fragileCandidates.sort((a, b) => a.halfLife - b.halfLife);
    const pick = fragileCandidates[0];
    return { kcId: pick.kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
  }

  const allConsolidated = await ctx.db
    .query("userMastery")
    .withIndex("by_user_kc", (q) => q.eq("telegramUserId", telegramUserId))
    .filter((q) => q.eq(q.field("consolidated"), true))
    .take(100);

  const fallback = allConsolidated.filter((m) => !occupiedKcIds.includes(m.kcId));
  if (isNonEmpty(fallback)) {
    const pick = fallback[0];
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
    const masteryMap = await getMasteryMap({ ctx, telegramUserId, kcIds });

    const kept = initSlots({ existingSlots: existing, masteryMap, now });

    const roles: readonly ("drill" | "new" | "review")[] = ["drill", "drill", "new", "review"];
    const filled: FocusSlot[] = [...kept];

    for (let i = 0; i < roles.length; i++) {
      if (filled[i]) continue;
      const role = roles[i];
      if (role === undefined) continue;
      const newSlot = await fillSlot({
        ctx,
        telegramUserId,
        role,
        occupiedKcIds: filled.map((s) => s.kcId),
        now,
      });
      if (newSlot) filled[i] = newSlot;
    }

    await ctx.db.patch("users", user._id, { focusSlots: filled });
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
    const masteryMap = await getMasteryMap({ ctx, telegramUserId, kcIds });

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
    if (!user) return;

    const slots = user.focusSlots ?? [];
    const idx = slots.findIndex((s: FocusSlot) => s.kcId === kcId);
    if (idx === -1) return;

    const slot = slots[idx];
    if (!slot) return;

    slot.totalAnswers += 1;
    if (isCorrect) {
      slot.correctStreak += 1;
    } else {
      slot.correctStreak = 0;
    }

    const mastery = await ctx.db
      .query("userMastery")
      .withIndex("by_user_kc", (q) =>
        q.eq("telegramUserId", telegramUserId).eq("kcId", kcId)
      )
      .unique();

    const shouldExitSlot = slot.correctStreak >= EXIT_STREAK || (mastery?.consolidated ?? false);
    if (shouldExitSlot) {
      slots.splice(idx, 1);
    }

    await ctx.db.patch("users", user._id, { focusSlots: slots, lastAnsweredAt: now });
  },
});
