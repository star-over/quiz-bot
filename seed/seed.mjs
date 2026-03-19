#!/usr/bin/env node
/**
 * Сидирование базы: загрузка картинок в Convex Storage + вставка вопросов.
 * Запуск: node seed/seed.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(__dirname, "questions.json");
const IMAGES_DIR = join(__dirname, "images");

// URL деплоймента из .env.local (тот же что использует convex CLI)
const envLocal = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const convexUrl = envLocal.match(/CONVEX_URL=(.+)/)?.[1]?.trim();
if (!convexUrl) {
  console.error("❌ CONVEX_URL не найден в .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

const questions = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8"));
console.log(`📦 Загружаем ${questions.length} вопросов...\n`);

// 1. Загрузить картинки и собрать маппинг filename → storageId
const imageMap = new Map();
const questionsWithImages = questions.filter((q) => q.image);

for (const q of questionsWithImages) {
  if (imageMap.has(q.image)) continue; // уже загружен

  const filePath = join(IMAGES_DIR, q.image);
  const fileBuffer = readFileSync(filePath);

  // Получить upload URL
  const uploadUrl = await client.action(api.seed.generateUploadUrl);

  // Загрузить файл
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: fileBuffer,
  });

  if (!res.ok) {
    console.error(`❌ Ошибка загрузки ${q.image}: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const { storageId } = await res.json();
  imageMap.set(q.image, storageId);
  console.log(`  🖼  ${q.image} → ${storageId}`);
}

if (imageMap.size > 0) console.log();

// 2. Подготовить документы для вставки (без seed-метаданных id, image)
const docs = questions.map((q) => {
  const doc = {
    choiceType: q.choiceType,
    prompt: q.prompt,
    choices: q.choices.map((c) => {
      const choice = { id: c.id, content: c.content, score: c.score };
      if (c.explanation) choice.explanation = c.explanation;
      return choice;
    }),
    irtParameters: q.irtParameters,
    random: q.random,
  };
  if (q.explanation) doc.explanation = q.explanation;
  if (q.image && imageMap.has(q.image)) {
    doc.imageStorageId = imageMap.get(q.image);
  }
  return doc;
});

// 3. Очистить таблицу и вставить все вопросы одной mutation
const count = await client.mutation(api.seed.replaceQuestions, {
  questions: docs,
});

console.log(`✅ Загружено ${count} вопросов (${imageMap.size} картинок)`);
