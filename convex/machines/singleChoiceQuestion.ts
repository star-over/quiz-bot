// Машина вопроса с одиночным выбором
import { createMachine, assign } from "xstate";

// Типы данных для контекста машины
export interface SingleChoiceQuestionContext {
  questionId: string;
  questionText: string;
  options: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
  selectedOptionId?: string;
  isCorrect?: boolean;
  feedback?: string;
}

// Создание машины вопроса с одиночным выбором
export const singleChoiceQuestionMachine = createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5SwJYDsoBswGEAWA9igMZgCKArnAC4oFoB0EKsADpgIYCe6UlNdNAGIAygFEAcgBEA+iICqOHGJEiA2gAYAuolCsCqWvV0gAHogAsANgDsDAEwAOAMz2NAVgCMGq48f2rZwAaEC5ETwZHAE4bbyj3d3sLGw0ki3sAXwyQ1AxsfCJSflgjRmY2Th4MYtLRSVkAMQBBAEkAGXkAJTFNHSQQfUNBE3MEKyiNByt3DQ8rDRsvBJCwhAjo2I14xOTUi3SsnN58whJyKhLBBg4Adw4UWgwmtFgbsAAnISaJEQB1MU6cjEbTEOAAKmIpL0TIMHsN+qMLF4GIF3BZnNNHEjUo4VuF7O4GJ50u5AlEYvZvJ4bIcQLksLhTkULqUGGAAG4cTAUDiPKBCaH9WGlEaILyTXyOameZxSqUaXGhRAYyapNyOQL+dzOLy0+knQrnAT0JgsdjcXgNMCQABGHGIAGshPIAApSJoQuSKZSqQV6Axw4wIyzuOzTGzzZwaTz+KwWPEIBLOBhRcYWTxRKVWewBRx646Mw01K7lc1VKBW232p2u92e5rtLo9bQwgMi4NjRyTTyhlLuTMy6JRBNJlPjWXOTz2KM2PxZbIgNAECBwEz6wtnYtB-1DbdmZVRCyRWazzxTyfOScJgC0lPsDAsqaj6WSnkCVnzeQ3zONZTNlV4Lc0FbXdgI7JF7ysWwAg0ScXGnAIbynQlqUvCYbAsDVH2cT8GQKTcWSuW57j5Z5Xg+EDAzA0BEXGBgI3GadEhsckdQTXwUSSVwrB7JwzyiXCDQI382U5bleV4Sj2xoyx0QcYk0niGV9nsBNp2TWYojPN8c2cR9fEE78jUuE1SwAjBKwgO1HSk+EZIQFTjwWKVzxlK8lQc+wwy7HU3IY5JDPwn8TMYAAzdAWDwWy90RCYGGcGwkmYmwdTRON2KjB9Uo8fttXcfxAqZYzWQ+d4CHeaLqP3BAUnvNKJi82xHHy4IPMCSZ0TRWqeMpfL5wyIA */
  id: "singleChoiceQuestion",
  initial: "displayingQuestion",
  context: {} as SingleChoiceQuestionContext,
  states: {
    displayingQuestion: {
      entry: ["renderMessage", "sendMessage"],
      on: {
        SEND_SUCCESS: { target: "awaitingAnswer" },
        SEND_FAILURE: { target: "error" }
      }
    },

    awaitingAnswer: {
      tags: "persist",
      on: {
        ANSWER_SELECTED: {
          target: "evaluating",
          actions: "assignSelectedOption",
          reenter: true
        }
      }
    },

    evaluating: {
      entry: ["evaluateAnswer", "saveStatistics"],
      always: "displayingFeedback",
    },

    displayingFeedback: {
      tags: "persist",
      entry: ["renderMessage", "updateMessage"],
      on: {
        UPDATE_SUCCESS: { target: "finish" },
        UPDATE_FAILURE: { target: "error" }
      }
    },

    finish: {
      type: "final",
      output: ({ context }) => ({
        isCorrect: context.isCorrect,
        selectedOptionId: context.selectedOptionId
      })
    },

    error: {
      type: "final" // Завершаем машину в случае ошибки
    }
  },
}, {
  actions: {
    // Существующие assign'ы
    assignSelectedOption: assign({
      selectedOptionId: (_, event: any) => {
        if (event && event.type === "ANSWER_SELECTED") {
          return event.optionId;
        }
        return undefined;
      },
    }),
    evaluateAnswer: assign({
      isCorrect: ({ context }) => {
        const selectedOption = context.options.find(
          (option) => option.id === context.selectedOptionId
        );
        return selectedOption?.isCorrect || false;
      },
    }),
    provideFeedback: assign({
      feedback: ({ context }) => {
        return context.isCorrect
          ? "Правильный ответ!"
          : "Неправильный ответ. Попробуйте еще раз.";
      },
    }),

    // Добавленные заглушки для недостающих действий
    renderMessage: () => { console.log("Action: renderMessage"); },
    sendMessage: () => { console.log("Action: sendMessage"); },
    updateMessage: () => { console.log("Action: updateMessage"); },
    saveStatistics: () => { console.log("Action: saveStatistics"); },
    Log: (context, event) => {
      console.log("LOG:", { context, event });
    },
  },
});
