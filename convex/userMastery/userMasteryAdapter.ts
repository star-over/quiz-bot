import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import type {
  MasteryDeps,
  MasteryPatch,
  MasteryInsert,
} from "./userMasteryTypes";

export function createMasteryDeps(
  ctx: QueryCtx | MutationCtx,
): MasteryDeps {
  return {
    async getQuestion(questionId) {
      return await ctx.db.get("questions", questionId);
    },

    async getQuestionKcs(questionId) {
      const rows = await ctx.db
        .query("questionKcs")
        .withIndex("by_question", (q) => q.eq("questionId", questionId))
        .collect();
      return rows.map((r) => ({ kcId: r.kcId, isPrimary: r.isPrimary }));
    },

    async getMastery(telegramUserId, kcId) {
      return await ctx.db
        .query("userMastery")
        .withIndex("by_user_kc", (q) =>
          q.eq("telegramUserId", telegramUserId).eq("kcId", kcId),
        )
        .unique();
    },

    async patchMastery(_id, patch) {
      await (ctx.db as MutationCtx["db"]).patch(
        "userMastery",
        _id,
        patch as Partial<Omit<Doc<"userMastery">, "_id" | "_creationTime">>,
      );
    },

    async insertMastery(row) {
      return await (ctx.db as MutationCtx["db"]).insert("userMastery", row);
    },
  };
}
