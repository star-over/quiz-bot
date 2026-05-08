import { describe, it, expect } from "vitest";
import { initSlots, pickSlot, shouldExit, chooseRefillRole } from "../../convex/focusSlots/focusSlotsPure";

const MS_PER_DAY = 86_400_000;

describe("Focus Slots end-to-end", () => {
  it("full lifecycle: init → pick → answer → exit", () => {
    const now = Date.now();
    const existing = [
      { kcId: "grammar/present_simple", role: "drill" as const, correctStreak: 2, totalAnswers: 4, enteredAt: now },
      { kcId: "grammar/present_time/be_am_is_are", role: "new" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
    ];
    const mastery = new Map([
      ["grammar/present_simple", { kcId: "grammar/present_simple", known: 0.75, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
      ["grammar/present_time/be_am_is_are", { kcId: "grammar/present_time/be_am_is_are", known: 0.20, halfLife: 1, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 1 }],
    ]);

    const afterInit = initSlots({ existingSlots: existing, masteryMap: mastery, now });
    expect(afterInit.length).toBe(2);

    const selected = pickSlot({ slots: afterInit, masteryMap: mastery, now });
    expect(selected?.kcId).toBe("grammar/present_time/be_am_is_are");

    const updatedSlot = { ...selected!, correctStreak: 1, totalAnswers: 2 };
    expect(shouldExit({ correctStreak: updatedSlot.correctStreak })).toBe(false);

    const exitedSlot = { ...updatedSlot, correctStreak: 3, totalAnswers: 4 };
    expect(shouldExit({ correctStreak: exitedSlot.correctStreak })).toBe(true);
  });

  it("timeout removes completed slots during init", () => {
    const now = Date.now();
    const existing = [
      { kcId: "a", role: "drill" as const, correctStreak: 3, totalAnswers: 3, enteredAt: now - 31 * 60 * 1000 },
      { kcId: "b", role: "drill" as const, correctStreak: 1, totalAnswers: 2, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.95, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 3 }],
      ["b", { kcId: "b", known: 0.50, halfLife: 2, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
    ]);

    const result = initSlots({ existingSlots: existing, masteryMap: mastery, now });
    expect(result.length).toBe(1);
    expect(result[0].kcId).toBe("b");
  });
});

describe("chooseRefillRole integration", () => {
  it("when active KC are strong enough, exiting review slot becomes new", () => {
    const now = Date.now();
    const existing = [
      { kcId: "grammar/present_simple", role: "review" as const, correctStreak: 0, totalAnswers: 4, enteredAt: now },
      { kcId: "grammar/be", role: "review" as const, correctStreak: 0, totalAnswers: 4, enteredAt: now },
      { kcId: "grammar/past", role: "review" as const, correctStreak: 3, totalAnswers: 6, enteredAt: now },
    ];
    const mastery = new Map([
      ["grammar/present_simple", { kcId: "grammar/present_simple", known: 0.95, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
      ["grammar/be", { kcId: "grammar/be", known: 0.90, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
      ["grammar/past", { kcId: "grammar/past", known: 0.99, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: true, seenCount: 6 }],
    ]);

    // Simulate init removing the consolidated slot
    const afterInit = initSlots({ existingSlots: existing, masteryMap: mastery, now });
    expect(afterInit.length).toBe(2);
    expect(afterInit.find((s) => s.kcId === "grammar/past")).toBeUndefined();

    // The remaining active slots are both above threshold (0.85)
    const refillRole = chooseRefillRole({ slots: afterInit, masteryMap: mastery, now, defaultRole: "review" });
    expect(refillRole).toBe("new");
  });

  it("when weakest active KC is below threshold, keep default role", () => {
    const now = Date.now();
    const existing = [
      { kcId: "grammar/present_simple", role: "review" as const, correctStreak: 0, totalAnswers: 4, enteredAt: now },
      { kcId: "grammar/be", role: "review" as const, correctStreak: 0, totalAnswers: 4, enteredAt: now },
    ];
    const mastery = new Map([
      ["grammar/present_simple", { kcId: "grammar/present_simple", known: 0.95, halfLife: 64, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
      ["grammar/be", { kcId: "grammar/be", known: 0.50, halfLife: 2, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 4 }],
    ]);

    const refillRole = chooseRefillRole({ slots: existing, masteryMap: mastery, now, defaultRole: "review" });
    expect(refillRole).toBe("review");
  });
});
