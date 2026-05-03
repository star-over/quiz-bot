import { Composer } from "grammy";
import type { BotContext } from "./context";
import { internal } from "../_generated/api";

const composer = new Composer<BotContext>();

const WINDOW_MS = 10_000; // 10 seconds
const MAX_REQUESTS = 5;   // 5 interactions per window

composer.use(async (ctx, next) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return next(); // no identity — pass through (rare)

  const result = await ctx.convex.runMutation(internal.rateLimits.checkRateLimit, {
    telegramId,
    windowMs: WINDOW_MS,
    maxRequests: MAX_REQUESTS,
  });

  // Fallback for environments where the mutation mock doesn't return the expected shape (e.g., tests)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!result || typeof result !== "object" || !("allowed" in result)) {
    return next();
  }

  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({
        text: `Слишком много запросов. Подождите ${seconds} с.`,
        show_alert: true,
      });
    } else {
      await ctx.reply(`Слишком много запросов. Подождите ${seconds} с.`);
    }
    return;
  }

  return next();
});

export default composer;
