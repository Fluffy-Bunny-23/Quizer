'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { migrateQuizData } from '@/lib/migration';
import {
  subscribeToSession,
  subscribeToPlayers,
  startNextQuestion,
  showAnswerReveal,
  showLeaderboard,
  calculateScores,
  endGame,
  deleteSession,
} from '@/lib/sessions';
import { Quiz, Session, Player, Question } from '@/types';
import Icon from '@mdi/react';
import {
  mdiPlay,
  mdiSkipNext,
  mdiStop,
  mdiAccountGroup,
  mdiTrophy,
  mdiCheck,
  mdiClose,
  mdiContentCopy,
  mdiCheckBold,
  mdiDownload,
} from '@mdi/js';

export default function HostSession() {
  const { user, loading, isHost } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check host authorization
  useEffect(() => {
    if (!loading && !isHost) {
      router.push('/');
    }
  }, [loading, isHost, router]);

  // Subscribe to session
  useEffect(() => {
    if (!sessionId || !user) return;

    const setupSubscriptions = async () => {
      try {
        // Ensure Firebase is initialized before setting up subscriptions
        const { waitForFirebaseInit } = await import('@/lib/firebase');
        await waitForFirebaseInit();

        const unsubSession = subscribeToSession(sessionId, (sessionData) => {
          if (!sessionData) {
            setError('Session not found');
            setLoadingSession(false);
            return;
          }
          
          if (sessionData.hostUid !== user.uid) {
            setError('You are not the host of this session');
            setLoadingSession(false);
            return;
          }

          setSession(sessionData);
          setLoadingSession(false);
        });

        const unsubPlayers = subscribeToPlayers(sessionId, setPlayers);

        return () => {
          unsubSession();
          unsubPlayers();
        };
      } catch (err) {
        console.error('Error setting up subscriptions:', err);
        setError('Failed to connect to session');
        setLoadingSession(false);
      }
    };

    const cleanup = setupSubscriptions().then(c => c);
    return () => {
      cleanup.then(c => c?.());
    };
  }, [sessionId, user]);

  // Load quiz data
  useEffect(() => {
    const loadQuiz = async () => {
      if (!session?.quizId) return;

      try {
        const quizDoc = await getDoc(doc(getDb(), 'quizzes', session.quizId));
        if (quizDoc.exists()) {
          const migratedQuiz = migrateQuizData({ id: quizDoc.id, ...quizDoc.data() });
          setQuiz(migratedQuiz);
        }
      } catch (err) {
        console.error('Error loading quiz:', err);
      }
    };

    loadQuiz();
  }, [session?.quizId]);

  // Handle showing answer - defined before useEffect that uses it
  const doShowAnswer = useCallback(async () => {
    if (!quiz || !session) return;
    
    const currentQuestion = quiz.questions[session.currentQuestionIndex];
    await calculateScores(
      sessionId,
      session.currentQuestionIndex,
      currentQuestion.correctIndices,
      currentQuestion.timeLimit
    );
    await showAnswerReveal(sessionId);
  }, [quiz, session, sessionId]);

  // Timer for question countdown
  useEffect(() => {
    if (!(session?.status === 'question' && session.questionStartTime && quiz)) {
      return;
    }
    
    const currentQuestion = quiz.questions[session.currentQuestionIndex];
    if (!currentQuestion) return;

    const updateTimer = () => {
      const elapsed = Date.now() - session.questionStartTime!;
      const remaining = Math.max(0, currentQuestion.timeLimit * 1000 - elapsed);
      setTimeLeft(Math.ceil(remaining / 1000));

      if (remaining <= 0 && session.settings.mode === 'auto') {
        if (timerRef.current) clearInterval(timerRef.current);
        (async () => {
          try {
            await doShowAnswer();
          } catch (error) {
            console.error('Failed to auto-show answer', error);
          }
        })();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(null);
    };
  }, [session?.status, session?.questionStartTime, session?.currentQuestionIndex, session?.settings?.mode, quiz, doShowAnswer]);

  // Auto-advance when all players have answered
  useEffect(() => {
    if (session?.status !== 'question') return;
    if (session?.settings?.mode === 'manual') return; // Don't auto-advance in manual mode
    
    const playerList = Object.values(players).filter(p => p.role === 'player');
    if (playerList.length === 0) return;
    
    const answeredCount = playerList.filter(p => p.lastAnswer !== null).length;
    
    if (answeredCount === playerList.length && answeredCount > 0) {
      // All players answered, auto-advance after 1 second
      const timeout = setTimeout(async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        try {
          await doShowAnswer();
        } catch (error) {
          console.error('Failed to auto-show answer after all answered', error);
        }
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [session?.status, session?.settings?.mode, players, doShowAnswer]);

  const copyCode = async () => {
    if (!navigator?.clipboard?.writeText) {
      window.alert('Copy to clipboard is not supported in this browser. Please copy the code manually.');
      return;
    }

    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy session code to clipboard', error);
      window.alert('Failed to copy the code to clipboard. Please copy it manually.');
    }
  };

  const handleStartGame = async () => {
    await startNextQuestion(sessionId);
  };

  const handleNextQuestion = async () => {
    if (!quiz || !session) return;
    
    if (session.currentQuestionIndex >= quiz.questions.length - 1) {
      await endGame(sessionId);
    } else {
      await startNextQuestion(sessionId);
    }
  };

  const handleShowAnswer = async () => {
    await doShowAnswer();
  };

  const handleShowLeaderboard = async () => {
    await showLeaderboard(sessionId);
  };

  const handleCloseSession = async () => {
    await deleteSession(sessionId);
    router.push('/dashboard');
  };

  const exportAnswers = () => {
    if (!quiz || !session) return;

    const playerList = Object.entries(players).filter(([, p]) => p.role === 'player');
    const sortedPlayers = [...playerList].sort(([, a], [, b]) => b.score - a.score);

    const exportData = {
      version: '1.0',
      sessionId: sessionId,
      sessionStatus: session.status,
      quizTitle: quiz.title,
      quizDescription: quiz.description,
      totalQuestions: quiz.questions.length,
      exportedAt: new Date().toISOString(),
      questions: quiz.questions.map((q, index) => ({
        questionNumber: index + 1,
        question: q.question,
        options: q.options,
        correctIndices: q.correctIndices,
        timeLimit: q.timeLimit,
      })),
      leaderboard: sortedPlayers.map(([playerId, player], index) => ({
        rank: index + 1,
        name: player.name,
        score: player.score,
        lastAnswer: player.lastAnswer,
        answerTime: player.answerTime,
      })),
      playerAnswers: sortedPlayers.map(([playerId, player]) => ({
        name: player.name,
        score: player.score,
        lastAnswer: player.lastAnswer,
        answerTime: player.answerTime,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quiz.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_answers_${sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading || loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading message="Loading session..." />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-error mb-4" role="alert" aria-live="assertive">{error || 'Session not found'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const playerList = Object.entries(players).filter(([, p]) => p.role === 'player');
  const spectatorList = Object.entries(players).filter(([, p]) => p.role === 'spectator');
  const currentQuestion: Question | null = quiz?.questions?.[session.currentQuestionIndex] ?? null;
  const isLastQuestion = quiz && session.currentQuestionIndex >= quiz.questions.length - 1;

  // Sort players by score for leaderboard
  const sortedPlayers = [...playerList].sort(([, a], [, b]) => b.score - a.score);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-border">
        <div className="flex justify-between items-center p-4 max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-primary">⚡ Quizer</h1>
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2 bg-card-bg border border-card-border px-4 py-2 rounded-lg cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={copyCode}
              role="button"
              tabIndex={0}
              aria-label={`Copy session code: ${sessionId}`}
            >
              <span className="text-xl font-mono font-bold tracking-widest">{sessionId}</span>
              <Icon
                path={copied ? mdiCheckBold : mdiContentCopy}
                size={0.8}
                className={copied ? 'text-success' : 'text-foreground/50'}
              />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4" role="main">
        {/* Lobby State */}
        {session.status === 'lobby' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-2">Waiting for Players</h2>
              <p className="text-xl text-foreground/70">
                Share the code <span className="font-mono font-bold text-primary" aria-label={`Session code: ${sessionId}`}>{sessionId}</span> to join
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Players */}
              <div className="card">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Icon path={mdiAccountGroup} size={1} className="text-primary" aria-hidden="true" />
                  Players ({playerList.length})
                </h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto" role="list" aria-label="Players in lobby" aria-live="polite">
                  {playerList.length === 0 ? (
                    <p className="text-foreground/50 text-center py-4">Waiting for players...</p>
                  ) : (
                    playerList.map(([id, player]) => (
                      <div
                        key={id}
                        className="flex items-center justify-between p-3 bg-primary/10 rounded-lg animate-slide-in"
                        role="listitem"
                      >
                        <span className="font-medium">{player.name}</span>
                        <Icon path={mdiCheck} size={0.8} className="text-success" aria-hidden="true" />
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Spectators */}
              <div className="card">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Icon path={mdiAccountGroup} size={1} className="text-secondary" aria-hidden="true" />
                  Spectators ({spectatorList.length})
                </h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto" role="list" aria-label="Spectators in lobby">
                  {spectatorList.length === 0 ? (
                    <p className="text-foreground/50 text-center py-4">No spectators</p>
                  ) : (
                    spectatorList.map(([id, player]) => (
                      <div
                        key={id}
                        className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg"
                        role="listitem"
                      >
                        <span className="font-medium">{player.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={handleStartGame}
                disabled={playerList.length === 0}
                aria-disabled={playerList.length === 0}
                className="btn-primary flex items-center gap-2 text-lg py-4 px-8 disabled:opacity-50"
                aria-label="Start game"
              >
                <Icon path={mdiPlay} size={1} aria-hidden="true" />
                Start Game
              </button>
              <button
                onClick={handleCloseSession}
                className="btn-secondary flex items-center gap-2"
                aria-label="Close session"
              >
                <Icon path={mdiClose} size={1} aria-hidden="true" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Question State */}
        {session.status === 'question' && currentQuestion && (
          <div className="animate-fade-in">
            {/* Timer Bar */}
            <div className="mb-6">
              <div className="h-4 bg-card-border rounded-full overflow-hidden" role="progressbar" aria-label="Time remaining" aria-valuemin={0} aria-valuemax={currentQuestion.timeLimit} aria-valuenow={timeLeft ?? currentQuestion.timeLimit}>
                <div
                  className={`h-full transition-all duration-100 ease-linear ${
                    timeLeft && timeLeft <= 5
                      ? 'bg-error'
                      : timeLeft && timeLeft <= 10
                      ? 'bg-accent'
                      : 'bg-primary'
                  }`}
                  style={{
                    width: `${
                      timeLeft !== null
                        ? (timeLeft / currentQuestion.timeLimit) * 100
                        : 100
                    }%`,
                  }}
                />
              </div>
              <div className="text-center mt-2 text-2xl font-bold" aria-live="polite" aria-atomic="true">
                {timeLeft !== null ? `${timeLeft}s` : '...'}
              </div>
            </div>

            {/* Question Display */}
            <div className="card mb-6">
              <div className="text-sm text-foreground/50 mb-2">
                Question {session.currentQuestionIndex + 1} of {quiz?.questions.length}
              </div>
              <h2 className="text-3xl font-bold text-center mb-4">{currentQuestion.question}</h2>
              {currentQuestion.image && (
                <div className="mb-6 flex justify-center">
                  <img
                    src={currentQuestion.image}
                    alt="Question illustration"
                    className="max-h-64 object-contain rounded-lg"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {currentQuestion.options.map((option, i) => (
                  <div key={i} className={`answer-btn answer-btn-${i} opacity-80`}>
                    <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    {option}
                  </div>
                ))}
              </div>
            </div>

            {/* Answer Count */}
            <div className="text-center mb-6" aria-live="polite">
              <span className="text-xl" aria-label={`${Object.values(players).filter((p) => p.lastAnswer !== null).length} of ${playerList.length} players answered`}>
                {Object.values(players).filter((p) => p.lastAnswer !== null).length} / {playerList.length} answered
              </span>
            </div>

            {/* Controls */}
            {session.settings.mode === 'manual' && (
              <div className="flex justify-center">
                <button
                  onClick={handleShowAnswer}
                  className="btn-accent flex items-center gap-2"
                  aria-label="End question and show answer"
                >
                  <Icon path={mdiStop} size={1} aria-hidden="true" />
                  End Question
                </button>
              </div>
            )}
          </div>
        )}

        {/* Answer Reveal State */}
        {session.status === 'answer_reveal' && currentQuestion && (
          <div className="animate-fade-in">
            <div className="card mb-6">
              <div className="text-sm text-foreground/50 mb-2">
                Question {session.currentQuestionIndex + 1} of {quiz?.questions.length}
              </div>
              <h2 className="text-3xl font-bold text-center mb-4">{currentQuestion.question}</h2>
              {currentQuestion.image && (
                <div className="mb-6 flex justify-center">
                  <img
                    src={currentQuestion.image}
                    alt="Question illustration"
                    className="max-h-64 object-contain rounded-lg"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {currentQuestion.options.map((option, i) => (
                  <div
                    key={i}
                    className={`answer-btn answer-btn-${i} ${
                      currentQuestion.correctIndices.includes(i)
                        ? 'ring-4 ring-white animate-pulse'
                        : 'opacity-50'
                    }`}
                  >
                    <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    {option}
                    {currentQuestion.correctIndices.includes(i) && (
                      <Icon path={mdiCheck} size={1} className="ml-2 inline" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="text-center mb-6" aria-live="polite">
              <span className="text-xl text-success" aria-label={`${Object.values(players).filter((p) => p.lastAnswer !== null && currentQuestion.correctIndices.includes(p.lastAnswer)).length} correct answers`}>
                {Object.values(players).filter((p) => p.lastAnswer !== null && currentQuestion.correctIndices.includes(p.lastAnswer)).length} correct
              </span>
              <span className="mx-4 text-foreground/50" aria-hidden="true">|</span>
              <span className="text-xl text-error" aria-label={`${Object.values(players).filter((p) => p.lastAnswer !== null && !currentQuestion.correctIndices.includes(p.lastAnswer)).length} incorrect answers`}>
                {Object.values(players).filter((p) => p.lastAnswer !== null && !currentQuestion.correctIndices.includes(p.lastAnswer)).length} incorrect
              </span>
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-4">
              <button
                onClick={handleShowLeaderboard}
                className="btn-secondary flex items-center gap-2"
                aria-label="Show leaderboard"
              >
                <Icon path={mdiTrophy} size={1} aria-hidden="true" />
                Show Leaderboard
              </button>
              <button
                onClick={handleNextQuestion}
                className="btn-primary flex items-center gap-2"
                aria-label={isLastQuestion ? 'Finish game' : 'Next question'}
              >
                <Icon path={mdiSkipNext} size={1} aria-hidden="true" />
                {isLastQuestion ? 'Finish Game' : 'Next Question'}
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard State */}
        {session.status === 'leaderboard' && (
          <div className="animate-fade-in">
            <h2 className="text-4xl font-bold text-center mb-8 flex items-center justify-center gap-2">
              <Icon path={mdiTrophy} size={1.5} className="text-accent" aria-hidden="true" />
              Leaderboard
            </h2>

            <div className="card max-w-lg mx-auto mb-8">
              <div className="space-y-3" role="list" aria-label="Leaderboard rankings">
                {sortedPlayers.map(([id, player], index) => (
                  <div
                    key={id}
                    className="leaderboard-item animate-slide-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                    role="listitem"
                    aria-label={`Rank ${index + 1}: ${player.name}, ${player.score} points`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold w-8">{index + 1}</span>
                      <span className="font-medium">{player.name}</span>
                    </div>
                    <span className="text-xl font-bold text-primary">{player.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center">
              <button
                onClick={handleNextQuestion}
                className="btn-primary flex items-center gap-2 text-lg py-4 px-8"
                aria-label={isLastQuestion ? 'Finish game' : 'Next question'}
              >
                <Icon path={mdiSkipNext} size={1} aria-hidden="true" />
                {isLastQuestion ? 'Finish Game' : 'Next Question'}
              </button>
            </div>
          </div>
        )}

        {/* Finished State */}
        {session.status === 'finished' && (
          <div className="animate-bounce-in text-center">
            <h2 className="text-5xl font-bold mb-4" role="status" aria-live="polite">🎉 Game Over!</h2>
            
            {sortedPlayers.length > 0 && (
              <div className="mb-8">
                <h3 className="text-2xl mb-4">Winner</h3>
                <div className="text-6xl font-bold text-accent mb-2" aria-label={`Winner: ${sortedPlayers[0][1].name}`}>
                  🏆 {sortedPlayers[0][1].name}
                </div>
                <div className="text-3xl text-primary">{sortedPlayers[0][1].score} points</div>
              </div>
            )}

            <div className="card max-w-lg mx-auto mb-8">
              <h3 className="font-bold text-lg mb-4">Final Standings</h3>
              <div className="space-y-3" role="list" aria-label="Final standings">
                {sortedPlayers.map(([id, player], index) => (
                  <div key={id} className="leaderboard-item" role="listitem" aria-label={`Rank ${index + 1}: ${player.name}, ${player.score} points`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold w-8">{index + 1}</span>
                      <span className="font-medium">{player.name}</span>
                    </div>
                    <span className="text-lg font-bold text-primary">{player.score}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={exportAnswers}
                className="btn-secondary flex items-center gap-2 text-lg py-4 px-8"
                aria-label="Export game results"
              >
                <Icon path={mdiDownload} size={1} aria-hidden="true" />
                Export Answers
              </button>
              <button
                onClick={handleCloseSession}
                className="btn-primary text-lg py-4 px-8"
                aria-label="Close session and return to dashboard"
              >
                Close Session
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
