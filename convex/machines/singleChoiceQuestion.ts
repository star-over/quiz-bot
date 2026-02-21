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
  /** @xstate-layout N4IgpgJg5mDOIC5SwJYDsoBswGEAWA9igMZgCKArnAC4oFoB0sYaE6UAxACoDiA+gCUAogGUACgHkAciKEBtAAwBdRKAAOBVLXqqQAD0QBGABwBmBgBYAbMYBM10wE4FAVitWFFgDQgAnogBaUwB2BitTDysXBVtgj1sEgF9En1QMbHwiUkoaOkZmVnZufmFxaVk5QxUkEA0tPN0DBA9jBlsrQ2DDC1tHF0dbF0MffwQAqwsGZ0cLEwnol17g5NT2DMIScipYbUYwADcAQ0wKQ9oMDkVq9U0UXcbEWNb2mItjTqdjCZHEJwUGboKBTGYKmUz9RxWWwrEBpLC4DbZba7BgAMzAkHYACFDsQANbFQSiSQyeTKXR1O4NGpNEzmMwWYKOMy2TpDZk-ZoKULAiyOYIuCymPkeZYpWFrBFZLa5ehojFsDA4-GE0okipVCm3e40xBvFwMBQRdwM4IC7x+RAuYyTJwdUGQ1wWBSOGFw9bSnI7PJMFgQSAcHgSLh8ACCMgA6kIBFctfUdLqEAlbAC3KDWV17MYXJzuuZQUNhfyEsEQclxWgCP74DV3VLNl6dTd42gHghDODLDZ7OFnG4PBbRgFYoZLBZFu9DG5nVO3ZLMg3kT6CoqoHGqQnQE0M4bgYYjS9PPZOQETJNDAkIoXXGZ+XP0vWkbK9kcTmd2Oum-pHvuGF9TMYdgRKYF5GjmlpJh0DBDHEEyGFYjgzFYYqrA+C5Pt6cropiSq4nin7UluP7-BYbw2qYtiAXyXycuO5jgk4LjBJ4wKCma97wuhMqYYwqLoCgsB4ARm7fkmIRhEyLgARRDFOJyzGOAwpYwcyISQoYhgcR6i7Pr6rCQMJraJgkimxG8GmIbYFHOFYnIUWEzLwY48GCk54LlokQA */
  id: "singleChoiceQuestion",
  initial: "sending",
  context: {} as SingleChoiceQuestionContext,
  states: {
    sending: {
      on: {
        TG_RESPONSE: [{
          target: "sended",
          guard: "isSuccess",
          reenter: true
        }, {
          target: "finish",
          reenter: true,
          actions: "Log"
        }]
      },

      entry: ["renderMessage", "sendMessage"]
    },

    evaluating: {
      entry: ["evaluateAnswer", "saveStatistics"],
      always: "feedingBack",
    },

    feedingBack: {
      entry: ["renderMessage", "updateMessage"],

      on: {
        TG_RESPONSE: [{
          target: "finish",
          guard: "isSuccess"
        }, {
          target: "finish",
          actions: "Log",
          reenter: true
        }]
      }
    },

    finish: {
      type: "final",
      entry: "saveState"
    },

    sended: {
      on: {
        GOT_ANSWER: {
          target: "evaluating",
          actions: "assignSelectedOption",
          reenter: true
        }
      },

      entry: "saveState"
    }
  },
}, {
  actions: {
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
  },
});
