import { Quiz, Question } from '@/types';

// Migrate old quiz format (correctIndex) to new format (correctIndices)
export function migrateQuizData(quiz: Record<string, unknown>): Quiz {
  if (!quiz.questions) {
    return quiz as unknown as Quiz;
  }

  const migratedQuestions = (quiz.questions as Array<Record<string, unknown>>).map((q: Record<string, unknown>) => {
    // If already using correctIndices, return as is
    if (Array.isArray(q.correctIndices)) {
      return q;
    }

    // Migrate from correctIndex to correctIndices
    const correctIndices = typeof q.correctIndex === 'number' ? [q.correctIndex] : [];
    const { correctIndex: _correctIndex, ...rest } = q; // Remove correctIndex from rest

    return {
      ...rest,
      correctIndices,
    };
  });

  return {
    ...quiz,
    questions: migratedQuestions,
  } as unknown as Quiz;
}

// Migrate question for backward compatibility
export function migrateQuestionData(question: Record<string, unknown>): Question {
  // If already using correctIndices, return as is
  if (Array.isArray(question.correctIndices)) {
    return question as unknown as Question;
  }

  // Migrate from correctIndex to correctIndices
  const correctIndices = typeof question.correctIndex === 'number' ? [question.correctIndex as number] : [];
  const { correctIndex, ...rest } = question; // Remove correctIndex

  return {
    ...rest,
    correctIndices,
  } as unknown as Question;
}
