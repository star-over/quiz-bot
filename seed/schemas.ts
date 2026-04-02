/**
 * Zod-схемы для валидации seed/questions.json и seed/kc-catalog.jsonl.
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
export const telegramHtml = z.string().refine(
  (val) => validateTelegramHtml({ html: val }).length === 0,
  (val) => ({ message: validateTelegramHtml({ html: val }).join("; ") }),
);

const telegramHtmlOptional = z.string().refine(
  (val) => validateTelegramHtml({ html: val }).length === 0,
  (val) => ({ message: validateTelegramHtml({ html: val }).join("; ") }),
).optional();

// === Choice ===

export const choiceSchema = z.object({
  id: z.number().int()
    .describe("Стабильный целочисленный ID варианта ответа. Не меняется при перемешивании и редактировании — используется в answerLog для записи что именно выбрал пользователь."),
  content: telegramHtml.pipe(z.string().min(1))
    .describe("Telegram HTML — текст варианта ответа, отображается в теле сообщения (не в кнопке). Может содержать форматирование."),
  score: z.number()
    .describe("Правильность варианта: 1 = правильный, 0 = неправильный. Задел на частичный балл (0.5) — не используется пока."),
  explanation: telegramHtmlOptional
    .describe("Telegram HTML — объяснение именно этого варианта. Показывается после ответа. Переопределяет question.explanation для данного choice (override)."),
});

export type SeedChoice = z.infer<typeof choiceSchema>;

// === Question ===

// Формат KC ID: категория:часть1[:часть2...]
const kcIdRegex = /^(grammar|vocab|collocation|spelling)\/.+/;

export const questionSchema = z
  .object({
    id: z.number().int()
      .describe("Стабильный числовой ID вопроса в seed-файле. Хранится в БД как seedId — используется командой /test <id> для прямого вызова вопроса при разработке."),
    choiceType: z.enum(["single", "multiple", "yes_no"])
      .describe("Тип взаимодействия: single — ровно 1 правильный ответ; multiple — несколько правильных; yes_no — ровно 2 варианта (Да/Нет). yes_no не обновляет BKT (GUESS=0.5 нарушает ограничение модели)."),
    prompt: telegramHtml.pipe(z.string().min(1))
      .describe("Telegram HTML — текст вопроса, отображается пользователю. Может содержать форматирование, кодовые блоки, курсив для примеров."),
    explanation: telegramHtmlOptional
      .describe("Telegram HTML — общее объяснение вопроса. Fallback: показывается если у выбранного choice нет своего explanation."),
    image: z.string().optional()
      .describe("Имя файла изображения из seed/images/ (например 'house.png'). При сидировании загружается в Convex Storage, ссылка сохраняется как imageStorageId."),
    kcs: z.array(
      z.string().regex(kcIdRegex, "kcs: невалидный KC ID (ожидается category/...)"),
    ).optional()
      .describe("Список KC ID которые проверяет этот вопрос (например ['grammar:present_time:be_am_is_are']). Первый KC — primary (полное BKT-обновление), остальные — secondary (LEARN × 0.5). Денормализация: дублирует questionKcs для удобства."),
    choices: z.array(choiceSchema).min(2)
      .describe("Варианты ответа. Минимум 2. Порядок в seed-файле — порядок по умолчанию; при показе пользователю перемешиваются (кроме choice с pin: first/last)."),
    slip: z.number()
      .describe("Вероятность ошибиться при знании KC [0,1]. Используется в BKT-F формуле байесовского обновления. Типичное значение: 0.05–0.10. После накопления данных заменит глобальную константу SLIP=0.10."),
    random: z.number().min(0).max(1)
      .describe("Случайное число [0,1) назначенное вопросу при создании. Используется для O(1) случайного выбора вопроса внутри KC без сортировки всей таблицы."),
    author: z.string().optional()
      .describe("Slug автора-персоны (methodist, trap, colleague, ...). Пустой для ручных вопросов."),
    llmModel: z.string().optional()
      .describe("ID модели LLM, которая сгенерировала вопрос (claude-sonnet-4-5-20250514, ...)."),
    summary: z.string().optional()
      .describe("Краткое описание вопроса (10–15 слов). Используется для дедупликации при генерации."),
    generatedAt: z.string().optional()
      .describe("ISO timestamp генерации вопроса."),
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

// === KC Catalog ===

export const kcCatalogItemSchema = z.object({
  kcId: z.string().regex(kcIdRegex)
    .describe("Стабильный идентификатор KC в формате category/subcategory[/rule]. Примеры: 'grammar/present_time/be_am_is_are', 'vocab/give_up', 'spelling/necessary'. Не меняется после создания — используется как внешний ключ в questionKcs и userMastery."),
  category: z.enum(["grammar", "vocab", "collocation", "spelling"])
    .describe("Категория KC. Должна совпадать с префиксом kcId. grammar — грамматические правила; vocab — слова и фразовые глаголы; collocation — устойчивые словосочетания; spelling — правописание конкретных слов."),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2"])
    .describe("Уровень CEFR на котором KC вводится в курикулум. Определяет когда пользователь впервые встретит этот KC. Основан на Cambridge English Grammar Profile и Oxford 3000."),
  sortOrder: z.number().int().min(1)
    .describe("Глобальная позиция KC в курикулуме (1 = первый). Определяет порядок введения нового материала: A1 (1–79) → A2 (80–173) → B1 (174–284) → B2 (285–368). Уникален — не может повторяться."),
  description: z.string().min(1).optional()
    .describe("Краткое описание для методологов: что именно проверяет KC, почему это сложно для русскоговорящих, какие форматы вопросов типичны. Помогает писать целевые вопросы и дистракторы."),
});

export type KcCatalogItem = z.infer<typeof kcCatalogItemSchema>;

export const kcCatalogArraySchema = z
  .array(kcCatalogItemSchema)
  // Уникальность kcId
  .refine(
    (items) => {
      const ids = new Set<string>();
      for (const item of items) {
        if (ids.has(item.kcId)) return false;
        ids.add(item.kcId);
      }
      return true;
    },
    { message: "дублирующиеся kcId в kc-catalog" },
  )
  // Уникальность sortOrder
  .refine(
    (items) => {
      const orders = new Set<number>();
      for (const item of items) {
        if (orders.has(item.sortOrder)) return false;
        orders.add(item.sortOrder);
      }
      return true;
    },
    { message: "дублирующиеся sortOrder в kc-catalog" },
  )
  // category соответствует префиксу kcId
  .refine(
    (items) => items.every((item) => item.kcId.startsWith(item.category + "/")),
    { message: "category не совпадает с префиксом kcId" },
  );

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
