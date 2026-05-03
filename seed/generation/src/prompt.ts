/**
 * Загрузка промпт-шаблона и подстановка плейсхолдеров.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PROMPT_TEMPLATE_PATH, AUTHORS_DIR, AUTHOR_NAMES, type AuthorSlug } from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

interface KcInfo {
  kcId: string;
  category: string;
  cefrLevel: string;
  description?: string;
}

/** Извлекает текст промпта из markdown-файла (содержимое между ``` ``` в разделе «User prompt») */
function extractPromptTemplate(): string {
  const md = readFileSync(join(ROOT, PROMPT_TEMPLATE_PATH), "utf8");
  const promptSection = md.split("## User prompt")[1];
  if (!promptSection) throw new Error("Раздел '## User prompt' не найден в шаблоне");
  const match = promptSection.match(/```\n([\s\S]*?)\n```/);
  if (!match?.[1]) throw new Error("Блок кода не найден в разделе 'User prompt'");
  return match[1];
}

/** Читает файл персоны автора */
function loadAuthorPersona({ authorSlug }: { authorSlug: AuthorSlug }): string {
  return readFileSync(join(ROOT, AUTHORS_DIR, `${authorSlug}.md`), "utf8");
}

/** Собирает промпт для LLM */
export function buildPrompt({ authorSlug, kc, existingSummaries }: {
  authorSlug: AuthorSlug;
  kc: KcInfo;
  existingSummaries: string[];
}): { systemPrompt: string; userPrompt: string } {
  const template = extractPromptTemplate();
  const persona = loadAuthorPersona({ authorSlug });
  const authorName = AUTHOR_NAMES[authorSlug];

  const existingBlock = existingSummaries.length > 0
    ? existingSummaries.map((s) => `- ${s}`).join("\n")
    : "(пусто)";

  const systemPrompt = [
    `Ты — ${authorName}. Ты пишешь вопросы для quiz-бота от своего лица — со своим характером, голосом и жизненным опытом.`,
    `Каждое объяснение звучит как твоя реплика, а не как справочник.`,
    `Верни ровно один JSON-объект. Без markdown, без комментариев, без текста вокруг JSON.`,
  ].join(" ");

  const userPrompt = template
    .replaceAll("{AUTHOR_NAME}", authorName)
    .replaceAll("{AUTHOR_PERSONA}", persona)
    .replaceAll("{KC_ID}", kc.kcId)
    .replaceAll("{KC_CATEGORY}", kc.category)
    .replaceAll("{CEFR_LEVEL}", kc.cefrLevel)
    .replaceAll("{KC_DESCRIPTION}", kc.description ?? kc.kcId)
    .replaceAll("{EXISTING_QUESTIONS}", existingBlock);

  return { systemPrompt, userPrompt };
}
