import { createMachine, assign } from "xstate";
import type { SingleChoiceQuestionContext } from "./types";

export const singleChoiceQuestionMachine = createMachine(
  {
    id: "singleChoiceQuestion",
    initial: "displayingQuestion",

    types: {} as {
      context: SingleChoiceQuestionContext;
      events:
        | { type: "MESSAGE_SENT"; messageId: number }
        | { type: "ANSWER_SELECTED"; optionId: string }
        | { type: "FEEDBACK_SHOWN" };
      input: Omit<
        SingleChoiceQuestionContext,
        "messageId" | "selectedOptionId" | "isCorrect"
      >;
    },

    context: ({ input }) => ({
      ...input,
      messageId: undefined,
      selectedOptionId: undefined,
      isCorrect: undefined,
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
            target: "evaluating",
            actions: assign({
              selectedOptionId: ({ event }) => event.optionId,
            }),
          },
        },
      },

      // Синхронная оценка ответа — немедленно переходим дальше
      evaluating: {
        entry: "evaluateAnswer",
        always: "displayingFeedback",
      },

      // Manager показал фидбек в Telegram — ждём подтверждения
      displayingFeedback: {
        on: {
          FEEDBACK_SHOWN: "finish",
        },
      },

      // Финальное состояние — результат доступен через snapshot.output
      finish: {
        type: "final",
        output: ({ context }) => ({
          isCorrect: context.isCorrect,
          selectedOptionId: context.selectedOptionId,
        }),
      },
    },
  },
  {
    actions: {
      evaluateAnswer: assign({
        isCorrect: ({ context }) => {
          const selected = context.options.find(
            (o) => o.id === context.selectedOptionId
          );
          return selected?.isCorrect ?? false;
        },
      }),
    },
  }
);
