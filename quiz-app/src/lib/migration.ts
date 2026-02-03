import { Quiz, Question } from '@/types';

// Migrate old quiz format (correctIndex) to new format (correctIndices)
export function migrateQuizData(quiz: any): Quiz {
  if (!quiz.questions) {
    return quiz;
  }

  const migratedQuestions = quiz.questions.map((q: any) => {
    // If already using correctIndices, return as is
    if (Array.isArray(q.correctIndices)) {
      return q;
    }

    // Migrate from correctIndex to correctIndices
    const correctIndices = typeof q.correctIndex === 'number' ? [q.correctIndex] : [];
    const { correctIndex, ...rest } = q; // Remove correctIndex

    return {
      ...rest,
      correctIndices,
    };
  });

  return {
    ...quiz,
    questions: migratedQuestions,
  };
}

// Migrate question for backward compatibility
export function migrateQuestionData(question: any): Question {
  // If already using correctIndices, return as is
  if (Array.isArray(question.correctIndices)) {
    return question;
  }

  // Migrate from correctIndex to correctIndices
  const correctIndices = typeof question.correctIndex === 'number' ? [question.correctIndex] : [];
  const { correctIndex, ...rest } = question; // Remove correctIndex

  return {
    ...rest,
    correctIndices,
  };
}
