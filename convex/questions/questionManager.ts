import { createActor } from "xstate";
import { type Api } from "grammy";
import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { SingleChoiceQuestionContext } from "../machines/types";
import { singleChoiceQuestionMachine } from "../machines/singleChoiceQuestion";
import { api } from "../_generated/api";
import { canUseInlineLabels, makeSingleChoiceKeyboard, makeYesNoKeyboard } from "../bot/keyboard";

function checkAnswer(
  options: SingleChoiceQuestionContext["options"],
  selectedOptionId: number,
): boolean {
  return options.find((o) => o.id === selectedOptionId)?.isCorrect ?? false;
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

    // 2. Подготовить опции
    const options = question.options.map((opt) => ({
      id: opt.id,
      content: opt.content,
      isCorrect: opt.score === 1,
      explanation: opt.explanation,
    }));

    // 3. Собрать клавиатуру и текст сообщения
    let keyboard;
    let messageText: string;

    if (question.choiceType === "yes_no") {
      keyboard = makeYesNoKeyboard(options, question._id);
      messageText = question.prompt;
    } else {
      const useInlineLabels = canUseInlineLabels(options);
      keyboard = makeSingleChoiceKeyboard(options, question._id, useInlineLabels);
      messageText = useInlineLabels
        ? question.prompt
        : [
            question.prompt,
            "",
            options.map((opt, i) => `${i + 1}. ${opt.content}`).join("\n"),
          ].join("\n");
    }

    // 4. Отправить сообщение в Telegram
    const message = await this.bot.sendMessage(this.chatId, messageText, {
      reply_markup: keyboard,
      parse_mode: "HTML",
    });

    // 5. Запустить машину и передать ей messageId
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

    // 6. Сохранить снапшот
    await this.ctx.runMutation(api.development.dev_updateUserMachineState, {
      telegramId: this.telegramId,
      state: JSON.stringify(actor.getSnapshot()),
    });
  }

  // Принять ответ пользователя, показать фидбек, очистить сессию
  async handleAnswer(optionId: number): Promise<void> {
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

    // 3. Отправить событие — машина синхронно переходит в displayingFeedback
    actor.send({ type: "ANSWER_SELECTED", optionId });
    const context = actor.getSnapshot().context;

    // 4. Вычислить результат и отредактировать сообщение с фидбеком
    const isCorrect = checkAnswer(context.options, optionId);
    if (context.messageId) {
      await this.bot.editMessageText(
        this.chatId,
        context.messageId,
        this.buildFeedbackText(context, isCorrect),
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
  private buildFeedbackText(
    context: SingleChoiceQuestionContext,
    isCorrect: boolean,
  ): string {
    const optionLines = context.options
      .map((opt, i) => {
        const isSelected = opt.id === context.selectedOptionId;
        const mark = opt.isCorrect ? " ✅" : isSelected ? " ❌" : "";
        return `${i + 1}. ${opt.content}${mark}`;
      })
      .join("\n");

    const result = isCorrect
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
