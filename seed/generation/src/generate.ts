#!/usr/bin/env npx tsx
/**
 * CLI для генерации вопросов через LLM.
 *
 * Использование:
 *   npx tsx seed/generation/src/generate.ts --model claude-sonnet-4-5-20250514 --kc grammar/determiners/a_an
 *   npx tsx seed/generation/src/generate.ts --model claude-sonnet-4-5-20250514 --level A1 --authors methodist,trap --max 3
 *   npx tsx seed/generation/src/generate.ts --dry-run --model test --level A1
 */
import { parseArgs } from "node:util";
import { readFileSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

import { AUTHOR_SLUGS, DEFAULT_MAX_PER_AUTHOR_KC, MAX_RETRIES, GENERATED_DIR, kcIdToFilename, type AuthorSlug } from "./constants.js";
import { llmResponseSchema } from "./llm-schemas.js";
import { buildPrompt } from "./prompt.js";
import { loadExistingSummaries } from "./existing.js";
import { callLlm } from "./llm.js";
import { validateTelegramHtml } from "../schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    model:    { type: "string" },
    kc:       { type: "string" },
    level:    { type: "string" },
    category: { type: "string" },
    authors:  { type: "string" },
    max:      { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

const modelsRaw = values.model;
if (!modelsRaw) {
  console.error("❌ --model обязателен");
  process.exit(1);
}
const models = modelsRaw.split(",").map((s) => s.trim());

const maxPerAuthorKc = values.max ? parseInt(values.max, 10) : DEFAULT_MAX_PER_AUTHOR_KC;
const dryRun = values["dry-run"] ?? false;

const selectedAuthors: AuthorSlug[] = values.authors
  ? values.authors.split(",").map((s) => {
      const trimmed = s.trim();
      if (!AUTHOR_SLUGS.includes(trimmed as AuthorSlug)) {
        console.error(`❌ Неизвестный автор: ${trimmed}`);
        process.exit(1);
      }
      return trimmed as AuthorSlug;
    })
  : [...AUTHOR_SLUGS];

// ── Загрузка KC каталога ──────────────────────────────────────────────────────

interface KcEntry {
  kcId: string;
  category: string;
  cefrLevel: string;
  sortOrder: number;
  description?: string;
}

function loadKcCatalog(): KcEntry[] {
  const path = join(ROOT, "seed/generation/data/kc-catalog.jsonl");
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  return lines.map((line) => JSON.parse(line) as KcEntry);
}

function filterKcs({ catalog }: { catalog: KcEntry[] }): KcEntry[] {
  let filtered = catalog;

  if (values.kc) {
    filtered = filtered.filter((kc) => kc.kcId === values.kc);
    if (filtered.length === 0) {
      console.error(`❌ KC не найден: ${values.kc}`);
      process.exit(1);
    }
  }
  if (values.level) {
    filtered = filtered.filter((kc) => kc.cefrLevel === values.level);
  }
  if (values.category) {
    filtered = filtered.filter((kc) => kc.category === values.category);
  }

  return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
}

// ── Парсинг JSON из ответа LLM ───────────────────────────────────────────────

function parseJsonFromLlm({ text }: { text: string }): unknown {
  // Убираем markdown-fence если есть
  const stripped = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return JSON.parse(stripped);
}

/** Экранирует & вне HTML-тегов и известных entities */
function escapeAmpersands({ html }: { html: string }): string {
  // Заменяем & которые НЕ являются частью известных entities (&amp; &lt; &gt; &quot; &#123; &#x1f;)
  return html.replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi, "&amp;");
}

/** Экранирует спецсимволы во всех текстовых полях ответа LLM */
function sanitizeHtmlFields({ parsed }: { parsed: Record<string, unknown> }): void {
  if (typeof parsed["prompt"] === "string") {
    parsed["prompt"] = escapeAmpersands({ html: parsed["prompt"] });
  }
  const choices = parsed["choices"] as Array<Record<string, unknown>> | undefined;
  if (choices) {
    for (const c of choices) {
      if (typeof c["content"] === "string") {
        c["content"] = escapeAmpersands({ html: c["content"] });
      }
      if (typeof c["explanation"] === "string") {
        c["explanation"] = escapeAmpersands({ html: c["explanation"] });
      }
    }
  }
}

/** Проверяет Telegram HTML во всех текстовых полях, бросает читаемую ошибку */
function validateHtmlFields({ parsed }: { parsed: Record<string, unknown> }): void {
  const errors: string[] = [];

  const prompt = parsed["prompt"];
  if (typeof prompt === "string") {
    const promptErrors = validateTelegramHtml({ html: prompt });
    if (promptErrors.length > 0) {
      errors.push(`prompt: ${promptErrors.join("; ")}`);
    }
  }

  const choices = parsed["choices"] as Array<Record<string, unknown>> | undefined;
  if (choices) {
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]!;
      const content = c["content"];
      if (typeof content === "string") {
        const contentErrors = validateTelegramHtml({ html: content });
        if (contentErrors.length > 0) {
          errors.push(`choices[${i}].content: ${contentErrors.join("; ")}`);
        }
      }
      const explanation = c["explanation"];
      if (typeof explanation === "string") {
        const explErrors = validateTelegramHtml({ html: explanation });
        if (explErrors.length > 0) {
          errors.push(`choices[${i}].explanation: ${explErrors.join("; ")}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Невалидный Telegram HTML:\n  ${errors.join("\n  ")}`);
  }
}

/** Добавляет choiceType и choice.id если модель их не вернула */
function applyDefaults({ parsed }: { parsed: Record<string, unknown> }): Record<string, unknown> {
  if (!parsed["choiceType"]) {
    parsed["choiceType"] = "single";
  }
  const choices = parsed["choices"] as Array<Record<string, unknown>> | undefined;
  if (choices) {
    for (let i = 0; i < choices.length; i++) {
      if (choices[i]!["id"] === undefined) {
        choices[i]!["id"] = i + 1;
      }
    }
  }
  return parsed;
}

// ── Основной цикл ────────────────────────────────────────────────────────────

async function main() {
  const catalog = loadKcCatalog();
  const kcs = filterKcs({ catalog });

  console.log(`📋 Модели: ${models.join(", ")}`);
  console.log(`📋 KC: ${kcs.length} шт.`);
  console.log(`📋 Авторы: ${selectedAuthors.join(", ")}`);
  console.log(`📋 Макс. вопросов на (модель, автор, KC): ${maxPerAuthorKc}`);
  console.log();

  if (dryRun) {
    const totalToGenerate = kcs.length * models.length * selectedAuthors.length * maxPerAuthorKc;
    for (const kc of kcs) {
      for (const m of models) {
        for (const author of selectedAuthors) {
          console.log(`  ${kc.kcId} × ${m} × ${author}: ${maxPerAuthorKc}`);
        }
      }
    }
    console.log(`\n📊 Итого к генерации: ${totalToGenerate} вопросов`);
    return;
  }

  let generated = 0;
  let failed = 0;

  for (const kc of kcs) {
    // Загружаем summary всех существующих вопросов для этого KC (для дедупликации)
    const summaries = loadExistingSummaries({ kcId: kc.kcId });

    for (const model of models) {
      for (const author of selectedAuthors) {
        for (let i = 0; i < maxPerAuthorKc; i++) {
          const { systemPrompt, userPrompt } = buildPrompt({
            authorSlug: author,
            kc,
            existingSummaries: summaries,
          });

          let success = false;
          for (let retry = 0; retry <= MAX_RETRIES; retry++) {
            try {
              const rawText = await callLlm({ model, systemPrompt, userPrompt });
              const parsed = applyDefaults({ parsed: parseJsonFromLlm({ text: rawText }) as Record<string, unknown> });
              sanitizeHtmlFields({ parsed });
              validateHtmlFields({ parsed });
              const validated = llmResponseSchema.parse(parsed);

              // Проверяем что KC совпадает
              if (validated.kcs[0] !== kc.kcId) {
                console.warn(`  ⚠️  KC mismatch: ожидался ${kc.kcId}, получен ${validated.kcs[0]}`);
                continue;
              }

              // Собираем запись для JSONL
              const record = {
                ...validated,
                author,
                llmModel: model,
                generatedAt: new Date().toISOString(),
              };

              // Записываем в файл
              const outDir = join(ROOT, GENERATED_DIR);
              mkdirSync(outDir, { recursive: true });
              const outFile = join(outDir, `${kcIdToFilename({ kcId: kc.kcId })}.jsonl`);
              appendFileSync(outFile, JSON.stringify(record) + "\n");

              // Обновляем summaries для следующей итерации
              summaries.push(validated.summary);

              generated++;
              success = true;
              console.log(`  ✅ [${kc.kcId}] [${model}] [${author}] ${i + 1}/${maxPerAuthorKc}`);
              break;
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              if (retry < MAX_RETRIES) {
                console.warn(`  ⚠️  [${kc.kcId}] [${model}] [${author}] retry ${retry + 1}/${MAX_RETRIES}: ${msg}`);
              } else {
                console.error(`  ❌ [${kc.kcId}] [${model}] [${author}] ${i + 1}/${maxPerAuthorKc}: ${msg}`);
              }
            }
          }

          if (!success) failed++;
        }
      }
    }
  }

  console.log();
  console.log(`📊 Результат: ${generated} сгенерировано, ${failed} ошибок`);
}

main().catch((err) => {
  console.error("❌ Фатальная ошибка:", err);
  process.exit(1);
});
