'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { Question } from '@/types';
import Icon from '@mdi/react';
import { sanitizeInput, containsXSSPatterns } from '@/lib/utils';
import {
  mdiArrowLeft,
  mdiPlus,
  mdiDelete,
  mdiCheck,
  mdiContentSave,
  mdiUpload,
} from '@mdi/js';
import { ImageUpload } from '@/components/ImageUpload';

const MAX_QUESTIONS = 100;
const DEFAULT_TIME_LIMIT = 20;

const emptyQuestion: Question = {
  question: '',
  options: ['', '', '', ''],
  correctIndices: [],
  timeLimit: DEFAULT_TIME_LIMIT,
};

// Validation functions
const validateTitle = (title: string): string | null => {
  if (!title.trim()) return 'Title is required';
  if (title.trim().length < 3) return 'Title must be at least 3 characters';
  if (title.length > 100) return 'Title must be 100 characters or less';
  return null;
};

const validateDescription = (description: string): string | null => {
  if (description.length > 500) return 'Description must be 500 characters or less';
  return null;
};

const validateQuestion = (question: string): string | null => {
  if (!question.trim()) return 'Question text is required';
  if (question.trim().length < 5) return 'Question must be at least 5 characters';
  if (question.length > 500) return 'Question must be 500 characters or less';
  return null;
};

const validateOption = (option: string): string | null => {
  if (!option.trim()) return 'Answer option is required';
  if (option.length > 200) return 'Option must be 200 characters or less';
  return null;
};

const isValidTitle = (title: string): boolean => {
  return title.trim().length >= 3 && title.length <= 100;
};

const isValidQuestion = (question: string): boolean => {
  return question.trim().length >= 5 && question.length <= 500;
};

const areAllOptionsValid = (options: string[]): boolean => {
  // Only validate filled options (empty options are allowed)
  const filledOptions = options.filter(opt => opt.trim().length > 0);
  // Need at least 2 filled options, and all must be <= 200 chars
  return filledOptions.length >= 2 && filledOptions.every(opt => opt.length <= 200);
};

const isQuizValid = (title: string, questions: Question[]): boolean => {
  if (!isValidTitle(title)) return false;
  return questions.every(q => 
    isValidQuestion(q.question) && 
    areAllOptionsValid(q.options) &&
    q.correctIndices.length > 0
  );
};

export default function NewQuiz() {
  const { user, loading, isHost } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([{ ...emptyQuestion }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [questionErrors, setQuestionErrors] = useState<{[key: number]: {question: string | null, options: (string | null)[]}}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportQuiz = () => {
    fileInputRef.current?.click();
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
    setTitleError(validateTitle(value));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDescription(value);
    setDescriptionError(validateDescription(value));
  };

  const handleQuestionChange = (index: number, value: string) => {
    updateQuestion(index, 'question', value);
    setQuestionErrors(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        question: validateQuestion(value)
      }
    }));
  };

  const handleOptionChange = (questionIndex: number, optionIndex: number, value: string) => {
    updateOption(questionIndex, optionIndex, value);
    setQuestionErrors(prev => {
      const currentErrors = prev[questionIndex]?.options || ['', '', '', ''];
      const newOptions = [...currentErrors];
      newOptions[optionIndex] = validateOption(value);
      return {
        ...prev,
        [questionIndex]: {
          ...prev[questionIndex],
          options: newOptions
        }
      };
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedQuiz = JSON.parse(e.target?.result as string);

        // Validate imported data
        if (!importedQuiz.title || !Array.isArray(importedQuiz.questions)) {
          setError('Invalid quiz file format');
          return;
        }

        // Validate each question
        for (let i = 0; i < importedQuiz.questions.length; i++) {
          const q = importedQuiz.questions[i];
          if (!q.question || !Array.isArray(q.options) || !Array.isArray(q.correctIndices)) {
            setError(`Invalid question format at question ${i + 1}`);
            return;
          }
        }

        // Check for XSS patterns in imported data
        const suspiciousFields: string[] = [];
        if (containsXSSPatterns(importedQuiz.title)) suspiciousFields.push('title');
        if (containsXSSPatterns(importedQuiz.description)) suspiciousFields.push('description');
        importedQuiz.questions.forEach((q: any, idx: number) => {
          if (containsXSSPatterns(q.question)) suspiciousFields.push(`question ${idx + 1}`);
          q.options.forEach((opt: string, optIdx: number) => {
            if (containsXSSPatterns(opt)) suspiciousFields.push(`question ${idx + 1}, option ${optIdx + 1}`);
          });
        });

        if (suspiciousFields.length > 0) {
          setError(`Import blocked: Suspicious content detected in ${suspiciousFields.join(', ')}`);
          return;
        }

        // Set imported data with sanitization
        setTitle(sanitizeInput(importedQuiz.title, 100));
        setDescription(sanitizeInput(importedQuiz.description || '', 500));
        setQuestions(importedQuiz.questions.map((q: any) => ({
          question: sanitizeInput(q.question, 500),
          options: q.options.map((o: string) => sanitizeInput(o, 200)),
          correctIndices: q.correctIndices,
          timeLimit: q.timeLimit || DEFAULT_TIME_LIMIT,
        })));
        setActiveQuestion(0);
        setError('');
      } catch (error) {
        setError('Failed to import quiz. Please check the file format.');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!loading && !isHost) {
      router.push('/');
    }
  }, [loading, isHost, router]);

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) {
      setError(`Maximum ${MAX_QUESTIONS} questions allowed`);
      return;
    }
    setQuestions([...questions, { ...emptyQuestion }]);
    setActiveQuestion(questions.length);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    const newQuestions = questions.filter((_, i) => i !== index);
    setQuestions(newQuestions);
    if (activeQuestion >= newQuestions.length) {
      setActiveQuestion(newQuestions.length - 1);
    }
  };

  const updateQuestion = (index: number, field: keyof Question, value: Question[keyof Question]) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setQuestions(newQuestions);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const newQuestions = [...questions];
    const newOptions = [...newQuestions[questionIndex].options];
    newOptions[optionIndex] = value;
    newQuestions[questionIndex] = { ...newQuestions[questionIndex], options: newOptions };
    setQuestions(newQuestions);
  };

  const toggleCorrectAnswer = (questionIndex: number, optionIndex: number) => {
    const newQuestions = [...questions];
    const correctIndices = [...newQuestions[questionIndex].correctIndices];
    const idx = correctIndices.indexOf(optionIndex);
    if (idx > -1) {
      correctIndices.splice(idx, 1);
    } else {
      correctIndices.push(optionIndex);
    }
    newQuestions[questionIndex] = { ...newQuestions[questionIndex], correctIndices };
    setQuestions(newQuestions);
  };

  const addOption = (questionIndex: number) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].options.length < 4) {
      newQuestions[questionIndex].options.push('');
      setQuestions(newQuestions);
    }
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const newQuestions = [...questions];
    const filledCount = newQuestions[questionIndex].options.filter((o) => o.trim()).length;
    if (filledCount > 2) {
      newQuestions[questionIndex].options.splice(optionIndex, 1);
      // Update correctIndices - remove this index and shift others
      const correctIndices = newQuestions[questionIndex].correctIndices
        .filter((i) => i !== optionIndex)
        .map((i) => (i > optionIndex ? i - 1 : i));
      newQuestions[questionIndex].correctIndices = correctIndices;
      setQuestions(newQuestions);
    }
  };

  const validateQuiz = (): boolean => {
    if (!title.trim()) {
      setError('Quiz title is required');
      return false;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        setError(`Question ${i + 1} text is required`);
        setActiveQuestion(i);
        return false;
      }
      const filledOptions = q.options.filter((o) => o.trim());
      if (filledOptions.length < 2) {
        setError(`Question ${i + 1} needs at least 2 options`);
        setActiveQuestion(i);
        return false;
      }
      if (q.correctIndices.length === 0) {
        setError(`Question ${i + 1} needs at least 1 correct answer`);
        setActiveQuestion(i);
        return false;
      }
      // Validate all correct indices are filled
      for (const idx of q.correctIndices) {
        if (!q.options[idx]?.trim()) {
          setError(`Question ${i + 1} correct answer is empty`);
          setActiveQuestion(i);
          return false;
        }
      }
    }
    return true;
  };

  const saveQuiz = async () => {
    console.log('💾 saveQuiz called');
    setError('');
    if (!validateQuiz()) {
      console.log('❌ Quiz validation failed');
      return;
    }

    setSaving(true);
    try {
      console.log('📝 Sanitizing quiz data...');
      // Sanitize all data before saving
      const sanitizedTitle = sanitizeInput(title, 100);
      const sanitizedDescription = sanitizeInput(description, 500);
      const sanitizedQuestions = questions.map((q) => ({
        ...q,
        question: sanitizeInput(q.question, 500),
        options: q.options.map((o) => sanitizeInput(o, 200)),
      }));

      console.log('🔥 Saving to Firestore...', { title: sanitizedTitle, questions: sanitizedQuestions.length });
      await addDoc(collection(getDb(), 'quizzes'), {
        ownerUid: user!.uid,
        title: sanitizedTitle,
        description: sanitizedDescription,
        createdAt: serverTimestamp(),
        questions: sanitizedQuestions,
      });
      console.log('✅ Quiz saved successfully');
      router.push('/dashboard');
    } catch (err) {
      console.error('Error saving quiz:', err);
      setError('Failed to save quiz. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !isHost) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading message="Loading..." />
      </div>
    );
  }

  const currentQuestion = questions[activeQuestion];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-border sticky top-0 bg-background z-10">
        <div className="flex justify-between items-center p-4 max-w-6xl mx-auto">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors"
            aria-label="Back to dashboard"
          >
            <Icon path={mdiArrowLeft} size={1} aria-hidden="true" />
            <span>Back</span>
          </button>
          <h1 className="text-xl font-bold">Create Quiz</h1>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={handleImportQuiz}
              className="btn-secondary flex items-center gap-2 py-2"
              title="Import quiz from JSON"
              aria-label="Import quiz from JSON file"
            >
              <Icon path={mdiUpload} size={0.8} aria-hidden="true" />
              Import
            </button>
            <ThemeToggle />
            <button
              onClick={saveQuiz}
              disabled={!isQuizValid(title, questions) || saving}
              aria-disabled={!isQuizValid(title, questions) || saving}
              className="btn-primary flex items-center gap-2 py-2"
              aria-label={saving ? 'Saving quiz...' : 'Save quiz'}
            >
              <Icon path={mdiContentSave} size={0.8} aria-hidden="true" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {error && (
          <div className="bg-error/10 border border-error text-error px-4 py-3 rounded-lg mb-4 animate-slide-in" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-[300px,1fr] gap-6">
          {/* Sidebar - Quiz Details & Question List */}
          <div className="space-y-4">
            {/* Quiz Details */}
            <div className="card">
              <h3 className="font-semibold mb-4">Quiz Details</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="quiz-title" className="block text-sm text-foreground/70 mb-1">
                    Title *
                    <span className="float-right text-foreground/50">{title.length}/100</span>
                  </label>
                  <input
                    id="quiz-title"
                    type="text"
                    value={title}
                    onChange={handleTitleChange}
                    placeholder="Quiz title"
                    className={`input ${titleError ? 'border-error focus:border-error' : ''}`}
                    maxLength={100}
                    aria-describedby="title-help title-error"
                    aria-invalid={!!titleError}
                    required
                  />
                  {titleError && (
                    <p id="title-error" className="text-error text-sm mt-1" role="alert">{titleError}</p>
                  )}
                  <span id="title-help" className="sr-only">Enter a title for your quiz, 3 to 100 characters required</span>
                </div>
                <div>
                  <label htmlFor="quiz-description" className="block text-sm text-foreground/70 mb-1">
                    Description
                    <span className="float-right text-foreground/50">{description.length}/500</span>
                  </label>
                  <textarea
                    id="quiz-description"
                    value={description}
                    onChange={handleDescriptionChange}
                    placeholder="Optional description"
                    className={`input resize-none ${descriptionError ? 'border-error focus:border-error' : ''}`}
                    rows={3}
                    maxLength={500}
                    aria-describedby="description-help description-error"
                    aria-invalid={!!descriptionError}
                  />
                  {descriptionError && (
                    <p id="description-error" className="text-error text-sm mt-1" role="alert">{descriptionError}</p>
                  )}
                  <span id="description-help" className="sr-only">Optional description for your quiz, up to 500 characters</span>
                </div>
              </div>
            </div>

            {/* Question List */}
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">Questions ({questions.length}/{MAX_QUESTIONS})</h3>
                <button
                  onClick={addQuestion}
                  disabled={questions.length >= MAX_QUESTIONS}
                  className="p-1 rounded hover:bg-primary/10 disabled:opacity-50"
                  title="Add question"
                  aria-label="Add question"
                >
                  <Icon path={mdiPlus} size={0.8} className="text-primary" />
                </button>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto" role="list" aria-label="Question list">
                {questions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveQuestion(i)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      activeQuestion === i
                        ? 'bg-primary text-white'
                        : 'bg-card-bg hover:bg-primary/10'
                    }`}
                    aria-current={activeQuestion === i ? 'true' : undefined}
                    aria-label={`Question ${i + 1}: ${q.question || 'Untitled'}`}
                    role="listitem"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium truncate">
                        Q{i + 1}: {q.question || 'Untitled'}
                      </span>
                      {questions.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeQuestion(i);
                          }}
                          className={`p-1 rounded hover:bg-error/20 ${
                            activeQuestion === i ? 'text-white' : 'text-foreground/50'
                          }`}
                          aria-label={`Delete question ${i + 1}`}
                        >
                          <Icon path={mdiDelete} size={0.6} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Question Editor */}
          <div className="card animate-fade-in" key={activeQuestion}>
            <h3 className="text-xl font-bold mb-6">Question {activeQuestion + 1}</h3>

            <div className="space-y-6">
              {/* Question Text */}
              <div>
                <label htmlFor="question-text" className="block text-sm text-foreground/70 mb-1">
                  Question *
                  <span className="float-right text-foreground/50">{currentQuestion.question.length}/500</span>
                </label>
                <textarea
                  id="question-text"
                  value={currentQuestion.question}
                  onChange={(e) => handleQuestionChange(activeQuestion, e.target.value)}
                  placeholder="Enter your question..."
                  className={`input resize-none text-lg ${questionErrors[activeQuestion]?.question ? 'border-error focus:border-error' : ''}`}
                  rows={3}
                  maxLength={500}
                  aria-describedby="question-help question-error"
                  aria-invalid={!!questionErrors[activeQuestion]?.question}
                  required
                />
                {questionErrors[activeQuestion]?.question && (
                  <p id="question-error" className="text-error text-sm mt-1" role="alert">{questionErrors[activeQuestion]?.question}</p>
                )}
                <span id="question-help" className="sr-only">Enter your question text, 5 to 500 characters required</span>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm text-foreground/70 mb-1">Question Image (Optional)</label>
                <ImageUpload
                  value={currentQuestion.image}
                  onChange={(image) => updateQuestion(activeQuestion, 'image', image)}
                  maxFileSizeMB={1}
                />
              </div>

              {/* Time Limit */}
              <div>
                <label htmlFor="time-limit" className="block text-sm text-foreground/70 mb-1">
                  Time Limit: {currentQuestion.timeLimit} seconds
                </label>
                <input
                  id="time-limit"
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={currentQuestion.timeLimit}
                  onChange={(e) =>
                    updateQuestion(activeQuestion, 'timeLimit', parseInt(e.target.value))
                  }
                  className="w-full"
                  aria-valuemin={5}
                  aria-valuemax={60}
                  aria-valuenow={currentQuestion.timeLimit}
                  aria-label={`Time limit: ${currentQuestion.timeLimit} seconds`}
                />
              </div>

              {/* Answer Options */}
              <div>
                <label className="block text-sm text-foreground/70 mb-2">
                  Answer Options (click checkbox for correct answers)
                </label>
                <div className="space-y-3" role="group" aria-label="Answer options">
                  {currentQuestion.options.map((option, i) => (
                    <div
                      key={i}
                      className={`relative flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                        currentQuestion.correctIndices.includes(i)
                          ? 'border-success bg-success/10'
                          : 'border-card-border'
                      }`}
                    >
                      <button
                        onClick={() => toggleCorrectAnswer(activeQuestion, i)}
                        className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
                          currentQuestion.correctIndices.includes(i)
                            ? 'bg-success border-success text-white'
                            : 'border-foreground/30 hover:border-success'
                        }`}
                        aria-pressed={currentQuestion.correctIndices.includes(i)}
                        aria-label={`Mark option ${String.fromCharCode(65 + i)} as correct answer`}
                      >
                        {currentQuestion.correctIndices.includes(i) && (
                          <Icon path={mdiCheck} size={0.6} aria-hidden="true" />
                        )}
                      </button>
                      <div className="flex-1">
                        <input
                          id={`option-${i}`}
                          type="text"
                          value={option}
                          onChange={(e) => updateOption(activeQuestion, i, e.target.value)}
                          placeholder={`Option ${i + 1} (optional)`}
                          className="w-full bg-transparent border-none focus:outline-none"
                          maxLength={200}
                          aria-label={`Answer option ${String.fromCharCode(65 + i)}`}
                        />
                        <div className={`text-xs mt-1 ${option.length > 200 ? 'text-error' : 'text-foreground/50'}`}>
                          {option.length}/200
                        </div>
                      </div>
                      {currentQuestion.options.length > 2 && !option.trim() && (
                        <button
                          onClick={() => removeOption(activeQuestion, i)}
                          className="p-1 rounded hover:bg-error/20 text-foreground/50"
                          title="Remove option"
                          aria-label={`Remove option ${i + 1}`}
                        >
                          <Icon path={mdiDelete} size={0.6} />
                        </button>
                      )}
                      <span
                        className={`text-xs font-bold w-6 h-6 rounded flex items-center justify-center ${
                          i === 0
                            ? 'bg-red-500'
                            : i === 1
                            ? 'bg-blue-500'
                            : i === 2
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        } text-white`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                    </div>
                  ))}
                  {currentQuestion.options.length < 4 && (
                    <button
                      onClick={() => addOption(activeQuestion)}
                      className="w-full p-3 rounded-lg border-2 border-dashed border-card-border hover:border-primary/50 text-foreground/50 hover:text-primary transition-colors"
                      aria-label="Add answer option"
                    >
                      + Add Option
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-6 border-t border-card-border">
              <button
                onClick={() => setActiveQuestion(Math.max(0, activeQuestion - 1))}
                disabled={activeQuestion === 0}
                aria-disabled={activeQuestion === 0}
                className="btn-secondary py-2 disabled:opacity-50"
                aria-label="Previous question"
              >
                Previous
              </button>
              {activeQuestion < questions.length - 1 ? (
                <button
                  onClick={() => setActiveQuestion(activeQuestion + 1)}
                  className="btn-primary py-2"
                  aria-label="Next question"
                >
                  Next
                </button>
              ) : (
                <button onClick={addQuestion} className="btn-accent py-2 flex items-center gap-2" aria-label="Add new question">
                  <Icon path={mdiPlus} size={0.8} aria-hidden="true" />
                  Add Question
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
