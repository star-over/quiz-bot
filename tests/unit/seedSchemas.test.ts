import { describe, it, expect } from "vitest";
import { questionSchema, questionsArraySchema } from "../../seed/generation/schemas";

// Минимальный валидный вопрос
function validQuestion(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    choiceType: "single",
    prompt: "What is 2+2?",
    choices: [
      { id: 1, content: "4", score: 1 },
      { id: 2, content: "5", score: 0 },
    ],
    slip: 0.05,
    random: 0.5,
    ...overrides,
  };
}

describe("questionSchema", () => {
  it("валидный вопрос проходит", () => {
    const result = questionSchema.safeParse(validQuestion());
    expect(result.success).toBe(true);
  });

  it("id не целое число — ошибка", () => {
    const result = questionSchema.safeParse(validQuestion({ id: 1.5 }));
    expect(result.success).toBe(false);
  });

  it("пустой prompt — ошибка", () => {
    const result = questionSchema.safeParse(validQuestion({ prompt: "" }));
    expect(result.success).toBe(false);
  });

  it("невалидный choiceType — ошибка", () => {
    const result = questionSchema.safeParse(validQuestion({ choiceType: "multi" }));
    expect(result.success).toBe(false);
  });

  it("менее 2 вариантов — ошибка", () => {
    const result = questionSchema.safeParse(
      validQuestion({ choices: [{ id: 1, content: "A", score: 1 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("нет правильного ответа (score=1) — ошибка", () => {
    const result = questionSchema.safeParse(
      validQuestion({
        choices: [
          { id: 1, content: "A", score: 0 },
          { id: 2, content: "B", score: 0 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("single + 2 правильных ответа — ошибка", () => {
    const result = questionSchema.safeParse(
      validQuestion({
        choiceType: "single",
        choices: [
          { id: 1, content: "A", score: 1 },
          { id: 2, content: "B", score: 1 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("yes_no + 3 варианта — ошибка", () => {
    const result = questionSchema.safeParse(
      validQuestion({
        choiceType: "yes_no",
        choices: [
          { id: 1, content: "Да", score: 1 },
          { id: 2, content: "Нет", score: 0 },
          { id: 3, content: "Может", score: 0 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("yes_no + 2 варианта — OK", () => {
    const result = questionSchema.safeParse(
      validQuestion({
        choiceType: "yes_no",
        choices: [
          { id: 1, content: "Да", score: 1 },
          { id: 2, content: "Нет", score: 0 },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("random >= 1 — ошибка", () => {
    const result = questionSchema.safeParse(validQuestion({ random: 1.0 }));
    expect(result.success).toBe(false);
  });

  it("random < 0 — ошибка", () => {
    const result = questionSchema.safeParse(validQuestion({ random: -0.1 }));
    expect(result.success).toBe(false);
  });

  it("slip нечисловой — ошибка", () => {
    const result = questionSchema.safeParse(
      validQuestion({ slip: "high" }),
    );
    expect(result.success).toBe(false);
  });

  it("дублирующиеся choice.id — ошибка", () => {
    const result = questionSchema.safeParse(
      validQuestion({
        choices: [
          { id: 1, content: "A", score: 1 },
          { id: 1, content: "B", score: 0 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("дублирующийся choice.content — ошибка", () => {
    const result = questionSchema.safeParse(
      validQuestion({
        choices: [
          { id: 1, content: "Same", score: 1 },
          { id: 2, content: "Same", score: 0 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("score не 0 и не 1 — ошибка", () => {
    const result = questionSchema.safeParse(
      validQuestion({
        choices: [
          { id: 1, content: "A", score: 1 },
          { id: 2, content: "B", score: 0.5 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("optional поля (explanation, image) — OK без них", () => {
    const q = validQuestion();
    delete (q as Record<string, unknown>).explanation;
    delete (q as Record<string, unknown>).image;
    const result = questionSchema.safeParse(q);
    expect(result.success).toBe(true);
  });
});

describe("questionsArraySchema", () => {
  it("массив валидных вопросов — OK", () => {
    const questions = [
      validQuestion({ id: 1, random: 0.1 }),
      validQuestion({ id: 2, random: 0.2 }),
    ];
    const result = questionsArraySchema.safeParse(questions);
    expect(result.success).toBe(true);
  });

  it("дублирующиеся question.id — ошибка", () => {
    const questions = [
      validQuestion({ id: 1, random: 0.1 }),
      validQuestion({ id: 1, random: 0.2 }),
    ];
    const result = questionsArraySchema.safeParse(questions);
    expect(result.success).toBe(false);
  });

  it("дублирующиеся random — ошибка", () => {
    const questions = [
      validQuestion({ id: 1, random: 0.123456 }),
      validQuestion({ id: 2, random: 0.123456 }),
    ];
    const result = questionsArraySchema.safeParse(questions);
    expect(result.success).toBe(false);
  });

  it("пустой массив — OK", () => {
    const result = questionsArraySchema.safeParse([]);
    expect(result.success).toBe(true);
  });
});
