#!/usr/bin/env node
/**
 * Сидирование базы: загрузка картинок в Convex Storage + вставка вопросов + KC каталог.
 * Запуск: node seed/seed.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(__dirname, "questions.json");
const KC_CATALOG_PATH = join(__dirname, "kc-catalog.jsonl");
const IMAGES_DIR = join(__dirname, "images");

// URL деплоймента из .env.local (тот же что использует convex CLI)
const envLocal = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const convexUrl = envLocal.match(/CONVEX_URL=(.+)/)?.[1]?.trim();
if (!convexUrl) {
  console.error("❌ CONVEX_URL не найден в .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

// ── 1. Загрузить KC каталог ────────────────────────────────────────────────

const kcLines = readFileSync(KC_CATALOG_PATH, "utf8").split("\n").filter((l) => l.trim());
const kcItems = kcLines.map((line) => JSON.parse(line));
console.log(`📚 Загружаем KC каталог (${kcItems.length} записей)...`);

// Генерируем random для каждого KC (не хранится в JSONL)
const kcItemsWithRandom = kcItems.map((item) => ({
  ...item,
  random: Math.random(),
}));

await client.mutation(api.seed.replaceKcCatalog, { items: kcItemsWithRandom });
console.log(`  ✅ KC каталог загружен (${kcItems.length} KC)\n`);

// ── 2. Загрузить картинки и собрать маппинг filename → storageId ───────────

const questions = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8"));
console.log(`📦 Загружаем ${questions.length} вопросов...`);

const imageMap = new Map();
const questionsWithImages = questions.filter((q) => q.image);

for (const q of questionsWithImages) {
  if (imageMap.has(q.image)) continue; // уже загружен

  const filePath = join(IMAGES_DIR, q.image);
  const fileBuffer = readFileSync(filePath);

  const uploadUrl = await client.action(api.seed.generateUploadUrl);

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

// ── 3. Подготовить документы для вставки ─────────────────────────────────

const docs = questions.map((q) => {
  const doc = {
    seedId: q.id,
    choiceType: q.choiceType,
    prompt: q.prompt,
    choices: q.choices.map((c) => {
      const choice = { id: c.id, content: c.content, score: c.score };
      if (c.explanation) choice.explanation = c.explanation;
      return choice;
    }),
    slip: q.slip,
    random: q.random,
  };
  if (q.explanation) doc.explanation = q.explanation;
  if (q.kcs?.length) doc.kcs = q.kcs;
  if (q.image && imageMap.has(q.image)) {
    doc.imageStorageId = imageMap.get(q.image);
  }
  return doc;
});

// ── 4. Очистить и вставить вопросы, получить seedId → convexId маппинг ────

const idMap = await client.mutation(api.seed.replaceQuestions, { questions: docs });
console.log(`  ✅ Загружено ${docs.length} вопросов (${imageMap.size} картинок)\n`);

// ── 5. Построить и загрузить questionKcs ──────────────────────────────────

const seedIdToConvexId = new Map(idMap.map(({ seedId, convexId }) => [seedId, convexId]));

const kcEntries = [];
for (const q of questions) {
  if (!q.kcs?.length) continue;

  const convexId = seedIdToConvexId.get(q.id);
  if (!convexId) {
    console.error(`❌ Не найден convexId для seedId=${q.id}`);
    process.exit(1);
  }

  for (let i = 0; i < q.kcs.length; i++) {
    kcEntries.push({
      questionId: convexId,
      kcId: q.kcs[i],
      isPrimary: i === 0,
    });
  }
}

if (kcEntries.length > 0) {
  await client.mutation(api.seed.replaceQuestionKcs, { entries: kcEntries });
  console.log(`✅ Загружено ${kcEntries.length} questionKcs записей`);
} else {
  console.log("ℹ️  Нет topics у вопросов — questionKcs не заполнены");
}
