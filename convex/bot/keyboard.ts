import { InlineKeyboard } from "grammy";
import type { Id } from "../_generated/dataModel";

interface Choice {
  id: number;
  content: string;
  isCorrect: boolean;
  explanation?: string | undefined;
}

const HTML_PATTERN = /<[^>]+>|&[a-z]+;|&#\d+;/i;
const BUTTON_LABEL_LIMIT = 24;
const SKIP_LABEL = "🙈 Пропустить";

function countGraphemes(str: string): number {
  return [...new Intl.Segmenter().segment(str)].length;
}

export function canUseInlineLabels(choices: { content: string }[]): boolean {
  return choices.every(
    (choice) =>
      !HTML_PATTERN.test(choice.content) &&
      countGraphemes(choice.content) <= BUTTON_LABEL_LIMIT,
  );
}

// Формат callback_data: "qa:<questionId>:<choiceId>" — лимит Telegram 64 байта
export function makeSingleChoiceKeyboard({
  choices,
  questionId,
  useInlineLabels,
}: {
  choices: Choice[];
  questionId: Id<"questions">;
  useInlineLabels: boolean;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  choices.forEach((choice, i) => {
    const label = useInlineLabels ? choice.content : String(i + 1);
    keyboard.text(label, `qa:${questionId}:${choice.id}`).row();
  });
  keyboard.add({ text: SKIP_LABEL, callback_data: `skip:${questionId}`, style: "primary" });
  return keyboard;
}

// Формат callback_data: "yn:<questionId>:<choiceId>" — лимит Telegram 64 байта
// "Да" — зелёный (success), "Нет" — красный (danger), кнопки в одну строку
export function makeYesNoKeyboard({
  choices,
  questionId,
}: {
  choices: Choice[];
  questionId: Id<"questions">;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  choices.forEach((choice) => {
    const style = choice.content === "Да" ? "success" : "danger";
    keyboard.add({
      text: choice.content,
      callback_data: `yn:${questionId}:${choice.id}`,
      style,
    });
  });
  keyboard.row();
  keyboard.add({ text: SKIP_LABEL, callback_data: `skip:${questionId}`, style: "primary" });
  return keyboard;
}
