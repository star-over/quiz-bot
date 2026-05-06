import { describe, it, expect } from "vitest";
import { fillSlot, initSlots, updateAfterAnswer } from "../../convex/focusSlots/focusSlotsImpl";
import type { FocusSlot } from "../../convex/focusSlots/focusSlotsPure";
import type { MasteryRow, UserRow } from "../../convex/focusSlots/focusSlotsTypes";
import type { SlotFillerDeps } from "../../convex/focusSlots/focusSlotsTypes";

function createStubDeps(overrides?: Partial<SlotFillerDeps>): SlotFillerDeps {
  return {
    getUser: async () => null,
    updateUser: async () => {},
    getActivePool: async () => [],
    getDueReview: async () => [],
    getEarlyReview: async () => [],
    getFreshKcs: async () => [],
    getFragileConsolidated: async () => [],
    getRandomConsolidated: async () => [],
    getMastery: async () => null,
    getKcCatalogWindow: async () => [],
    getAllKcCatalog: async () => [],
    getKcById: async () => null,
    getSeenKcIds: async () => [],
    getKcIdsWithQuestions: async () => new Set(),
    ...overrides,
  };
}

const now = 1_000_000;

function m(kcId: string, overrides?: Partial<MasteryRow>): MasteryRow {
  return {
    kcId,
    known: 0.5,
    halfLife: 4,
    lastSeen: now,
    nextReviewAt: 0,
    consolidated: false,
    seenCount: 1,
    ...overrides,
  };
}

describe("fillSlot drill role", () => {
  it("active pool hit → returns drill slot", async () => {
    const deps = createStubDeps({
      getActivePool: async () => [m("a", { known: 0.3 })],
      getKcIdsWithQuestions: async () => new Set(["a"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "drill", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("a");
    expect(result?.role).toBe("drill");
  });

  it("active empty, due review hit → returns drill slot", async () => {
    const deps = createStubDeps({
      getActivePool: async () => [],
      getDueReview: async () => [m("b", { known: 0.4 })],
      getKcIdsWithQuestions: async () => new Set(["b"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "drill", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("b");
    expect(result?.role).toBe("drill");
  });

  it("excludes occupied KC ids", async () => {
    const deps = createStubDeps({
      getActivePool: async (_uid, opts) => {
        const all = [m("a", { known: 0.3 }), m("b", { known: 0.2 })];
        if (!opts?.excludeKcIds?.length) return all;
        const exclude = new Set(opts.excludeKcIds);
        return all.filter((r) => !exclude.has(r.kcId));
      },
      getKcIdsWithQuestions: async () => new Set(["a", "b"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "drill", occupiedKcIds: ["a"], now });
    expect(result?.kcId).toBe("b");
  });

  it("active empty, due empty → falls back to review path (early review)", async () => {
    const deps = createStubDeps({
      getActivePool: async () => [],
      getDueReview: async () => [],
      getEarlyReview: async () => [m("c", { known: 0.8 })],
      getKcIdsWithQuestions: async () => new Set(["c"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "drill", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("c");
    expect(result?.role).toBe("review");
  });
});

describe("fillSlot new role", () => {
  it("curriculum window hit → returns new slot", async () => {
    const deps = createStubDeps({
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [{ kcId: "n1", sortOrder: 1 }],
      getSeenKcIds: async () => [],
      getKcIdsWithQuestions: async () => new Set(["n1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "new", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("n1");
    expect(result?.role).toBe("new");
  });

  it("window empty, extended fallback hit → returns new slot", async () => {
    const deps = createStubDeps({
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [],
      getAllKcCatalog: async () => [{ kcId: "n2", sortOrder: 2 }],
      getSeenKcIds: async () => [],
      getKcIdsWithQuestions: async () => new Set(["n2"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "new", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("n2");
    expect(result?.role).toBe("new");
  });

  it("window empty, extended empty → falls back to review", async () => {
    const deps = createStubDeps({
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [],
      getAllKcCatalog: async () => [],
      getSeenKcIds: async () => [],
      getEarlyReview: async () => [m("r1")],
      getKcIdsWithQuestions: async () => new Set(["r1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "new", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("r1");
    expect(result?.role).toBe("review");
  });
});

describe("fillSlot review role cascade", () => {
  it("early review hit", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [m("e1", { known: 0.75 })],
      getKcIdsWithQuestions: async () => new Set(["e1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("e1");
  });

  it("early empty, fresh hit", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [],
      getFreshKcs: async () => [m("f1", { lastSeen: now - 1 * 86_400_000, seenCount: 2 })],
      getKcIdsWithQuestions: async () => new Set(["f1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("f1");
  });

  it("early empty, fresh empty, fragile hit", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [],
      getFreshKcs: async () => [],
      getFragileConsolidated: async () => [m("g1", { consolidated: true, halfLife: 8 })],
      getKcIdsWithQuestions: async () => new Set(["g1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("g1");
  });

  it("all consolidated empty, wide window unseen hit", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [],
      getFreshKcs: async () => [],
      getFragileConsolidated: async () => [],
      getRandomConsolidated: async () => [],
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [{ kcId: "w1", sortOrder: 5 }],
      getSeenKcIds: async () => [],
      getKcIdsWithQuestions: async () => new Set(["w1"]),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result?.kcId).toBe("w1");
  });

  it("all empty → returns null", async () => {
    const deps = createStubDeps({
      getEarlyReview: async () => [],
      getFreshKcs: async () => [],
      getFragileConsolidated: async () => [],
      getRandomConsolidated: async () => [],
      getUser: async () => ({ _id: "u1", telegramId: "u1", curriculumPointer: 0 } as UserRow),
      getKcCatalogWindow: async () => [],
      getAllKcCatalog: async () => [],
      getSeenKcIds: async () => [],
      getKcIdsWithQuestions: async () => new Set(),
    });
    const result = await fillSlot({ deps, telegramUserId: "u1", role: "review", occupiedKcIds: [], now });
    expect(result).toBeNull();
  });
});

describe("initSlots", () => {
  it("filters consolidated slots and refills", async () => {
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 0, totalAnswers: 1, enteredAt: now },
            { kcId: "b", role: "drill", correctStreak: 3, totalAnswers: 3, enteredAt: now },
          ],
          curriculumPointer: 0,
        } as UserRow),
      getMastery: async (_uid, kcId) => {
        if (kcId === "a") return m("a", { consolidated: false });
        if (kcId === "b") return m("b", { consolidated: true });
        return null;
      },
      getKcIdsWithQuestions: async () => new Set(["a", "new1"]),
      getActivePool: async () => [m("new1", { known: 0.3 })],
    });

    const result = await initSlots({ deps, telegramUserId: "u1", now });
    expect(result.map((s) => s.kcId)).toContain("a");
    expect(result.map((s) => s.kcId)).toContain("new1");
    expect(result.map((s) => s.kcId)).not.toContain("b");
    expect(result.length).toBe(2);
  });

  it("bumps curriculumPointer for new slots", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [],
          curriculumPointer: 0,
        } as UserRow),
      getKcIdsWithQuestions: async () => new Set(["n1"]),
      getKcCatalogWindow: async () => [{ kcId: "n1", sortOrder: 5 }],
      getSeenKcIds: async () => [],
      getKcById: async (kcId) => (kcId === "n1" ? { kcId: "n1", sortOrder: 5 } : null),
      getActivePool: async () => [m("drill1", { known: 0.3 })],
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
    });

    await initSlots({ deps, telegramUserId: "u1", now });
    expect(capturedPatch?.curriculumPointer).toBe(5);
  });

  it("throws when user not found", async () => {
    const deps = createStubDeps({ getUser: async () => null });
    await expect(initSlots({ deps, telegramUserId: "u1", now })).rejects.toThrow("not found");
  });
});

describe("updateAfterAnswer", () => {
  it("wrong answer → streak 0, slot stays", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 2, totalAnswers: 2, enteredAt: now },
          ],
        } as UserRow),
      getMastery: async () => m("a", { consolidated: false }),
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
    });

    await updateAfterAnswer({ deps, telegramUserId: "u1", kcId: "a", isCorrect: false, now });
    const slots = capturedPatch?.focusSlots as FocusSlot[];
    expect(slots[0].correctStreak).toBe(0);
    expect(slots[0].totalAnswers).toBe(3);
  });

  it("correct x3 → exit + refill with default role", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 2, totalAnswers: 2, enteredAt: now },
          ],
        } as UserRow),
      getMastery: async () => m("a", { consolidated: false }),
      getActivePool: async () => [m("b", { known: 0.3 })],
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
      getKcIdsWithQuestions: async () => new Set(["b"]),
    });

    await updateAfterAnswer({ deps, telegramUserId: "u1", kcId: "a", isCorrect: true, now });
    const slots = capturedPatch?.focusSlots as FocusSlot[];
    expect(slots.length).toBe(1);
    expect(slots[0].kcId).toBe("b");
    expect(slots[0].role).toBe("drill");
  });

  it("consolidated mastery → exit + refill", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 0, totalAnswers: 1, enteredAt: now },
          ],
        } as UserRow),
      getMastery: async () => m("a", { consolidated: true }),
      getActivePool: async () => [m("b", { known: 0.3 })],
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
      getKcIdsWithQuestions: async () => new Set(["b"]),
    });

    await updateAfterAnswer({ deps, telegramUserId: "u1", kcId: "a", isCorrect: true, now });
    const slots = capturedPatch?.focusSlots as FocusSlot[];
    expect(slots[0].kcId).toBe("b");
  });

  it("all active above 0.85 → chooseRefillRole returns new", async () => {
    let capturedPatch: Record<string, unknown> | undefined;
    const deps = createStubDeps({
      getUser: async () =>
        ({
          _id: "uid",
          telegramId: "u1",
          focusSlots: [
            { kcId: "a", role: "drill", correctStreak: 3, totalAnswers: 3, enteredAt: now },
            { kcId: "b", role: "review", correctStreak: 0, totalAnswers: 1, enteredAt: now },
          ],
          curriculumPointer: 0,
        } as UserRow),
      getMastery: async (_uid, kcId) => {
        if (kcId === "b") return m("b", { known: 0.9, halfLife: 64 });
        return null;
      },
      getKcCatalogWindow: async () => [{ kcId: "n1", sortOrder: 1 }],
      getSeenKcIds: async () => [],
      getKcById: async () => null,
      updateUser: async (_uid, patch) => {
        capturedPatch = patch;
      },
      getKcIdsWithQuestions: async () => new Set(["n1"]),
    });

    await updateAfterAnswer({ deps, telegramUserId: "u1", kcId: "a", isCorrect: true, now });
    const slots = capturedPatch?.focusSlots as FocusSlot[];
    const newSlot = slots.find((s) => s.kcId === "n1");
    expect(newSlot?.role).toBe("new");
  });
});
