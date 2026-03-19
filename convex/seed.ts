import { action, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Генерация URL для загрузки файла в Storage. */
export const generateUploadUrl = action({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Очистить таблицу questions и вставить новые документы (аналог --replace). */
export const replaceQuestions = mutation({
  args: {
    questions: v.array(
      v.object({
        choiceType: v.union(
          v.literal("single"),
          v.literal("multiple"),
          v.literal("yes_no"),
        ),
        prompt: v.string(),
        explanation: v.optional(v.string()),
        imageStorageId: v.optional(v.id("_storage")),
        choices: v.array(
          v.object({
            id: v.number(),
            content: v.string(),
            score: v.number(),
            explanation: v.optional(v.string()),
          }),
        ),
        irtParameters: v.object({
          difficulty: v.number(),
          discriminability: v.number(),
          guessing: v.number(),
          slip: v.number(),
        }),
        random: v.number(),
      }),
    ),
  },
  handler: async (ctx, { questions }) => {
    // Удалить все существующие вопросы и их файлы из Storage
    const existing = await ctx.db.query("questions").collect();
    await Promise.all(
      existing.map(async (doc) => {
        if (doc.imageStorageId) {
          await ctx.storage.delete(doc.imageStorageId);
        }
        // eslint-disable-next-line @convex-dev/explicit-table-ids
        await ctx.db.delete(doc._id);
      }),
    );

    // Вставить новые
    for (const q of questions) {
      await ctx.db.insert("questions", q);
    }

    return questions.length;
  },
});
