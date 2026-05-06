import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { createSlotFillerDeps } from "./focusSlotsAdapter";
import { initSlots, pickSlotForUser, updateAfterAnswer as updateAfterAnswerImpl } from "./focusSlotsImpl";

export const initSlotsMutation = internalMutation({
  args: {
    telegramUserId: v.string(),
    now: v.number(),
  },
  handler: async (ctx, { telegramUserId, now }) => {
    const deps = createSlotFillerDeps(ctx);
    return await initSlots({ deps, telegramUserId, now });
  },
});

export const pickSlotQuery = internalQuery({
  args: {
    telegramUserId: v.string(),
    excludedKcIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const deps = createSlotFillerDeps(ctx);
    return await pickSlotForUser({ deps, ...args, now: Date.now() });
  },
});

export const updateAfterAnswer = internalMutation({
  args: {
    telegramUserId: v.string(),
    kcId: v.string(),
    isCorrect: v.boolean(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const deps = createSlotFillerDeps(ctx);
    await updateAfterAnswerImpl({ deps, ...args });
  },
});
