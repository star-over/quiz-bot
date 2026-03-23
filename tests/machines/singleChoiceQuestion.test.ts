import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { singleChoiceQuestionMachine } from "../../convex/machines/singleChoiceQuestion";
import { makeChoices } from "../fixtures/choices";

const INPUT = {
  questionId: "test-q-1",
  prompt: "What is correct?",
  explanation: "Because it is.",
  choices: makeChoices({ count: 3 }),
};

const MESSAGE_SENT_EVENT = {
  type: "MESSAGE_SENT" as const,
  messageId: 42,
  isPhoto: false,
  shownAt: 1000,
};

function startMachine() {
  const actor = createActor(singleChoiceQuestionMachine, { input: INPUT });
  actor.start();
  return actor;
}

describe("singleChoiceQuestionMachine", () => {
  it("стартует в displayingQuestion", () => {
    const actor = startMachine();
    expect(actor.getSnapshot().value).toBe("displayingQuestion");
  });

  it("context инициализируется из input", () => {
    const actor = startMachine();
    const ctx = actor.getSnapshot().context;

    expect(ctx.questionId).toBe("test-q-1");
    expect(ctx.prompt).toBe("What is correct?");
    expect(ctx.choices).toHaveLength(3);
    expect(ctx.messageId).toBeUndefined();
    expect(ctx.selectedChoiceId).toBeUndefined();
  });

  describe("MESSAGE_SENT", () => {
    it("переходит в awaitingAnswer", () => {
      const actor = startMachine();
      actor.send(MESSAGE_SENT_EVENT);
      expect(actor.getSnapshot().value).toBe("awaitingAnswer");
    });

    it("записывает messageId, isPhoto, shownAt в context", () => {
      const actor = startMachine();
      actor.send(MESSAGE_SENT_EVENT);
      const ctx = actor.getSnapshot().context;

      expect(ctx.messageId).toBe(42);
      expect(ctx.isPhoto).toBe(false);
      expect(ctx.shownAt).toBe(1000);
    });
  });

  describe("happy path: ответ на вопрос", () => {
    it("awaitingAnswer → ANSWER_SELECTED → displayingFeedback → FEEDBACK_SHOWN → finish", () => {
      const actor = startMachine();
      actor.send(MESSAGE_SENT_EVENT);
      actor.send({ type: "ANSWER_SELECTED", choiceId: 2 });

      expect(actor.getSnapshot().value).toBe("displayingFeedback");
      expect(actor.getSnapshot().context.selectedChoiceId).toBe(2);

      actor.send({ type: "FEEDBACK_SHOWN" });
      expect(actor.getSnapshot().value).toBe("finish");
      expect(actor.getSnapshot().status).toBe("done");
    });
  });

  describe("skip path: пропуск вопроса", () => {
    it("awaitingAnswer → SKIPPED → displayingFeedback → FEEDBACK_SHOWN → finish", () => {
      const actor = startMachine();
      actor.send(MESSAGE_SENT_EVENT);
      actor.send({ type: "SKIPPED" });

      expect(actor.getSnapshot().value).toBe("displayingFeedback");
      expect(actor.getSnapshot().context.selectedChoiceId).toBeUndefined();

      actor.send({ type: "FEEDBACK_SHOWN" });
      expect(actor.getSnapshot().value).toBe("finish");
    });
  });

  describe("awaitingAnswer имеет тег persist", () => {
    it("состояние awaitingAnswer помечено тегом persist", () => {
      const actor = startMachine();
      actor.send(MESSAGE_SENT_EVENT);

      expect(actor.getSnapshot().tags).toContain("persist");
    });
  });

  describe("snapshot round-trip", () => {
    it("serialize → deserialize → продолжение из awaitingAnswer", () => {
      const actor1 = startMachine();
      actor1.send(MESSAGE_SENT_EVENT);
      const serialized = JSON.stringify(actor1.getSnapshot());

      const persisted = JSON.parse(serialized);
      const actor2 = createActor(singleChoiceQuestionMachine, {
        snapshot: persisted,
        input: persisted.context,
      });
      actor2.start();

      expect(actor2.getSnapshot().value).toBe("awaitingAnswer");
      expect(actor2.getSnapshot().context.messageId).toBe(42);

      actor2.send({ type: "ANSWER_SELECTED", choiceId: 1 });
      expect(actor2.getSnapshot().value).toBe("displayingFeedback");

      actor2.send({ type: "FEEDBACK_SHOWN" });
      expect(actor2.getSnapshot().value).toBe("finish");
    });
  });

  describe("finish сохраняет selectedChoiceId в context", () => {
    it("при ответе — context содержит выбранный choiceId", () => {
      const actor = startMachine();
      actor.send(MESSAGE_SENT_EVENT);
      actor.send({ type: "ANSWER_SELECTED", choiceId: 3 });
      actor.send({ type: "FEEDBACK_SHOWN" });

      expect(actor.getSnapshot().context.selectedChoiceId).toBe(3);
    });

    it("при пропуске — selectedChoiceId остаётся undefined", () => {
      const actor = startMachine();
      actor.send(MESSAGE_SENT_EVENT);
      actor.send({ type: "SKIPPED" });
      actor.send({ type: "FEEDBACK_SHOWN" });

      expect(actor.getSnapshot().context.selectedChoiceId).toBeUndefined();
    });
  });
});
