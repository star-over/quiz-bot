/**
 * Zod-схемы для валидации ответов LLM и записей в JSONL.
 */
import { z } from "zod";
import { telegramHtml, validateTelegramHtml } from "../schemas.js";
import { AUTHOR_SLUGS } from "./constants.js";

// Telegram HTML строка, обязательная для генерации (explanation всегда нужен)
const telegramHtmlRequired = z.string().refine(
  (val) => validateTelegramHtml({ html: val }).length === 0,
  (val) => ({ message: validateTelegramHtml({ html: val }).join("; ") }),
);

// KC ID: category/subcategory[/rule]
const kcIdRegex = /^(grammar)\/.+/;

/**
 * Схема ответа LLM — то, что модель возвращает в JSON.
 * choiceType и choice.id генерируются моделью сразу.
 */
export const llmResponseSchema = z.object({
  choiceType: z.enum(["single", "multiple", "yes_no"]),
  summary: z.string().min(10).max(200),
  prompt: telegramHtml.pipe(z.string().min(1)),
  slip: z.number().min(0.01).max(0.20),
  kcs: z.array(z.string().regex(kcIdRegex)).length(1),
  choices: z.array(z.object({
    id: z.number().int(),
    content: telegramHtmlRequired.pipe(z.string().min(1)),
    score: z.number().refine((s) => s === 0 || s === 1),
    explanation: telegramHtmlRequired.pipe(z.string().min(1)),
  })).min(2),
});

/**
 * Схема записи в JSONL — ответ LLM + метаданные скрипта.
 */
export const generatedQuestionSchema = llmResponseSchema.extend({
  author: z.enum(AUTHOR_SLUGS),
  llmModel: z.string().min(1),
  generatedAt: z.string(),
});

export type LlmResponse = z.infer<typeof llmResponseSchema>;
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
