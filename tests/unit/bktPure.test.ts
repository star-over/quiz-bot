import { describe, it, expect } from "vitest";
import {
  bktUpdate,
  computePriority,
  createInitialMastery,
  PRIOR,
  INITIAL_HALF_LIFE,
  MASTERY_THRESHOLD,
  CONSOLIDATION_HL_THRESHOLD,
  SCHEDULE_THRESHOLD,
  DEFAULT_SLIP,
} from "../../convex/bkt/bktPure";

// Базовый input для переиспользования в тестах.
// KNOWN=0.50, HALF_LIFE=4 дня, 4 варианта, Δt=0 — числовой пример из плана (раздел 5).
const BASE_INPUT = {
  known: 0.50,
  halfLife: 4,
  lastSeen: 1000,
  now: 1000,
  choicesCount: 4,
  slip: 0.10,
  isPrimary: true,
  consolidated: false,
} as const;

const MS_PER_DAY = 86_400_000;

describe("bktUpdate", () => {
  describe("числовой пример из плана (KNOWN=0.50, HL=4д, 4 варианта, Δt=0)", () => {
    it("правильный ответ → known=0.826, hl=8", () => {
      const result = bktUpdate({ ...BASE_INPUT, isCorrect: true });

      // Шаг 2: 0.50×0.90 / (0.50×0.90 + 0.50×0.25) = 0.783
      // Шаг 3: 0.783 + 0.217×0.20 = 0.826
      expect(result.known).toBeCloseTo(0.826, 2);
      expect(result.halfLife).toBe(8);
      expect(result.consolidated).toBe(false);
    });

    it("неправильный ответ → known=0.162, hl=2", () => {
      const result = bktUpdate({ ...BASE_INPUT, isCorrect: false });

      // Шаг 2: 0.50×0.10 / (0.50×0.10 + 0.50×0.75) = 0.118
      // Шаг 3: 0.118 + 0.882×0.05 = 0.162
      expect(result.known).toBeCloseTo(0.162, 2);
      expect(result.halfLife).toBe(2);
      expect(result.consolidated).toBe(false);
    });
  });

  describe("забывание (шаг 1)", () => {
    it("через 1 half-life known падает вдвое перед обновлением", () => {
      const result = bktUpdate({
        ...BASE_INPUT,
        now: BASE_INPUT.lastSeen + 4 * MS_PER_DAY, // Δt = 4 дня = 1 half-life
        isCorrect: true,
      });

      // После забывания: 0.50 × 2^(-1) = 0.25
      // Байес: 0.25×0.90 / (0.25×0.90 + 0.75×0.25) = 0.545
      // Обучение: 0.545 + 0.455×0.20 = 0.636
      expect(result.known).toBeCloseTo(0.636, 2);
    });

    it("Δt=0 — забывание не применяется", () => {
      const withDelta = bktUpdate({ ...BASE_INPUT, isCorrect: true });
      const withoutDelta = bktUpdate({
        ...BASE_INPUT,
        lastSeen: BASE_INPUT.now,
        isCorrect: true,
      });

      expect(withDelta.known).toBeCloseTo(withoutDelta.known, 10);
    });
  });

  describe("secondary KC (isPrimary=false)", () => {
    it("LEARN уменьшен вдвое", () => {
      const primary = bktUpdate({ ...BASE_INPUT, isCorrect: true, isPrimary: true });
      const secondary = bktUpdate({ ...BASE_INPUT, isCorrect: true, isPrimary: false });

      // Secondary получает LEARN×0.5 → known растёт медленнее
      expect(secondary.known).toBeLessThan(primary.known);
      expect(secondary.halfLife).toBe(primary.halfLife); // half-life не зависит от isPrimary
    });
  });

  describe("consolidated KC", () => {
    const consolidated = {
      ...BASE_INPUT,
      known: 0.96,
      halfLife: 128,
      consolidated: true,
    };

    it("правильный ответ → no-op (known и hl не меняются)", () => {
      const result = bktUpdate({ ...consolidated, isCorrect: true });

      expect(result.known).toBe(0.96);
      expect(result.halfLife).toBe(128);
      expect(result.consolidated).toBe(true);
    });

    it("неправильный ответ → де-консолидация", () => {
      const result = bktUpdate({ ...consolidated, isCorrect: false });

      expect(result.known).toBe(0.60);
      expect(result.halfLife).toBe(4);
      expect(result.consolidated).toBe(false);
      expect(result.nextReviewAt).toBe(0); // в активный пул
    });
  });

  describe("консолидация", () => {
    it("known >= 0.95 И hl >= 64 → consolidated", () => {
      // hl=32 → после правильного ×2 = 64, known должен быть >= 0.95
      const result = bktUpdate({
        ...BASE_INPUT,
        known: 0.98,
        halfLife: 32,
        isCorrect: true,
      });

      expect(result.halfLife).toBe(64);
      expect(result.known).toBeGreaterThanOrEqual(MASTERY_THRESHOLD);
      expect(result.consolidated).toBe(true);
      expect(result.nextReviewAt).toBe(Infinity);
    });

    it("known высокий, но hl < 64 → не consolidated", () => {
      const result = bktUpdate({
        ...BASE_INPUT,
        known: 0.98,
        halfLife: 16,
        isCorrect: true,
      });

      expect(result.halfLife).toBe(32);
      expect(result.consolidated).toBe(false);
    });
  });

  describe("exposure-режим (yes_no вопросы)", () => {
    const exposureInput = { ...BASE_INPUT, choicesCount: 2, isExposure: true };

    it("правильный ответ → LEARN_CORRECT_EXPOSURE (0.15), known растёт медленнее", () => {
      const standard = bktUpdate({ ...BASE_INPUT, isCorrect: true });
      const exposure = bktUpdate({ ...exposureInput, isCorrect: true });

      // Exposure: меньше LEARN (0.15 vs 0.20) + слабый Байес (GUESS=0.50)
      expect(exposure.known).toBeLessThan(standard.known);
    });

    it("неправильный ответ → LEARN_WRONG_EXPOSURE (0.10), known падает меньше", () => {
      const standard = bktUpdate({ ...BASE_INPUT, isCorrect: false });
      const exposure = bktUpdate({ ...exposureInput, isCorrect: false });

      // Exposure: больше LEARN_WRONG (0.10 vs 0.05) — ценный педагогический момент
      expect(exposure.known).toBeGreaterThan(standard.known);
    });

    it("half-life обновляется как обычно", () => {
      const correct = bktUpdate({ ...exposureInput, isCorrect: true });
      const wrong = bktUpdate({ ...exposureInput, isCorrect: false });

      expect(correct.halfLife).toBe(8);
      expect(wrong.halfLife).toBe(2);
    });
  });

  describe("half-life", () => {
    it("правильный ответ → ×2", () => {
      const result = bktUpdate({ ...BASE_INPUT, isCorrect: true });
      expect(result.halfLife).toBe(8);
    });

    it("неправильный ответ → ×0.5", () => {
      const result = bktUpdate({ ...BASE_INPUT, isCorrect: false });
      expect(result.halfLife).toBe(2);
    });

    it("half-life не опускается ниже 0.5 дня", () => {
      const result = bktUpdate({
        ...BASE_INPUT,
        halfLife: 0.5,
        isCorrect: false,
      });
      expect(result.halfLife).toBe(0.5);
    });

    it("half-life не превышает HL_MAX (365 дней)", () => {
      const result = bktUpdate({
        ...BASE_INPUT,
        halfLife: 200,
        isCorrect: true,
      });
      expect(result.halfLife).toBe(365);
    });
  });

  describe("nextReviewAt", () => {
    it("known < 0.70 → активный пул (nextReviewAt=0)", () => {
      const result = bktUpdate({ ...BASE_INPUT, isCorrect: false });
      expect(result.known).toBeLessThan(SCHEDULE_THRESHOLD);
      expect(result.nextReviewAt).toBe(0);
    });

    it("known >= 0.70 → расписание (nextReviewAt > now)", () => {
      const result = bktUpdate({
        ...BASE_INPUT,
        known: 0.90,
        halfLife: 8,
        isCorrect: true,
      });
      expect(result.known).toBeGreaterThanOrEqual(SCHEDULE_THRESHOLD);
      expect(result.nextReviewAt).toBeGreaterThan(BASE_INPUT.now);
    });
  });

  describe("GUESS зависит от choicesCount", () => {
    it("6 вариантов → GUESS=1/6, known растёт сильнее при правильном ответе", () => {
      const with4 = bktUpdate({ ...BASE_INPUT, choicesCount: 4, isCorrect: true });
      const with6 = bktUpdate({ ...BASE_INPUT, choicesCount: 6, isCorrect: true });

      // Меньше вероятность угадать → правильный ответ информативнее
      expect(with6.known).toBeGreaterThan(with4.known);
    });
  });

  describe("сходимость от PRIOR", () => {
    it("5 правильных ответов подряд → known > 0.95", () => {
      let known = PRIOR;
      let halfLife = INITIAL_HALF_LIFE;
      let lastSeen = 0;

      for (let i = 0; i < 5; i++) {
        const result = bktUpdate({
          known,
          halfLife,
          lastSeen,
          now: lastSeen,
          isCorrect: true,
          choicesCount: 4,
          slip: DEFAULT_SLIP,
          isPrimary: true,
          consolidated: false,
        });
        known = result.known;
        halfLife = result.halfLife;
      }

      expect(known).toBeGreaterThanOrEqual(MASTERY_THRESHOLD);
    });

    it("серия ошибок → known стабилизируется около пола ~0.058", () => {
      let known = PRIOR;
      let halfLife = INITIAL_HALF_LIFE;
      let lastSeen = 0;

      for (let i = 0; i < 20; i++) {
        const result = bktUpdate({
          known,
          halfLife,
          lastSeen,
          now: lastSeen,
          isCorrect: false,
          choicesCount: 4,
          slip: DEFAULT_SLIP,
          isPrimary: true,
          consolidated: false,
        });
        known = result.known;
        halfLife = result.halfLife;
      }

      // Пол не нулевой (exposure-эффект), но низкий
      expect(known).toBeGreaterThan(0.03);
      expect(known).toBeLessThan(0.10);
    });
  });
});

describe("computePriority", () => {
  it("KC никогда не учил (высокий need, urgency=0)", () => {
    const priority = computePriority({
      known: PRIOR,
      halfLife: INITIAL_HALF_LIFE,
      lastSeen: 1000,
      now: 1000, // Δt=0
    });

    // need = 1 - 0.10 = 0.90, urgency = 0
    // priority = 0.5×0.90 + 0.5×0 = 0.45
    expect(priority).toBeCloseTo(0.45, 2);
  });

  it("KC выучил и забыл (высокие need и urgency)", () => {
    const priority = computePriority({
      known: 0.80,
      halfLife: 2,
      lastSeen: 0,
      now: 4 * MS_PER_DAY, // Δt = 4 дня = 2 half-life
    });

    // После забывания: 0.80 × 2^(-2) = 0.20
    // need = 0.80, urgency = 1 - 2^(-2) = 0.75
    // priority = 0.5×0.80 + 0.5×0.75 = 0.775
    expect(priority).toBeCloseTo(0.775, 2);
  });

  it("KC свежий и хорошо известен → низкий приоритет", () => {
    const priority = computePriority({
      known: 0.95,
      halfLife: 32,
      lastSeen: 0,
      now: 0, // только что ответил
    });

    // need = 0.05, urgency = 0 → priority = 0.025
    expect(priority).toBeCloseTo(0.025, 2);
  });

  it("приоритет всегда в диапазоне [0, 1]", () => {
    const extreme = computePriority({
      known: 0.01,
      halfLife: 0.5,
      lastSeen: 0,
      now: 365 * MS_PER_DAY, // год без практики
    });

    expect(extreme).toBeGreaterThanOrEqual(0);
    expect(extreme).toBeLessThanOrEqual(1);
  });
});

describe("createInitialMastery", () => {
  it("возвращает начальные значения", () => {
    const now = Date.now();
    const mastery = createInitialMastery({ now });

    expect(mastery.known).toBe(PRIOR);
    expect(mastery.halfLife).toBe(INITIAL_HALF_LIFE);
    expect(mastery.nextReviewAt).toBe(0);
    expect(mastery.consolidated).toBe(false);
  });
});
