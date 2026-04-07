#!/usr/bin/env npx tsx
/**
 * Компилятор: собирает seed/questions.json из seed/generated/**\/*.jsonl.
 *
 * Использование:
 *   npx tsx seed/gen/compile.ts
 *   npx tsx seed/gen/compile.ts --out seed/questions.json
 *   npx tsx seed/gen/compile.ts --stats-only
 */
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { generatedQuestionSchema, type GeneratedQuestion } from "./schemas.js";
import { GENERATED_DIR } from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

const { values } = parseArgs({
  options: {
    out:        { type: "string", default: "seed/questions.json" },
    source:     { type: "string", default: "reviewed" },
    "stats-only": { type: "boolean", default: false },
  },
  strict: true,
});

// ── Сбор JSONL-файлов ────────────────────────────────────────────────────────

function collectJsonlFiles({ dir, suffix }: { dir: string; suffix?: string }): string[] {
  if (!existsSync(dir)) return [];
  const ext = suffix ?? ".jsonl";
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => join(dir, f));
}

function parseJsonlFile({ filePath }: { filePath: string }): GeneratedQuestion[] {
  const content = readFileSync(filePath, "utf8");
  const questions: GeneratedQuestion[] = [];
  const lines = content.split("\n").filter((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]!);
      const validated = generatedQuestionSchema.parse(parsed);
      questions.push(validated);
    } catch (error) {
      const relPath = relative(ROOT, filePath);
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  ${relPath}:${i + 1} — пропущена: ${msg}`);
    }
  }

  return questions;
}

// ── Детерминистичный random из хеша ──────────────────────────────────────────

function deterministicRandom({ seed }: { seed: string }): number {
  const hash = createHash("sha256").update(seed).digest();
  // Берём 4 байта как uint32, делим на max uint32
  const uint32 = hash.readUInt32BE(0);
  return uint32 / 0xFFFFFFFF;
}

// ── Основная логика ──────────────────────────────────────────────────────────

function main() {
  const source = values.source ?? "reviewed";
  let jsonlFiles: string[];

  const baseDir = join(ROOT, GENERATED_DIR);

  if (source === "reviewed") {
    // Сначала .review.jsonl, затем .jsonl для KC без рецензии
    const reviewedFiles = collectJsonlFiles({ dir: baseDir, suffix: ".review.jsonl" });
    if (reviewedFiles.length > 0) {
      jsonlFiles = reviewedFiles;
      console.log(`📂 Источник: ${GENERATED_DIR}/*.review.jsonl (${reviewedFiles.length} файлов)`);
    } else {
      // Fallback на сырые .jsonl если рецензия не проводилась
      jsonlFiles = collectJsonlFiles({ dir: baseDir });
      console.log(`📂 Источник: ${GENERATED_DIR}/*.jsonl (fallback, рецензия не проводилась)`);
    }
  } else if (source === "generated") {
    jsonlFiles = collectJsonlFiles({ dir: baseDir });
    console.log(`📂 Источник: ${GENERATED_DIR}/*.jsonl`);
  } else {
    // both: объединяем
    const reviewedFiles = collectJsonlFiles({ dir: baseDir, suffix: ".review.jsonl" });
    const generatedFiles = collectJsonlFiles({ dir: baseDir });
    jsonlFiles = [...reviewedFiles, ...generatedFiles];
    console.log(`📂 Источник: оба (${reviewedFiles.length} reviewed + ${generatedFiles.length} generated)`);
  }

  if (jsonlFiles.length === 0) {
    console.log("📭 Нет файлов для компиляции");
    return;
  }

  // Собираем все вопросы
  const allQuestions: GeneratedQuestion[] = [];
  for (const file of jsonlFiles) {
    allQuestions.push(...parseJsonlFile({ filePath: file }));
  }

  // Сортируем для стабильности: по kcId → author → generatedAt
  allQuestions.sort((a, b) =>
    a.kcs[0]!.localeCompare(b.kcs[0]!) ||
    a.author.localeCompare(b.author) ||
    a.generatedAt.localeCompare(b.generatedAt),
  );

  // Статистика
  const byAuthor = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byLevel = new Map<string, number>();
  const kcSet = new Set<string>();

  for (const q of allQuestions) {
    const kcId = q.kcs[0]!;
    const category = kcId.split("/")[0]!;
    kcSet.add(kcId);
    byAuthor.set(q.author, (byAuthor.get(q.author) ?? 0) + 1);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }

  // Для статистики по уровню нужен kc-catalog
  const kcCatalogPath = join(ROOT, "seed", "kc-catalog.jsonl");
  const kcLevelMap = new Map<string, string>();
  if (existsSync(kcCatalogPath)) {
    const lines = readFileSync(kcCatalogPath, "utf8").split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const obj = JSON.parse(line) as { kcId: string; cefrLevel: string };
      kcLevelMap.set(obj.kcId, obj.cefrLevel);
    }
  }
  for (const q of allQuestions) {
    const level = kcLevelMap.get(q.kcs[0]!) ?? "?";
    byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
  }

  console.log(`📊 Статистика генерации:`);
  console.log(`   Всего вопросов: ${allQuestions.length}`);
  console.log(`   Уникальных KC: ${kcSet.size}`);
  console.log();
  console.log(`   По авторам:`);
  for (const [author, count] of [...byAuthor.entries()].sort()) {
    console.log(`     ${author}: ${count}`);
  }
  console.log();
  console.log(`   По категориям:`);
  for (const [cat, count] of [...byCategory.entries()].sort()) {
    console.log(`     ${cat}: ${count}`);
  }
  console.log();
  console.log(`   По уровням:`);
  for (const [level, count] of [...byLevel.entries()].sort()) {
    console.log(`     ${level}: ${count}`);
  }

  if (values["stats-only"]) return;

  // Формируем seed-формат
  const usedRandoms = new Set<string>();
  const seedQuestions = allQuestions.map((q, index) => {
    // Детерминистичный random с защитой от коллизий
    let random: number;
    let attempt = 0;
    do {
      const seed = `${q.kcs[0]}:${q.author}:${q.summary}:${attempt}`;
      random = deterministicRandom({ seed });
      attempt++;
    } while (usedRandoms.has(random.toFixed(6)));
    usedRandoms.add(random.toFixed(6));

    return {
      id: index + 1,
      choiceType: q.choiceType,
      prompt: q.prompt,
      explanation: undefined, // LLM генерирует explanation на уровне choice
      choices: q.choices,
      slip: q.slip,
      kcs: q.kcs,
      random,
      author: q.author,
      llmModel: q.llmModel,
      summary: q.summary,
      generatedAt: q.generatedAt,
    };
  });

  // Записываем
  const outPath = join(ROOT, values.out!);
  writeFileSync(outPath, JSON.stringify(seedQuestions, null, 2) + "\n");
  console.log(`\n✅ Записано ${seedQuestions.length} вопросов в ${values.out}`);
}

main();
