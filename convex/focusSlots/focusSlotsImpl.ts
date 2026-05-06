import type { FocusSlot } from "./focusSlotsPure";
import {
  initSlots as initSlotsPure,
  chooseRefillRole,
  EXIT_STREAK,
  SLOT_COUNT,
} from "./focusSlotsPure";
import type { SlotFillerDeps, MasteryRow, KcRow } from "./focusSlotsTypes";
import { computePriority } from "../bkt/bktPure";

function isNonEmpty<T>(arr: readonly T[]): arr is readonly [T, ...T[]] {
  return arr.length > 0;
}

function randomElement<T>(arr: readonly [T, ...T[]]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function slotFromKc(kcId: string, role: FocusSlot["role"], now: number): FocusSlot {
  return { kcId, role, correctStreak: 0, totalAnswers: 0, enteredAt: now };
}

function sortByKnownAsc(a: MasteryRow, b: MasteryRow): number {
  return a.known - b.known;
}

function sortByPriorityDesc(a: MasteryRow, b: MasteryRow, now: number): number {
  const pa = computePriority({ known: a.known, halfLife: a.halfLife, lastSeen: a.lastSeen, now });
  const pb = computePriority({ known: b.known, halfLife: b.halfLife, lastSeen: b.lastSeen, now });
  return pb - pa;
}

export async function fillSlot({
  deps,
  telegramUserId,
  role,
  occupiedKcIds,
  now,
}: {
  deps: SlotFillerDeps;
  telegramUserId: string;
  role: "drill" | "new" | "review";
  occupiedKcIds: string[];
  now: number;
}): Promise<FocusSlot | null> {
  const excludeOpts = { excludeKcIds: occupiedKcIds };

  if (role === "drill") {
    const active = await deps.getActivePool(telegramUserId, excludeOpts);
    if (isNonEmpty(active)) {
      active.sort(sortByKnownAsc);
      const pick = randomElement(active);
      return slotFromKc(pick.kcId, role, now);
    }

    const due = await deps.getDueReview(telegramUserId, now, excludeOpts);
    if (isNonEmpty(due)) {
      due.sort((a, b) => sortByPriorityDesc(a, b, now));
      const pick = randomElement(due);
      return slotFromKc(pick.kcId, role, now);
    }

    return fillSlot({ deps, telegramUserId, role: "review", occupiedKcIds, now });
  }

  if (role === "new") {
    const user = await deps.getUser(telegramUserId);
    const pointer = user?.curriculumPointer ?? 0;

    const window = await deps.getKcCatalogWindow(pointer, 10);
    const seenIds = new Set(await deps.getSeenKcIds(telegramUserId));
    const qs = await deps.getKcIdsWithQuestions();

    const candidates = window.filter(
      (k) => !seenIds.has(k.kcId) && !occupiedKcIds.includes(k.kcId) && qs.has(k.kcId),
    );
    if (isNonEmpty(candidates)) {
      const pick = randomElement(candidates);
      return slotFromKc(pick.kcId, role, now);
    }

    const extended = await deps.getAllKcCatalog(200);
    const extendedCandidates = extended.filter(
      (k) => !seenIds.has(k.kcId) && !occupiedKcIds.includes(k.kcId) && qs.has(k.kcId),
    );
    if (isNonEmpty(extendedCandidates)) {
      const pick = randomElement(extendedCandidates);
      return slotFromKc(pick.kcId, role, now);
    }

    return fillSlot({ deps, telegramUserId, role: "review", occupiedKcIds, now });
  }

  const early = await deps.getEarlyReview(telegramUserId, excludeOpts);
  if (isNonEmpty(early)) {
    early.sort(sortByKnownAsc);
    const pick = randomElement(early);
    return slotFromKc(pick.kcId, role, now);
  }

  const fresh = await deps.getFreshKcs(telegramUserId, now, excludeOpts);
  if (isNonEmpty(fresh)) {
    fresh.sort((a, b) => sortByPriorityDesc(a, b, now));
    const pick = randomElement(fresh);
    return slotFromKc(pick.kcId, role, now);
  }

  const fragile = await deps.getFragileConsolidated(telegramUserId, excludeOpts);
  if (isNonEmpty(fragile)) {
    fragile.sort((a, b) => a.halfLife - b.halfLife);
    const pick = randomElement(fragile);
    return slotFromKc(pick.kcId, role, now);
  }

  const randomCons = await deps.getRandomConsolidated(telegramUserId, excludeOpts);
  if (isNonEmpty(randomCons)) {
    const pick = randomElement(randomCons);
    return slotFromKc(pick.kcId, role, now);
  }

  const user = await deps.getUser(telegramUserId);
  const pointer = user?.curriculumPointer ?? 0;
  const wideWindow = await deps.getKcCatalogWindow(pointer, 50);
  const seenIds = new Set(await deps.getSeenKcIds(telegramUserId));
  const qs = await deps.getKcIdsWithQuestions();

  const unseen = wideWindow.filter(
    (k) => !seenIds.has(k.kcId) && !occupiedKcIds.includes(k.kcId) && qs.has(k.kcId),
  );
  if (isNonEmpty(unseen)) {
    const pick = randomElement(unseen);
    return slotFromKc(pick.kcId, role, now);
  }

  const any = await deps.getAllKcCatalog(100);
  const anyCandidates = any.filter(
    (k) => !occupiedKcIds.includes(k.kcId) && qs.has(k.kcId),
  );
  if (isNonEmpty(anyCandidates)) {
    const pick = randomElement(anyCandidates);
    return slotFromKc(pick.kcId, "review", now);
  }

  return null;
}

export async function initSlots({
  deps,
  telegramUserId,
  now,
}: {
  deps: SlotFillerDeps;
  telegramUserId: string;
  now: number;
}): Promise<FocusSlot[]> {
  const user = await deps.getUser(telegramUserId);
  if (!user) throw new Error(`User ${telegramUserId} not found`);

  const existing = user.focusSlots ?? [];
  const kcIds = existing.map((s) => s.kcId);

  const masteryEntries = await Promise.all(
    kcIds.map((kcId) => deps.getMastery(telegramUserId, kcId)),
  );
  const masteryMap = new Map<string, MasteryRow>();
  masteryEntries.forEach((m, i) => {
    const kcId = kcIds[i];
    if (m && kcId) masteryMap.set(kcId, m);
  });

  const qs = await deps.getKcIdsWithQuestions();
  const kept = initSlotsPure({ existingSlots: existing, masteryMap, now }).filter((s) =>
    qs.has(s.kcId),
  );

  const roles: readonly ("drill" | "new" | "review")[] = ["drill", "drill", "new", "review"];
  const filled: (FocusSlot | undefined)[] = [...kept];

  for (let i = 0; i < roles.length; i++) {
    if (filled[i]) continue;
    const role = roles[i];
    if (!role) continue;
    const occupiedKcIds = filled.flatMap((s) => (s ? [s.kcId] : []));
    const slot = await fillSlot({ deps, telegramUserId, role, occupiedKcIds, now });
    if (slot) filled[i] = slot;
  }

  const finalSlots = filled.filter((s): s is FocusSlot => s !== undefined).slice(0, SLOT_COUNT);

  const patch: { focusSlots: FocusSlot[]; curriculumPointer?: number } = {
    focusSlots: finalSlots,
  };

  const newSlotKcIds = finalSlots.filter((s) => s.role === "new").map((s) => s.kcId);
  if (newSlotKcIds.length > 0) {
    const newKcs = await Promise.all(newSlotKcIds.map((kcId) => deps.getKcById(kcId)));
    const maxSortOrder = newKcs
      .filter((kc): kc is KcRow => kc !== null)
      .reduce((max, kc) => Math.max(max, kc.sortOrder), user.curriculumPointer ?? 0);
    if (maxSortOrder > (user.curriculumPointer ?? 0)) {
      patch.curriculumPointer = maxSortOrder;
    }
  }

  await deps.updateUser(user._id, patch);
  return finalSlots;
}

export async function updateAfterAnswer({
  deps,
  telegramUserId,
  kcId,
  isCorrect,
  now,
}: {
  deps: SlotFillerDeps;
  telegramUserId: string;
  kcId: string;
  isCorrect: boolean;
  now: number;
}): Promise<void> {
  const user = await deps.getUser(telegramUserId);
  if (!user) return;

  const slots = [...(user.focusSlots ?? [])];
  const idx = slots.findIndex((s) => s.kcId === kcId);
  if (idx === -1) return;

  const slot = slots[idx];
  if (!slot) return;

  slot.totalAnswers += 1;
  if (isCorrect) {
    slot.correctStreak += 1;
  } else {
    slot.correctStreak = 0;
  }

  const mastery = await deps.getMastery(telegramUserId, kcId);

  const shouldExit = slot.correctStreak >= EXIT_STREAK || (mastery?.consolidated ?? false);

  const patch: { focusSlots: FocusSlot[]; lastAnsweredAt: number; curriculumPointer?: number } = {
    focusSlots: slots,
    lastAnsweredAt: now,
  };

  if (shouldExit) {
    slots.splice(idx, 1);

    const remainingKcIds = slots.map((s) => s.kcId);
    const remainingMasteryEntries = await Promise.all(
      remainingKcIds.map((id) => deps.getMastery(telegramUserId, id)),
    );
    const remainingMasteryMap = new Map<string, MasteryRow>();
    remainingMasteryEntries.forEach((m, i) => {
      const id = remainingKcIds[i];
      if (m && id) remainingMasteryMap.set(id, m);
    });

    const refillRole = chooseRefillRole({
      slots,
      masteryMap: remainingMasteryMap,
      now,
      defaultRole: slot.role,
    });

    const filled = await fillSlot({
      deps,
      telegramUserId,
      role: refillRole,
      occupiedKcIds: remainingKcIds,
      now,
    });
    if (filled) slots.push(filled);

    if (refillRole === "new" && mastery && mastery.known >= 0.7) {
      const kc = await deps.getKcById(kcId);
      if (kc && (user.curriculumPointer ?? 0) < kc.sortOrder) {
        patch.curriculumPointer = kc.sortOrder;
      }
    }
  }

  await deps.updateUser(user._id, patch);
}
