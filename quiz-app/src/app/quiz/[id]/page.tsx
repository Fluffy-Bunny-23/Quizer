'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { migrateQuizData } from '@/lib/migration';
import { Question, Quiz } from '@/types';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiPlus,
  mdiDelete,
  mdiCheck,
  mdiContentSave,
} from '@mdi/js';

const MAX_QUESTIONS = 100;
const DEFAULT_TIME_LIMIT = 20;

const emptyQuestion: Question = {
  question: '',
  options: ['', '', '', ''],
  correctIndices: [],
  timeLimit: DEFAULT_TIME_LIMIT,
};

export default function EditQuiz() {
  const { user, loading, isHost } = useAuth();
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([{ ...emptyQuestion }]);
  const [saving, setSaving] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [error, setError] = useState('');
  const [activeQuestion, setActiveQuestion] = useState(0);

  useEffect(() => {
    if (!loading && !isHost) {
      router.push('/');
    }
  }, [loading, isHost, router]);

  useEffect(() => {
    const fetchQuiz = async () => {
      if (!quizId || !user) return;

      try {
        const quizDoc = await getDoc(doc(getDb(), 'quizzes', quizId));
        if (!quizDoc.exists()) {
          setError('Quiz not found');
          return;
        }

        const quizData = migrateQuizData(quizDoc.data());
        if (quizData.ownerUid !== user.uid) {
          setError('You do not have permission to edit this quiz');
          return;
        }

        setTitle(quizData.title);
        setDescription(quizData.description || '');
        setQuestions(quizData.questions?.length > 0 ? quizData.questions : [{ ...emptyQuestion }]);
      } catch (err) {
        console.error('Error loading quiz:', err);
        setError('Failed to load quiz');
      } finally {
        setLoadingQuiz(false);
      }
    };

    if (user && isHost) {
      fetchQuiz();
    }
  }, [quizId, user, isHost]);

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
    setError('');
    if (!validateQuiz()) return;

    setSaving(true);
    try {
      await updateDoc(doc(getDb(), 'quizzes', quizId), {
        title: title.trim(),
        description: description.trim(),
        questions: questions.map((q) => ({
          ...q,
          question: q.question.trim(),
          options: q.options.map((o) => o.trim()),
        })),
      });
      router.push('/dashboard');
    } catch (err) {
      console.error('Error saving quiz:', err);
      setError('Failed to save quiz. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || loadingQuiz || !isHost) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading message={loadingQuiz ? 'Loading quiz...' : 'Loading...'} />
      </div>
    );
  }

  if (error && !title) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card text-center">
          <p className="text-error mb-4">{error}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
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
          >
            <Icon path={mdiArrowLeft} size={1} />
            <span>Back</span>
          </button>
          <h1 className="text-xl font-bold">Edit Quiz</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={saveQuiz}
              disabled={saving}
              className="btn-primary flex items-center gap-2 py-2"
            >
              <Icon path={mdiContentSave} size={0.8} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {error && (
          <div className="bg-error/10 border border-error text-error px-4 py-3 rounded-lg mb-4 animate-slide-in">
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
                  <label className="block text-sm text-foreground/70 mb-1">Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Quiz title"
                    className="input"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-sm text-foreground/70 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    className="input resize-none"
                    rows={3}
                    maxLength={500}
                  />
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
                >
                  <Icon path={mdiPlus} size={0.8} className="text-primary" />
                </button>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {questions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveQuestion(i)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      activeQuestion === i
                        ? 'bg-primary text-white'
                        : 'bg-card-bg hover:bg-primary/10'
                    }`}
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
                        >
                          <Icon path={mdiDelete} size={0.6} />
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
                <label className="block text-sm text-foreground/70 mb-1">Question *</label>
                <textarea
                  value={currentQuestion.question}
                  onChange={(e) => updateQuestion(activeQuestion, 'question', e.target.value)}
                  placeholder="Enter your question..."
                  className="input resize-none text-lg"
                  rows={3}
                  maxLength={500}
                />
              </div>

              {/* Time Limit */}
              <div>
                <label className="block text-sm text-foreground/70 mb-1">
                  Time Limit: {currentQuestion.timeLimit} seconds
                </label>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={currentQuestion.timeLimit}
                  onChange={(e) =>
                    updateQuestion(activeQuestion, 'timeLimit', parseInt(e.target.value))
                  }
                  className="w-full"
                />
              </div>

              {/* Answer Options */}
              <div>
                <label className="block text-sm text-foreground/70 mb-2">
                  Answer Options (click checkbox for correct answers)
                </label>
                <div className="space-y-3">
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
                      >
                        {currentQuestion.correctIndices.includes(i) && (
                          <Icon path={mdiCheck} size={0.6} />
                        )}
                      </button>
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => updateOption(activeQuestion, i, e.target.value)}
                        placeholder={`Option ${i + 1} (optional)`}
                        className="flex-1 bg-transparent border-none focus:outline-none"
                        maxLength={200}
                      />
                      {currentQuestion.options.length > 2 && !option.trim() && (
                        <button
                          onClick={() => removeOption(activeQuestion, i)}
                          className="p-1 rounded hover:bg-error/20 text-foreground/50"
                          title="Remove option"
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
                className="btn-secondary py-2 disabled:opacity-50"
              >
                Previous
              </button>
              {activeQuestion < questions.length - 1 ? (
                <button
                  onClick={() => setActiveQuestion(activeQuestion + 1)}
                  className="btn-primary py-2"
                >
                  Next
                </button>
              ) : (
                <button onClick={addQuestion} className="btn-accent py-2 flex items-center gap-2">
                  <Icon path={mdiPlus} size={0.8} />
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
