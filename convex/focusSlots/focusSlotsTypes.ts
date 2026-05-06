import type { FocusSlot, UserMasteryEntry } from "./focusSlotsPure";

export interface UserRow {
  _id: string;
  telegramId: string;
  focusSlots?: FocusSlot[];
  curriculumPointer?: number;
  lastAnsweredAt?: number;
}

export type MasteryRow = UserMasteryEntry;

export interface KcRow {
  kcId: string;
  sortOrder: number;
}

export type UserPatch = Pick<UserRow, 'focusSlots' | 'curriculumPointer' | 'lastAnsweredAt'>;

/**
 * Seam interface for slot-filling logic.
 * Decouples pure slot-filling algorithms from Convex-specific I/O.
 */
export interface SlotFillerDeps {
  getUser(telegramUserId: string): Promise<UserRow | null>;
  updateUser(convexUserId: string, patch: UserPatch): Promise<void>;

  getActivePool(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getDueReview(userId: string, opts: { now: number; excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getEarlyReview(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getFreshKcs(userId: string, opts: { now: number; excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getFragileConsolidated(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getRandomConsolidated(userId: string, opts: { excludeKcIds: string[] }): Promise<MasteryRow[]>;
  getMastery(userId: string, kcId: string): Promise<MasteryRow | null>;

  getKcCatalogWindow(pointer: number, limit: number): Promise<KcRow[]>;
  getAllKcCatalog(limit: number): Promise<KcRow[]>;
  getKcById(kcId: string): Promise<KcRow | null>;

  getSeenKcIds(userId: string): Promise<string[]>;
  getKcIdsWithQuestions(): Promise<Set<string>>;
}
