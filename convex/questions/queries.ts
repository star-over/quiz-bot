import { internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";

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
    if (!pick) return null;
    return await ctx.db.get("questions", pick.questionId);
  },
});
