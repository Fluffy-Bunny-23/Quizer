'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { createSession } from '@/lib/sessions';
import { Quiz, GameMode } from '@/types';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiPlay, mdiRobot, mdiHandBackRight, mdiShuffle } from '@mdi/js';

function NewSessionContent() {
  const { user, loading, isHost } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quizId = searchParams.get('quiz');

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<GameMode>('manual');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);

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

        const quizData = { id: quizDoc.id, ...quizDoc.data() } as Quiz;
        if (quizData.ownerUid !== user.uid) {
          setError('You do not have permission to host this quiz');
          return;
        }

        if (!quizData.questions || quizData.questions.length === 0) {
          setError('This quiz has no questions. Add questions before starting.');
          return;
        }

        setQuiz(quizData);
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

  const handleStartSession = async () => {
    if (!quiz || !user) return;

    setCreating(true);
    try {
      // Ensure Firebase is initialized before creating session
      const { waitForFirebaseInit } = await import('@/lib/firebase');
      await waitForFirebaseInit();

      const sessionCode = await createSession(user.uid, quiz.id!, mode, shuffleQuestions, quiz.questions.length);
      router.push(`/session/${sessionCode}`);
    } catch (err) {
      console.error('Error creating session:', err);
      setError('Failed to create session');
      setCreating(false);
    }
  };

  if (loading || loadingQuiz || !isHost) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading message="Loading..." />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-error mb-4">{error || 'Quiz not found'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-border">
        <div className="flex justify-between items-center p-4 max-w-6xl mx-auto">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors"
          >
            <Icon path={mdiArrowLeft} size={1} />
            <span>Back</span>
          </button>
          <h1 className="text-xl font-bold">Start Game</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 py-8">
        <div className="card animate-slide-in">
          <h2 className="text-2xl font-bold mb-2">{quiz.title}</h2>
          <p className="text-foreground/70 mb-6">
            {quiz.questions.length} questions
          </p>

          <div className="mb-8">
            <h3 className="font-semibold mb-4">Select Game Mode</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMode('manual')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  mode === 'manual'
                    ? 'border-primary bg-primary/10'
                    : 'border-card-border hover:border-primary/50'
                }`}
              >
                <Icon
                  path={mdiHandBackRight}
                  size={2}
                  className={`mx-auto mb-2 ${mode === 'manual' ? 'text-primary' : 'text-foreground/50'}`}
                />
                <h4 className="font-bold">Manual</h4>
                <p className="text-sm text-foreground/70">
                  Host controls when to advance
                </p>
              </button>
              <button
                onClick={() => setMode('auto')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  mode === 'auto'
                    ? 'border-primary bg-primary/10'
                    : 'border-card-border hover:border-primary/50'
                }`}
              >
                <Icon
                  path={mdiRobot}
                  size={2}
                  className={`mx-auto mb-2 ${mode === 'auto' ? 'text-primary' : 'text-foreground/50'}`}
                />
                <h4 className="font-bold">Automatic</h4>
                <p className="text-sm text-foreground/70">
                  Timer-driven progression
                </p>
              </button>
            </div>
          </div>

          {/* Shuffle Questions Option */}
          <div className="mb-6">
            <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-card-border hover:border-primary/50 cursor-pointer transition-all">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-5 h-5 rounded border-card-border text-primary focus:ring-primary"
              />
              <Icon path={mdiShuffle} size={1.2} className="text-primary" />
              <div>
                <span className="font-semibold block">Shuffle Question Order</span>
                <span className="text-sm text-foreground/70">Randomize the order of questions for this session</span>
              </div>
            </label>
          </div>

          <button
            onClick={handleStartSession}
            disabled={creating}
            className="btn-primary w-full flex items-center justify-center gap-2 text-lg py-4"
          >
            <Icon path={mdiPlay} size={1} />
            {creating ? 'Creating...' : 'Create Game Session'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function NewSession() {
  return (
    <Suspense fallback={<Loading />}>
      <NewSessionContent />
    </Suspense>
  );
}
