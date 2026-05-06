import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import type { SlotFillerDeps, UserRow, MasteryRow } from "./focusSlotsTypes";
import { MS_PER_DAY } from "./focusSlotsPure";

function filterExclude<T extends { kcId: string }>(
  rows: T[],
  opts: { excludeKcIds: string[]; questionsSet: Set<string> },
): T[] {
  return rows.filter((r) => !opts.excludeKcIds.includes(r.kcId) && opts.questionsSet.has(r.kcId));
}

export function createSlotFillerDeps(ctx: QueryCtx | MutationCtx): SlotFillerDeps {
  let _questionsSet: Set<string> | undefined;

  async function questionsSet(): Promise<Set<string>> {
    if (!_questionsSet) {
      const links = await ctx.db.query("questionKcs").take(1000);
      _questionsSet = new Set(links.map((l) => l.kcId));
    }
    return _questionsSet;
  }

  return {
    async getUser(telegramUserId: string): Promise<UserRow | null> {
      return await ctx.db
        .query("users")
        .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramUserId))
        .first();
    },

    async updateUser(convexUserId: string, patch) {
      await (ctx.db as MutationCtx["db"]).patch(
        "users",
        convexUserId as Id<"users">,
        patch as Partial<Omit<Doc<"users">, "_id" | "_creationTime">>,
      );
    },

    async getActivePool(userId, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_nextReview", (q) =>
          q.eq("telegramUserId", userId).eq("nextReviewAt", 0),
        )
        // consolidated is not part of the index; filter is required
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) => q.eq(q.field("consolidated"), false))
        .take(50);
      return filterExclude(rows as MasteryRow[], { excludeKcIds, questionsSet: qs });
    },

    async getDueReview(userId, { now, excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_nextReview", (q) =>
          q.eq("telegramUserId", userId).lte("nextReviewAt", now),
        )
        // consolidated is not part of the index; filter is required
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) => q.eq(q.field("consolidated"), false))
        .take(50);
      return filterExclude(rows as MasteryRow[], { excludeKcIds, questionsSet: qs });
    },

    async getEarlyReview(userId, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        // known/consolidated are not part of the index; filter is required
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) =>
          q.and(q.gte(q.field("known"), 0.7), q.eq(q.field("consolidated"), false)),
        )
        .take(50);
      return filterExclude(rows as MasteryRow[], { excludeKcIds, questionsSet: qs });
    },

    async getFreshKcs(userId, { now, excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        // lastSeen/seenCount are not part of the index; filter is required
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) =>
          q.and(
            q.gte(q.field("lastSeen"), now - 7 * MS_PER_DAY),
            q.lt(q.field("seenCount"), 5),
          ),
        )
        .take(50);
      return filterExclude(rows as MasteryRow[], { excludeKcIds, questionsSet: qs });
    },

    // Returns consolidated KCs; consumer (focusSlotsImpl) sorts by halfLife
    async getFragileConsolidated(userId, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        // consolidated is not part of the index; filter is required
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) => q.eq(q.field("consolidated"), true))
        .take(50);
      return filterExclude(rows as MasteryRow[], { excludeKcIds, questionsSet: qs });
    },

    // Returns consolidated KCs; consumer (focusSlotsImpl) picks randomly
    async getRandomConsolidated(userId, { excludeKcIds }) {
      const qs = await questionsSet();
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        // consolidated is not part of the index; filter is required
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) => q.eq(q.field("consolidated"), true))
        .take(100);
      return filterExclude(rows as MasteryRow[], { excludeKcIds, questionsSet: qs });
    },

    async getMastery(userId, kcId) {
      return await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) =>
          q.eq("telegramUserId", userId).eq("kcId", kcId),
        )
        .unique();
    },

    async getKcCatalogWindow(pointer, limit) {
      return await ctx.db
        .query("kcCatalog")
        .withIndex("by_sortOrder", (q) => q.gt("sortOrder", pointer))
        .take(limit);
    },

    async getAllKcCatalog(limit) {
      return await ctx.db.query("kcCatalog").take(limit);
    },

    async getKcById(kcId) {
      return await ctx.db
        .query("kcCatalog")
        .withIndex("by_kcId", (q) => q.eq("kcId", kcId))
        .unique();
    },

    async getSeenKcIds(userId) {
      const rows = await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) => q.eq("telegramUserId", userId))
        .collect();
      return rows.map((r) => r.kcId);
    },

    async getKcIdsWithQuestions() {
      return questionsSet();
    },
  };
}
