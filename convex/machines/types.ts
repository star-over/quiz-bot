// Типы данных для контекста машины
export interface SingleChoiceQuestionContext {
    questionId: string;
    questionText: string;
    options: Array<{
      id: string;
      text: string;
      isCorrect: boolean;
    }>;
    selectedOptionId?: string | undefined;
    isCorrect?: boolean | undefined;
    feedback?: string | undefined;
    messageId?: number | undefined;
  }
  