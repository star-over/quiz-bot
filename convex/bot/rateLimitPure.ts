export interface RateLimitState {
  windowStart: number;
  count: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  windowStart: number;
  count: number;
  retryAfterMs?: number;
}

export function computeRateLimitDecision({
  now,
  existing,
  windowMs,
  maxRequests,
}: {
  now: number;
  existing: RateLimitState | null;
  windowMs: number;
  maxRequests: number;
}): RateLimitDecision {
  if (!existing || now - existing.windowStart > windowMs) {
    return { allowed: true, windowStart: now, count: 1 };
  }

  if (existing.count < maxRequests) {
    return { allowed: true, windowStart: existing.windowStart, count: existing.count + 1 };
  }

  const retryAfterMs = Math.max(0, existing.windowStart + windowMs - now);
  return { allowed: false, windowStart: existing.windowStart, count: existing.count, retryAfterMs };
}
