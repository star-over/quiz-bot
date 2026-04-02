/**
 * Чтение существующих summary из seed/generated/ для данного KC.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { GENERATED_DIR, kcIdToFilename } from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

/** KC ID → путь к JSONL-файлу: grammar/future/going_to → seed/generated/grammar--future--going_to.jsonl */
export function kcIdToFile({ kcId }: { kcId: string }): string {
  return join(ROOT, GENERATED_DIR, `${kcIdToFilename({ kcId })}.jsonl`);
}

/** Парсит строки JSONL-файла, возвращая распознанные объекты */
function parseJsonlLines({ filePath }: { filePath: string }): Array<Record<string, unknown>> {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf8");
  const results: Array<Record<string, unknown>> = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      results.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // Пропускаем битые строки
    }
  }
  return results;
}

/** Загружает все summary для данного KC */
export function loadExistingSummaries({ kcId }: { kcId: string }): string[] {
  const filePath = kcIdToFile({ kcId });
  return parseJsonlLines({ filePath })
    .map((obj) => obj.summary as string | undefined)
    .filter((s): s is string => !!s);
}

/** Считает количество вопросов автора для данного KC */
export function countExistingQuestions({ kcId, authorSlug }: { kcId: string; authorSlug: string }): number {
  const filePath = kcIdToFile({ kcId });
  return parseJsonlLines({ filePath })
    .filter((obj) => obj.author === authorSlug)
    .length;
}
