import { createActor } from "xstate";
import { type Api, type InlineKeyboard } from "grammy";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { SCQContext } from "../machines/types";
import { scqMachine } from "../machines/scqMachine";
import { internal } from "../_generated/api";

import { canUseInlineLabels, makeSingleChoiceKeyboard, makeYesNoKeyboard } from "../bot/keyboard";
import { checkAnswer, buildFeedbackText, buildDebugFooter, getExplanation, safeParseSnapshot, truncateTelegramText, truncateTelegramCaption, type KcDebugEntry } from "./questionPure";

export class QuestionManager {
  private ctx: ActionCtx;
  private bot: Api;
  private chatId: number;
  private telegramId: string;

  constructor({ ctx, bot, chatId, telegramId }: { ctx: ActionCtx; bot: Api; chatId: number; telegramId: string }) {
    this.ctx = ctx;
    this.bot = bot;
    this.chatId = chatId;
    this.telegramId = telegramId;
  }

  private isDevMode(): boolean {
    return process.env.ENVIRONMENT === "development";
  }

  // Загружает данные KC (каталог + мастери пользователя) для отладочного блока
  private async fetchKcDebugEntries({ kcIds }: { kcIds: string[] }): Promise<KcDebugEntry[]> {
    const [catalogEntries, masteryEntries] = await Promise.all([
      this.ctx.runQuery(internal.kcCatalog.getCatalogEntries, { kcIds }),
      this.ctx.runQuery(internal.userMastery.getMasteryForKcs, {
        telegramUserId: this.telegramId,
        kcIds,
      }),
    ]);

    const masteryMap = new Map(masteryEntries.map((m) => [m.kcId, m]));

    return kcIds.map((kcId) => {
      const catalog = catalogEntries.find((c) => c.kcId === kcId);
      const mastery = masteryMap.get(kcId);
      return {
        kcId,
        cefrLevel: catalog?.cefrLevel ?? "?",
        ...(mastery ? { consolidated: mastery.consolidated, masteryBefore: { known: mastery.known, halfLife: mastery.halfLife } } : {}),
      };
    });
  }

  // Отправить вопрос пользователю и сохранить снапшот машины
  async start(question: Doc<"questions">): Promise<void> {
    // 1. Удалить старое сообщение если есть активная сессия
    const user = await this.ctx.runQuery(internal.users.getByTelegramId, {
      telegramId: this.telegramId,
    });
    if (user?.questionSnapshot) {
      const parsed = safeParseSnapshot(user.questionSnapshot);
      if (parsed.success) {
        const old = parsed.snapshot as { context?: { messageId?: number } };
        if (old.context?.messageId) {
          await this.bot.deleteMessage(this.chatId, old.context.messageId).catch(() => {
            // Сообщение уже удалено — игнорируем
          });
        }
      } else {
        // Corrupted snapshot — reset to avoid lock-in
        await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
          telegramId: this.telegramId,
        });
      }
    }

    // 2. Подготовить варианты ответа
    const choices = question.choices.map((choice) => ({
      id: choice.id,
      content: choice.content,
      isCorrect: choice.score === 1,
      explanation: choice.explanation,
    }));

    // 3. Собрать клавиатуру и текст сообщения
    let keyboard;
    let messageText: string;

    if (question.choiceType === "yes_no") {
      keyboard = makeYesNoKeyboard({ choices, questionId: question._id });
      messageText = question.prompt;
    } else {
      const useInlineLabels = canUseInlineLabels(choices);
      keyboard = makeSingleChoiceKeyboard({ choices, questionId: question._id, useInlineLabels });
      messageText = useInlineLabels
        ? question.prompt
        : [
            question.prompt,
            "",
            choices.map((choice, i) => `${i + 1}. ${choice.content}`).join("\n"),
          ].join("\n");
    }

    // 4. Усечь текст до лимита Telegram
    messageText = truncateTelegramText(messageText);

    // 5. Добавить отладочный блок (только dev)
    if (this.isDevMode() && question.kcs && question.kcs.length > 0) {
      const kcs = await this.fetchKcDebugEntries({ kcIds: question.kcs });
      const footer = buildDebugFooter({ seedId: question.seedId, slip: question.slip, choicesCount: question.choices.length, isExposure: question.choiceType === "yes_no", kcs });
      messageText = `${messageText}\n\n${footer}`;
    }

    // 5. Отправить сообщение в Telegram (фото или текст)
    let isPhoto = false;
    let messageId: number | undefined;

    const sendOpts = { reply_markup: keyboard, parse_mode: "HTML" as const };
    // caption в Telegram ≤ 1024 символов — если больше, отправляем текстом
    const canSendAsPhoto = messageText.length <= 1024;

    if (canSendAsPhoto && question.telegramFileId) {
      // Быстрый путь: файл уже на серверах Telegram
      const result = await this.trySendPhoto({ photoSource: question.telegramFileId, caption: messageText, opts: sendOpts });
      if (result) {
        messageId = result.message_id;
        isPhoto = true;
      } else {
        // file_id протух — сбросить кеш
        await this.ctx.runMutation(internal.development.cacheTelegramFileId, {
          questionId: question._id,
        });
      }
    }

    if (!isPhoto && canSendAsPhoto && question.imageStorageId) {
      // Отправка по URL из Convex Storage
      const imageUrl = await this.ctx.storage.getUrl(question.imageStorageId);
      if (imageUrl) {
        const result = await this.trySendPhoto({ photoSource: imageUrl, caption: messageText, opts: sendOpts });
        if (result) {
          messageId = result.message_id;
          isPhoto = true;
          // Закешировать file_id для последующих отправок
          const fileId = result.photo.at(-1)?.file_id;
          if (fileId) {
            await this.ctx.runMutation(internal.development.cacheTelegramFileId, {
              questionId: question._id, telegramFileId: fileId,
            });
          }
        }
      }
    }

    // Fallback: текстовое сообщение (нет картинки / URL недоступен / caption > 1024)
    if (!isPhoto || messageId === undefined) {
      isPhoto = false;
      messageId = (await this.bot.sendMessage(this.chatId, messageText, sendOpts)).message_id;
    }

    // 5. Запустить машину и передать ей messageId
    // messageId гарантированно определён: photo-ветки или fallback его устанавливают
    const actor = createActor(scqMachine, {
      input: {
        questionId: question._id,
        prompt: question.prompt,
        explanation: question.explanation,
        choices,
      },
    });
    actor.start();
    actor.send({ type: "MESSAGE_SENT", messageId, isPhoto, shownAt: Date.now() });

    // 6. Сохранить снапшот
    await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
      telegramId: this.telegramId,
      questionSnapshot: JSON.stringify(actor.getSnapshot()),
    });
  }

  // Принять ответ пользователя, показать фидбек, очистить сессию
  async handleAnswer(choiceId: number): Promise<void> {
    const respondedAt = Date.now();

    // 1. Загрузить сессию
    const user = await this.ctx.runQuery(internal.users.getByTelegramId, {
      telegramId: this.telegramId,
    });
    if (!user?.questionSnapshot) return;

    // 2. Восстановить машину из снапшота
    const parseResult = safeParseSnapshot(user.questionSnapshot);
    if (!parseResult.success) {
      await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
        telegramId: this.telegramId,
      });
      return;
    }
    const persistedSnapshot = parseResult.snapshot as never;
    const actor = createActor(scqMachine, {
      snapshot: persistedSnapshot,
      input: (parseResult.snapshot as { context: never }).context,
    });
    actor.start();

    // 3. Отправить событие — машина синхронно переходит в displayingFeedback
    actor.send({ type: "ANSWER_SELECTED", choiceId });
    const context = actor.getSnapshot().context;

    // 4. Вычислить результат
    const isCorrect = checkAnswer({ choices: context.choices, selectedChoiceId: choiceId });

    // 5. Обновить уровень знания по KC вопроса (BKT-F)
    const masteryResults = await this.ctx.runMutation(internal.userMastery.updateMastery, {
      telegramUserId: this.telegramId,
      questionId: context.questionId as Id<"questions">,
      isCorrect,
      respondedAt,
    });

    // Обновить Focus Slots (streak, exit, fill)
    const kcIds = masteryResults.map((r) => r.kcId);
    for (const kcId of kcIds) {
      await this.ctx.runMutation(internal.focusSlots.focusSlots.updateAfterAnswer, {
        telegramUserId: this.telegramId,
        kcId,
        isCorrect,
        now: respondedAt,
      });
    }

    // 6. Показать фидбек
    let debugFooter: string | undefined;
    if (this.isDevMode() && context.shownAt !== undefined) {
      debugFooter = await this.buildFeedbackDebugFooter({
        questionId: context.questionId as Id<"questions">,
        masteryResults,
        elapsedMs: respondedAt - context.shownAt,
      });
    }
    await this.showFeedback({ context, isCorrect, skipped: false, ...(debugFooter !== undefined ? { debugFooter } : {}) });

    // 7. Сообщить машине что фидбек показан → finish
    actor.send({ type: "FEEDBACK_SHOWN" });

    // 8. Залогировать ответ
    const selectedIndex = context.choices.findIndex((c) => c.id === choiceId);
    const correctIndex = context.choices.findIndex((c) => c.isCorrect);
    if (context.shownAt === undefined || context.messageId === undefined) return;
    await this.ctx.runMutation(internal.answerLog.logAnswer, {
      telegramUserId: this.telegramId,
      questionId: context.questionId as Id<"questions">,
      selectedChoiceId: choiceId,
      isCorrect,
      choicesCount: context.choices.length,
      selectedPosition: selectedIndex + 1,
      correctPosition: correctIndex + 1,
      shownAt: context.shownAt,
      respondedAt,
      chatId: this.chatId,
      messageId: context.messageId,
      kcIds,
    });

    // 9. Очистить снапшот и подать следующий вопрос
    await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
      telegramId: this.telegramId,
    });
    await this.next();
  }

  // Пропустить вопрос, показать правильный ответ, подать следующий вопрос
  async handleSkip(): Promise<void> {
    const respondedAt = Date.now();

    // 1. Загрузить сессию
    const user = await this.ctx.runQuery(internal.users.getByTelegramId, {
      telegramId: this.telegramId,
    });
    if (!user?.questionSnapshot) return;

    // 2. Восстановить машину из снапшота
    const parseResult = safeParseSnapshot(user.questionSnapshot);
    if (!parseResult.success) {
      await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
        telegramId: this.telegramId,
      });
      return;
    }
    const persistedSnapshot = parseResult.snapshot as never;
    const actor = createActor(scqMachine, {
      snapshot: persistedSnapshot,
      input: (parseResult.snapshot as { context: never }).context,
    });
    actor.start();

    // 3. Отправить событие — машина переходит в displayingFeedback (без selectedChoiceId)
    actor.send({ type: "SKIPPED" });
    const context = actor.getSnapshot().context;

    // 4. Обновить уровень знания по KC вопроса (BKT-F, isCorrect=false для пропуска)
    const masteryResults = await this.ctx.runMutation(internal.userMastery.updateMastery, {
      telegramUserId: this.telegramId,
      questionId: context.questionId as Id<"questions">,
      isCorrect: false,
      respondedAt,
    });

    // Обновить Focus Slots
    const kcIds = masteryResults.map((r) => r.kcId);
    for (const kcId of kcIds) {
      await this.ctx.runMutation(internal.focusSlots.focusSlots.updateAfterAnswer, {
        telegramUserId: this.telegramId,
        kcId,
        isCorrect: false,
        now: respondedAt,
      });
    }

    // 5. Показать фидбек с правильным ответом
    let debugFooter: string | undefined;
    if (this.isDevMode() && context.shownAt !== undefined) {
      debugFooter = await this.buildFeedbackDebugFooter({
        questionId: context.questionId as Id<"questions">,
        masteryResults,
        elapsedMs: respondedAt - context.shownAt,
      });
    }
    await this.showFeedback({ context, isCorrect: false, skipped: true, ...(debugFooter !== undefined ? { debugFooter } : {}) });

    // 6. Сообщить машине что фидбек показан → finish
    actor.send({ type: "FEEDBACK_SHOWN" });

    // 7. Залогировать пропуск
    const correctIndex = context.choices.findIndex((c) => c.isCorrect);
    if (context.shownAt === undefined || context.messageId === undefined) return;
    await this.ctx.runMutation(internal.answerLog.logSkip, {
      telegramUserId: this.telegramId,
      questionId: context.questionId as Id<"questions">,
      choicesCount: context.choices.length,
      correctPosition: correctIndex + 1,
      shownAt: context.shownAt,
      respondedAt,
      chatId: this.chatId,
      messageId: context.messageId,
      kcIds,
    });

    // 8. Очистить снапшот и подать следующий вопрос
    await this.ctx.runMutation(internal.users.updateQuestionSnapshot, {
      telegramId: this.telegramId,
    });
    await this.next();
  }

  // Подать следующий вопрос если drill активен
  async next(): Promise<void> {
    const user = await this.ctx.runQuery(internal.users.getByTelegramId, {
      telegramId: this.telegramId,
    });

    if (!user?.drillSnapshot) return;
    const parsedDrill = safeParseSnapshot(user.drillSnapshot);
    if (!parsedDrill.success) {
      await this.ctx.runMutation(internal.users.updateDrillSnapshot, {
        telegramId: this.telegramId,
      });
      return;
    }
    const drillSnapshot = parsedDrill.snapshot as { value?: string };
    if (drillSnapshot.value !== "questioning") return;

    const now = Date.now();
    const needInit = !user.focusSlots?.length || !user.lastAnsweredAt || (now - user.lastAnsweredAt > 30 * 60 * 1000);

    let slots = user.focusSlots ?? [];
    if (needInit) {
      slots = await this.ctx.runMutation(internal.focusSlots.focusSlots.initSlotsMutation, {
        telegramUserId: this.telegramId,
        now,
      });
    }

    if (slots.length === 0) return;

    const triedKcIds = new Set<string>();
    let attempts = 0;
    const maxAttempts = (slots.length + 2) * 2;

    while (attempts < maxAttempts) {
      attempts++;

      const slot = await this.ctx.runQuery(internal.focusSlots.focusSlots.pickSlotQuery, {
        telegramUserId: this.telegramId,
        excludedKcIds: Array.from(triedKcIds),
      });

      if (!slot) {
        slots = await this.ctx.runMutation(internal.focusSlots.focusSlots.initSlotsMutation, {
          telegramUserId: this.telegramId,
          now,
        });
        if (slots.length === 0) return;
        triedKcIds.clear();
        continue;
      }

      const recentAnswers = await this.ctx.runQuery(internal.answerLog.getRecentAnswersForKc, {
        telegramUserId: this.telegramId,
        kcId: slot.kcId,
        limit: 3,
      });
      const excludedQuestionIds = recentAnswers.map((a) => a.questionId);

      const questionQueryArgs: { kcId: string; random: number; excludedQuestionIds?: Id<"questions">[] } = {
        kcId: slot.kcId,
        random: Math.random(),
      };
      if (excludedQuestionIds.length > 0) {
        questionQueryArgs.excludedQuestionIds = excludedQuestionIds;
      }
      const question = await this.ctx.runQuery(internal.questions.queries.getRandomQuestionForKc, questionQueryArgs);

      if (question) {
        await this.start(question);
        return;
      }

      triedKcIds.add(slot.kcId);
    }
  }

  // Собрать debug-footer для фидбека с before→after mastery (только dev)
  private async buildFeedbackDebugFooter({
    questionId,
    masteryResults,
    elapsedMs,
  }: {
    questionId: Id<"questions">;
    masteryResults: { kcId: string; consolidated: boolean; before?: { known: number; halfLife: number }; after: { known: number; halfLife: number } }[];
    elapsedMs: number;
  }): Promise<string | undefined> {
    const question = await this.ctx.runQuery(internal.queries.getQuestionById, { questionId });
    if (!question?.kcs || question.kcs.length === 0) return undefined;

    const catalogEntries = await this.ctx.runQuery(internal.kcCatalog.getCatalogEntries, { kcIds: question.kcs });
    const masteryMap = new Map(masteryResults.map((m) => [m.kcId, m]));

    const kcs: KcDebugEntry[] = question.kcs.map((kcId) => {
      const catalog = catalogEntries.find((c) => c.kcId === kcId);
      const mastery = masteryMap.get(kcId);
      return {
        kcId,
        cefrLevel: catalog?.cefrLevel ?? "?",
        ...(mastery ? { consolidated: mastery.consolidated } : {}),
        ...(mastery?.before ? { masteryBefore: mastery.before } : {}),
        ...(mastery?.after ? { masteryAfter: mastery.after } : {}),
      };
    });

    return buildDebugFooter({ seedId: question.seedId, slip: question.slip, choicesCount: question.choices.length, isExposure: question.choiceType === "yes_no", kcs, elapsedMs });
  }

  // Отобразить фидбек: отредактировать сообщение, убрать клавиатуру
  private async showFeedback({
    context,
    isCorrect,
    skipped,
    debugFooter,
  }: {
    context: SCQContext;
    isCorrect: boolean;
    skipped: boolean;
    debugFooter?: string;
  }): Promise<void> {
    if (!context.messageId) return;

    const withFooter = (text: string) =>
      debugFooter ? `${text}\n\n${debugFooter}` : text;

    const editOpts = { reply_markup: { inline_keyboard: [] as [] }, parse_mode: "HTML" as const };

    if (context.isPhoto) {
      // Фото: редактируем caption (≤ 1024 символов)
      const fullFeedback = truncateTelegramCaption(withFooter(buildFeedbackText({ context, isCorrect, skipped })));
      if (fullFeedback.length <= 1024) {
        await this.bot.editMessageCaption(this.chatId, context.messageId, {
          caption: fullFeedback, ...editOpts,
        });
      } else {
        // Компактный фидбек без explanation в caption (footer остаётся)
        const compactFeedback = truncateTelegramCaption(withFooter(buildFeedbackText({ context, isCorrect, skipped, omitExplanation: true })));
        await this.bot.editMessageCaption(this.chatId, context.messageId, {
          caption: compactFeedback, ...editOpts,
        });
        // Объяснение — отдельным сообщением
        const explanationText = getExplanation({ context, skipped });
        if (explanationText) {
          await this.bot.sendMessage(this.chatId, truncateTelegramText(explanationText), { parse_mode: "HTML" });
        }
      }
    } else {
      await this.bot.editMessageText(
        this.chatId,
        context.messageId,
        truncateTelegramText(withFooter(buildFeedbackText({ context, isCorrect, skipped }))),
        { ...editOpts },
      );
    }
  }

  // Хелпер: попытка отправить фото, null при ошибке
  private async trySendPhoto({
    photoSource,
    caption,
    opts,
  }: {
    photoSource: string;
    caption: string;
    opts: { reply_markup: InlineKeyboard; parse_mode: "HTML" };
  }) {
    const safeCaption = truncateTelegramCaption(caption);
    try {
      return await this.bot.sendPhoto(this.chatId, photoSource, {
        caption: safeCaption,
        reply_markup: opts.reply_markup,
        parse_mode: opts.parse_mode,
      });
    } catch {
      return null; // file_id протух или URL недоступен
    }
  }

}
