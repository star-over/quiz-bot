# Drill Lifecycle Deepening

> Дата: 2026-05-06
> Статус: Approved
> Кандидат: Candidate 6 из architecture-review-2026-05-06.md

## Проблема

`start.ts`, `test.ts`, `stop.ts` содержат дублирование и fragility:

1. **~25 строк duplication** между `start.ts` и `test.ts`:
   - `ensureUser` + `getByTelegramId`
   - `createActor(drillMachine)` из snapshot (raw `JSON.parse`)
   - `drillActor.start()` + `send(START)`
   - `updateDrillSnapshot`

2. **Raw `JSON.parse`** в `stop.ts` для `drillSnapshot` и `questionSnapshot` — corrupted snapshot → throw. В `answerFlow.ts` используется `safeParseSnapshot` → graceful reset.

## Дизайн

### Deep module

`convex/bot/drillLifecycle.ts` — чистые функции, zero side-effects кроме вызовов через deps.

```ts
export interface DrillLifecycleDeps {
  ensureUser(args: EnsureUserArgs): Promise<void>;
  getUser(args: { telegramId: string }): Promise<UserRow | null>;
  updateDrillSnapshot(args: { telegramId: string; drillSnapshot?: string }): Promise<void>;
  updateQuestionSnapshot(args: { telegramId: string; questionSnapshot?: string }): Promise<void>;
  deleteMessage(args: { chatId: number; messageId: number }): Promise<void>;
}

export async function activateDrill({ deps, telegramId, profile, reenter }): Promise<void>
export async function deactivateDrill({ deps, telegramId, chatId }): Promise<void>
export async function isDrilling({ deps, telegramId }): Promise<boolean>
```

**`activateDrill`:**
1. `ensureUser`
2. `getUser` → load drillSnapshot
3. `safeParseSnapshot` → corrupted → fresh actor
4. `createActor` → `start()`
5. Если `reenter = true` (default) → всегда `send(START)` + save snapshot
6. Если `reenter = false` → `send(START)` только если state = `idle`, затем save snapshot

**`deactivateDrill`:**
1. `getUser`
2. `safeParseSnapshot` questionSnapshot → delete message → clear questionSnapshot
3. `safeParseSnapshot` drillSnapshot → create actor → `send(STOP)` → save snapshot. Corrupted → clear snapshot.

**`isDrilling`:**
1. `getUser` → `safeParseSnapshot` drillSnapshot → value === `"questioning"`. Corrupted → clear → `false`.

### Adapter

`convex/bot/drillLifecycleAdapter.ts`:
```ts
export function createDrillLifecycleAdapter({
  ctx,
  bot,
  chatId,
}: {
  ctx: ActionCtx;
  bot: Api;
  chatId: number;
}): DrillLifecycleDeps
```

### Tests

`tests/unit/drillLifecycle.test.ts` — stub-adapter, 10 тестов:
- activateDrill: new user → fresh actor → START → save
- activateDrill: existing idle → START → save
- activateDrill: existing questioning + reenter=true → START → save
- activateDrill: existing questioning + reenter=false → no send, no save
- activateDrill: corrupted snapshot → fresh actor → START → save
- deactivateDrill: questioning → delete message + STOP + save
- deactivateDrill: idle → STOP + save
- deactivateDrill: corrupted snapshots → clear both
- isDrilling: questioning → true
- isDrilling: no snapshot / idle / corrupted → false

## Handler refactoring

- `start.ts`: `activateDrill({ reenter: true })` → `advanceDrill()` → `deliverQuestion()`
- `test.ts`: `activateDrill({ reenter: false })` → `deliverQuestion(question)`
- `stop.ts`: `deactivateDrill()` → `reply("Бот остановлен...")`

## Leverage

Вызывающий передаёт `telegramId` + `profile`, модуль выполняет: ensureUser → load → parse → actor lifecycle → DB write.

## Локальность

Баг в drill activation/deactivation теперь живёт в 1 файле (`drillLifecycle.ts`), не bouncing между 3 handler-файлами.
