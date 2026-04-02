/**
 * Сборка промпта для рецензирования вопросов по одному KC.
 */
import type { GeneratedQuestion } from "./schemas.js";
import type { AuthorSlug } from "./constants.js";
import { AUTHOR_NAMES, REVIEW_MAX_PER_AUTHOR } from "./constants.js";

interface KcInfo {
  kcId: string;
  category: string;
  cefrLevel: string;
  description?: string;
}

/** Группирует вопросы по автору */
function groupByAuthor({ questions }: { questions: GeneratedQuestion[] }): Map<AuthorSlug, GeneratedQuestion[]> {
  const map = new Map<AuthorSlug, GeneratedQuestion[]>();
  for (const q of questions) {
    const existing = map.get(q.author) ?? [];
    existing.push(q);
    map.set(q.author, existing);
  }
  return map;
}

/** Форматирует вопросы автора как нумерованный JSON-блок */
function formatAuthorBlock({ author, questions }: { author: AuthorSlug; questions: GeneratedQuestion[] }): string {
  const name = AUTHOR_NAMES[author];
  const lines = [`### ${name} (${author}) — ${questions.length} вопросов\n`];
  for (let i = 0; i < questions.length; i++) {
    lines.push(`**[${i}]** model: ${questions[i]!.llmModel}`);
    lines.push("```json");
    lines.push(JSON.stringify(questions[i], null, 2));
    lines.push("```\n");
  }
  return lines.join("\n");
}

export function buildReviewPrompt({ kc, questions }: {
  kc: KcInfo;
  questions: GeneratedQuestion[];
}): { systemPrompt: string; userPrompt: string } {

  const systemPrompt = [
    "Ты — старший методист и редактор банка вопросов для Telegram quiz-бота, обучающего английскому языку.",
    "Аудитория — русскоговорящие ученики.",
    "Твоя задача — отрецензировать набор сгенерированных вопросов для одного KC и отобрать лучшие.",
    "Верни ровно один JSON-объект. Без markdown-блоков, без комментариев, без текста вокруг JSON.",
  ].join(" ");

  const grouped = groupByAuthor({ questions });
  const authorBlocks = [...grouped.entries()]
    .map(([author, qs]) => formatAuthorBlock({ author, questions: qs }))
    .join("\n---\n\n");

  const userPrompt = `## KC (Knowledge Component)

- **ID:** ${kc.kcId}
- **Категория:** ${kc.category}
- **Уровень CEFR:** ${kc.cefrLevel}
- **Описание:** ${kc.description ?? kc.kcId}

## Входные вопросы

Всего: ${questions.length} вопросов от ${grouped.size} авторов, сгенерированных разными LLM.

${authorBlocks}

---

## Задание

Проведи рецензию всех вопросов выше. Для каждого автора отбери **от 1 до ${REVIEW_MAX_PER_AUTHOR}** лучших вопросов.

### Критерии рецензии

1. **ФИЛЬТРАЦИЯ (брак)**
   - Варианты ответов (choices.content) не на английском — УДАЛИТЬ
   - Объяснения (choices.explanation) не на русском — УДАЛИТЬ
   - Бессмысленный правильный ответ или choices — УДАЛИТЬ
   - Нет ровно одного score=1 — УДАЛИТЬ
   - Фактические ошибки в грамматике — УДАЛИТЬ

2. **ДЕДУПЛИКАЦИЯ**
   - Если несколько вопросов тестируют один и тот же сценарий/паттерн — оставь самый яркий
   - "Яркий" = уникальный контекст, живой голос автора, запоминающийся сценарий

3. **НОРМАЛИЗАЦИЯ форматирования**
   - Подпись автора в prompt: должна быть (имя автора в начале или конце)
   - Telegram HTML: <b>, <i>, <u>, <code>, <s> — допустимые теги. Убери <code> из choices.content
   - Если prompt слишком сухой (менее 50 символов, нет контекста) — НЕ выбирай его

4. **ПОКРЫТИЕ KC**
   - Оцени, покрывают ли отобранные вопросы разные аспекты KC
   - Для грамматики: разные подлежащие (I/he/they), разные значения конструкции, разные контексты
   - Запиши наблюдения в coverageNotes

5. **ОТБОР лучших**
   - Для каждого автора выбери 1-2 лучших вопроса
   - Приоритет: яркий голос автора > разнообразие сценариев > длина объяснений
   - Можешь внести мелкие правки форматирования в отобранные вопросы (HTML, пунктуация)
   - НЕ переписывай содержание вопросов существенно

6. **ОЦЕНКА ПРОМПТА ГЕНЕРАЦИИ**
   - Если качество ответов одной или нескольких LLM систематически ниже ожиданий — напиши конкретные рекомендации по корректировке промпта генерации
   - Примеры: "модели путают язык choices", "не покрывают prediction-by-evidence", "слишком однотипные fill-the-gap"
   - Если промпт работает хорошо — поставь null

### Формат ответа

Верни ТОЛЬКО один JSON-объект:

{
  "selected": [
    {
      "choiceType": "single",
      "summary": "...",
      "prompt": "...",
      "slip": 0.05,
      "kcs": ["${kc.kcId}"],
      "choices": [...],
      "author": "methodist",
      "llmModel": "...",
      "generatedAt": "...",
      "reviewNote": "Почему выбран этот вопрос"
    }
  ],
  "rejected": [
    {
      "summary": "...",
      "author": "trap",
      "llmModel": "...",
      "reason": "Причина отклонения"
    }
  ],
  "coverageNotes": "Какие аспекты KC покрыты, чего не хватает",
  "promptCorrections": "Рекомендации по промпту или null"
}

Поле "selected" — массив полных объектов вопросов (с возможными правками форматирования).
Поле "rejected" — краткие записи об отклонённых вопросах.
`;

  return { systemPrompt, userPrompt };
}
