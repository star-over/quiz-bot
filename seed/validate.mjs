#!/usr/bin/env node
/**
 * Валидация seed/questions.json — структура, типы, уникальность, ссылки на файлы.
 * Запуск: node seed/validate.mjs
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(__dirname, "questions.json");
const IMAGES_DIR = join(__dirname, "images");

let errors = 0;
let warnings = 0;

function error(msg) { console.error(`  ❌ ${msg}`); errors++; }
function warn(msg) { console.error(`  ⚠️  ${msg}`); warnings++; }

// 1. Парсинг JSON
let questions;
try {
  questions = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8"));
} catch (e) {
  console.error(`❌ Невалидный JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(questions)) {
  console.error("❌ Корневой элемент должен быть массивом");
  process.exit(1);
}

console.log(`Проверяем ${questions.length} вопросов...\n`);

const VALID_CHOICE_TYPES = ["single", "multiple", "yes_no"];
const questionIds = new Set();
const randoms = new Set();

for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  const label = `Вопрос [${i}] (id=${q.id ?? "??"})`;

  // id
  if (q.id == null) {
    error(`${label}: отсутствует поле id`);
  } else if (typeof q.id !== "number" || !Number.isInteger(q.id)) {
    error(`${label}: id должен быть целым числом`);
  } else if (questionIds.has(q.id)) {
    error(`${label}: дублирующийся id=${q.id}`);
  } else {
    questionIds.add(q.id);
  }

  // choiceType
  if (!VALID_CHOICE_TYPES.includes(q.choiceType)) {
    error(`${label}: choiceType="${q.choiceType}" — допустимы: ${VALID_CHOICE_TYPES.join(", ")}`);
  }

  // prompt
  if (typeof q.prompt !== "string" || q.prompt.length === 0) {
    error(`${label}: prompt должен быть непустой строкой`);
  }

  // choices
  if (!Array.isArray(q.choices) || q.choices.length < 2) {
    error(`${label}: choices должен содержать минимум 2 варианта`);
  } else {
    const choiceIds = new Set();
    let correctCount = 0;

    for (let j = 0; j < q.choices.length; j++) {
      const c = q.choices[j];
      const cLabel = `${label} → choice[${j}]`;

      if (typeof c.id !== "number") {
        error(`${cLabel}: id должен быть числом`);
      } else if (choiceIds.has(c.id)) {
        error(`${cLabel}: дублирующийся choice id=${c.id}`);
      } else {
        choiceIds.add(c.id);
      }

      if (typeof c.content !== "string" || c.content.length === 0) {
        error(`${cLabel}: content должен быть непустой строкой`);
      }

      if (typeof c.score !== "number") {
        error(`${cLabel}: score должен быть числом`);
      } else if (c.score === 1) {
        correctCount++;
      } else if (c.score !== 0) {
        warn(`${cLabel}: score=${c.score} — ожидается 0 или 1`);
      }

      // Дубликаты content
      const dupes = q.choices.filter((other, k) => k !== j && other.content === c.content);
      if (dupes.length > 0) {
        error(`${cLabel}: дублирующийся content="${c.content}"`);
      }
    }

    if (correctCount === 0) {
      error(`${label}: нет правильного ответа (score=1)`);
    }
    if (q.choiceType === "single" && correctCount > 1) {
      error(`${label}: single choice, но ${correctCount} правильных ответов`);
    }
    if (q.choiceType === "yes_no" && q.choices.length !== 2) {
      error(`${label}: yes_no должен содержать ровно 2 варианта`);
    }
  }

  // image
  if (q.image != null) {
    if (typeof q.image !== "string") {
      error(`${label}: image должен быть строкой`);
    } else {
      const imagePath = join(IMAGES_DIR, q.image);
      if (!existsSync(imagePath)) {
        error(`${label}: файл не найден: seed/images/${q.image}`);
      }
    }
  }

  // irtParameters
  if (q.irtParameters == null) {
    error(`${label}: отсутствует irtParameters`);
  } else {
    for (const key of ["difficulty", "discriminability", "guessing", "slip"]) {
      if (typeof q.irtParameters[key] !== "number") {
        error(`${label}: irtParameters.${key} должен быть числом`);
      }
    }
  }

  // random
  if (typeof q.random !== "number") {
    error(`${label}: random должен быть числом`);
  } else if (q.random < 0 || q.random >= 1) {
    error(`${label}: random=${q.random} — должен быть в диапазоне [0, 1)`);
  } else {
    const key = q.random.toFixed(6);
    if (randoms.has(key)) {
      error(`${label}: дублирующийся random=${q.random}`);
    }
    randoms.add(key);
  }
}

// Итог
console.log();
if (errors > 0) {
  console.error(`💥 ${errors} ошибок, ${warnings} предупреждений`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`✅ Валидация пройдена (${warnings} предупреждений)`);
} else {
  console.log("✅ Валидация пройдена");
}
