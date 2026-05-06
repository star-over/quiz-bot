import { describe, it, expect, vi } from "vitest";
import { createActor } from "xstate";
import { scqMachine } from "../../convex/machines/scqMachine";
import { deliverQuestion } from "../../convex/questions/answerFlow";
import type { AnswerFlowDeps } from "../../convex/questions/answerFlowTypes";

function stubDeps(overrides: Partial<AnswerFlowDeps> = {}): AnswerFlowDeps {
  return {
    loadQuestionSession: vi.fn().mockResolvedValue(null),
    saveQuestionSession: vi.fn().mockResolvedValue(undefined),
    loadQuestion: vi.fn().mockResolvedValue(null),
    updateMastery: vi.fn().mockResolvedValue([]),
    updateFocusSlots: vi.fn().mockResolvedValue(undefined),
    logResponse: vi.fn().mockResolvedValue(undefined),
    displayQuestion: vi.fn().mockResolvedValue({ messageId: 100, isPhoto: false }),
    displayFeedback: vi.fn().mockResolvedValue(undefined),
    deleteQuestionMessage: vi.fn().mockResolvedValue(undefined),
    advanceDrill: vi.fn().mockResolvedValue(null),
    loadKcCatalog: vi.fn().mockResolvedValue([]),
    loadMasteryForKcs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("deliverQuestion", () => {
  const baseQuestion = {
    _id: "q1" as any,
    prompt: "Test?",
    explanation: "Because.",
    choices: [
      { id: 1, content: "A", score: 1, explanation: "Right" },
      { id: 2, content: "B", score: 0 },
    ],
    choiceType: "single" as const,
    slip: 0.1,
    seedId: 42,
    kcs: ["kc1"],
    telegramFileId: undefined,
    imageStorageId: undefined,
  };

  it("отправляет вопрос и сохраняет сессию", async () => {
    const deps = stubDeps();
    await deliverQuestion({
      deps,
      telegramUserId: "123",
      chatId: 456,
      question: baseQuestion as any,
    });

    expect(deps.displayQuestion).toHaveBeenCalledOnce();
    expect(deps.saveQuestionSession).toHaveBeenCalledOnce();
    const saved = (deps.saveQuestionSession as any).mock.calls[0][0];
    expect(saved.telegramUserId).toBe("123");
    expect(saved.session).toBeDefined();
  });

  it("удаляет старое сообщение если есть активная сессия", async () => {
    const snapshot = await makeScqSnapshot();
    const deps = stubDeps({
      loadQuestionSession: vi.fn().mockResolvedValue({ snapshot }),
    });

    await deliverQuestion({
      deps,
      telegramUserId: "123",
      chatId: 456,
      question: baseQuestion as any,
    });

    expect(deps.deleteQuestionMessage).toHaveBeenCalledWith({ chatId: 456, messageId: 99 });
  });
});

async function makeScqSnapshot(): Promise<unknown> {
  const actor = createActor(scqMachine, {
    input: {
      questionId: "q1",
      prompt: "Test?",
      explanation: undefined,
      choices: [{ id: 1, content: "A", isCorrect: true }],
    },
  });
  actor.start();
  actor.send({ type: "MESSAGE_SENT", messageId: 99, isPhoto: false, shownAt: Date.now() });
  return actor.getSnapshot();
}
