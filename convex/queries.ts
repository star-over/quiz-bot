import { query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * Gets a random question from the database.
 * Note: This implementation loads all questions into memory to ensure a
 * truly uniform random selection, and is suitable for small to medium-sized collections.
 * It accepts a dummy argument to bypass Convex's query caching.
 */
export const getRandomQuestion = query({
  args: { dummy: v.any() },
  handler: async (ctx, _args): Promise<Doc<"questions"> | null> => {
    const allQuestions = await ctx.db.query("questions").collect();
    
    if (allQuestions.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * allQuestions.length);
    return allQuestions[randomIndex] ?? null;
  },
});
