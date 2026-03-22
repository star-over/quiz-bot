import { createMachine } from "xstate";

// Управляет жизненным циклом drill — бесконечной подачи вопросов.
// idle: бот молчит, вопросов нет.
// questioning: вопрос отправлен, ждём ответа. После ответа — следующий вопрос.
export const drillMachine = createMachine({
  id: "drill",
  initial: "idle",

  types: {} as {
    events:
      | { type: "START" }
      | { type: "STOP" };
  },

  states: {
    idle: {
      on: { START: "questioning" },
    },
    questioning: {
      on: {
        STOP: "idle",
        START: "questioning", // re-entry при повторном /start
      },
    },
  },
});
