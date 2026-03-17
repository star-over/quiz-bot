import { InlineKeyboard } from "grammy";
import type { Id } from "../_generated/dataModel";

type Option = {
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

export function canUseInlineLabels(options: Array<{ content: string }>): boolean {
  return options.every(
    (opt) =>
      !HTML_PATTERN.test(opt.content) &&
      countGraphemes(opt.content) <= BUTTON_LABEL_LIMIT,
  );
}

// Формат callback_data: "qa:<questionId>:<optionId>" — лимит Telegram 64 байта
export function makeSingleChoiceKeyboard(
  options: Option[],
  questionId: Id<"questions">,
  useInlineLabels: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  options.forEach((opt, i) => {
    const label = useInlineLabels ? opt.content : String(i + 1);
    keyboard.text(label, `qa:${questionId}:${opt.id}`).row();
  });
  return keyboard;
}

// Формат callback_data: "yn:<questionId>:<optionId>" — лимит Telegram 64 байта
// "Да" — зелёный (success), "Нет" — красный (danger), кнопки в одну строку
export function makeYesNoKeyboard(
  options: Option[],
  questionId: Id<"questions">,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  options.forEach((opt) => {
    const style = opt.content === "Да" ? "success" : "danger";
    keyboard.add({
      text: opt.content,
      callback_data: `yn:${questionId}:${opt.id}`,
      style,
    });
  });
  keyboard.row();
  return keyboard;
}
