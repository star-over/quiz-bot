import { InlineKeyboard } from "grammy";
import type { Id } from "../_generated/dataModel";

type Choice = {
  id: number;
  content: string;
  isCorrect: boolean;
  explanation?: string | undefined;
};

const HTML_PATTERN = /<[^>]+>|&[a-z]+;|&#\d+;/i;
const BUTTON_LABEL_LIMIT = 24;

function countGraphemes(str: string): number {
  return [...new Intl.Segmenter().segment(str)].length;
}

export function canUseInlineLabels(choices: Array<{ content: string }>): boolean {
  return choices.every(
    (choice) =>
      !HTML_PATTERN.test(choice.content) &&
      countGraphemes(choice.content) <= BUTTON_LABEL_LIMIT,
  );
}

// Формат callback_data: "qa:<questionId>:<choiceId>" — лимит Telegram 64 байта
export function makeSingleChoiceKeyboard(
  choices: Choice[],
  questionId: Id<"questions">,
  useInlineLabels: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  choices.forEach((choice, i) => {
    const label = useInlineLabels ? choice.content : String(i + 1);
    keyboard.text(label, `qa:${questionId}:${choice.id}`).row();
  });
  return keyboard;
}

// Формат callback_data: "yn:<questionId>:<choiceId>" — лимит Telegram 64 байта
// "Да" — зелёный (success), "Нет" — красный (danger), кнопки в одну строку
export function makeYesNoKeyboard(
  choices: Choice[],
  questionId: Id<"questions">,
): InlineKeyboard {
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
  return keyboard;
}
