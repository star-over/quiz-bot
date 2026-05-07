import { bktUpdate, createInitialMastery } from "../bkt/bktPure";
import type { Id } from "../_generated/dataModel";
import type {
  MasteryDeps,
  MasteryInsert,
  MasteryUpdateEntry,
} from "./userMasteryTypes";

const SENTINEL_MAX_DATE = 32503680000000;

function safeNextReviewAt(nextReviewAt: number): number {
  return Number.isFinite(nextReviewAt) ? nextReviewAt : SENTINEL_MAX_DATE;
}

export async function updateMastery({
  deps,
  telegramUserId,
  questionId,
  isCorrect,
  respondedAt,
}: {
  deps: MasteryDeps;
  telegramUserId: string;
  questionId: Id<"questions">;
  isCorrect: boolean;
  respondedAt: number;
}): Promise<MasteryUpdateEntry[]> {
  const question = await deps.getQuestion(questionId);
  if (!question) {
    throw new Error(`Question ${questionId} not found`);
  }

  const slip = question.slip;
  const choicesCount = question.choices.length;
  const isExposure = question.choiceType === "yes_no";

  const questionKcs = await deps.getQuestionKcs(questionId);
  if (questionKcs.length === 0) {
    return [];
  }

  const results: MasteryUpdateEntry[] = [];

  for (const qkc of questionKcs) {
    const existing = await deps.getMastery(telegramUserId, qkc.kcId);

    if (existing) {
      const before = { known: existing.known, halfLife: existing.halfLife };
      const output = bktUpdate({
        known: existing.known,
        halfLife: existing.halfLife,
        lastSeen: existing.lastSeen,
        now: respondedAt,
        isCorrect,
        choicesCount,
        slip,
        isPrimary: qkc.isPrimary,
        consolidated: existing.consolidated,
        isExposure,
      });
      const nextReviewAt = safeNextReviewAt(output.nextReviewAt);
      await deps.patchMastery(existing._id, {
        known: output.known,
        halfLife: output.halfLife,
        lastSeen: respondedAt,
        nextReviewAt,
        consolidated: output.consolidated,
        seenCount: existing.seenCount + 1,
      });
      results.push({
        kcId: qkc.kcId,
        consolidated: output.consolidated,
        before,
        after: { known: output.known, halfLife: output.halfLife },
      });
    } else {
      const initial = createInitialMastery({ now: respondedAt });
      const before = { known: initial.known, halfLife: initial.halfLife };
      const output = bktUpdate({
        known: initial.known,
        halfLife: initial.halfLife,
        lastSeen: respondedAt,
        now: respondedAt,
        isCorrect,
        choicesCount,
        slip,
        isPrimary: qkc.isPrimary,
        consolidated: false,
        isExposure,
      });
      const nextReviewAt = safeNextReviewAt(output.nextReviewAt);
      const row: MasteryInsert = {
        telegramUserId,
        kcId: qkc.kcId,
        known: output.known,
        halfLife: output.halfLife,
        lastSeen: respondedAt,
        nextReviewAt,
        consolidated: output.consolidated,
        seenCount: 1,
      };
      await deps.insertMastery(row);
      results.push({
        kcId: qkc.kcId,
        consolidated: output.consolidated,
        before,
        after: { known: output.known, halfLife: output.halfLife },
      });
    }
  }

  return results;
}

export async function getMasteryForKcs({
  deps,
  telegramUserId,
  kcIds,
}: {
  deps: Pick<MasteryDeps, "getMastery">;
  telegramUserId: string;
  kcIds: string[];
}): Promise<
  Array<{ kcId: string; known: number; halfLife: number; consolidated: boolean }>
> {
  const entries = await Promise.all(
    kcIds.map(async (kcId) => {
      const entry = await deps.getMastery(telegramUserId, kcId);
      return entry
        ? {
            kcId: entry.kcId,
            known: entry.known,
            halfLife: entry.halfLife,
            consolidated: entry.consolidated,
          }
        : null;
    }),
  );
  return entries.filter(
    (e): e is NonNullable<typeof e> => e !== null,
  );
}
