//Nvidia models:
// moonshotai/kimi-k2.5          -- 20-60 сек.
// z-ai/glm5                     -- 30 сек.
// qwen/qwen3.5-397b-a17b        -- 30-60 сек.
// moonshotai/kimi-k2-thinking   -- 100 сек.
// openai/gpt-oss-120b -- быстрый ответ + ошибки форматирования
// deepseek-ai/deepseek-v3.2 -- долгий таймаут
// deepseek-ai/deepseek-v3.1 -- таймаут 30-60 сек. + ошибки форматирования
// mistralai/mistral-large-3-675b-instruct-2512 -- 9-130 сек. + ошибки форматирования
// meta/llama-3.1-405b-instruct -- 9-30 сек.
// minimaxai/minimax-m2.5
// aliceai-llm
// GigaChat-Pro
/**
 * Обёртка для вызова LLM через OpenAI SDK.
 *
 * Конфигурация провайдеров загружается из src/providers/*.json.
 * Каждый файл описывает провайдер: baseURL, API-ключ, тип API (chat/responses),
 * список поддерживаемых моделей. Модель автоматически маршрутизируется
 * к правильному провайдеру по имени.
 *
 * Поддерживаемые типы API:
 * - "chat"      → client.chat.completions.create (OpenAI, Anthropic, NVIDIA)
 * - "responses" → client.responses.create (Yandex Cloud и др.)
 *
 * Поддерживаемые типы авторизации:
 * - "apiKey" (по умолчанию) — статический ключ из env
 * - "oauth"  — обмен auth key на временный access token (GigaChat и др.)
 */
import OpenAI from "openai";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = join(__dirname, "providers");

// ── Конфигурация провайдеров ────────────────────────────────────────────────

interface OAuthConfig {
  tokenURL: string;
  authKeyEnv: string;
  scope: string;
}

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKeyEnv?: string;                  // для auth: "apiKey" (по умолчанию)
  api: "chat" | "responses";
  auth?: "apiKey" | "oauth";
  oauth?: OAuthConfig;                 // для auth: "oauth"
  headers?: Record<string, string>;    // доп. заголовки; $ENV_VAR подставляется из env
  modelPrefix?: string;                // префикс модели для API-вызова; $ENV_VAR подставляется
  tlsRejectUnauthorized?: boolean;     // false для серверов с нестандартными сертификатами
  models: string[];
}

/** Подставляет $ENV_VAR в строку */
function substituteEnv({ value }: { value: string }): string {
  return value.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name: string) => {
    const envVal = process.env[name];
    if (!envVal) throw new Error(`Переменная окружения ${name} не задана (требуется для провайдера)`);
    return envVal;
  });
}

function loadProviders(): { configs: ProviderConfig[]; modelMap: Map<string, ProviderConfig> } {
  const configs: ProviderConfig[] = [];
  const modelMap = new Map<string, ProviderConfig>();

  const files = readdirSync(PROVIDERS_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const raw = readFileSync(join(PROVIDERS_DIR, file), "utf8");
    const config = JSON.parse(raw) as ProviderConfig;
    config.api ??= "chat";
    config.auth ??= "apiKey";
    configs.push(config);

    for (const model of config.models) {
      if (modelMap.has(model)) {
        throw new Error(`Модель ${model} определена в нескольких провайдерах`);
      }
      modelMap.set(model, config);
    }
  }

  return { configs, modelMap };
}

const { modelMap } = loadProviders();

function getProvider({ model }: { model: string }): ProviderConfig {
  const config = modelMap.get(model);
  if (!config) {
    const available = [...modelMap.keys()].sort().join(", ");
    throw new Error(`Неизвестная модель: ${model}\nДоступные: ${available}`);
  }
  return config;
}

// ── OAuth: получение и кеширование access token ─────────────────────────────

interface TokenEntry {
  token: string;
  expiresAt: number;  // unix ms
}

const tokenCache = new Map<string, TokenEntry>();

async function getOAuthToken({ provider }: { provider: ProviderConfig }): Promise<string> {
  const oauth = provider.oauth!;

  // Проверяем кеш (обновляем за 60 сек до истечения)
  const cached = tokenCache.get(provider.name);
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.token;
  }

  const authKey = process.env[oauth.authKeyEnv];
  if (!authKey) throw new Error(`Переменная окружения ${oauth.authKeyEnv} не задана`);

  console.log(`  🔑 Обновление OAuth-токена для ${provider.name}...`);

  // Временно отключаем проверку TLS для серверов с нестандартными сертификатами (Минцифры РФ)
  const prevTls = process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
  if (provider.tlsRejectUnauthorized === false) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
  }

  let response: Response;
  try {
    response = await fetch(oauth.tokenURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "RqUID": randomUUID(),
        "Authorization": `Basic ${authKey}`,
      },
      body: `scope=${encodeURIComponent(oauth.scope)}`,
    });
  } finally {
    // Восстанавливаем настройку TLS
    if (provider.tlsRejectUnauthorized === false) {
      if (prevTls === undefined) delete process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
      else process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = prevTls;
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth ошибка ${response.status}: ${text}`);
  }

  const data = await response.json() as { access_token: string; expires_at: number };
  // expires_at — unix timestamp в миллисекундах
  const entry: TokenEntry = {
    token: data.access_token,
    expiresAt: data.expires_at,
  };
  tokenCache.set(provider.name, entry);

  return entry.token;
}

// ── Клиенты OpenAI SDK ──────────────────────────────────────────────────────

// Кеш клиентов по ключу "имя провайдера" (для apiKey) или не кешируется (для oauth)
const clients = new Map<string, OpenAI>();

async function getClient({ provider }: { provider: ProviderConfig }): Promise<OpenAI> {
  // OAuth: токен обновляется → клиент пересоздаётся при каждом вызове
  if (provider.auth === "oauth") {
    const token = await getOAuthToken({ provider });

    const defaultHeaders: Record<string, string> = {};
    if (provider.headers) {
      for (const [key, value] of Object.entries(provider.headers)) {
        defaultHeaders[key] = substituteEnv({ value });
      }
    }

    return new OpenAI({
      apiKey: token,
      baseURL: provider.baseURL,
      timeout: 300_000,
      defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
    });
  }

  // apiKey: кешируем клиент
  const cached = clients.get(provider.name);
  if (cached) return cached;

  const apiKey = process.env[provider.apiKeyEnv!];
  if (!apiKey) throw new Error(`Переменная окружения ${provider.apiKeyEnv} не задана`);

  const defaultHeaders: Record<string, string> = {};
  if (provider.headers) {
    for (const [key, value] of Object.entries(provider.headers)) {
      defaultHeaders[key] = substituteEnv({ value });
    }
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider.baseURL,
    timeout: 300_000,
    defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
  });

  clients.set(provider.name, client);
  return client;
}

// ── Публичный API ───────────────────────────────────────────────────────────

/** Вызывает LLM и возвращает сырой текст ответа */
export async function callLlm({ model, systemPrompt, userPrompt, maxTokens = 8192, temperature = 1 }: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const provider = getProvider({ model });
  const client = await getClient({ provider });
  console.log(`  🔄 LLM запрос → ${provider.name} / ${model}...`);
  const start = Date.now();

  // Имя модели для API-вызова (с возможным префиксом)
  const apiModel = provider.modelPrefix
    ? substituteEnv({ value: provider.modelPrefix }) + model
    : model;

  // Временно отключаем проверку TLS для нестандартных сертификатов
  const prevTls = process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
  if (provider.tlsRejectUnauthorized === false) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
  }

  let content: string;
  try {
    if (provider.api === "responses") {
      // Responses API (Yandex Cloud и др.)
      const response = await client.responses.create({
        model: apiModel,
        instructions: systemPrompt,
        input: userPrompt,
        temperature,
        max_output_tokens: maxTokens,
      });
      content = response.output_text;
    } else {
      // Chat Completions API (OpenAI, Anthropic, NVIDIA, GigaChat)
      const completion = await client.chat.completions.create({
        model: apiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
        top_p: 0.95,
      });
      content = completion.choices[0]?.message?.content ?? "";
    }
  } finally {
    if (provider.tlsRejectUnauthorized === false) {
      if (prevTls === undefined) delete process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
      else process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = prevTls;
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (!content) throw new Error("LLM: пустой ответ");
  console.log(`  ✓ Ответ за ${elapsed}s (${content.length} символов)`);
  return content;
}

/** Возвращает список всех доступных моделей */
export function listAvailableModels(): string[] {
  return [...modelMap.keys()].sort();
}
