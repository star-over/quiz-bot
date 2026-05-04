// Чистые функции алгоритма BKT-F (Bayesian Knowledge Tracing with Forgetting).
// Без side-эффектов, без зависимостей от Convex — только математика.
//
// BKT-F — расширение классического BKT экспоненциальным забыванием.
// После каждого ответа: забывание → байесовское обновление → обучение → пересчёт half-life.
// Подробная формула и числовые примеры: docs/bkt-f-implementation-plan.md, разделы 4–5.

// ============================================================================
// Константы алгоритма (внутренние)
// ============================================================================

/**
 * Скорость обучения при правильном ответе.
 * KNOWN_new = KNOWN_obs + (1 - KNOWN_obs) × LEARN_CORRECT
 * При LEARN_CORRECT=0.20 достаточно 4–5 правильных ответов подряд для перехода
 * от PRIOR=0.10 к порогу мастерства 0.95.
 */
const LEARN_CORRECT = 0.20;

/**
 * Минимальный exposure-эффект при неправильном ответе.
 * Даже при ошибке пользователь видит правильный ответ — минимальное обучение.
 * При LEARN_WRONG=0.05 пол known после серии ошибок ~0.058
 * (достаточно низко, чтобы ошибки реально снижали known).
 */
const LEARN_WRONG = 0.05;

/**
 * LEARN для exposure-вопросов (yes_no): мини-урок, а не тест.
 * Пользователь видит утверждение и подтверждает/опровергает.
 * Байесовский шаг (2) работает как обычно, но с GUESS=0.50 даёт слабый сигнал.
 * Основной вклад — через LEARN (шаг 3).
 *
 * LEARN_CORRECT_EXPOSURE = 0.15 — чуть ниже обычного (0.20): угадать проще,
 *   уверенность в знании от правильного ответа меньше.
 * LEARN_WRONG_EXPOSURE = 0.10 — вдвое выше обычного (0.05): пользователь увидел
 *   правильный ответ + объяснение, это ценный педагогический момент.
 */
const LEARN_CORRECT_EXPOSURE = 0.15;
const LEARN_WRONG_EXPOSURE = 0.10;

/**
 * Правильный ответ удваивает half-life — интервалы растут экспоненциально.
 * 1д → 2д → 4д → 8д → 16д → 32д → 64д (консолидация после ~7 правильных).
 */
const HL_MULTIPLIER_CORRECT = 2.0;

/**
 * Неправильный ответ вдвое сокращает half-life — знание тает быстрее.
 * Ограничено HL_MIN снизу, чтобы не уходить в микроинтервалы.
 */
const HL_MULTIPLIER_WRONG = 0.5;

/** Минимальный half-life (дни). Пол для сокращения при ошибках. */
const HL_MIN = 0.5;

/** Максимальный half-life (дни). Потолок для роста при успехе. */
const HL_MAX = 365;

/**
 * Known после де-консолидации (ошибка на «выученном» KC).
 * Не с нуля — частичное знание сохранилось (0.60 > SCHEDULE_THRESHOLD? нет,
 * 0.60 < 0.70, поэтому KC попадает в активный пул — nextReviewAt = 0).
 */
const DECONSOLIDATION_KNOWN = 0.60;

/** Half-life после де-консолидации (дни). Умеренный интервал, не с начала. */
const DECONSOLIDATION_HL = 4.0;

/**
 * Множитель LEARN для secondary KC в multi-KC вопросах.
 * Первый KC в kcs[] = primary (полное обновление),
 * остальные = secondary (LEARN × 0.5 — слабый сигнал от косвенной практики).
 */
const SECONDARY_LEARN_FACTOR = 0.5;

/**
 * Целевой known для расчёта nextReviewAt.
 * nextReviewAt = момент, когда known упадёт до этого значения.
 * 0.50 — «забыл половину», оптимальный момент для повторения (testing effect).
 */
const REVIEW_TARGET = 0.50;

const MS_PER_DAY = 86_400_000;

// ============================================================================
// Константы, нужные внешнему коду (запросы, UI, seed)
// ============================================================================

/** Начальное P(Known) нового KC. Популяционная оценка, единая для всех. */
export const PRIOR = 0.10;

/** Начальный half-life нового KC (дни). */
export const INITIAL_HALF_LIFE = 1.0;

/** SLIP по умолчанию — вероятность ошибки при знании (до per-KC калибровки). */
export const DEFAULT_SLIP = 0.10;

/** Порог мастерства: known >= 0.95 означает «знает». */
export const MASTERY_THRESHOLD = 0.95;

/** Порог half-life для консолидации (дни). known >= 0.95 И hl >= 64 → «выучил навсегда». */
export const CONSOLIDATION_HL_THRESHOLD = 64;

/**
 * Порог перехода в расписание.
 * known < 0.70 → KC всегда в активном пуле (nextReviewAt = 0).
 * known >= 0.70 → KC уходит в расписание повторений.
 */
export const SCHEDULE_THRESHOLD = 0.70;

// ============================================================================
// Типы
// ============================================================================

export interface BktInput {
  /** P(Known) на момент lastSeen — не текущее, а сохранённое значение */
  known: number;
  /** Дней до снижения known вдвое (без практики) */
  halfLife: number;
  /** Timestamp последней практики (ms). Для расчёта Δt забывания */
  lastSeen: number;
  /** Timestamp текущего ответа (ms) */
  now: number;
  /** Правильный ответ? */
  isCorrect: boolean;
  /** Количество вариантов ответа. GUESS = 1/choicesCount (4 кнопки → 0.25) */
  choicesCount: number;
  /** SLIP вопроса — вероятность ошибки при знании */
  slip: number;
  /** Primary KC = полный LEARN; secondary = LEARN × 0.5 */
  isPrimary: boolean;
  /** KC заморожен (consolidated)? Влияет на логику: no-op или де-консолидация */
  consolidated: boolean;
  /**
   * Exposure-режим (yes_no вопросы).
   * Используются LEARN_EXPOSURE значения вместо стандартных.
   * Байесовский шаг работает как обычно (с GUESS=0.50 даёт слабый сигнал).
   */
  isExposure?: boolean;
}

export interface BktOutput {
  known: number;
  halfLife: number;
  /** Timestamp следующего повторения (ms). 0 = активный пул, Infinity = consolidated */
  nextReviewAt: number;
  consolidated: boolean;
}

export interface PriorityInput {
  /** P(Known) на момент lastSeen */
  known: number;
  /** Дней до снижения вдвое */
  halfLife: number;
  /** Timestamp последней практики (ms) */
  lastSeen: number;
  /** Текущий timestamp (ms) */
  now: number;
}

// ============================================================================
// Внутренние шаги алгоритма
// ============================================================================

/**
 * Шаг 1 — экспоненциальное забывание.
 * KNOWN_after = KNOWN × 2^(-Δt / HALF_LIFE)
 *
 * При Δt = HALF_LIFE known падает вдвое. При Δt = 0 — без изменений.
 */
function applyForgetting({
  known,
  halfLife,
  deltaDays,
}: {
  known: number;
  halfLife: number;
  deltaDays: number;
}): number {
  if (deltaDays <= 0) return known;
  return known * Math.pow(2, -deltaDays / halfLife);
}

/**
 * Шаг 2 — байесовское обновление: что ответ говорит о знании.
 *
 * Правильно: P(знает|правильно) = P(правильно|знает)×P(знает) / P(правильно)
 *   = known×(1-slip) / [known×(1-slip) + (1-known)×guess]
 *
 * Неправильно: P(знает|неправильно) = P(неправильно|знает)×P(знает) / P(неправильно)
 *   = known×slip / [known×slip + (1-known)×(1-guess)]
 */
function bayesianUpdate({
  knownAfterForget,
  isCorrect,
  guess,
  slip,
}: {
  knownAfterForget: number;
  isCorrect: boolean;
  guess: number;
  slip: number;
}): number {
  if (isCorrect) {
    const numerator = knownAfterForget * (1 - slip);
    const denominator = numerator + (1 - knownAfterForget) * guess;
    return numerator / denominator;
  }
  const numerator = knownAfterForget * slip;
  const denominator = numerator + (1 - knownAfterForget) * (1 - guess);
  return numerator / denominator;
}

/**
 * Шаг 3 — обучение (learning gain).
 * KNOWN_new = KNOWN_obs + (1 - KNOWN_obs) × LEARN
 *
 * Стандартный режим: LEARN_CORRECT (0.20) / LEARN_WRONG (0.05).
 * Exposure-режим (yes_no): LEARN_CORRECT_EXPOSURE (0.15) / LEARN_WRONG_EXPOSURE (0.10).
 * Secondary KC: LEARN × 0.5 — косвенная практика даёт меньше.
 */
function applyLearning({
  knownObs,
  isCorrect,
  isPrimary,
  isExposure,
}: {
  knownObs: number;
  isCorrect: boolean;
  isPrimary: boolean;
  isExposure: boolean;
}): number {
  const baseLearn = isExposure
    ? (isCorrect ? LEARN_CORRECT_EXPOSURE : LEARN_WRONG_EXPOSURE)
    : (isCorrect ? LEARN_CORRECT : LEARN_WRONG);
  const learn = isPrimary ? baseLearn : baseLearn * SECONDARY_LEARN_FACTOR;
  return knownObs + (1 - knownObs) * learn;
}

/**
 * Шаг 4 — обновление half-life.
 * Правильно: ×2.0 (интервалы растут экспоненциально).
 * Неправильно: ×0.5, но не ниже HL_MIN (0.5 дня).
 */
function updateHalfLife({
  halfLife,
  isCorrect,
}: {
  halfLife: number;
  isCorrect: boolean;
}): number {
  if (isCorrect) return Math.min(HL_MAX, halfLife * HL_MULTIPLIER_CORRECT);
  return Math.max(HL_MIN, halfLife * HL_MULTIPLIER_WRONG);
}

/**
 * Когда known упадёт до REVIEW_TARGET (50%).
 * Формула: now + HALF_LIFE × log₂(known / 0.5) дней.
 *
 * Если known < SCHEDULE_THRESHOLD (0.70) — KC в активном пуле,
 * возвращает 0 (показывать при каждой возможности).
 */
function computeNextReviewAt({
  known,
  halfLife,
  now,
}: {
  known: number;
  halfLife: number;
  now: number;
}): number {
  if (known < SCHEDULE_THRESHOLD) return 0;
  const daysUntilReview = halfLife * Math.log2(known / REVIEW_TARGET);
  return now + daysUntilReview * MS_PER_DAY;
}

// ============================================================================
// Публичный API
// ============================================================================

/**
 * Полный цикл обновления BKT-F после ответа пользователя.
 *
 * Три ветки:
 * 1. Consolidated + правильный ответ → no-op (знание подтверждено).
 * 2. Consolidated + ошибка → де-консолидация (known=0.60, hl=4д, в активный пул).
 * 3. Обычный KC → 4 шага: забывание → Байес → обучение → half-life.
 */
export function bktUpdate(input: BktInput): BktOutput {
  const { known, halfLife, lastSeen, now, isCorrect, choicesCount, slip, isPrimary, consolidated, isExposure = false } = input;

  // Ветка 1: consolidated + правильный ответ → подтверждение, ничего не меняем
  if (consolidated && isCorrect) {
    return { known, halfLife, nextReviewAt: computeNextReviewAt({ known, halfLife, now }), consolidated: true };
  }

  // Ветка 2: consolidated + ошибка → де-консолидация
  if (consolidated && !isCorrect) {
    return { known: DECONSOLIDATION_KNOWN, halfLife: DECONSOLIDATION_HL, nextReviewAt: 0, consolidated: false };
  }

  // Ветка 3: обычный KC — полный цикл обновления
  const guess = 1 / choicesCount;
  const deltaDays = (now - lastSeen) / MS_PER_DAY;

  const knownAfterForget = applyForgetting({ known, halfLife, deltaDays });
  const knownObs = bayesianUpdate({ knownAfterForget, isCorrect, guess, slip });
  const knownNew = applyLearning({ knownObs, isCorrect, isPrimary, isExposure });
  const halfLifeNew = updateHalfLife({ halfLife, isCorrect });

  // Консолидация: known >= 0.95 И half-life >= 64 дней
  const isConsolidated = knownNew >= MASTERY_THRESHOLD && halfLifeNew >= CONSOLIDATION_HL_THRESHOLD;

  return {
    known: knownNew,
    halfLife: halfLifeNew,
    nextReviewAt: isConsolidated ? Infinity : computeNextReviewAt({ known: knownNew, halfLife: halfLifeNew, now }),
    consolidated: isConsolidated,
  };
}

/**
 * Приоритет KC для выбора следующего вопроса (раздел 8 плана).
 *
 * Две компоненты (обе [0, 1]):
 * - need    = 1 - currentKNOWN  — насколько слабо знает прямо сейчас
 * - urgency = 1 - 2^(-Δt/HL)   — насколько сильно забыл с последней практики
 *
 * Разница: KC никогда не учил → need высокий, urgency=0.
 *          KC выучил давно    → оба высокие.
 *
 * Возвращает priority ∈ [0, 1]. Распределяется по корзинам:
 * >0.60 → корзина A (слабые), 0.30–0.60 → B (средние), <0.30 → низкий приоритет.
 */
export function computePriority({ known, halfLife, lastSeen, now }: PriorityInput): number {
  const deltaDays = (now - lastSeen) / MS_PER_DAY;
  const currentKnown = applyForgetting({ known, halfLife, deltaDays });
  const need = 1 - currentKnown;
  const urgency = 1 - Math.pow(2, -deltaDays / halfLife);
  return 0.5 * need + 0.5 * urgency;
}

/**
 * Начальное состояние для нового KC (первая встреча).
 * known = PRIOR (0.10), halfLife = 1 день, в активном пуле.
 */
export function createInitialMastery({ now: _now }: { now: number }): BktOutput {
  return { known: PRIOR, halfLife: INITIAL_HALF_LIFE, nextReviewAt: 0, consolidated: false };
}
