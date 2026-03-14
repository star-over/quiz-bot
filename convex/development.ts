import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

/**
 * DEVELOPMENT ONLY: A query to get a user and their active machine state.
 */
export const dev_getUserState = query({
  args: { telegramId: v.string() },
  handler: async (ctx, { telegramId }): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();
  },
});

/**
 * DEVELOPMENT ONLY: A mutation to create or update a user and save their machine state.
 */
export const dev_updateUserMachineState = mutation({
  args: {
    telegramId: v.string(),
    state: v.string(),
  },
  handler: async (ctx, { telegramId, state }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();

    if (user) {
      await ctx.db.patch("users", user._id, { activeMachineState: state });
    } else {
      await ctx.db.insert("users", {
        telegramId: telegramId,
        activeMachineState: state,
        skillVector: {
          grammar: 0,
          vocabulary: 0,
          listening: 0,
          reading: 0,
          speaking: 0,
        },
      });
    }
  },
});


/**
 * DEBUG ONLY: A mutation to dangerously delete all documents from the 'questions' table.
 * Used to reset the database during development when breaking schema changes are introduced.
 */
export const debugClearQuestions = mutation({
  args: {},
  handler: async (ctx, _args) => {
    const allQuestions = await ctx.db.query("questions").collect();
    if (allQuestions.length === 0) {
      return "Table 'questions' is already empty.";
    }

    // We have to delete documents one by one.
    // ctx.db.delete() does not support deleting a whole query result yet.
    // eslint-disable-next-line @convex-dev/explicit-table-ids
    const deletePromises = allQuestions.map(doc => ctx.db.delete(doc._id));
    await Promise.all(deletePromises);
    
    return `Successfully deleted ${allQuestions.length} questions.`;
  },
});
