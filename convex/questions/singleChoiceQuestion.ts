import { createActor } from "xstate";
import { InlineKeyboard, type Api } from "grammy";
import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { SingleChoiceQuestionContext } from "../machines/types";
import { singleChoiceQuestionMachine } from "../machines/singleChoiceQuestion";
import { api } from "../_generated/api";

const HTML_PATTERN = /<[^>]+>|&[a-z]+;|&#\d+;/i;
const BUTTON_LABEL_LIMIT = 24;

function countGraphemes(str: string): number {
  return [...new Intl.Segmenter().segment(str)].length;
}

function canUseInlineLabels(options: Array<{ content: string }>): boolean {
  return options.every(
    (opt) =>
      !HTML_PATTERN.test(opt.content) &&
      countGraphemes(opt.content) <= BUTTON_LABEL_LIMIT,
  );
}

export class SingleChoiceQuestionManager {
  constructor(
    private ctx: ActionCtx,
    private bot: Api,
    private chatId: number,
    private telegramId: string,
  ) {}

  // Отправить вопрос пользователю и сохранить снапшот машины
  async start(question: Doc<"questions">): Promise<void> {
    // 1. Удалить старое сообщение если есть активная сессия
    const user = await this.ctx.runQuery(api.development.dev_getUserState, {
      telegramId: this.telegramId,
    });
    if (user?.activeSession) {
      const old = JSON.parse(user.activeSession) as { context?: { messageId?: number } };
      if (old.context?.messageId) {
        await this.bot.deleteMessage(this.chatId, old.context.messageId).catch(() => {
          // Сообщение уже удалено — игнорируем
        });
      }
    }

    // 2. Подготовить опции (schema: id — number, машина: id — string)
    const options = question.options.map((opt) => ({
      id: String(opt.id),
      content: opt.content,
      isCorrect: opt.score === 1,
      explanation: opt.explanation,
    }));

    // 3. Собрать клавиатуру и текст сообщения
    // Формат callback_data: "qa:<questionId>:<optionId>" — лимит Telegram 64 байта
    // Если все варианты — plain text и ≤ 24 графемы, текст идёт прямо на кнопку.
    // Иначе — прокси-числа на кнопках, варианты в теле сообщения.
    const useInlineLabels = canUseInlineLabels(options);
    const keyboard = new InlineKeyboard();
    options.forEach((opt, i) => {
      const label = useInlineLabels ? opt.content : String(i + 1);
      keyboard.text(label, `qa:${question._id}:${opt.id}`).row();
    });

    const messageText = useInlineLabels
      ? question.prompt
      : [
          question.prompt,
          "",
          options.map((opt, i) => `${i + 1}. ${opt.content}`).join("\n"),
        ].join("\n");

    // 4. Отправить сообщение в Telegram
    const message = await this.bot.sendMessage(this.chatId, messageText, {
      reply_markup: keyboard,
      parse_mode: "HTML",
    });

    // 5. Запустить машину и передать ей messageId
    //    Все переходы синхронные — waitFor не нужен
    const actor = createActor(singleChoiceQuestionMachine, {
      input: {
        questionId: question._id,
        prompt: question.prompt,
        explanation: question.explanation,
        options,
      },
    });
    actor.start();
    actor.send({ type: "MESSAGE_SENT", messageId: message.message_id });
    // Машина сейчас в awaitingAnswer

    // 6. Сохранить снапшот
    await this.ctx.runMutation(api.development.dev_updateUserMachineState, {
      telegramId: this.telegramId,
      state: JSON.stringify(actor.getSnapshot()),
    });
  }

  // Принять ответ пользователя, показать фидбек, очистить сессию
  async handleAnswer(optionId: string): Promise<void> {
    // 1. Загрузить сессию
    const user = await this.ctx.runQuery(api.development.dev_getUserState, {
      telegramId: this.telegramId,
    });
    if (!user?.activeSession) return;

    // 2. Восстановить машину из снапшота
    const persistedSnapshot = JSON.parse(user.activeSession);
    const actor = createActor(singleChoiceQuestionMachine, {
      snapshot: persistedSnapshot,
      input: persistedSnapshot.context,
    });
    actor.start();

    // 3. Отправить событие
    //    Машина синхронно: awaitingAnswer → evaluating (isCorrect вычислен) → displayingFeedback
    actor.send({ type: "ANSWER_SELECTED", optionId });
    const context = actor.getSnapshot().context;

    // 4. Отредактировать сообщение с фидбеком
    if (context.messageId) {
      await this.bot.editMessageText(
        this.chatId,
        context.messageId,
        this.buildFeedbackText(context),
        { reply_markup: { inline_keyboard: [] }, parse_mode: "HTML" },
      );
    }

    // 5. Сообщить машине что фидбек показан → finish
    actor.send({ type: "FEEDBACK_SHOWN" });

    // 6. Очистить сессию
    await this.ctx.runMutation(api.development.dev_updateUserMachineState, {
      telegramId: this.telegramId,
    });

    // TODO: залогировать ответ в answerLog (userId, questionId, isCorrect, skillVector)
  }

  // Строит текст сообщения с результатом и объяснением
  private buildFeedbackText(context: SingleChoiceQuestionContext): string {
    const optionLines = context.options
      .map((opt, i) => {
        const isSelected = opt.id === context.selectedOptionId;
        const mark = opt.isCorrect ? " ✅" : isSelected ? " ❌" : "";
        return `${i + 1}. ${opt.content}${mark}`;
      })
      .join("\n");

    const result = context.isCorrect
      ? "✅ <b>Правильно!</b>"
      : "❌ <b>Неправильно.</b>";

    const selectedOption = context.options.find(
      (o) => o.id === context.selectedOptionId,
    );
    const explanation = selectedOption?.explanation ?? context.explanation;

    return [
      context.prompt,
      "",
      optionLines,
      "",
      result,
      ...(explanation ? ["", explanation] : []),
    ].join("\n");
  }
}
