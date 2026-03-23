/**
 * Zod-схемы для валидации seed/questions.json.
 * Чистые функции — без I/O (fs, network). Проверка файлов — в validate.ts.
 */
import { z } from "zod";

// === Choice ===

export const choiceSchema = z.object({
  id: z.number().int("choice.id должен быть целым числом"),
  content: z.string().min(1, "choice.content не может быть пустым"),
  score: z.number("choice.score должен быть числом"),
  explanation: z.string().optional(),
});

export type SeedChoice = z.infer<typeof choiceSchema>;

// === IRT Parameters ===

export const irtParametersSchema = z.object({
  difficulty: z.number("difficulty должен быть числом"),
  discriminability: z.number("discriminability должен быть числом"),
  guessing: z.number("guessing должен быть числом"),
  slip: z.number("slip должен быть числом"),
});

// === Question ===

export const questionSchema = z
  .object({
    id: z.number().int("id должен быть целым числом"),
    choiceType: z.enum(["single", "multiple", "yes_no"]),
    prompt: z.string().min(1, "prompt не может быть пустым"),
    explanation: z.string().optional(),
    image: z.string().optional(),
    choices: z.array(choiceSchema).min(2, "минимум 2 варианта ответа"),
    irtParameters: irtParametersSchema,
    random: z.number().min(0, "random ≥ 0").max(1, "random < 1"),
  })
  // score должен быть 0 или 1
  .refine(
    (q) => q.choices.every((c) => c.score === 0 || c.score === 1),
    { message: "choice.score должен быть 0 или 1", path: ["choices"] },
  )
  // Минимум 1 правильный ответ
  .refine(
    (q) => q.choices.some((c) => c.score === 1),
    { message: "нет правильного ответа (score=1)", path: ["choices"] },
  )
  // single → ровно 1 правильный
  .refine(
    (q) => q.choiceType !== "single" || q.choices.filter((c) => c.score === 1).length === 1,
    { message: "single choice: должен быть ровно 1 правильный ответ", path: ["choices"] },
  )
  // yes_no → ровно 2 варианта
  .refine(
    (q) => q.choiceType !== "yes_no" || q.choices.length === 2,
    { message: "yes_no: должно быть ровно 2 варианта", path: ["choices"] },
  )
  // Уникальность choice.id внутри вопроса
  .refine(
    (q) => {
      const ids = new Set(q.choices.map((c) => c.id));
      return ids.size === q.choices.length;
    },
    { message: "дублирующиеся choice.id", path: ["choices"] },
  )
  // Уникальность choice.content внутри вопроса
  .refine(
    (q) => {
      const contents = new Set(q.choices.map((c) => c.content));
      return contents.size === q.choices.length;
    },
    { message: "дублирующийся choice.content", path: ["choices"] },
  )
  // random строго < 1
  .refine(
    (q) => q.random < 1,
    { message: "random должен быть в диапазоне [0, 1)", path: ["random"] },
  );

export type SeedQuestion = z.infer<typeof questionSchema>;

// === Массив вопросов (с глобальной уникальностью) ===

export const questionsArraySchema = z
  .array(questionSchema)
  // Уникальность id
  .refine(
    (questions) => {
      const ids = new Set<number>();
      for (const q of questions) {
        if (ids.has(q.id)) return false;
        ids.add(q.id);
      }
      return true;
    },
    { message: "дублирующиеся question.id" },
  )
  // Уникальность random (с точностью toFixed(6))
  .refine(
    (questions) => {
      const randoms = new Set<string>();
      for (const q of questions) {
        const key = q.random.toFixed(6);
        if (randoms.has(key)) return false;
        randoms.add(key);
      }
      return true;
    },
    { message: "дублирующиеся random значения" },
  );
