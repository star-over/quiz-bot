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
    // undefined — очистить сессию, строка — сохранить снапшот
    state: v.optional(v.string()),
  },
  handler: async (ctx, { telegramId, state }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();

    if (user) {
      await ctx.db.patch("users", user._id, { activeSession: state });
    } else {
      await ctx.db.insert("users", {
        telegramId: telegramId,
        ...(state !== undefined ? { activeSession: state } : {}),
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
 * DEBUG ONLY: Удаляет все документы из указанных таблиц (по умолчанию — все).
 * Используется при миграциях схемы в разработке.
 */
export const debugClearAll = mutation({
  args: {
    tables: v.optional(
      v.array(v.union(
        v.literal("users"),
        v.literal("questions"),
        v.literal("answerLog"),
      ))
    ),
  },
  handler: async (ctx, { tables }) => {
    const targets = tables ?? ["users", "questions", "answerLog"];
    const results: string[] = [];

    for (const table of targets) {
      const docs = await ctx.db.query(table).collect();
      // eslint-disable-next-line @convex-dev/explicit-table-ids
      await Promise.all(docs.map(doc => ctx.db.delete(doc._id)));
      results.push(`${table}: удалено ${docs.length}`);
    }

    return results.join("\n");
  },
});
