import type { InlineKeyboard } from "grammy";
import type { Doc, Id } from "../_generated/dataModel";

export type AnswerEvent =
  | { type: "answer"; choiceId: number }
  | { type: "skip" };

export interface QuestionSession {
  snapshot: unknown;
}

export interface DisplayedMessage {
  messageId: number;
  isPhoto: boolean;
}

export interface MasteryResult {
  kcId: string;
  consolidated: boolean;
  before: { known: number; halfLife: number };
  after: { known: number; halfLife: number };
}

export interface CatalogEntry {
  kcId: string;
  cefrLevel: string;
}

export interface MasteryEntry {
  kcId: string;
  known: number;
  halfLife: number;
  consolidated: boolean;
}

export interface AnswerFlowDeps {
  loadQuestionSession(args: { telegramUserId: string }): Promise<QuestionSession | null>;
  saveQuestionSession(args: { telegramUserId: string; session: QuestionSession | null }): Promise<void>;

  loadQuestion(args: { questionId: Id<"questions"> }): Promise<Doc<"questions"> | null>;

  updateMastery(args: {
    telegramUserId: string;
    questionId: Id<"questions">;
    isCorrect: boolean;
    respondedAt: number;
  }): Promise<MasteryResult[]>;

  updateFocusSlots(args: {
    telegramUserId: string;
    kcId: string;
    isCorrect: boolean;
    now: number;
  }): Promise<void>;

  logResponse(args: {
    telegramUserId: string;
    questionId: Id<"questions">;
    skipped: boolean;
    selectedChoiceId?: number;
    isCorrect?: boolean;
    choicesCount: number;
    selectedPosition?: number;
    correctPosition: number;
    shownAt: number;
    respondedAt: number;
    chatId: number;
    messageId: number;
    kcIds: string[];
    primaryKcId?: string;
  }): Promise<void>;

  displayQuestion(args: {
    chatId: number;
    text: string;
    keyboard: InlineKeyboard;
    photo?: {
      telegramFileId?: string;
      imageStorageId?: Id<"_storage">;
      questionId: Id<"questions">;
    };
  }): Promise<DisplayedMessage>;

  displayFeedback(args: {
    chatId: number;
    messageId: number;
    isPhoto: boolean;
    text: string;
    compactText: string;
    explanation?: string;
  }): Promise<void>;

  deleteQuestionMessage(args: { chatId: number; messageId: number }): Promise<void>;

  advanceDrill(args: { telegramUserId: string; now: number }): Promise<Doc<"questions"> | null>;

  loadKcCatalog(args: { kcIds: string[] }): Promise<CatalogEntry[]>;
  loadMasteryForKcs(args: { telegramUserId: string; kcIds: string[] }): Promise<MasteryEntry[]>;
}
