import { query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * Gets a random question from the database using an indexed 'random' field.
 * Принимает случайное число извне, т.к. Convex queries детерминированы —
 * Math.random() внутри query всегда возвращает одно и то же значение.
 */
export const getRandomQuestion = query({
  args: { random: v.number() },
  handler: async (ctx, { random }): Promise<Doc<"questions"> | null> => {
    // 1. Ищем первый вопрос с random > переданного значения
    let question = await ctx.db
      .query("questions")
      .withIndex("by_random", (q) => q.gt("random", random))
      .first();

    // 2. Если не нашли (значение больше всех в БД) — берём первый по индексу
    if (question === null) {
      question = await ctx.db.query("questions").withIndex("by_random").first();
    }

    return question;
  },
});
