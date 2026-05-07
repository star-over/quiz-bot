import { type Context } from "grammy";
import { type ActionCtx } from "../_generated/server";

// Intentionally shallow — shared type imported by 10+ bot handlers.
// Extracted to avoid circular dependency (bot/index.ts imports handlers).

/**
 * Defines the custom context object that will be available in all grammY handlers.
 * It extends the base `Context` from grammY and adds the `convex`
 * property, which is the full Convex `ActionCtx`.
 */
export type BotContext = Context & {
  convex: ActionCtx;
};
