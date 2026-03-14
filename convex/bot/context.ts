import { type Context } from "grammy";
import { type ActionCtx } from "../_generated/server";

/**
 * Defines the custom context object that will be available in all grammY handlers.
 * It extends the base `Context` from grammY and adds the `convex`
 * property, which is the full Convex `ActionCtx`.
 */
export type BotContext = Context & {
  convex: ActionCtx;
};
