/**
 * Zod-схемы для валидации seed/questions.json.
 * Чистые функции — без I/O (fs, network). Проверка файлов — в validate.ts.
 */
import { z } from "zod";

// === Telegram HTML validation ===

// Допустимые теги Telegram Bot API (HTML parse_mode)
// https://core.telegram.org/bots/api#html-style
const ALLOWED_TAGS = new Set([
  "b", "strong",
  "i", "em",
  "u", "ins",
  "s", "strike", "del",
  "code", "pre",
  "a",
  "blockquote",
  "tg-spoiler",
  "tg-emoji",
  "span",
]);

// Атрибуты допустимые для конкретных тегов
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href"]),
  span: new Set(["class"]),
  "tg-emoji": new Set(["emoji-id"]),
  pre: new Set(["language"]),  // <pre><code class="language-xxx"> но pre может иметь language
  code: new Set(["class"]),
};

/**
 * Валидирует строку как допустимый Telegram HTML.
 * Возвращает массив ошибок (пустой = валидно).
 *
 * Проверяет:
 * 1. Все HTML-теги — из списка допустимых Telegram
 * 2. Атрибуты — только допустимые для данного тега
 * 3. Открывающие/закрывающие теги сбалансированы
 * 4. Неэкранированные `<`, `>`, `&` вне тегов
 */
export function validateTelegramHtml({ html }: { html: string }): string[] {
  const errors: string[] = [];

  // 1. Найти все HTML-теги и проверить допустимость
  const tagPattern = /<\/?([a-z][a-z0-9-]*)(\s[^>]*)?\s*\/?>/gi;
  const stack: string[] = [];

  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1]!.toLowerCase();
    const attrsRaw = match[2]?.trim();

    if (!ALLOWED_TAGS.has(tagName)) {
      errors.push(`недопустимый тег <${tagName}>`);
      continue;
    }

    const isClosing = fullMatch.startsWith("</");
    const isSelfClosing = fullMatch.endsWith("/>");

    if (isClosing) {
      // Проверяем баланс
      if (stack.length === 0 || stack[stack.length - 1] !== tagName) {
        errors.push(`неожиданный закрывающий тег </${tagName}>`);
      } else {
        stack.pop();
      }
    } else {
      // Проверяем атрибуты
      if (attrsRaw) {
        const allowedForTag = ALLOWED_ATTRS[tagName];
        const attrNames = [...attrsRaw.matchAll(/([a-z][a-z0-9-]*)=/gi)].map((m) => m[1]!.toLowerCase());
        for (const attr of attrNames) {
          if (!allowedForTag?.has(attr)) {
            errors.push(`недопустимый атрибут ${attr} в теге <${tagName}>`);
          }
        }
      }

      if (!isSelfClosing) {
        stack.push(tagName);
      }
    }
  }

  // Незакрытые теги
  for (const tag of stack) {
    errors.push(`незакрытый тег <${tag}>`);
  }

  // 2. Проверка неэкранированных & (должны быть &amp; &lt; &gt; &quot;)
  // Убираем допустимые HTML entities и теги, проверяем оставшиеся &
  const withoutTags = html.replace(/<\/?[a-z][a-z0-9-]*(\s[^>]*)?\s*\/?>/gi, "");
  const withoutEntities = withoutTags.replace(/&(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/gi, "");
  if (withoutEntities.includes("&")) {
    errors.push("неэкранированный символ & (используйте &amp;)");
  }

  return errors;
}

// Zod-обёртка для Telegram HTML строки
const telegramHtml = z.string().refine(
  (val) => validateTelegramHtml({ html: val }).length === 0,
  (val) => ({ message: validateTelegramHtml({ html: val }).join("; ") }),
);

const telegramHtmlOptional = z.string().refine(
  (val) => validateTelegramHtml({ html: val }).length === 0,
  (val) => ({ message: validateTelegramHtml({ html: val }).join("; ") }),
).optional();

// === Choice ===

export const choiceSchema = z.object({
  id: z.number().int("choice.id должен быть целым числом"),
  content: telegramHtml.pipe(z.string().min(1, "choice.content не может быть пустым")),
  score: z.number("choice.score должен быть числом"),
  explanation: telegramHtmlOptional,
});

export type SeedChoice = z.infer<typeof choiceSchema>;

// === IRT Parameters ===

export const irtParametersSchema = z.object({
  difficulty: z.number("difficulty должен быть числом"),
  discriminability: z.number("discriminability должен быть числом"),
  guessing: z.number("guessing должен быть числом"),
  slip: z.number("slip должен быть числом"),
});

// === Question ===

export const questionSchema = z
  .object({
    id: z.number().int("id должен быть целым числом"),
    choiceType: z.enum(["single", "multiple", "yes_no"]),
    prompt: telegramHtml.pipe(z.string().min(1, "prompt не может быть пустым")),
    explanation: telegramHtmlOptional,
    image: z.string().optional(),
    choices: z.array(choiceSchema).min(2, "минимум 2 варианта ответа"),
    irtParameters: irtParametersSchema,
    random: z.number().min(0, "random ≥ 0").max(1, "random < 1"),
  })
  // score должен быть 0 или 1
  .refine(
    (q) => q.choices.every((c) => c.score === 0 || c.score === 1),
    { message: "choice.score должен быть 0 или 1", path: ["choices"] },
  )
  // Минимум 1 правильный ответ
  .refine(
    (q) => q.choices.some((c) => c.score === 1),
    { message: "нет правильного ответа (score=1)", path: ["choices"] },
  )
  // single → ровно 1 правильный
  .refine(
    (q) => q.choiceType !== "single" || q.choices.filter((c) => c.score === 1).length === 1,
    { message: "single choice: должен быть ровно 1 правильный ответ", path: ["choices"] },
  )
  // yes_no → ровно 2 варианта
  .refine(
    (q) => q.choiceType !== "yes_no" || q.choices.length === 2,
    { message: "yes_no: должно быть ровно 2 варианта", path: ["choices"] },
  )
  // Уникальность choice.id внутри вопроса
  .refine(
    (q) => {
      const ids = new Set(q.choices.map((c) => c.id));
      return ids.size === q.choices.length;
    },
    { message: "дублирующиеся choice.id", path: ["choices"] },
  )
  // Уникальность choice.content внутри вопроса
  .refine(
    (q) => {
      const contents = new Set(q.choices.map((c) => c.content));
      return contents.size === q.choices.length;
    },
    { message: "дублирующийся choice.content", path: ["choices"] },
  )
  // random строго < 1
  .refine(
    (q) => q.random < 1,
    { message: "random должен быть в диапазоне [0, 1)", path: ["random"] },
  );

export type SeedQuestion = z.infer<typeof questionSchema>;

// === Массив вопросов (с глобальной уникальностью) ===

export const questionsArraySchema = z
  .array(questionSchema)
  // Уникальность id
  .refine(
    (questions) => {
      const ids = new Set<number>();
      for (const q of questions) {
        if (ids.has(q.id)) return false;
        ids.add(q.id);
      }
      return true;
    },
    { message: "дублирующиеся question.id" },
  )
  // Уникальность random (с точностью toFixed(6))
  .refine(
    (questions) => {
      const randoms = new Set<string>();
      for (const q of questions) {
        const key = q.random.toFixed(6);
        if (randoms.has(key)) return false;
        randoms.add(key);
      }
      return true;
    },
    { message: "дублирующиеся random значения" },
  );
