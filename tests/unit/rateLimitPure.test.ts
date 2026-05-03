import { describe, it, expect } from "vitest";
import { computeRateLimitDecision } from "../../convex/bot/rateLimitPure";

describe("computeRateLimitDecision", () => {
  const windowMs = 10_000;
  const maxRequests = 3;

  it("allows first request and starts window", () => {
    const now = 1_000_000;
    const result = computeRateLimitDecision({ now, existing: null, windowMs, maxRequests });
    expect(result.allowed).toBe(true);
    expect(result.windowStart).toBe(now);
    expect(result.count).toBe(1);
  });

  it("allows up to maxRequests inside window", () => {
    const now = 1_000_000;
    const existing = { windowStart: now, count: 2 };
    const result = computeRateLimitDecision({ now, existing, windowMs, maxRequests });
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
  });

  it("blocks request beyond maxRequests inside window", () => {
    const now = 1_000_000;
    const existing = { windowStart: now, count: 3 };
    const result = computeRateLimitDecision({ now, existing, windowMs, maxRequests });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(windowMs);
  });

  it("resets window after it expires", () => {
    const now = 1_000_000;
    const existing = { windowStart: now - windowMs - 1, count: 99 };
    const result = computeRateLimitDecision({ now, existing, windowMs, maxRequests });
    expect(result.allowed).toBe(true);
    expect(result.windowStart).toBe(now);
    expect(result.count).toBe(1);
  });
});
