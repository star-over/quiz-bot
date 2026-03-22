import { createActor } from "xstate";
import { type Api, type InlineKeyboard } from "grammy";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { SingleChoiceQuestionContext } from "../machines/types";
import { singleChoiceQuestionMachine } from "../machines/singleChoiceQuestion";
import { api, internal } from "../_generated/api";

import { canUseInlineLabels, makeSingleChoiceKeyboard, makeYesNoKeyboard } from "../bot/keyboard";

function checkAnswer(
  choices: SingleChoiceQuestionContext["choices"],
  selectedChoiceId: number,
): boolean {
  return choices.find((c) => c.id === selectedChoiceId)?.isCorrect ?? false;
}

export class QuestionManager {
  constructor(
    private ctx: ActionCtx,
    private bot: Api,
    private chatId: number,
    private telegramId: string,
  ) {}

  // Отправить вопрос пользователю и сохранить снапшот машины
  async start(question: Doc<"questions">): Promise<void> {
    // 1. Удалить старое сообщение если есть активная сессия
    const user = await this.ctx.runQuery(internal.users.getByTelegramId, {
      telegramId: this.telegramId,
    });
    if (user?.questionSnapshot) {
      const old = JSON.parse(user.questionSnapshot) as { context?: { messageId?: number } };
      if (old.context?.messageId) {
        await this.bot.deleteMessage(this.chatId, old.context.messageId).catch(() => {
          // Сообщение уже удалено — игнорируем
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
      keyboard = makeYesNoKeyboard(choices, question._id);
      messageText = question.prompt;
    } else {
      const useInlineLabels = canUseInlineLabels(choices);
      keyboard = makeSingleChoiceKeyboard(choices, question._id, useInlineLabels);
      messageText = useInlineLabels
        ? question.prompt
        : [
            question.prompt,
            "",
            choices.map((choice, i) => `${i + 1}. ${choice.content}`).join("\n"),
          ].join("\n");
    }

    // 4. Отправить сообщение в Telegram (фото или текст)
    let isPhoto = false;
    let messageId: number;

    const sendOpts = { reply_markup: keyboard, parse_mode: "HTML" as const };
    // caption в Telegram ≤ 1024 символов — если больше, отправляем текстом
    const canSendAsPhoto = messageText.length <= 1024;

    if (canSendAsPhoto && question.telegramFileId) {
      // Быстрый путь: файл уже на серверах Telegram
      const result = await this.trySendPhoto(question.telegramFileId, messageText, sendOpts);
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
        const result = await this.trySendPhoto(imageUrl, messageText, sendOpts);
        if (result) {
          messageId = result.message_id;
          isPhoto = true;
          // Закешировать file_id для последующих отправок
          const fileId = result.photo?.at(-1)?.file_id;
          if (fileId) {
            await this.ctx.runMutation(internal.development.cacheTelegramFileId, {
              questionId: question._id, telegramFileId: fileId,
            });
          }
        }
      }
    }

    // @ts-expect-error messageId присваивается в одной из веток выше или ниже
    if (!isPhoto || messageId === undefined) {
      // Fallback: текстовое сообщение (нет картинки / URL недоступен / caption > 1024)
      isPhoto = false;
      const msg = await this.bot.sendMessage(this.chatId, messageText, sendOpts);
      messageId = msg.message_id;
    }

    // 5. Запустить машину и передать ей messageId
    const actor = createActor(singleChoiceQuestionMachine, {
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
    const persistedSnapshot = JSON.parse(user.questionSnapshot);
    const actor = createActor(singleChoiceQuestionMachine, {
      snapshot: persistedSnapshot,
      input: persistedSnapshot.context,
    });
    actor.start();

    // 3. Отправить событие — машина синхронно переходит в displayingFeedback
    actor.send({ type: "ANSWER_SELECTED", choiceId });
    const context = actor.getSnapshot().context;

    // 4. Вычислить результат и показать фидбек
    const isCorrect = checkAnswer(context.choices, choiceId);
    await this.showFeedback(context, isCorrect, false);

    // 5. Сообщить машине что фидбек показан → finish
    actor.send({ type: "FEEDBACK_SHOWN" });

    // 6. Залогировать ответ
    const selectedIndex = context.choices.findIndex((c) => c.id === choiceId);
    const correctIndex = context.choices.findIndex((c) => c.isCorrect);
    await this.ctx.runMutation(internal.answerLog.logAnswer, {
      telegramUserId: this.telegramId,
      questionId: context.questionId as Id<"questions">,
      selectedChoiceId: choiceId,
      isCorrect,
      choicesCount: context.choices.length,
      selectedPosition: selectedIndex + 1,
      correctPosition: correctIndex + 1,
      shownAt: context.shownAt!,
      respondedAt,
      chatId: this.chatId,
      messageId: context.messageId!,
    });

    // 7. Очистить снапшот и подать следующий вопрос
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
    const persistedSnapshot = JSON.parse(user.questionSnapshot);
    const actor = createActor(singleChoiceQuestionMachine, {
      snapshot: persistedSnapshot,
      input: persistedSnapshot.context,
    });
    actor.start();

    // 3. Отправить событие — машина переходит в displayingFeedback (без selectedChoiceId)
    actor.send({ type: "SKIPPED" });
    const context = actor.getSnapshot().context;

    // 4. Показать фидбек с правильным ответом
    await this.showFeedback(context, false, true);

    // 5. Сообщить машине что фидбек показан → finish
    actor.send({ type: "FEEDBACK_SHOWN" });

    // 6. Залогировать пропуск
    const correctIndex = context.choices.findIndex((c) => c.isCorrect);
    await this.ctx.runMutation(internal.answerLog.logSkip, {
      telegramUserId: this.telegramId,
      questionId: context.questionId as Id<"questions">,
      choicesCount: context.choices.length,
      correctPosition: correctIndex + 1,
      shownAt: context.shownAt!,
      respondedAt,
      chatId: this.chatId,
      messageId: context.messageId!,
    });

    // 7. Очистить снапшот и подать следующий вопрос
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

    // Drill должен быть в состоянии questioning
    if (!user?.drillSnapshot) return;
    const drillSnapshot = JSON.parse(user.drillSnapshot) as { value?: string };
    if (drillSnapshot.value !== "questioning") return;

    // Выбрать следующий вопрос (временно: случайный)
    const question = await this.ctx.runQuery(api.queries.getRandomQuestion, {
      random: Math.random(),
    });
    if (!question) return;

    await this.start(question);
  }

  // Отобразить фидбек: отредактировать сообщение, убрать клавиатуру
  private async showFeedback(
    context: SingleChoiceQuestionContext,
    isCorrect: boolean,
    skipped: boolean,
  ): Promise<void> {
    if (!context.messageId) return;

    const editOpts = { reply_markup: { inline_keyboard: [] as [] }, parse_mode: "HTML" as const };

    if (context.isPhoto) {
      // Фото: редактируем caption (≤ 1024 символов)
      const fullFeedback = this.buildFeedbackText(context, isCorrect, { skipped });
      if (fullFeedback.length <= 1024) {
        await this.bot.editMessageCaption(this.chatId, context.messageId, {
          caption: fullFeedback, ...editOpts,
        });
      } else {
        // Компактный фидбек без explanation в caption
        const compactFeedback = this.buildFeedbackText(context, isCorrect, { skipped, omitExplanation: true });
        await this.bot.editMessageCaption(this.chatId, context.messageId, {
          caption: compactFeedback, ...editOpts,
        });
        // Объяснение — отдельным сообщением
        const explanation = this.getExplanation(context, skipped);
        if (explanation) {
          await this.bot.sendMessage(this.chatId, explanation, { parse_mode: "HTML" });
        }
      }
    } else {
      await this.bot.editMessageText(
        this.chatId,
        context.messageId,
        this.buildFeedbackText(context, isCorrect, { skipped }),
        { ...editOpts },
      );
    }
  }

  // Хелпер: попытка отправить фото, null при ошибке
  private async trySendPhoto(
    photoSource: string,
    caption: string,
    opts: { reply_markup: InlineKeyboard; parse_mode: "HTML" },
  ) {
    try {
      return await this.bot.sendPhoto(this.chatId, photoSource, {
        caption,
        reply_markup: opts.reply_markup,
        parse_mode: opts.parse_mode,
      });
    } catch {
      return null; // file_id протух или URL недоступен
    }
  }

  // Получить explanation: для ответа — explanation выбранного варианта, для пропуска — правильного
  private getExplanation(context: SingleChoiceQuestionContext, skipped = false): string | undefined {
    if (skipped) {
      const correctChoice = context.choices.find((c) => c.isCorrect);
      return correctChoice?.explanation ?? context.explanation;
    }
    const selectedChoice = context.choices.find(
      (c) => c.id === context.selectedChoiceId,
    );
    return selectedChoice?.explanation ?? context.explanation;
  }

  // Строит текст сообщения с результатом и объяснением
  private buildFeedbackText(
    context: SingleChoiceQuestionContext,
    isCorrect: boolean,
    options?: { omitExplanation?: boolean; skipped?: boolean },
  ): string {
    const choiceLines = context.choices
      .map((choice, i) => {
        const isSelected = choice.id === context.selectedChoiceId;
        const mark = choice.isCorrect ? " ✅" : isSelected ? " ❌" : "";
        return `${i + 1}. ${choice.content}${mark}`;
      })
      .join("\n");

    const result = options?.skipped
      ? "🙈 <b>Пропущено.</b>"
      : isCorrect
        ? "✅ <b>Правильно!</b>"
        : "❌ <b>Неправильно.</b>";

    const explanation = options?.omitExplanation
      ? undefined
      : this.getExplanation(context, options?.skipped);

    return [
      context.prompt,
      "",
      choiceLines,
      "",
      result,
      ...(explanation ? ["", explanation] : []),
    ].join("\n");
  }
}
