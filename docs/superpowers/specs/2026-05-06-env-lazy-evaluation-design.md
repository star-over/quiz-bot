# Lazy Env Validation (Candidate 7)

> Дата: 2026-05-06
> Статус: Approved

## Проблема

`convex/bot/index.ts` вызывает `validateEnvVars()` на top-level при загрузке модуля:
```ts
export const env = validateEnvVars();
```

Любой import `bot/index.ts` (прямой или транзитивный) триггерит валидацию env. `botHandleUpdate.test.ts` вынужден ставить `process.env` **до** импорта бота, иначе тест падает. Это хрупкость — добавление import выше ломает тест.

## Решение

Lazy singleton в `bot/index.ts`:
```ts
let _env: EnvVars | undefined;
export function getEnv(): EnvVars {
  if (!_env) _env = validateEnvVars();
  return _env;
}
```

**Потребители:**
- `telegramBot.ts` — `env.BOT_TOKEN` → `getEnv().BOT_TOKEN` (inside handler)
- `development.ts` — `env.*` → `getEnv().*` (inside handler)
- `http.ts` — `env.ENVIRONMENT` → `getEnv().ENVIRONMENT` (top-level path constant)

**Результат:**
- Импорт `registerHandlers` из `bot/index.ts` больше не триггерит валидацию.
- `botHandleUpdate.test.ts` больше не зависит от порядка `process.env` и импорта.
- Валидация env откладывается до первого runtime-вызова `getEnv()`.
