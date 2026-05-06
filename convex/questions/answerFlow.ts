import { createActor } from "xstate";
import type { Doc, Id } from "../_generated/dataModel";
import { scqMachine } from "../machines/scqMachine";
import {
  buildDebugFooter,
  safeParseSnapshot,
  type KcDebugEntry,
} from "./questionPure";
import {
  canUseInlineLabels,
  makeSingleChoiceKeyboard,
  makeYesNoKeyboard,
} from "../bot/keyboard";
import type { AnswerFlowDeps } from "./answerFlowTypes";

export async function deliverQuestion({
  deps,
  telegramUserId,
  chatId,
  question,
}: {
  deps: AnswerFlowDeps;
  telegramUserId: string;
  chatId: number;
  question: Doc<"questions">;
}): Promise<void> {
  // 1. Delete old message if exists
  const session = await deps.loadQuestionSession({ telegramUserId });
  if (session) {
    const parsed = safeParseSnapshot(
      typeof session.snapshot === "string"
        ? session.snapshot
        : JSON.stringify(session.snapshot),
    );
    if (parsed.success) {
      const old = parsed.snapshot as { context?: { messageId?: number } };
      if (old.context?.messageId) {
        await deps.deleteQuestionMessage({
          chatId,
          messageId: old.context.messageId,
        });
      }
    }
  }

  // 2. Prepare choices
  const choices = question.choices.map((choice) => ({
    id: choice.id,
    content: choice.content,
    isCorrect: choice.score === 1,
    explanation: choice.explanation,
  }));

  // 3. Build keyboard and text
  let keyboard;
  let messageText: string;

  if (question.choiceType === "yes_no") {
    keyboard = makeYesNoKeyboard({ choices, questionId: question._id });
    messageText = question.prompt;
  } else {
    const useInlineLabels = canUseInlineLabels(choices);
    keyboard = makeSingleChoiceKeyboard({
      choices,
      questionId: question._id,
      useInlineLabels,
    });
    messageText = useInlineLabels
      ? question.prompt
      : [
          question.prompt,
          "",
          choices.map((choice, i) => `${i + 1}. ${choice.content}`).join("\n"),
        ].join("\n");
  }

  // 4. Debug footer (dev mode)
  const isDevMode = process.env.ENVIRONMENT === "development";
  if (isDevMode && question.kcs && question.kcs.length > 0) {
    const [catalogEntries, masteryEntries] = await Promise.all([
      deps.loadKcCatalog({ kcIds: question.kcs }),
      deps.loadMasteryForKcs({ telegramUserId, kcIds: question.kcs }),
    ]);

    const masteryMap = new Map(masteryEntries.map((m) => [m.kcId, m]));
    const kcs: KcDebugEntry[] = question.kcs.map((kcId) => {
      const catalog = catalogEntries.find((c) => c.kcId === kcId);
      const mastery = masteryMap.get(kcId);
      return {
        kcId,
        cefrLevel: catalog?.cefrLevel ?? "?",
        ...(mastery
          ? {
              consolidated: mastery.consolidated,
              masteryBefore: {
                known: mastery.known,
                halfLife: mastery.halfLife,
              },
            }
          : {}),
      };
    });

    const footer = buildDebugFooter({
      seedId: question.seedId,
      slip: question.slip,
      choicesCount: question.choices.length,
      isExposure: question.choiceType === "yes_no",
      kcs,
    });
    messageText = `${messageText}\n\n${footer}`;
  }

  // 5. Display question
  const displayed = await deps.displayQuestion({
    chatId,
    text: messageText,
    keyboard,
    photo:
      question.telegramFileId || question.imageStorageId
        ? {
            telegramFileId: question.telegramFileId,
            imageStorageId: question.imageStorageId,
            questionId: question._id,
          }
        : undefined,
  });

  // 6. Start machine and persist
  const actor = createActor(scqMachine, {
    input: {
      questionId: question._id,
      prompt: question.prompt,
      explanation: question.explanation,
      choices,
    },
  });
  actor.start();
  actor.send({
    type: "MESSAGE_SENT",
    messageId: displayed.messageId,
    isPhoto: displayed.isPhoto,
    shownAt: Date.now(),
  });

  await deps.saveQuestionSession({
    telegramUserId,
    session: { snapshot: actor.getSnapshot() },
  });
}
