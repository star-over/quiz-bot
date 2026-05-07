import type { Doc, Id } from "../_generated/dataModel";

export interface MasteryRow {
  _id: Id<"userMastery">;
  telegramUserId: string;
  kcId: string;
  known: number;
  halfLife: number;
  lastSeen: number;
  nextReviewAt: number;
  consolidated: boolean;
  seenCount: number;
}

export interface MasteryPatch {
  known?: number;
  halfLife?: number;
  lastSeen?: number;
  nextReviewAt?: number;
  consolidated?: boolean;
  seenCount?: number;
}

export interface MasteryInsert {
  telegramUserId: string;
  kcId: string;
  known: number;
  halfLife: number;
  lastSeen: number;
  nextReviewAt: number;
  consolidated: boolean;
  seenCount: number;
}

export interface MasteryUpdateEntry {
  kcId: string;
  consolidated: boolean;
  before: { known: number; halfLife: number };
  after: { known: number; halfLife: number };
}

export interface MasteryDeps {
  getQuestion(questionId: Id<"questions">): Promise<Doc<"questions"> | null>;
  getQuestionKcs(questionId: Id<"questions">): Promise<{ kcId: string; isPrimary: boolean }[]>;
  getMastery(telegramUserId: string, kcId: string): Promise<MasteryRow | null>;
  patchMastery(_id: Id<"userMastery">, patch: MasteryPatch): Promise<void>;
  insertMastery(row: MasteryInsert): Promise<Id<"userMastery">>;
}
