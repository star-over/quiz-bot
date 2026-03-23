// Чистый парсер callback_data для inline-кнопок.
// Форматы: "qa:<questionId>:<choiceId>", "yn:<questionId>:<choiceId>", "skip:<questionId>"

export type ParsedCallback =
  | { type: "answer"; choiceId: number }
  | { type: "skip" }
  | null;

const QA_PREFIX = "qa:";
const YN_PREFIX = "yn:";
const SKIP_PREFIX = "skip:";

export function parseCallbackData({ data }: { data: string }): ParsedCallback {
  if (data.startsWith(SKIP_PREFIX)) {
    return { type: "skip" };
  }

  if (data.startsWith(QA_PREFIX) || data.startsWith(YN_PREFIX)) {
    const prefix = data.startsWith(QA_PREFIX) ? QA_PREFIX : YN_PREFIX;
    const parts = data.slice(prefix.length).split(":");
    const choiceIdRaw = parts[1];
    if (!choiceIdRaw) return null;

    const choiceId = parseInt(choiceIdRaw, 10);
    if (isNaN(choiceId)) return null;

    return { type: "answer", choiceId };
  }

  return null;
}
