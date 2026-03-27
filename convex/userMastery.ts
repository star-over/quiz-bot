import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Получить текущий уровень знания пользователя по списку KC.
 * Возвращает только те KC, для которых уже есть запись (остальные = new).
 */
export const getMasteryForKcs = internalQuery({
  args: {
    telegramUserId: v.string(),
    kcIds: v.array(v.string()),
  },
  handler: async (ctx, { telegramUserId, kcIds }) => {
    const results = await Promise.all(
      kcIds.map((kcId) =>
        ctx.db
          .query("userMastery")
          .withIndex("by_user_kc", (q) =>
            q.eq("telegramUserId", telegramUserId).eq("kcId", kcId),
          )
          .unique(),
      ),
    );
    return results.flatMap((entry) =>
      entry
        ? [{ kcId: entry.kcId, known: entry.known, halfLife: entry.halfLife }]
        : [],
    );
  },
});
