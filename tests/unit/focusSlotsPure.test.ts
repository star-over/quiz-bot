import { describe, it, expect } from "vitest";
import {
  computeCurrentKnown,
  shouldExit,
  pickSlot,
  initSlots,
  EXIT_STREAK,
  NEW_KC_KNOWN_THRESHOLD,
  chooseRefillRole,
} from "../../convex/focusSlots/focusSlotsPure";

const MS_PER_DAY = 86_400_000;

describe("computeCurrentKnown", () => {
  it("Δt=0 → known без изменений", () => {
    expect(computeCurrentKnown({ known: 0.80, halfLife: 4, lastSeen: 1000, now: 1000 })).toBe(0.80);
  });

  it("через 1 half-life → known падает вдвое", () => {
    expect(
      computeCurrentKnown({ known: 0.80, halfLife: 4, lastSeen: 0, now: 4 * MS_PER_DAY })
    ).toBeCloseTo(0.40, 2);
  });
});

describe("shouldExit", () => {
  it("correctStreak >= EXIT_STREAK → true", () => {
    expect(shouldExit({ correctStreak: EXIT_STREAK, consolidated: false })).toBe(true);
  });

  it("consolidated → true", () => {
    expect(shouldExit({ correctStreak: 0, consolidated: true })).toBe(true);
  });

  it("low streak and not consolidated → false", () => {
    expect(shouldExit({ correctStreak: 2, consolidated: false })).toBe(false);
  });
});

describe("pickSlot", () => {
  const now = Date.now();
  const slots = [
    { kcId: "a", role: "drill" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
    { kcId: "b", role: "drill" as const, correctStreak: 1, totalAnswers: 2, enteredAt: now },
  ];
  const mastery = new Map([
    ["a", { kcId: "a", known: 0.30, halfLife: 2, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 1 }],
    ["b", { kcId: "b", known: 0.80, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
  ]);

  it("выбирает слот с min(currentKnown)", () => {
    const result = pickSlot({ slots, masteryMap: mastery, now });
    expect(result?.kcId).toBe("a");
  });

  it("все exit → возвращает null", () => {
    const allExit = slots.map((s) => ({ ...s, correctStreak: EXIT_STREAK }));
    const result = pickSlot({ slots: allExit, masteryMap: mastery, now });
    expect(result).toBeNull();
  });
});

describe("initSlots", () => {
  it("сбрасывает exit-слоты и оставляет активные", () => {
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

describe("chooseRefillRole", () => {
  const now = Date.now();

  it("returns 'new' when all active slots are above threshold", () => {
    const slots = [
      { kcId: "a", role: "review" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
      { kcId: "b", role: "review" as const, correctStreak: 0, totalAnswers: 2, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.90, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 1 }],
      ["b", { kcId: "b", known: 0.92, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
    ]);

    const result = chooseRefillRole({ slots, masteryMap: mastery, now, defaultRole: "review" });
    expect(result).toBe("new");
  });

  it("returns defaultRole when weakest active slot is below threshold", () => {
    const slots = [
      { kcId: "a", role: "review" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
      { kcId: "b", role: "review" as const, correctStreak: 0, totalAnswers: 2, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.90, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 1 }],
      ["b", { kcId: "b", known: 0.50, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
    ]);

    const result = chooseRefillRole({ slots, masteryMap: mastery, now, defaultRole: "review" });
    expect(result).toBe("review");
  });

  it("ignores consolidated slots when computing min known", () => {
    const slots = [
      { kcId: "a", role: "review" as const, correctStreak: 0, totalAnswers: 1, enteredAt: now },
      { kcId: "b", role: "review" as const, correctStreak: 0, totalAnswers: 2, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.20, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: true, seenCount: 1 }],
      ["b", { kcId: "b", known: 0.92, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 2 }],
    ]);

    const result = chooseRefillRole({ slots, masteryMap: mastery, now, defaultRole: "review" });
    expect(result).toBe("new");
  });

  it("returns defaultRole when no active slots remain", () => {
    const slots = [
      { kcId: "a", role: "review" as const, correctStreak: 3, totalAnswers: 3, enteredAt: now },
      { kcId: "b", role: "review" as const, correctStreak: 3, totalAnswers: 3, enteredAt: now },
    ];
    const mastery = new Map([
      ["a", { kcId: "a", known: 0.90, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 3 }],
      ["b", { kcId: "b", known: 0.92, halfLife: 8, lastSeen: now, nextReviewAt: 0, consolidated: false, seenCount: 3 }],
    ]);

    const result = chooseRefillRole({ slots, masteryMap: mastery, now, defaultRole: "drill" });
    expect(result).toBe("drill");
  });
});
