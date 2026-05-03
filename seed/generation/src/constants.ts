/**
 * Константы для генерации вопросов.
 */

/** Slug'и авторов-персон. Соответствуют файлам в prompts/authors/ */
export const AUTHOR_SLUGS = [
  "methodist",
  "trap",
  "colleague",
  "office",
  "traveler",
  "popculture",
  "provocateur",
  "narrator",
  "child",
] as const;

export type AuthorSlug = (typeof AUTHOR_SLUGS)[number];

/** Человеко-читаемые имена авторов (для логов) */
export const AUTHOR_NAMES: Record<AuthorSlug, string> = {
  methodist:   "Елена Соколова",
  trap:        "Артём Касьянов",
  colleague:   "Marcus Chen",
  office:      "Priya Sharma",
  traveler:    "Diego Almeida",
  popculture:  "Jamie O'Sullivan",
  provocateur: "Helen Blackwood",
  narrator:    "Yuki Tanaka",
  child:       "Тимка Морозов",
};

/** Максимум вопросов на пару (автор, KC) по умолчанию */
export const DEFAULT_MAX_PER_AUTHOR_KC = 5;

/** Максимум retry при ошибке LLM или валидации */
export const MAX_RETRIES = 2;

/** Директория с результатами генерации */
export const GENERATED_DIR = "seed/generation/data/generated";

/** Директория с файлами персон */
export const AUTHORS_DIR = "seed/generation/prompts/authors";

/** Путь к промпт-шаблону */
export const PROMPT_TEMPLATE_PATH = "seed/generation/prompts/question-generation.md";

/** Модель для рецензии по умолчанию */
export const DEFAULT_REVIEW_MODEL = "claude-sonnet-4-20250514";

/** Максимум вопросов от одного автора после рецензии */
export const REVIEW_MAX_PER_AUTHOR = 2;

/** KC ID → плоское имя файла: grammar/future/going_to → grammar--future--going_to */
export function kcIdToFilename({ kcId }: { kcId: string }): string {
  return kcId.replaceAll("/", "--");
}

/** Плоское имя файла → KC ID: grammar--future--going_to → grammar/future/going_to */
export function filenameToKcId({ filename }: { filename: string }): string {
  return filename.replaceAll("--", "/");
}
