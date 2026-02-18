import { z } from "zod";

// Схема для валидации переменных окружения
/**
 * CONVEX_SITE_URL - URL для HTTP Actions, используется для вебхуков и других HTTP вызовов
 * Пример: https://happy-animal-123.convex.site
 *
 * CONVEX_CLOUD_URL - Основной URL для подключения клиентов Convex, используется для WebSocket и HTTP клиентов
 * Пример: https://happy-animal-123.convex.cloud
 */
const envSchema = z.object({
  CONVEX_CLOUD_URL: z.url({
    message: "CONVEX_CLOUD_URL must be a valid URL (e.g., https://happy-animal-123.convex.cloud)"
  }),
  CONVEX_SITE_URL: z.url({
    message: "CONVEX_SITE_URL must be a valid URL (e.g., https://happy-animal-123.convex.site)"
  }),
  ENVIRONMENT: z.enum(["development", "production"], {
    message: "ENVIRONMENT must be either 'development' or 'production'"
  }),
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
});

// Тип для валидированных переменных окружения
export type EnvVars = z.infer<typeof envSchema>;

/**
 * Валидирует переменные окружения и возвращает объект с ними
 * @throws {Error} Если какие-либо переменные отсутствуют или имеют неверный формат
 */
export function validateEnvVars(): EnvVars {
  try {
    const envVars = {
      CONVEX_CLOUD_URL: process.env.CONVEX_CLOUD_URL,
      CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
      ENVIRONMENT: process.env.ENVIRONMENT,
      BOT_TOKEN: process.env.BOT_TOKEN,
    };

    // Валидация с помощью Zod
    const validatedEnvVars = envSchema.parse(envVars);

    return validatedEnvVars;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.issues
        .filter(issue => issue.code === "invalid_type" && (issue as any).received === "undefined")
        .map(issue => issue.path[0]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required environment variables: ${missingFields.join(", ")}`);
      }

      throw new Error(`Environment variable validation error: ${error.issues.map(e => e.message).join(", ")}`);
    }

    throw error;
  }
}
