/**
 * Zod-схемы для валидации ответа рецензента (review step).
 */
import { z } from "zod";
import { generatedQuestionSchema } from "./llm-schemas.js";
import { AUTHOR_SLUGS } from "./constants.js";

/**
 * Отрецензированный вопрос — исходный вопрос + возможные правки рецензента.
 * reviewNote — комментарий рецензента, почему вопрос выбран.
 */
export const reviewedQuestionSchema = generatedQuestionSchema.extend({
  reviewNote: z.string().optional(),
});

export type ReviewedQuestion = z.infer<typeof reviewedQuestionSchema>;

/**
 * Запись об отклонённом вопросе.
 */
const rejectedEntrySchema = z.object({
  summary: z.string(),
  author: z.enum(AUTHOR_SLUGS),
  llmModel: z.string(),
  reason: z.string(),
});

/**
 * Полный ответ рецензента.
 */
export const reviewResponseSchema = z.object({
  /** Отобранные вопросы (с возможными правками форматирования) */
  selected: z.array(reviewedQuestionSchema).min(1),
  /** Отклонённые вопросы с причинами */
  rejected: z.array(rejectedEntrySchema),
  /** Заметки о покрытии KC (какие аспекты покрыты, чего не хватает) */
  coverageNotes: z.string(),
  /** Рекомендации по корректировке промпта генерации (null — если промпт ок) */
  promptCorrections: z.string().nullable(),
});

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;
