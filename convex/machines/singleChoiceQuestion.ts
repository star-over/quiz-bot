import { createMachine, assign } from "xstate";
import type { SingleChoiceQuestionContext } from "./types";

export const singleChoiceQuestionMachine = createMachine({
  id: "singleChoiceQuestion",
  initial: "displayingQuestion",

  types: {} as {
    context: SingleChoiceQuestionContext;
    events:
      | { type: "MESSAGE_SENT"; messageId: number }
      | { type: "ANSWER_SELECTED"; optionId: number }
      | { type: "FEEDBACK_SHOWN" };
    input: Omit<SingleChoiceQuestionContext, "messageId" | "selectedOptionId">;
  },

  context: ({ input }) => ({
    ...input,
    messageId: undefined,
    selectedOptionId: undefined,
  }),

  states: {
    // Manager отправил сообщение в Telegram — ждём подтверждения с messageId
    displayingQuestion: {
      on: {
        MESSAGE_SENT: {
          target: "awaitingAnswer",
          actions: assign({
            messageId: ({ event }) => event.messageId,
          }),
        },
      },
    },

    // Вопрос показан — ждём ответа пользователя. Снапшот персистируется здесь.
    awaitingAnswer: {
      tags: "persist",
      on: {
        ANSWER_SELECTED: {
          target: "displayingFeedback",
          actions: assign({
            selectedOptionId: ({ event }) => event.optionId,
          }),
        },
      },
    },

    // Manager показал фидбек в Telegram — ждём подтверждения
    displayingFeedback: {
      on: {
        FEEDBACK_SHOWN: "finish",
      },
    },

    // Финальное состояние
    finish: {
      type: "final",
      output: ({ context }) => ({
        selectedOptionId: context.selectedOptionId,
      }),
    },
  },
});
