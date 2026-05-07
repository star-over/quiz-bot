import { describe, it, expect, vi } from "vitest";
import { createActor } from "xstate";
import { drillMachine } from "../../convex/machines/drillMachine";
import {
  activateDrill,
  deactivateDrill,
  isDrilling,
} from "../../convex/bot/drillLifecycle";
import type { DrillLifecycleDeps, UserRow } from "../../convex/bot/drillLifecycle";

function createStubDeps(
  overrides?: Partial<DrillLifecycleDeps>,
): DrillLifecycleDeps {
  return {
    ensureUser: async () => {},
    getUser: async () => null,
    updateDrillSnapshot: async () => {},
    updateQuestionSnapshot: async () => {},
    deleteMessage: async () => {},
    ...overrides,
  };
}

function user(overrides?: Partial<UserRow>): UserRow {
  return {
    _id: "u1" as any,
    _creationTime: 0,
    telegramId: "123",
    firstName: "Test",
    chatId: 1,
    profileKey: "Test\\0\\0\\0",
    createdAt: 0,
    ...overrides,
  } as UserRow;
}

function makeDrillSnapshot(state: "idle" | "questioning"): string {
  const actor = createActor(drillMachine);
  actor.start();
  if (state === "questioning") {
    actor.send({ type: "START" });
  }
  return JSON.stringify(actor.getSnapshot());
}

describe("activateDrill", () => {
  it("new user → fresh actor → START → save snapshot", async () => {
    const updateDrillSnapshot = vi.fn();
    const deps = createStubDeps({
      getUser: async () => null,
      updateDrillSnapshot,
    });

    await activateDrill({
      deps,
      telegramId: "123",
      profile: { firstName: "Test", chatId: 1 },
    });

    expect(updateDrillSnapshot).toHaveBeenCalledOnce();
    const saved = JSON.parse(updateDrillSnapshot.mock.calls[0]![0].drillSnapshot);
    expect(saved.value).toBe("questioning");
  });

  it("existing idle → START → save snapshot", async () => {
    const updateDrillSnapshot = vi.fn();
    const deps = createStubDeps({
      getUser: async () =>
        user({ drillSnapshot: makeDrillSnapshot("idle") }),
      updateDrillSnapshot,
    });

    await activateDrill({
      deps,
      telegramId: "123",
      profile: { firstName: "Test", chatId: 1 },
    });

    expect(updateDrillSnapshot).toHaveBeenCalledOnce();
    const saved = JSON.parse(updateDrillSnapshot.mock.calls[0]![0].drillSnapshot);
    expect(saved.value).toBe("questioning");
  });

  it("existing questioning + reenter=true → START → save snapshot", async () => {
    const updateDrillSnapshot = vi.fn();
    const deps = createStubDeps({
      getUser: async () =>
        user({ drillSnapshot: makeDrillSnapshot("questioning") }),
      updateDrillSnapshot,
    });

    await activateDrill({
      deps,
      telegramId: "123",
      profile: { firstName: "Test", chatId: 1 },
      reenter: true,
    });

    expect(updateDrillSnapshot).toHaveBeenCalledOnce();
    const saved = JSON.parse(updateDrillSnapshot.mock.calls[0]![0].drillSnapshot);
    expect(saved.value).toBe("questioning");
  });

  it("existing questioning + reenter=false → no send, no save", async () => {
    const updateDrillSnapshot = vi.fn();
    const deps = createStubDeps({
      getUser: async () =>
        user({ drillSnapshot: makeDrillSnapshot("questioning") }),
      updateDrillSnapshot,
    });

    await activateDrill({
      deps,
      telegramId: "123",
      profile: { firstName: "Test", chatId: 1 },
      reenter: false,
    });

    expect(updateDrillSnapshot).not.toHaveBeenCalled();
  });

  it("corrupted snapshot → fresh actor → START → save snapshot", async () => {
    const updateDrillSnapshot = vi.fn();
    const deps = createStubDeps({
      getUser: async () => user({ drillSnapshot: "not-json{" }),
      updateDrillSnapshot,
    });

    await activateDrill({
      deps,
      telegramId: "123",
      profile: { firstName: "Test", chatId: 1 },
    });

    expect(updateDrillSnapshot).toHaveBeenCalledOnce();
    const saved = JSON.parse(updateDrillSnapshot.mock.calls[0]![0].drillSnapshot);
    expect(saved.value).toBe("questioning");
  });
});

describe("deactivateDrill", () => {
  it("questioning → delete message + STOP + save idle snapshot", async () => {
    const updateDrillSnapshot = vi.fn();
    const updateQuestionSnapshot = vi.fn();
    const deleteMessage = vi.fn();
    const deps = createStubDeps({
      getUser: async () =>
        user({
          drillSnapshot: makeDrillSnapshot("questioning"),
          questionSnapshot: JSON.stringify({
            context: { messageId: 42 },
          }),
        }),
      updateDrillSnapshot,
      updateQuestionSnapshot,
      deleteMessage,
    });

    await deactivateDrill({ deps, telegramId: "123", chatId: 1 });

    expect(deleteMessage).toHaveBeenCalledWith({ chatId: 1, messageId: 42 });
    expect(updateQuestionSnapshot).toHaveBeenCalledWith({ telegramId: "123" });
    expect(updateDrillSnapshot).toHaveBeenCalledOnce();
    const saved = JSON.parse(updateDrillSnapshot.mock.calls[0]![0].drillSnapshot);
    expect(saved.value).toBe("idle");
  });

  it("idle → STOP → save idle snapshot", async () => {
    const updateDrillSnapshot = vi.fn();
    const deps = createStubDeps({
      getUser: async () =>
        user({ drillSnapshot: makeDrillSnapshot("idle") }),
      updateDrillSnapshot,
    });

    await deactivateDrill({ deps, telegramId: "123", chatId: 1 });

    expect(updateDrillSnapshot).toHaveBeenCalledOnce();
    const saved = JSON.parse(updateDrillSnapshot.mock.calls[0]![0].drillSnapshot);
    expect(saved.value).toBe("idle");
  });

  it("corrupted snapshots → clear both", async () => {
    const updateDrillSnapshot = vi.fn();
    const updateQuestionSnapshot = vi.fn();
    const deleteMessage = vi.fn();
    const deps = createStubDeps({
      getUser: async () =>
        user({
          drillSnapshot: "bad",
          questionSnapshot: "bad",
        }),
      updateDrillSnapshot,
      updateQuestionSnapshot,
      deleteMessage,
    });

    await deactivateDrill({ deps, telegramId: "123", chatId: 1 });

    expect(deleteMessage).not.toHaveBeenCalled();
    expect(updateQuestionSnapshot).toHaveBeenCalledWith({ telegramId: "123" });
    expect(updateDrillSnapshot).toHaveBeenCalledWith({ telegramId: "123" });
  });
});

describe("isDrilling", () => {
  it("questioning → true", async () => {
    const deps = createStubDeps({
      getUser: async () =>
        user({ drillSnapshot: makeDrillSnapshot("questioning") }),
    });

    const result = await isDrilling({ deps, telegramId: "123" });
    expect(result).toBe(true);
  });

  it("no snapshot → false", async () => {
    const deps = createStubDeps({
      getUser: async () => user({ drillSnapshot: undefined }),
    });

    const result = await isDrilling({ deps, telegramId: "123" });
    expect(result).toBe(false);
  });

  it("idle → false", async () => {
    const deps = createStubDeps({
      getUser: async () =>
        user({ drillSnapshot: makeDrillSnapshot("idle") }),
    });

    const result = await isDrilling({ deps, telegramId: "123" });
    expect(result).toBe(false);
  });

  it("corrupted → clear snapshot → false", async () => {
    const updateDrillSnapshot = vi.fn();
    const deps = createStubDeps({
      getUser: async () => user({ drillSnapshot: "bad" }),
      updateDrillSnapshot,
    });

    const result = await isDrilling({ deps, telegramId: "123" });
    expect(result).toBe(false);
    expect(updateDrillSnapshot).toHaveBeenCalledWith({ telegramId: "123" });
  });
});
