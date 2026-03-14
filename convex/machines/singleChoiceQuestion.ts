// Машина вопроса с одиночным выбовом
import { createMachine, assign, fromPromise } from "xstate";
import type { SingleChoiceQuestionContext } from "./types";

// Создание машины вопроса с одиночным выбором
export const singleChoiceQuestionMachine = createMachine({
  id: "singleChoiceQuestion",
  initial: "displayingQuestion",

  types: {} as {
    context: SingleChoiceQuestionContext;
    events: { type: "ANSWER_SELECTED"; optionId: string };
    input: Omit<SingleChoiceQuestionContext, "messageId">;
  },

  context: ({ input }) => ({
    ...input,
    selectedOptionId: undefined,
    isCorrect: undefined,
    feedback: undefined,
    messageId: undefined,
  }),

  states: {
    displayingQuestion: {
      invoke: {
        id: "sendMessageService",
        src: "sendMessageService",
        input: ({ context }) => ({
          questionText: context.questionText,
          options: context.options,
          questionId: context.questionId,
        }),
        onDone: {
          target: "awaitingAnswer",
          actions: assign({
            messageId: ({ event }) => event.output.messageId,
          }),
        },
        onError: {
          target: "error",
        },
      },
    },
    awaitingAnswer: {
      tags: "persist",
      on: {
        ANSWER_SELECTED: {
          target: "evaluating",
          actions: "assignSelectedOption",
          reenter: true,
        },
      },
    },
    evaluating: {
      entry: ["evaluateAnswer", "saveStatistics"],
      always: "displayingFeedback",
    },
    displayingFeedback: {
      tags: "persist",
      invoke: {
        id: "updateMessageService",
        src: "updateMessageService",
        input: ({ context }) => ({ ...context }),
        onDone: { target: "finish" },
        onError: { target: "error" },
      },
    },
    finish: {
      type: "final",
      output: ({ context }) => ({
        isCorrect: context.isCorrect,
        selectedOptionId: context.selectedOptionId,
      }),
    },
    error: {
      type: "final",
    },
  },
},
{
  actions: {
    assignSelectedOption: assign({
      selectedOptionId: ({ event }) => event.optionId,
    }),
    evaluateAnswer: assign({
      isCorrect: ({ context }) => {
        const selectedOption = context.options.find(
          (option) => option.id === context.selectedOptionId
        );
        return selectedOption?.isCorrect || false;
      },
    }),
    saveStatistics: () => { console.log("Action: saveStatistics"); },
  },
  actors: {
    sendMessageService: fromPromise(async () => {
      console.log("Service: sendMessageService (placeholder)");
      return { messageId: 12345 };
    }),
    updateMessageService: fromPromise(async () => {
      console.log("Service: updateMessageService (placeholder)");
    }),
  },
});
