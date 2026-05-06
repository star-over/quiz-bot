import type { Api } from "grammy";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

import {
  safeParseSnapshot,
  truncateTelegramText,
  truncateTelegramCaption,
} from "./questionPure";
import type {
  AnswerFlowDeps,
  CatalogEntry,
  DisplayedMessage,
  MasteryEntry,
  MasteryResult,
  QuestionSession,
} from "./answerFlowTypes";

export function createAnswerFlowAdapter({
  ctx,
  bot,
  chatId,
}: {
  ctx: ActionCtx;
  bot: Api;
  chatId: number;
}): AnswerFlowDeps {
  return {
    async loadQuestionSession({ telegramUserId }): Promise<QuestionSession | null> {
      const user = await ctx.runQuery(internal.users.getByTelegramId, {
        telegramId: telegramUserId,
      });
      if (!user?.questionSnapshot) return null;
      return { snapshot: JSON.parse(user.questionSnapshot) };
    },

    async saveQuestionSession({ telegramUserId, session }): Promise<void> {
      await ctx.runMutation(internal.users.updateQuestionSnapshot, {
        telegramId: telegramUserId,
        ...(session ? { questionSnapshot: JSON.stringify(session.snapshot) } : {}),
      });
    },

    async loadQuestion({ questionId }): Promise<Doc<"questions"> | null> {
      return await ctx.runQuery(internal.queries.getQuestionById, { questionId });
    },

    async updateMastery(args): Promise<MasteryResult[]> {
      return await ctx.runMutation(internal.userMastery.updateMastery, args);
    },

    async updateFocusSlots(args): Promise<void> {
      await ctx.runMutation(internal.focusSlots.focusSlots.updateAfterAnswer, args);
    },

    async logResponse(args): Promise<void> {
      await ctx.runMutation(internal.answerLog.logResponse, args);
    },

    async displayQuestion({
      chatId: cid,
      text,
      keyboard,
      photo,
    }): Promise<DisplayedMessage> {
      const sendOpts = {
        reply_markup: keyboard,
        parse_mode: "HTML" as const,
      };

      if (photo?.telegramFileId && text.length <= 1024) {
        try {
          const result = await bot.sendPhoto(cid, photo.telegramFileId, {
            caption: truncateTelegramCaption(text),
            ...sendOpts,
          });
          return { messageId: result.message_id, isPhoto: true };
        } catch {
          // Cache stale — fall through
        }
      }

      if (photo?.imageStorageId && text.length <= 1024) {
        const imageUrl = await ctx.storage.getUrl(photo.imageStorageId);
        if (imageUrl) {
          try {
            const result = await bot.sendPhoto(cid, imageUrl, {
              caption: truncateTelegramCaption(text),
              ...sendOpts,
            });
            const fileId = result.photo.at(-1)?.file_id;
            if (fileId) {
              await ctx.runMutation(internal.development.cacheTelegramFileId, {
                questionId: photo.questionId,
                telegramFileId: fileId,
              });
            }
            return { messageId: result.message_id, isPhoto: true };
          } catch {
            // URL unavailable — fall through
          }
        }
      }

      const result = await bot.sendMessage(
        cid,
        truncateTelegramText(text),
        sendOpts,
      );
      return { messageId: result.message_id, isPhoto: false };
    },

    async displayFeedback({
      chatId: cid,
      messageId,
      isPhoto,
      text,
      compactText,
      explanation,
    }): Promise<void> {
      const editOpts = {
        reply_markup: { inline_keyboard: [] as [] },
        parse_mode: "HTML" as const,
      };

      if (isPhoto) {
        const fullCaption = truncateTelegramCaption(text);
        if (fullCaption.length <= 1024) {
          await bot.editMessageCaption(cid, messageId, {
            caption: fullCaption,
            ...editOpts,
          });
        } else {
          const compactCaption = truncateTelegramCaption(compactText);
          await bot.editMessageCaption(cid, messageId, {
            caption: compactCaption,
            ...editOpts,
          });
          if (explanation) {
            await bot.sendMessage(cid, truncateTelegramText(explanation), {
              parse_mode: "HTML",
            });
          }
        }
      } else {
        await bot.editMessageText(
          cid,
          messageId,
          truncateTelegramText(text),
          { ...editOpts },
        );
      }
    },

    async deleteQuestionMessage({ chatId: cid, messageId }): Promise<void> {
      await bot.deleteMessage(cid, messageId).catch(() => {
        // Already deleted — ignore
      });
    },

    async advanceDrill({ telegramUserId, now }): Promise<Doc<"questions"> | null> {
      const user = await ctx.runQuery(internal.users.getByTelegramId, {
        telegramId: telegramUserId,
      });
      if (!user?.drillSnapshot) return null;

      const parsedDrill = safeParseSnapshot(user.drillSnapshot);
      if (!parsedDrill.success) {
        await ctx.runMutation(internal.users.updateDrillSnapshot, {
          telegramId: telegramUserId,
        });
        return null;
      }
      const drillSnapshot = parsedDrill.snapshot as { value?: string };
      if (drillSnapshot.value !== "questioning") return null;

      const needInit =
        !user.focusSlots?.length ||
        !user.lastAnsweredAt ||
        now - user.lastAnsweredAt > 30 * 60 * 1000;

      let slots = user.focusSlots ?? [];
      if (needInit) {
        slots = await ctx.runMutation(
          internal.focusSlots.focusSlots.initSlotsMutation,
          { telegramUserId, now },
        );
      }
      if (slots.length === 0) return null;

      const triedKcIds = new Set<string>();
      let attempts = 0;
      const maxAttempts = (slots.length + 2) * 2;

      while (attempts < maxAttempts) {
        attempts++;

        const slot = await ctx.runQuery(
          internal.focusSlots.focusSlots.pickSlotQuery,
          { telegramUserId, excludedKcIds: Array.from(triedKcIds) },
        );

        if (!slot) {
          slots = await ctx.runMutation(
            internal.focusSlots.focusSlots.initSlotsMutation,
            { telegramUserId, now },
          );
          if (slots.length === 0) return null;
          triedKcIds.clear();
          continue;
        }

        const recentAnswers = await ctx.runQuery(
          internal.answerLog.getRecentAnswersForKc,
          { telegramUserId, kcId: slot.kcId, limit: 3 },
        );
        const excludedQuestionIds = recentAnswers.map((a) => a.questionId);

        const question = await ctx.runQuery(
          internal.questions.queries.getRandomQuestionForKc,
          {
            kcId: slot.kcId,
            random: Math.random(),
            ...(excludedQuestionIds.length > 0
              ? { excludedQuestionIds }
              : {}),
          },
        );

        if (question) return question;
        triedKcIds.add(slot.kcId);
      }

      return null;
    },

    async loadKcCatalog({ kcIds }): Promise<CatalogEntry[]> {
      return await ctx.runQuery(internal.kcCatalog.getCatalogEntries, { kcIds });
    },

    async loadMasteryForKcs({
      telegramUserId,
      kcIds,
    }): Promise<MasteryEntry[]> {
      const entries = await ctx.runQuery(internal.userMastery.getMasteryForKcs, {
        telegramUserId,
        kcIds,
      });
      return entries.map((e) => ({
        kcId: e.kcId,
        known: e.known,
        halfLife: e.halfLife,
        consolidated: e.consolidated,
      }));
    },
  };
}
