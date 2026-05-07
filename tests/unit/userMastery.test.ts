import { describe, it, expect, vi } from "vitest";
import {
  updateMastery,
  getMasteryForKcs,
} from "../../convex/userMastery/userMasteryImpl";
import type { MasteryDeps, MasteryRow } from "../../convex/userMastery/userMasteryTypes";
import type { Id } from "../../convex/_generated/dataModel";

function createStubDeps(overrides: Partial<MasteryDeps> = {}): MasteryDeps {
  return {
    getQuestion: vi.fn().mockResolvedValue(null),
    getQuestionKcs: vi.fn().mockResolvedValue([]),
    getMastery: vi.fn().mockResolvedValue(null),
    patchMastery: vi.fn().mockResolvedValue(undefined),
    insertMastery: vi.fn().mockResolvedValue("m1" as Id<"userMastery">),
    ...overrides,
  };
}

const baseQuestion = {
  _id: "q1" as Id<"questions">,
  prompt: "Test?",
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

function createExistingMastery(overrides?: Partial<MasteryRow>): MasteryRow {
  return {
    _id: "m1" as Id<"userMastery">,
    telegramUserId: "u1",
    kcId: "kc1",
    known: 0.5,
    halfLife: 4,
    lastSeen: 1_000_000,
    nextReviewAt: 0,
    consolidated: false,
    seenCount: 3,
    ...overrides,
  };
}

const now = 2_000_000;

describe("updateMastery", () => {
  it("new KC → before = initial, after = post-bkt, insertMastery called", async () => {
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([{ kcId: "kc1", isPrimary: true }]),
      getMastery: vi.fn().mockResolvedValue(null),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results).toHaveLength(1);
    expect(results[0].kcId).toBe("kc1");
    expect(results[0].before).toEqual({ known: 0.1, halfLife: 1.0 });
    expect(results[0].after.known).toBeGreaterThan(0.1);
    expect(deps.insertMastery).toHaveBeenCalledOnce();
    const inserted = vi.mocked(deps.insertMastery).mock.calls[0][0];
    expect(inserted.seenCount).toBe(1);
    expect(inserted.telegramUserId).toBe("u1");
  });

  it("existing KC → before + after, patchMastery called, seenCount incremented", async () => {
    const existing = createExistingMastery();
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([{ kcId: "kc1", isPrimary: true }]),
      getMastery: vi.fn().mockResolvedValue(existing),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results).toHaveLength(1);
    expect(results[0].before).toEqual({ known: 0.5, halfLife: 4 });
    expect(results[0].after.known).not.toBe(0.5);
    expect(deps.patchMastery).toHaveBeenCalledOnce();
    const patched = vi.mocked(deps.patchMastery).mock.calls[0][1];
    expect(patched.seenCount).toBe(4);
    expect(patched.lastSeen).toBe(now);
  });

  it("Infinity nextReviewAt → sentinel date in patch/insert", async () => {
    // KC that will become consolidated after this correct answer → nextReviewAt = Infinity
    const existing = createExistingMastery({
      known: 0.96,
      halfLife: 60,
      consolidated: false,
    });
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([{ kcId: "kc1", isPrimary: true }]),
      getMastery: vi.fn().mockResolvedValue(existing),
    });

    await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    const patched = vi.mocked(deps.patchMastery).mock.calls[0][1];
    expect(patched.nextReviewAt).toBe(32503680000000);
  });

  it("question not found → throws Error", async () => {
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(null),
    });

    await expect(
      updateMastery({
        deps,
        telegramUserId: "u1",
        questionId: "q1" as Id<"questions">,
        isCorrect: true,
        respondedAt: now,
      }),
    ).rejects.toThrow("Question q1 not found");
  });

  it("question without KCs → returns [], no DB writes", async () => {
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([]),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results).toEqual([]);
    expect(deps.patchMastery).not.toHaveBeenCalled();
    expect(deps.insertMastery).not.toHaveBeenCalled();
  });

  it("multiple KCs → processes all, returns array with entries", async () => {
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([
        { kcId: "kc1", isPrimary: true },
        { kcId: "kc2", isPrimary: false },
      ]),
      getMastery: vi.fn().mockImplementation((_uid, kcId) => {
        if (kcId === "kc1") return createExistingMastery({ kcId: "kc1" });
        return null;
      }),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.kcId)).toContain("kc1");
    expect(results.map((r) => r.kcId)).toContain("kc2");
    expect(deps.patchMastery).toHaveBeenCalledOnce();
    expect(deps.insertMastery).toHaveBeenCalledOnce();
  });

  it("consolidated + correct → patch with unchanged known/halfLife, updated lastSeen", async () => {
    const existing = createExistingMastery({
      known: 0.99,
      halfLife: 128,
      consolidated: true,
    });
    const deps = createStubDeps({
      getQuestion: vi.fn().mockResolvedValue(baseQuestion),
      getQuestionKcs: vi.fn().mockResolvedValue([{ kcId: "kc1", isPrimary: true }]),
      getMastery: vi.fn().mockResolvedValue(existing),
    });

    const results = await updateMastery({
      deps,
      telegramUserId: "u1",
      questionId: "q1" as Id<"questions">,
      isCorrect: true,
      respondedAt: now,
    });

    expect(results[0].before.known).toBe(0.99);
    expect(results[0].after.known).toBe(0.99);
    expect(results[0].before.halfLife).toBe(128);
    expect(results[0].after.halfLife).toBe(128);
    const patched = vi.mocked(deps.patchMastery).mock.calls[0][1];
    expect(patched.lastSeen).toBe(now);
    expect(patched.seenCount).toBe(4);
  });
});

describe("getMasteryForKcs", () => {
  it("filters nulls and maps fields correctly", async () => {
    const deps = createStubDeps({
      getMastery: vi.fn().mockImplementation((_uid, kcId) => {
        if (kcId === "kc1") return createExistingMastery({ kcId: "kc1" });
        return null;
      }),
    });

    const results = await getMasteryForKcs({
      deps,
      telegramUserId: "u1",
      kcIds: ["kc1", "kc2"],
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      kcId: "kc1",
      known: 0.5,
      halfLife: 4,
      consolidated: false,
    });
  });
});
