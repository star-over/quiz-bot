// Типы данных для контекста машины состояний вопроса.
// Поле feedback отсутствует намеренно — текст фидбека строит Manager, не машина.
export interface SingleChoiceQuestionContext {
  questionId: string;
  prompt: string;
  explanation?: string | undefined;        // question-level fallback
  options: Array<{
    id: number;
    content: string;
    isCorrect: boolean;
    explanation?: string | undefined;      // option-level override
  }>;
  selectedOptionId?: number | undefined;
  messageId?: number | undefined;
}
