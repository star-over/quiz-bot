import { internalMutation } from "./_generated/server.js";

/**
 * DEBUG ONLY: A mutation to dangerously delete all documents from the 'questions' table.
 * Used to reset the database during development when breaking schema changes are introduced.
 */
export const debugClearQuestions = internalMutation({
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
