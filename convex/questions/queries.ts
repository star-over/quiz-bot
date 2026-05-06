import { internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";

export const getRandomQuestionForKc = internalQuery({
  args: {
    kcId: v.string(),
    random: v.number(),
    excludedQuestionIds: v.optional(v.array(v.id("questions"))),
  },
  handler: async (ctx, { kcId, random, excludedQuestionIds }): Promise<Doc<"questions"> | null> => {
    const links = await ctx.db
      .query("questionKcs")
      .withIndex("by_kc", (q) => q.eq("kcId", kcId))
      .collect();

    if (links.length === 0) return null;

    const excludedSet = new Set(excludedQuestionIds ?? []);
    const pool = links.filter((l) => !excludedSet.has(l.questionId));

    // Если все вопросы исключены — fallback на полный пул
    const effectivePool = pool.length > 0 ? pool : links;

    const pick = effectivePool[Math.floor(random * effectivePool.length)];
    if (!pick) return null;
    return await ctx.db.get("questions", pick.questionId);
  },
});
