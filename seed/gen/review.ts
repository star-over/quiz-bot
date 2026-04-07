#!/usr/bin/env npx tsx
/**
 * CLI для рецензирования сгенерированных вопросов через Claude Sonnet 4.
 *
 * Использование:
 *   npx tsx seed/gen/review.ts --kc grammar/future/going_to
 *   npx tsx seed/gen/review.ts --level A1
 *   npx tsx seed/gen/review.ts --category grammar
 *   npx tsx seed/gen/review.ts                          # все KC с файлами в seed/generated/
 *   npx tsx seed/gen/review.ts --dry-run --kc grammar/future/going_to
 */
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

import { GENERATED_DIR, DEFAULT_REVIEW_MODEL, MAX_RETRIES, kcIdToFilename, filenameToKcId } from "./constants.js";
import { generatedQuestionSchema, type GeneratedQuestion } from "./schemas.js";
import { reviewResponseSchema } from "./review-schemas.js";
import { buildReviewPrompt } from "./review-prompt.js";
import { callLlm } from "./llm.js";
import { validateTelegramHtml } from "../schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    model:    { type: "string" },
    kc:       { type: "string" },
    level:    { type: "string" },
    category: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

const model = values.model ?? DEFAULT_REVIEW_MODEL;
const dryRun = values["dry-run"] ?? false;

// ── Загрузка KC каталога ──────────────────────────────────────────────────────

interface KcEntry {
  kcId: string;
  category: string;
  cefrLevel: string;
  sortOrder: number;
  description?: string;
}

function loadKcCatalog(): KcEntry[] {
  const path = join(ROOT, "seed", "kc-catalog.jsonl");
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

// ── Загрузка сгенерированных вопросов ───────────────────────────────────────

function loadGeneratedQuestions({ kcId }: { kcId: string }): GeneratedQuestion[] {
  const filePath = join(ROOT, GENERATED_DIR, `${kcIdToFilename({ kcId })}.jsonl`);
  if (!existsSync(filePath)) return [];

  const questions: GeneratedQuestion[] = [];
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const validated = generatedQuestionSchema.parse(parsed);
      questions.push(validated);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️  ${kcId}: пропущена строка: ${msg.slice(0, 100)}`);
    }
  }

  return questions;
}

/** Находит KC с файлами в seed/generated/ */
function findGeneratedKcIds(): Set<string> {
  const result = new Set<string>();
  const baseDir = join(ROOT, GENERATED_DIR);
  if (!existsSync(baseDir)) return result;

  for (const entry of readdirSync(baseDir)) {
    if (!entry.endsWith(".jsonl")) continue;
    const basename = entry.replace(/\.jsonl$/, "");
    result.add(filenameToKcId({ filename: basename }));
  }
  return result;
}

// ── Парсинг JSON из ответа LLM ─────────────────────────────────────────────

function parseJsonFromLlm({ text }: { text: string }): unknown {
  const stripped = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return JSON.parse(stripped);
}

/** Экранирует & вне HTML-тегов и известных entities */
function escapeAmpersands({ html }: { html: string }): string {
  return html.replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi, "&amp;");
}

/** Экранирует спецсимволы во всех текстовых полях вопроса */
function sanitizeQuestion({ q }: { q: Record<string, unknown> }): void {
  if (typeof q["prompt"] === "string") {
    q["prompt"] = escapeAmpersands({ html: q["prompt"] });
  }
  const choices = q["choices"] as Array<Record<string, unknown>> | undefined;
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

/** Валидирует Telegram HTML во всех полях вопроса */
function validateQuestionHtml({ q }: { q: Record<string, unknown> }): string[] {
  const errors: string[] = [];

  if (typeof q["prompt"] === "string") {
    errors.push(...validateTelegramHtml({ html: q["prompt"] }).map((e) => `prompt: ${e}`));
  }
  const choices = q["choices"] as Array<Record<string, unknown>> | undefined;
  if (choices) {
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]!;
      if (typeof c["content"] === "string") {
        errors.push(...validateTelegramHtml({ html: c["content"] }).map((e) => `choices[${i}].content: ${e}`));
      }
      if (typeof c["explanation"] === "string") {
        errors.push(...validateTelegramHtml({ html: c["explanation"] }).map((e) => `choices[${i}].explanation: ${e}`));
      }
    }
  }
  return errors;
}

// ── Основной цикл ──────────────────────────────────────────────────────────

async function main() {
  const catalog = loadKcCatalog();
  const allKcs = filterKcs({ catalog });

  // Если KC не указан — ограничиваемся теми, у которых есть файлы
  const generatedKcIds = findGeneratedKcIds();
  const kcs = values.kc || values.level || values.category
    ? allKcs.filter((kc) => generatedKcIds.has(kc.kcId))
    : allKcs.filter((kc) => generatedKcIds.has(kc.kcId));

  console.log(`📋 Модель рецензии: ${model}`);
  console.log(`📋 KC для рецензии: ${kcs.length} шт.`);
  console.log();

  if (kcs.length === 0) {
    console.log("📭 Нет KC с сгенерированными вопросами для рецензии");
    return;
  }

  if (dryRun) {
    for (const kc of kcs) {
      const questions = loadGeneratedQuestions({ kcId: kc.kcId });
      const byAuthor = new Map<string, number>();
      const byModel = new Map<string, number>();
      for (const q of questions) {
        byAuthor.set(q.author, (byAuthor.get(q.author) ?? 0) + 1);
        byModel.set(q.llmModel, (byModel.get(q.llmModel) ?? 0) + 1);
      }
      console.log(`  ${kc.kcId}: ${questions.length} вопросов, ${byAuthor.size} авторов, ${byModel.size} моделей`);
    }
    return;
  }

  let totalSelected = 0;
  let totalRejected = 0;
  let totalKcs = 0;
  const allPromptCorrections: string[] = [];

  for (const kc of kcs) {
    const questions = loadGeneratedQuestions({ kcId: kc.kcId });
    if (questions.length === 0) {
      console.log(`  ⏭  [${kc.kcId}] нет вопросов — пропуск`);
      continue;
    }

    console.log(`\n📝 [${kc.kcId}] ${questions.length} вопросов → рецензия...`);

    const { systemPrompt, userPrompt } = buildReviewPrompt({ kc, questions });

    let success = false;
    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      try {
        const rawText = await callLlm({
          model,
          systemPrompt,
          userPrompt,
          maxTokens: 16384,
          temperature: 0,
        });

        const parsed = parseJsonFromLlm({ text: rawText });
        const response = reviewResponseSchema.parse(parsed);

        // Санитизация и валидация HTML в отобранных вопросах
        const validSelected = [];
        for (const q of response.selected) {
          const raw = q as unknown as Record<string, unknown>;
          sanitizeQuestion({ q: raw });
          const htmlErrors = validateQuestionHtml({ q: raw });
          if (htmlErrors.length > 0) {
            console.warn(`  ⚠️  HTML ошибки в отобранном вопросе [${q.author}]: ${htmlErrors.join("; ")}`);
            // Всё равно включаем — ошибки могут быть незначительными
          }
          validSelected.push(q);
        }

        // Записываем отобранные вопросы
        const outDir = join(ROOT, GENERATED_DIR);
        mkdirSync(outDir, { recursive: true });
        const kcFilename = kcIdToFilename({ kcId: kc.kcId });
        const outPath = join(outDir, `${kcFilename}.review.jsonl`);
        const content = validSelected.map((q) => JSON.stringify(q)).join("\n") + "\n";
        writeFileSync(outPath, content);

        // Записываем заметки рецензента
        const notesPath = join(outDir, `${kcFilename}.notes.md`);
        const notes = [
          `# Рецензия: ${kc.kcId}`,
          ``,
          `**Дата:** ${new Date().toISOString()}`,
          `**Модель:** ${model}`,
          `**Входных вопросов:** ${questions.length}`,
          `**Отобрано:** ${validSelected.length}`,
          `**Отклонено:** ${response.rejected.length}`,
          ``,
          `## Покрытие KC`,
          ``,
          response.coverageNotes,
          ``,
          `## Отклонённые`,
          ``,
          ...response.rejected.map((r) => `- **[${r.author}]** ${r.llmModel}: ${r.reason}`),
          ``,
        ];

        if (response.promptCorrections) {
          notes.push(`## Рекомендации по промпту`, ``, response.promptCorrections, ``);
          allPromptCorrections.push(`### ${kc.kcId}\n\n${response.promptCorrections}`);
        }

        writeFileSync(notesPath, notes.join("\n"));

        totalSelected += validSelected.length;
        totalRejected += response.rejected.length;
        totalKcs++;

        console.log(`  ✅ Отобрано: ${validSelected.length}, отклонено: ${response.rejected.length}`);
        if (response.promptCorrections) {
          console.log(`  📝 Есть рекомендации по промпту (см. review-notes.md)`);
        }

        success = true;
        break;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (retry < MAX_RETRIES) {
          console.warn(`  ⚠️  [${kc.kcId}] retry ${retry + 1}/${MAX_RETRIES}: ${msg.slice(0, 200)}`);
        } else {
          console.error(`  ❌ [${kc.kcId}] не удалось отрецензировать: ${msg.slice(0, 200)}`);
        }
      }
    }

    if (!success) totalKcs++; // считаем как обработанный, но неудачно
  }

  // Итог
  console.log();
  console.log(`📊 Результат рецензии:`);
  console.log(`   KC обработано: ${totalKcs}`);
  console.log(`   Отобрано вопросов: ${totalSelected}`);
  console.log(`   Отклонено вопросов: ${totalRejected}`);

  // Сводка рекомендаций по промпту
  if (allPromptCorrections.length > 0) {
    const summaryPath = join(ROOT, GENERATED_DIR, "prompt-corrections.md");
    const summary = [
      `# Рекомендации по промпту генерации`,
      ``,
      `**Дата:** ${new Date().toISOString()}`,
      `**Модель рецензии:** ${model}`,
      ``,
      ...allPromptCorrections,
    ].join("\n");
    writeFileSync(summaryPath, summary);
    console.log(`\n📝 Сводка рекомендаций по промпту: ${GENERATED_DIR}/prompt-corrections.md`);
  }
}

main().catch((err) => {
  console.error("❌ Фатальная ошибка:", err);
  process.exit(1);
});
