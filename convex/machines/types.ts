// Типы данных для контекста машины состояний вопроса с одиночным выбором.
// Поле feedback отсутствует намеренно — текст фидбека строит Manager, не машина.
export interface SingleChoiceQuestionContext {
  questionId: string;
  prompt: string;
  explanation?: string | undefined;        // question-level fallback
  options: Array<{
    id: string;
    content: string;
    isCorrect: boolean;
    explanation?: string | undefined;      // option-level override
  }>;
  selectedOptionId?: string | undefined;
  isCorrect?: boolean | undefined;
  messageId?: number | undefined;
}
