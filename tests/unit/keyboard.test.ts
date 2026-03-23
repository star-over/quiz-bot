import { describe, it, expect } from "vitest";
import {
  canUseInlineLabels,
  makeSingleChoiceKeyboard,
  makeYesNoKeyboard,
} from "../../convex/bot/keyboard";
import type { Id } from "../../convex/_generated/dataModel";

const questionId = "test-question-id" as Id<"questions">;

describe("canUseInlineLabels", () => {
  it("true для коротких текстовых вариантов", () => {
    expect(canUseInlineLabels([{ content: "Yes" }, { content: "No" }])).toBe(true);
  });

  it("false если вариант содержит HTML", () => {
    expect(canUseInlineLabels([{ content: "<b>Bold</b>" }])).toBe(false);
  });

  it("false если вариант содержит HTML entity", () => {
    expect(canUseInlineLabels([{ content: "A &amp; B" }])).toBe(false);
  });

  it("false если вариант длиннее 24 графем", () => {
    const longContent = "A".repeat(25);
    expect(canUseInlineLabels([{ content: longContent }])).toBe(false);
  });

  it("true для 24 графем ровно", () => {
    const content = "A".repeat(24);
    expect(canUseInlineLabels([{ content }])).toBe(true);
  });

  it("считает emoji как одну графему", () => {
    // 23 символа + 1 emoji = 24 графемы
    const content = "A".repeat(23) + "🎉";
    expect(canUseInlineLabels([{ content }])).toBe(true);
  });
});

describe("makeSingleChoiceKeyboard", () => {
  const choices = [
    { id: 1, content: "Apple", isCorrect: true },
    { id: 2, content: "Banana", isCorrect: false },
  ];

  it("создаёт кнопки с callback_data формата qa:<questionId>:<choiceId>", () => {
    const kb = makeSingleChoiceKeyboard({ choices, questionId, useInlineLabels: true });
    const rows = kb.inline_keyboard;

    expect(rows[0]?.[0]?.callback_data).toBe(`qa:${questionId}:1`);
    expect(rows[1]?.[0]?.callback_data).toBe(`qa:${questionId}:2`);
  });

  it("при useInlineLabels=true показывает content как label", () => {
    const kb = makeSingleChoiceKeyboard({ choices, questionId, useInlineLabels: true });
    const rows = kb.inline_keyboard;

    expect(rows[0]?.[0]?.text).toBe("Apple");
    expect(rows[1]?.[0]?.text).toBe("Banana");
  });

  it("при useInlineLabels=false показывает порядковый номер как label", () => {
    const kb = makeSingleChoiceKeyboard({ choices, questionId, useInlineLabels: false });
    const rows = kb.inline_keyboard;

    expect(rows[0]?.[0]?.text).toBe("1");
    expect(rows[1]?.[0]?.text).toBe("2");
  });

  it("последняя строка — кнопка Пропустить", () => {
    const kb = makeSingleChoiceKeyboard({ choices, questionId, useInlineLabels: true });
    const rows = kb.inline_keyboard;
    const lastRow = rows.at(-1);

    expect(lastRow?.[0]?.text).toContain("Пропустить");
    expect(lastRow?.[0]?.callback_data).toBe(`skip:${questionId}`);
  });
});

describe("makeYesNoKeyboard", () => {
  const choices = [
    { id: 1, content: "Да", isCorrect: true },
    { id: 2, content: "Нет", isCorrect: false },
  ];

  it("создаёт кнопки с callback_data формата yn:<questionId>:<choiceId>", () => {
    const kb = makeYesNoKeyboard({ choices, questionId });
    const rows = kb.inline_keyboard;
    // Да и Нет в одной строке
    const yesNoRow = rows[0];

    expect(yesNoRow?.[0]?.callback_data).toBe(`yn:${questionId}:1`);
    expect(yesNoRow?.[1]?.callback_data).toBe(`yn:${questionId}:2`);
  });

  it("последняя строка — кнопка Пропустить", () => {
    const kb = makeYesNoKeyboard({ choices, questionId });
    const rows = kb.inline_keyboard;
    const lastRow = rows.at(-1);

    expect(lastRow?.[0]?.text).toContain("Пропустить");
    expect(lastRow?.[0]?.callback_data).toBe(`skip:${questionId}`);
  });
});
