#!/usr/bin/env tsx
/**
 * Валидация seed/questions.json — Zod-схемы + проверка файлов.
 * Запуск: tsx seed/validate.ts  (или make validate-seed)
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { questionsArraySchema } from "./schemas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(__dirname, "questions.json");
const IMAGES_DIR = join(__dirname, "images");

// 1. Парсинг JSON
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

// 2. Zod-валидация структуры и бизнес-правил
const result = questionsArraySchema.safeParse(raw);

if (!result.success) {
  for (const issue of result.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    console.error(`  ❌ ${path}: ${issue.message}`);
  }
  console.error(`\n💥 ${result.error.issues.length} ошибок валидации`);
  process.exit(1);
}

// 3. Проверка файлов изображений (I/O — не в Zod-схеме)
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
  process.exit(1);
}

console.log("✅ Валидация пройдена");
