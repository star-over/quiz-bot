import type { Update } from "grammy/types";

let updateCounter = 1000;

function nextUpdateId(): number {
  return updateCounter++;
}

const DEFAULT_USER = {
  id: 123456789,
  is_bot: false as const,
  first_name: "Test",
};

const DEFAULT_CHAT = {
  id: 123456789,
  type: "private" as const,
  first_name: "Test",
};

export function makeTextUpdate({ text, chatId }: { text: string; chatId?: number }): Update {
  const chat = chatId ? { ...DEFAULT_CHAT, id: chatId } : DEFAULT_CHAT;
  return {
    update_id: nextUpdateId(),
    message: {
      message_id: nextUpdateId(),
      date: Math.floor(Date.now() / 1000),
      chat,
      from: DEFAULT_USER,
      text,
    },
  };
}

export function makeCallbackUpdate({ data, chatId }: { data: string; chatId?: number }): Update {
  const chat = chatId ? { ...DEFAULT_CHAT, id: chatId } : DEFAULT_CHAT;
  return {
    update_id: nextUpdateId(),
    callback_query: {
      id: String(nextUpdateId()),
      chat_instance: "test",
      from: DEFAULT_USER,
      message: {
        message_id: nextUpdateId(),
        date: Math.floor(Date.now() / 1000),
        chat,
        text: "Question text",
      },
      data,
    },
  };
}
