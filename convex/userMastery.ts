import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { createMasteryDeps } from "./userMastery/userMasteryAdapter";
import {
  updateMastery as updateMasteryImpl,
  getMasteryForKcs as getMasteryForKcsImpl,
} from "./userMastery/userMasteryImpl";

export const getMasteryForKcs = internalQuery({
  args: {
    telegramUserId: v.string(),
    kcIds: v.array(v.string()),
  },
  handler: async (ctx, { telegramUserId, kcIds }) => {
    const deps = createMasteryDeps(ctx);
    return await getMasteryForKcsImpl({ deps, telegramUserId, kcIds });
  },
});

export const updateMastery = internalMutation({
  args: {
    telegramUserId: v.string(),
    questionId: v.id("questions"),
    isCorrect: v.boolean(),
    respondedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const deps = createMasteryDeps(ctx);
    return await updateMasteryImpl({ deps, ...args });
  },
});
