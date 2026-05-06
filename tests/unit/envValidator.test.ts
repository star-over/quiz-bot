import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateEnvVars } from "../../convex/bot/envValidator";

const VALID_ENV = {
  CONVEX_CLOUD_URL: "https://happy-animal-123.convex.cloud",
  CONVEX_SITE_URL: "https://happy-animal-123.convex.site",
  ENVIRONMENT: "development",
  BOT_TOKEN: "123456:ABC-DEF",
};

describe("validateEnvVars", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Восстанавливаем process.env ключ за ключом, не заменяя сам объект
    for (const key of Object.keys(process.env)) {
      delete (process.env as Record<string, string | undefined>)[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("возвращает валидированные переменные при корректном окружении", () => {
    Object.assign(process.env, VALID_ENV);
    const result = validateEnvVars();

    expect(result).toEqual(VALID_ENV);
  });

  it("бросает ошибку при отсутствии BOT_TOKEN", () => {
    const { BOT_TOKEN: _, ...envWithout } = VALID_ENV;
    // Удаляем BOT_TOKEN из process.env
    delete process.env.BOT_TOKEN;
    Object.assign(process.env, envWithout);

    expect(() => validateEnvVars()).toThrow();
  });

  it("бросает ошибку при невалидном ENVIRONMENT", () => {
    Object.assign(process.env, { ...VALID_ENV, ENVIRONMENT: "staging" });

    expect(() => validateEnvVars()).toThrow();
  });

  it("бросает ошибку при невалидном URL", () => {
    Object.assign(process.env, { ...VALID_ENV, CONVEX_CLOUD_URL: "not-a-url" });

    expect(() => validateEnvVars()).toThrow();
  });

  it("принимает ENVIRONMENT=production", () => {
    Object.assign(process.env, { ...VALID_ENV, ENVIRONMENT: "production" });
    const result = validateEnvVars();

    expect(result.ENVIRONMENT).toBe("production");
  });

  it("показывает Missing required environment variables при отсутствии нескольких полей", () => {
    delete process.env.CONVEX_CLOUD_URL;
    delete process.env.CONVEX_SITE_URL;
    delete process.env.ENVIRONMENT;
    delete process.env.BOT_TOKEN;

    expect(() => validateEnvVars()).toThrow(/Missing required environment variables/);
  });

  it("показывает Environment variable validation error при невалидном URL", () => {
    Object.assign(process.env, { ...VALID_ENV, CONVEX_CLOUD_URL: "not-a-url" });

    expect(() => validateEnvVars()).toThrow(/Environment variable validation error/);
  });
});
