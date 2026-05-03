import { describe, it, expect } from "vitest";
import { validateTelegramHtml } from "../../seed/generation/schemas";

describe("validateTelegramHtml", () => {
  describe("допустимые теги", () => {
    it("простой текст без тегов — OK", () => {
      expect(validateTelegramHtml({ html: "Hello world" })).toEqual([]);
    });

    it("<b> и <i> — OK", () => {
      expect(validateTelegramHtml({ html: "<b>bold</b> and <i>italic</i>" })).toEqual([]);
    });

    it("<u>, <s>, <code>, <pre> — OK", () => {
      expect(validateTelegramHtml({ html: "<u>underline</u> <s>strike</s> <code>code</code> <pre>pre</pre>" })).toEqual([]);
    });

    it("<strong>, <em>, <ins>, <del>, <strike> — OK (синонимы)", () => {
      expect(validateTelegramHtml({ html: "<strong>b</strong> <em>i</em> <ins>u</ins> <del>s</del> <strike>s</strike>" })).toEqual([]);
    });

    it("<a href='...'> — OK", () => {
      expect(validateTelegramHtml({ html: '<a href="https://example.com">link</a>' })).toEqual([]);
    });

    it("<tg-spoiler> — OK", () => {
      expect(validateTelegramHtml({ html: "<tg-spoiler>hidden</tg-spoiler>" })).toEqual([]);
    });

    it("<blockquote> — OK", () => {
      expect(validateTelegramHtml({ html: "<blockquote>quote</blockquote>" })).toEqual([]);
    });

    it("вложенные теги — OK", () => {
      expect(validateTelegramHtml({ html: "<b>bold <i>italic</i></b>" })).toEqual([]);
    });
  });

  describe("недопустимые теги", () => {
    it("<div> — ошибка", () => {
      const errors = validateTelegramHtml({ html: "<div>text</div>" });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("<div>");
    });

    it("<script> — ошибка", () => {
      const errors = validateTelegramHtml({ html: "<script>alert(1)</script>" });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("<script>");
    });

    it("<p> — ошибка", () => {
      const errors = validateTelegramHtml({ html: "<p>paragraph</p>" });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("<p>");
    });

    it("<img> — ошибка", () => {
      const errors = validateTelegramHtml({ html: '<img src="x.png">' });
      expect(errors.some((e) => e.includes("<img>"))).toBe(true);
    });
  });

  describe("недопустимые атрибуты", () => {
    it("<b class='...'> — ошибка (b не принимает атрибутов)", () => {
      const errors = validateTelegramHtml({ html: '<b class="red">bold</b>' });
      expect(errors.some((e) => e.includes("class") && e.includes("<b>"))).toBe(true);
    });

    it("<a> без атрибутов — OK (технически допустимо)", () => {
      expect(validateTelegramHtml({ html: "<a>text</a>" })).toEqual([]);
    });

    it("<a onclick='...'> — ошибка", () => {
      const errors = validateTelegramHtml({ html: '<a onclick="alert(1)">link</a>' });
      expect(errors.some((e) => e.includes("onclick"))).toBe(true);
    });
  });

  describe("баланс тегов", () => {
    it("незакрытый <b> — ошибка", () => {
      const errors = validateTelegramHtml({ html: "<b>bold" });
      expect(errors.some((e) => e.includes("незакрытый"))).toBe(true);
    });

    it("лишний </b> — ошибка", () => {
      const errors = validateTelegramHtml({ html: "text</b>" });
      expect(errors.some((e) => e.includes("неожиданный"))).toBe(true);
    });

    it("неправильный порядок закрытия — ошибка", () => {
      const errors = validateTelegramHtml({ html: "<b><i>text</b></i>" });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("экранирование &", () => {
    it("&amp; — OK", () => {
      expect(validateTelegramHtml({ html: "A &amp; B" })).toEqual([]);
    });

    it("&lt; &gt; &quot; — OK", () => {
      expect(validateTelegramHtml({ html: "&lt;tag&gt; &quot;quoted&quot;" })).toEqual([]);
    });

    it("&#123; — OK (числовая entity)", () => {
      expect(validateTelegramHtml({ html: "char &#123;" })).toEqual([]);
    });

    it("&#x1F600; — OK (hex entity)", () => {
      expect(validateTelegramHtml({ html: "emoji &#x1F600;" })).toEqual([]);
    });

    it("неэкранированный & — ошибка", () => {
      const errors = validateTelegramHtml({ html: "A & B" });
      expect(errors.some((e) => e.includes("&"))).toBe(true);
    });
  });

  describe("интеграция с Zod-схемой questionSchema", () => {
    it("вопрос с недопустимым тегом в prompt — ошибка", async () => {
      const { questionSchema } = await import("../../seed/generation/schemas");
      const result = questionSchema.safeParse({
        id: 1,
        choiceType: "single",
        prompt: "<div>Bad tag</div>",
        choices: [
          { id: 1, content: "A", score: 1 },
          { id: 2, content: "B", score: 0 },
        ],
        slip: 0.05,
        random: 0.5,
      });
      expect(result.success).toBe(false);
    });

    it("вопрос с недопустимым тегом в choice.explanation — ошибка", async () => {
      const { questionSchema } = await import("../../seed/generation/schemas");
      const result = questionSchema.safeParse({
        id: 1,
        choiceType: "single",
        prompt: "Valid prompt",
        choices: [
          { id: 1, content: "A", score: 1, explanation: "<script>xss</script>" },
          { id: 2, content: "B", score: 0 },
        ],
        slip: 0.05,
        random: 0.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("длина строки", () => {
    it("prompt > 4096 символов — ошибка", async () => {
      const { questionSchema } = await import("../../seed/generation/schemas");
      const result = questionSchema.safeParse({
        id: 1,
        choiceType: "single",
        prompt: "a".repeat(4097),
        choices: [
          { id: 1, content: "A", score: 1 },
          { id: 2, content: "B", score: 0 },
        ],
        slip: 0.05,
        random: 0.5,
      });
      expect(result.success).toBe(false);
    });

    it("choice.content > 4096 символов — ошибка", async () => {
      const { questionSchema } = await import("../../seed/generation/schemas");
      const result = questionSchema.safeParse({
        id: 1,
        choiceType: "single",
        prompt: "Valid",
        choices: [
          { id: 1, content: "b".repeat(4097), score: 1 },
          { id: 2, content: "B", score: 0 },
        ],
        slip: 0.05,
        random: 0.5,
      });
      expect(result.success).toBe(false);
    });
  });
});
