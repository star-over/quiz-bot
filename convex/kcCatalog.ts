import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Получить записи каталога KC по списку kcId.
 * Возвращает только найденные записи (отсутствующие kcId пропускаются).
 */
export const getCatalogEntries = internalQuery({
  args: { kcIds: v.array(v.string()) },
  handler: async (ctx, { kcIds }) => {
    const results = await Promise.all(
      kcIds.map((kcId) =>
        ctx.db
          .query("kcCatalog")
          .withIndex("by_kcId", (q) => q.eq("kcId", kcId))
          .unique(),
      ),
    );
    return results.flatMap((entry) =>
      entry ? [{ kcId: entry.kcId, cefrLevel: entry.cefrLevel, category: entry.category }] : [],
    );
  },
});
