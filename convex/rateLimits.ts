import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { computeRateLimitDecision } from "./bot/rateLimitPure";

export const checkRateLimit = internalMutation({
  args: {
    telegramId: v.string(),
    windowMs: v.number(),
    maxRequests: v.number(),
  },
  handler: async (ctx, { telegramId, windowMs, maxRequests }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", telegramId))
      .first();

    const decision = computeRateLimitDecision({
      now,
      existing: existing ? { windowStart: existing.windowStart, count: existing.count } : null,
      windowMs,
      maxRequests,
    });

    if (existing) {
      await ctx.db.patch("rateLimits", existing._id, {
        windowStart: decision.windowStart,
        count: decision.count,
      });
    } else {
      await ctx.db.insert("rateLimits", {
        telegramId,
        windowStart: decision.windowStart,
        count: decision.count,
      });
    }

    return { allowed: decision.allowed, retryAfterMs: decision.retryAfterMs ?? 0 };
  },
});
