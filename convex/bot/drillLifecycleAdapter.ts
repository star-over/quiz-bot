import type { Api } from "grammy";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { DrillLifecycleDeps } from "./drillLifecycle";

export function createDrillLifecycleAdapter({
  ctx,
  bot,
}: {
  ctx: ActionCtx;
  bot: Api;
}): DrillLifecycleDeps {
  return {
    async ensureUser(args) {
      await ctx.runMutation(internal.users.ensureUser, args);
    },

    async getUser({ telegramId }) {
      return await ctx.runQuery(internal.users.getByTelegramId, { telegramId });
    },

    async updateDrillSnapshot({ telegramId, drillSnapshot }) {
      await ctx.runMutation(internal.users.updateDrillSnapshot, {
        telegramId,
        ...(drillSnapshot !== undefined ? { drillSnapshot } : {}),
      });
    },

    async updateQuestionSnapshot({ telegramId, questionSnapshot }) {
      await ctx.runMutation(internal.users.updateQuestionSnapshot, {
        telegramId,
        ...(questionSnapshot !== undefined ? { questionSnapshot } : {}),
      });
    },

    async deleteMessage({ chatId: msgChatId, messageId }) {
      await bot.deleteMessage(msgChatId, messageId).catch(() => {
        // Сообщение уже удалено — игнорируем
      });
    },
  };
}
