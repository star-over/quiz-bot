import { describe, it, expect } from "vitest";
import { parseCallbackData } from "../../convex/bot/handlers/callbacks/callbackParser";

describe("parseCallbackData", () => {
  it("парсит QA формат: qa:<questionId>:<choiceId>", () => {
    expect(parseCallbackData({ data: "qa:abc123:3" })).toEqual({
      type: "answer",
      choiceId: 3,
    });
  });

  it("парсит YN формат: yn:<questionId>:<choiceId>", () => {
    expect(parseCallbackData({ data: "yn:abc123:1" })).toEqual({
      type: "answer",
      choiceId: 1,
    });
  });

  it("парсит skip формат: skip:<questionId>", () => {
    expect(parseCallbackData({ data: "skip:abc123" })).toEqual({
      type: "skip",
    });
  });

  it("возвращает null для неизвестного префикса", () => {
    expect(parseCallbackData({ data: "unknown:abc123:1" })).toBeNull();
  });

  it("возвращает null для пустой строки", () => {
    expect(parseCallbackData({ data: "" })).toBeNull();
  });

  it("возвращает null если choiceId отсутствует в QA формате", () => {
    expect(parseCallbackData({ data: "qa:abc123" })).toBeNull();
  });

  it("возвращает null если choiceId не число", () => {
    expect(parseCallbackData({ data: "qa:abc123:notanumber" })).toBeNull();
  });

  it("корректно парсит choiceId = 0", () => {
    expect(parseCallbackData({ data: "qa:abc123:0" })).toEqual({
      type: "answer",
      choiceId: 0,
    });
  });
});
