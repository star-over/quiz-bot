// convex/focusSlots/focusSlotsPure.ts
// Чистые функции Focus Slots — без side-эффектов, без Convex-зависимостей.

export const SLOT_COUNT = 4;
export const EXIT_STREAK = 3;
export const SLOT_TIMEOUT_MS = 30 * 60 * 1000; // 30 минут

export interface FocusSlot {
  kcId: string;
  role: "drill" | "new" | "review";
  correctStreak: number;
  totalAnswers: number;
  enteredAt: number;
}

export interface UserMasteryEntry {
  kcId: string;
  known: number;
  halfLife: number;
  lastSeen: number;
  nextReviewAt: number;
  consolidated: boolean;
  seenCount: number;
}

const MS_PER_DAY = 86_400_000;

export function computeCurrentKnown({
  known, halfLife, lastSeen, now,
}: {
  known: number;
  halfLife: number;
  lastSeen: number;
  now: number;
}): number {
  const deltaDays = (now - lastSeen) / MS_PER_DAY;
  if (deltaDays <= 0) return known;
  return known * Math.pow(2, -deltaDays / halfLife);
}

export function shouldExit({
  correctStreak, consolidated,
}: {
  correctStreak: number;
  consolidated: boolean;
}): boolean {
  return correctStreak >= EXIT_STREAK || consolidated;
}

export function pickSlot({
  slots, masteryMap, now,
}: {
  slots: FocusSlot[];
  masteryMap: Map<string, UserMasteryEntry>;
  now: number;
}): FocusSlot | null {
  const active = slots.filter((s) =>
    !shouldExit({
      correctStreak: s.correctStreak,
      consolidated: masteryMap.get(s.kcId)?.consolidated ?? false,
    })
  );
  if (active.length === 0) return null;

  active.sort((a, b) => {
    const mA = masteryMap.get(a.kcId);
    const mB = masteryMap.get(b.kcId);
    const knownA = computeCurrentKnown({
      known: mA?.known ?? 0,
      halfLife: mA?.halfLife ?? 1,
      lastSeen: mA?.lastSeen ?? now,
      now,
    });
    const knownB = computeCurrentKnown({
      known: mB?.known ?? 0,
      halfLife: mB?.halfLife ?? 1,
      lastSeen: mB?.lastSeen ?? now,
      now,
    });
    return knownA - knownB;
  });

  return active[0];
}

export function initSlots({
  existingSlots, masteryMap, now,
}: {
  existingSlots: FocusSlot[];
  masteryMap: Map<string, UserMasteryEntry>;
  now: number;
}): FocusSlot[] {
  return existingSlots.filter((s) => {
    const m = masteryMap.get(s.kcId);
    if (!m) return false;
    if (m.consolidated) return false;
    if (s.correctStreak >= EXIT_STREAK && now - s.enteredAt > SLOT_TIMEOUT_MS)
      return false;
    return true;
  });
}
