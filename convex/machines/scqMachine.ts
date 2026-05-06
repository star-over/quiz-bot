import { createMachine, assign } from "xstate";
import type { SCQContext } from "./types";

export const scqMachine = createMachine({
  id: "scq",
  initial: "displayingQuestion",

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  types: {} as {
    context: SCQContext;
    events:
      | { type: "MESSAGE_SENT"; messageId: number; isPhoto: boolean; shownAt: number }
      | { type: "ANSWER_SELECTED"; choiceId: number }
      | { type: "SKIPPED" }
      | { type: "FEEDBACK_SHOWN" };
    input: Omit<SCQContext, "messageId" | "selectedChoiceId" | "isPhoto" | "shownAt">;
  },

  context: ({ input }) => ({
    ...input,
    messageId: undefined,
    selectedChoiceId: undefined,
    isPhoto: undefined,
    shownAt: undefined,
  }),

  states: {
    // Manager отправил сообщение в Telegram — ждём подтверждения с messageId
    displayingQuestion: {
      on: {
        MESSAGE_SENT: {
          target: "awaitingAnswer",
          actions: assign({
            messageId: ({ event }) => event.messageId,
            isPhoto: ({ event }) => event.isPhoto,
            shownAt: ({ event }) => event.shownAt,
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
            selectedChoiceId: ({ event }) => event.choiceId,
          }),
        },
        SKIPPED: {
          target: "displayingFeedback",
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
        selectedChoiceId: context.selectedChoiceId,
      }),
    },
  },
});
