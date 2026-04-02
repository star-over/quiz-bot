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

/**
 * Очистить kcCatalog и вставить новые записи.
 * random генерируется на стороне seed-скрипта.
 */
export const replaceKcCatalog = mutation({
  args: {
    items: v.array(
      v.object({
        kcId:        v.string(),
        category:    v.union(
          v.literal("grammar"),
          v.literal("vocab"),
          v.literal("collocation"),
          v.literal("spelling"),
        ),
        cefrLevel:   v.union(
          v.literal("A1"), v.literal("A2"),
          v.literal("B1"), v.literal("B2"),
        ),
        sortOrder:   v.number(),
        random:      v.number(),
        description: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    const existing = await ctx.db.query("kcCatalog").collect();
    await Promise.all(existing.map((doc) =>
      // Convex db.delete() не принимает имя таблицы — таблица известна из предыдущего query("kcCatalog")
      // eslint-disable-next-line @convex-dev/explicit-table-ids
      ctx.db.delete(doc._id),
    ));
    for (const item of items) {
      await ctx.db.insert("kcCatalog", item);
    }
    return items.length;
  },
});

/**
 * Очистить questionKcs и вставить новые записи.
 * Вызывается после replaceQuestions, когда известны Convex ID вопросов.
 */
export const replaceQuestionKcs = mutation({
  args: {
    entries: v.array(
      v.object({
        questionId: v.id("questions"),
        kcId:       v.string(),
        isPrimary:  v.boolean(),
      }),
    ),
  },
  handler: async (ctx, { entries }) => {
    const existing = await ctx.db.query("questionKcs").collect();
    await Promise.all(existing.map((doc) =>
      // Convex db.delete() не принимает имя таблицы — таблица известна из предыдущего query("questionKcs")
      // eslint-disable-next-line @convex-dev/explicit-table-ids
      ctx.db.delete(doc._id),
    ));
    for (const entry of entries) {
      await ctx.db.insert("questionKcs", entry);
    }
    return entries.length;
  },
});

/**
 * Очистить userMastery для всех пользователей.
 * Используется при полном пересеве (осторожно: удаляет прогресс пользователей).
 */
export const clearTopicMastery = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("userMastery").collect();
    await Promise.all(existing.map((doc) =>
      // Convex db.delete() не принимает имя таблицы — таблица известна из предыдущего query("userMastery")
      // eslint-disable-next-line @convex-dev/explicit-table-ids
      ctx.db.delete(doc._id),
    ));
    return existing.length;
  },
});

/**
 * Очистить таблицу questions (+ Storage файлы + questionKcs) и вставить новые.
 * Возвращает маппинг seedId → Convex ID для последующего заполнения questionKcs.
 */
export const replaceQuestions = mutation({
  args: {
    questions: v.array(
      v.object({
        seedId:         v.optional(v.number()),
        choiceType:     v.union(
          v.literal("single"),
          v.literal("multiple"),
          v.literal("yes_no"),
        ),
        prompt:         v.string(),
        explanation:    v.optional(v.string()),
        imageStorageId: v.optional(v.id("_storage")),
        kcs:            v.optional(v.array(v.string())),
        choices:        v.array(
          v.object({
            id:          v.number(),
            content:     v.string(),
            score:       v.number(),
            explanation: v.optional(v.string()),
          }),
        ),
        slip:           v.number(),
        random:         v.number(),
        author:         v.optional(v.string()),
        llmModel:       v.optional(v.string()),
        summary:        v.optional(v.string()),
        generatedAt:    v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { questions }) => {
    // Удалить зависимые questionKcs
    const existingKcs = await ctx.db.query("questionKcs").collect();
    await Promise.all(existingKcs.map((doc) =>
      // Convex db.delete() не принимает имя таблицы — таблица известна из предыдущего query("questionKcs")
      // eslint-disable-next-line @convex-dev/explicit-table-ids
      ctx.db.delete(doc._id),
    ));

    // Удалить все существующие вопросы и их файлы из Storage
    const existing = await ctx.db.query("questions").collect();
    await Promise.all(
      existing.map(async (doc) => {
        if (doc.imageStorageId) {
          await ctx.storage.delete(doc.imageStorageId);
        }
        // Convex db.delete() не принимает имя таблицы — таблица известна из предыдущего query("questions")
        // eslint-disable-next-line @convex-dev/explicit-table-ids
        await ctx.db.delete(doc._id);
      }),
    );

    // Вставить новые и собрать маппинг seedId → Convex ID
    const idMap: { seedId: number; convexId: string }[] = [];
    for (const q of questions) {
      const convexId = await ctx.db.insert("questions", q);
      if (q.seedId !== undefined) {
        idMap.push({ seedId: q.seedId, convexId });
      }
    }

    return idMap;
  },
});
