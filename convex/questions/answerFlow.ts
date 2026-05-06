import { createActor } from "xstate";
import type { Doc, Id } from "../_generated/dataModel";
import { scqMachine } from "../machines/scqMachine";
import {
  buildDebugFooter,
  safeParseSnapshot,
  checkAnswer,
  buildFeedbackText,
  getExplanation,
  type KcDebugEntry,
} from "./questionPure";
import {
  canUseInlineLabels,
  makeSingleChoiceKeyboard,
  makeYesNoKeyboard,
} from "../bot/keyboard";
import type { AnswerEvent, AnswerFlowDeps } from "./answerFlowTypes";

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
  const displayArgs: Parameters<AnswerFlowDeps["displayQuestion"]>[0] = {
    chatId,
    text: messageText,
    keyboard,
  };
  if (question.telegramFileId || question.imageStorageId) {
    displayArgs.photo = {
      questionId: question._id,
      ...(question.telegramFileId ? { telegramFileId: question.telegramFileId } : {}),
      ...(question.imageStorageId ? { imageStorageId: question.imageStorageId } : {}),
    };
  }
  const displayed = await deps.displayQuestion(displayArgs);

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

export async function processResponse({
  deps,
  telegramUserId,
  chatId,
  event,
}: {
  deps: AnswerFlowDeps;
  telegramUserId: string;
  chatId: number;
  event: AnswerEvent;
}): Promise<void> {
  const respondedAt = Date.now();

  // 1. Load session
  const session = await deps.loadQuestionSession({ telegramUserId });
  if (!session) return;

  // 2. Parse snapshot
  const sessionString =
    typeof session.snapshot === "string"
      ? session.snapshot
      : JSON.stringify(session.snapshot);
  const parseResult = safeParseSnapshot(sessionString);
  if (!parseResult.success) {
    await deps.saveQuestionSession({ telegramUserId, session: null });
    return;
  }

  const persistedSnapshot = parseResult.snapshot as never;
  const actor = createActor(scqMachine, {
    snapshot: persistedSnapshot,
    input: (parseResult.snapshot as { context: never }).context,
  });
  actor.start();

  // 3. Send event
  if (event.type === "answer") {
    actor.send({ type: "ANSWER_SELECTED", choiceId: event.choiceId });
  } else {
    actor.send({ type: "SKIPPED" });
  }
  const context = actor.getSnapshot().context;

  // 4. Check answer
  const isCorrect =
    event.type === "answer"
      ? checkAnswer({ choices: context.choices, selectedChoiceId: event.choiceId })
      : false;

  // 5. Update mastery
  const masteryResults = await deps.updateMastery({
    telegramUserId,
    questionId: context.questionId as Id<"questions">,
    isCorrect,
    respondedAt,
  });

  // 6. Update focus slots
  const kcIds = masteryResults.map((r) => r.kcId);
  for (const kcId of kcIds) {
    await deps.updateFocusSlots({
      telegramUserId,
      kcId,
      isCorrect,
      now: respondedAt,
    });
  }

  // 7. Show feedback
  const skipped = event.type === "skip";
  const feedbackText = buildFeedbackText({ context, isCorrect, skipped });
  const compactFeedbackText = buildFeedbackText({
    context,
    isCorrect,
    skipped,
    omitExplanation: true,
  });
  const explanationText = getExplanation({ context, skipped });

  let debugFooter: string | undefined;
  const isDevMode = process.env.ENVIRONMENT === "development";
  if (isDevMode && context.shownAt !== undefined) {
    const question = await deps.loadQuestion({
      questionId: context.questionId as Id<"questions">,
    });
    if (question?.kcs && question.kcs.length > 0) {
      const catalogEntries = await deps.loadKcCatalog({ kcIds: question.kcs });
      const masteryMap = new Map(masteryResults.map((m) => [m.kcId, m]));
      const kcs = question.kcs.map((kcId) => {
        const catalog = catalogEntries.find((c) => c.kcId === kcId);
        const mastery = masteryMap.get(kcId);
        return {
          kcId,
          cefrLevel: catalog?.cefrLevel ?? "?",
          ...(mastery ? { consolidated: mastery.consolidated } : {}),
          ...(mastery?.before ? { masteryBefore: mastery.before } : {}),
          ...(mastery?.after ? { masteryAfter: mastery.after } : {}),
        };
      });

      debugFooter = buildDebugFooter({
        seedId: question.seedId,
        slip: question.slip,
        choicesCount: question.choices.length,
        isExposure: question.choiceType === "yes_no",
        kcs,
        elapsedMs: respondedAt - context.shownAt,
      });
    }
  }

  await deps.displayFeedback({
    chatId,
    messageId: context.messageId!,
    isPhoto: context.isPhoto ?? false,
    text: debugFooter ? `${feedbackText}\n\n${debugFooter}` : feedbackText,
    compactText: debugFooter
      ? `${compactFeedbackText}\n\n${debugFooter}`
      : compactFeedbackText,
    ...(explanationText ? { explanation: explanationText } : {}),
  });

  // 8. Machine: feedback shown → finish
  actor.send({ type: "FEEDBACK_SHOWN" });

  // 9. Log response
  const selectedIndex = context.choices.findIndex(
    (c) => c.id === context.selectedChoiceId,
  );
  const correctIndex = context.choices.findIndex((c) => c.isCorrect);
  if (context.shownAt !== undefined && context.messageId !== undefined) {
    await deps.logResponse({
      telegramUserId,
      questionId: context.questionId as Id<"questions">,
      skipped,
      ...(event.type === "answer"
        ? {
            selectedChoiceId: event.choiceId,
            isCorrect,
            selectedPosition: selectedIndex + 1,
          }
        : {}),
      choicesCount: context.choices.length,
      correctPosition: correctIndex + 1,
      shownAt: context.shownAt,
      respondedAt,
      chatId,
      messageId: context.messageId,
      kcIds,
    });
  }

  // 10. Clear session and advance drill
  await deps.saveQuestionSession({ telegramUserId, session: null });

  const nextQuestion = await deps.advanceDrill({ telegramUserId, now: respondedAt });
  if (nextQuestion) {
    await deliverQuestion({ deps, telegramUserId, chatId, question: nextQuestion });
  }
}
