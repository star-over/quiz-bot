#!/usr/bin/env tsx
/**
 * Валидация seed/questions.json и seed/kc-catalog.jsonl — Zod-схемы + проверка файлов.
 * Запуск: tsx seed/validate.ts  (или make validate-seed)
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { questionsArraySchema, kcCatalogItemSchema, kcCatalogArraySchema } from "./schemas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(__dirname, "questions.json");
const KC_CATALOG_PATH = join(__dirname, "kc-catalog.jsonl");
const IMAGES_DIR = join(__dirname, "images");

let hasErrors = false;

// ── 1. Валидация kc-catalog.jsonl ─────────────────────────────────────────

let kcRaw: unknown[];
{
  let lines: string[];
  try {
    lines = readFileSync(KC_CATALOG_PATH, "utf8").split("\n").filter((l) => l.trim());
  } catch (e) {
    console.error(`❌ Не удалось прочитать kc-catalog.jsonl: ${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`Проверяем kc-catalog.jsonl (${lines.length} записей)...\n`);

  kcRaw = [];
  let lineErrors = 0;
  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]!);
    } catch {
      console.error(`  ❌ Строка ${i + 1}: невалидный JSON`);
      lineErrors++;
      continue;
    }

    const res = kcCatalogItemSchema.safeParse(parsed);
    if (!res.success) {
      for (const issue of res.error.issues) {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        console.error(`  ❌ Строка ${i + 1} (${(parsed as Record<string, unknown>)["kcId"] ?? "?"}): ${path}: ${issue.message}`);
      }
      lineErrors++;
    } else {
      kcRaw.push(res.data);
    }
  }

  if (lineErrors > 0) {
    console.error(`\n💥 ${lineErrors} ошибок в kc-catalog.jsonl`);
    hasErrors = true;
  } else {
    // Проверка массива целиком (уникальность kcId, sortOrder, category-prefix)
    const arrayResult = kcCatalogArraySchema.safeParse(kcRaw);
    if (!arrayResult.success) {
      for (const issue of arrayResult.error.issues) {
        console.error(`  ❌ kc-catalog (массив): ${issue.message}`);
      }
      console.error(`\n💥 ${arrayResult.error.issues.length} ошибок валидации kc-catalog`);
      hasErrors = true;
    } else {
      console.log(`✅ kc-catalog.jsonl валиден (${kcRaw.length} KC)\n`);
    }
  }
}

// ── 2. Валидация questions.json ────────────────────────────────────────────

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8"));
} catch (e) {
  console.error(`❌ Невалидный JSON: ${(e as Error).message}`);
  process.exit(1);
}

if (!Array.isArray(raw)) {
  console.error("❌ Корневой элемент должен быть массивом");
  process.exit(1);
}

console.log(`Проверяем ${raw.length} вопросов...\n`);

const result = questionsArraySchema.safeParse(raw);

if (!result.success) {
  for (const issue of result.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    console.error(`  ❌ ${path}: ${issue.message}`);
  }
  console.error(`\n💥 ${result.error.issues.length} ошибок валидации`);
  hasErrors = true;
}

// ── 3. Проверка файлов изображений (I/O — не в Zod-схеме) ─────────────────

if (result.success) {
  let imageErrors = 0;
  for (const q of result.data) {
    if (q.image) {
      const imagePath = join(IMAGES_DIR, q.image);
      if (!existsSync(imagePath)) {
        console.error(`  ❌ Вопрос id=${q.id}: файл не найден: seed/images/${q.image}`);
        imageErrors++;
      }
    }
  }

  if (imageErrors > 0) {
    console.error(`\n💥 ${imageErrors} ошибок (отсутствующие изображения)`);
    hasErrors = true;
  }
}

// ── 4. Перекрёстная проверка: topics вопросов ↔ kc-catalog ────────────────

if (result.success && kcRaw.length > 0) {
  const knownKcIds = new Set((kcRaw as Array<{ kcId: string }>).map((kc) => kc.kcId));
  let crossRefErrors = 0;

  for (const q of result.data) {
    for (const kcId of q.kcs ?? []) {
      if (!knownKcIds.has(kcId)) {
        console.error(`  ❌ Вопрос id=${q.id}: topics содержит неизвестный KC: "${kcId}"`);
        crossRefErrors++;
      }
    }
  }

  if (crossRefErrors > 0) {
    console.error(`\n💥 ${crossRefErrors} ошибок (неизвестные KC в topics)`);
    hasErrors = true;
  } else {
    console.log("✅ Перекрёстная проверка topics ↔ kc-catalog пройдена");
  }
}

// ── Итог ──────────────────────────────────────────────────────────────────

if (hasErrors) {
  process.exit(1);
}

console.log("✅ Валидация пройдена");
