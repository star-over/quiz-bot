import { test } from "vitest";
import type { SlotFillerDeps } from "../../convex/focusSlots/focusSlotsTypes";

export function createStubDeps(overrides?: Partial<SlotFillerDeps>): SlotFillerDeps {
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

test("stub adapter compiles", () => {
  // Placeholder so vitest doesn't fail with "No test suite found in file".
  // Real tests for fillSlot, initSlots, and updateAfterAnswer will be added in Tasks 6-8.
});
