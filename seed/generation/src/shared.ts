import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateTelegramHtml } from "../schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..", "..", "..");

export interface KcEntry {
  kcId: string;
  category: string;
  cefrLevel: string;
  sortOrder: number;
  description?: string;
}

export function loadKcCatalog(): KcEntry[] {
  const path = join(ROOT, "seed/generation/data/kc-catalog.jsonl");
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  return lines.map((line) => JSON.parse(line) as KcEntry);
}

export interface KcFilters {
  kc?: string;
  level?: string;
  category?: string;
}

export function filterKcs({
  catalog,
  filters,
}: {
  catalog: KcEntry[];
  filters: KcFilters;
}): KcEntry[] {
  let filtered = catalog;

  if (filters.kc) {
    filtered = filtered.filter((kc) => kc.kcId === filters.kc);
    if (filtered.length === 0) {
      console.error(`❌ KC не найден: ${filters.kc}`);
      process.exit(1);
    }
  }
  if (filters.level) {
    filtered = filtered.filter((kc) => kc.cefrLevel === filters.level);
  }
  if (filters.category) {
    filtered = filtered.filter((kc) => kc.category === filters.category);
  }

  return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function parseJsonFromLlm({ text }: { text: string }): unknown {
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  return JSON.parse(stripped);
}

/** Экранирует & вне HTML-тегов и известных entities */
export function escapeAmpersands({ html }: { html: string }): string {
  return html.replace(
    /&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi,
    "&amp;",
  );
}

/** Экранирует спецсимволы во всех текстовых полях ответа LLM */
export function sanitizeHtmlFields({
  parsed,
}: {
  parsed: Record<string, unknown>;
}): void {
  if (typeof parsed["prompt"] === "string") {
    parsed["prompt"] = escapeAmpersands({ html: parsed["prompt"] });
  }
  const choices = parsed["choices"] as
    | Array<Record<string, unknown>>
    | undefined;
  if (choices) {
    for (const c of choices) {
      if (typeof c["content"] === "string") {
        c["content"] = escapeAmpersands({ html: c["content"] });
      }
      if (typeof c["explanation"] === "string") {
        c["explanation"] = escapeAmpersands({ html: c["explanation"] });
      }
    }
  }
}

/** Валидирует Telegram HTML во всех текстовых полях, возвращает массив ошибок */
export function validateHtmlFields({
  parsed,
}: {
  parsed: Record<string, unknown>;
}): string[] {
  const errors: string[] = [];

  if (typeof parsed["prompt"] === "string") {
    errors.push(
      ...validateTelegramHtml({ html: parsed["prompt"] }).map(
        (e) => `prompt: ${e}`,
      ),
    );
  }

  const choices = parsed["choices"] as
    | Array<Record<string, unknown>>
    | undefined;
  if (choices) {
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]!;
      if (typeof c["content"] === "string") {
        errors.push(
          ...validateTelegramHtml({ html: c["content"] }).map(
            (e) => `choices[${i}].content: ${e}`,
          ),
        );
      }
      if (typeof c["explanation"] === "string") {
        errors.push(
          ...validateTelegramHtml({ html: c["explanation"] }).map(
            (e) => `choices[${i}].explanation: ${e}`,
          ),
        );
      }
    }
  }

  return errors;
}
