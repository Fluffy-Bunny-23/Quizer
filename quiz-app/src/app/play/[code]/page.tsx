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
  submitAnswer,
  leaveSession,
} from '@/lib/sessions';
import { Quiz, Session, Player, Question } from '@/types';
import Icon from '@mdi/react';
import {
  mdiCheck,
  mdiClose,
  mdiTrophy,
  mdiClockOutline,
  mdiAccountGroup,
  mdiExitToApp,
} from '@mdi/js';

export default function PlayGame() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionCode = (params.code as string)?.toUpperCase();

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [error, setError] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQuestionIndex = useRef<number>(-1);

  // Subscribe to session
  useEffect(() => {
    if (!sessionCode) return;

    const setupSubscriptions = async () => {
      try {
        // Ensure Firebase is initialized before setting up subscriptions
        const { waitForFirebaseInit } = await import('@/lib/firebase');
        await waitForFirebaseInit();

        const unsubSession = subscribeToSession(sessionCode, (sessionData) => {
          if (!sessionData) {
            setError('Game session ended');
            setLoadingSession(false);
            return;
          }
          
          // Reset answer state when moving to new question
          if (sessionData.currentQuestionIndex !== lastQuestionIndex.current) {
            setSelectedAnswer(null);
            setAnswerSubmitted(false);
            lastQuestionIndex.current = sessionData.currentQuestionIndex;
          }

          setSession(sessionData);
          setLoadingSession(false);
        });

        const unsubPlayers = subscribeToPlayers(sessionCode, setPlayers);

        return () => {
          unsubSession();
          unsubPlayers();
        };
      } catch (err) {
        console.error('Error setting up subscriptions:', err);
        setError('Failed to connect to game');
        setLoadingSession(false);
      }
    };

    const cleanup = setupSubscriptions().then(c => c);
    return () => {
      cleanup.then(c => c?.());
    };
  }, [sessionCode]);

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

  // Timer for question countdown
  useEffect(() => {
    if (!(session?.status === 'question' && session.questionStartTime && quiz)) {
      // Not in question state
      return;
    }
    
    const currentQuestion = quiz.questions[session.currentQuestionIndex];
    if (!currentQuestion) return;

    const updateTimer = () => {
      const elapsed = Date.now() - session.questionStartTime!;
      const remaining = Math.max(0, currentQuestion.timeLimit * 1000 - elapsed);
      setTimeLeft(Math.ceil(remaining / 1000));
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(null);
    };
  }, [session?.status, session?.questionStartTime, session?.currentQuestionIndex, quiz]);

  const handleSelectAnswer = useCallback(async (index: number) => {
    if (answerSubmitted || !user || !session || !quiz) return;

    const currentQuestion = quiz.questions[session.currentQuestionIndex];
    if (!currentQuestion) return;

    // Check if player (not spectator)
    const myPlayer = players[user.uid];
    if (myPlayer?.role === 'spectator') return;

    setSelectedAnswer(index);
    setAnswerSubmitted(true);

    const timeMs = session.questionStartTime
      ? Date.now() - session.questionStartTime
      : 0;

    try {
      await submitAnswer(
        sessionCode,
        user.uid,
        session.currentQuestionIndex,
        index,
        timeMs
      );
    } catch (err) {
      console.error('Error submitting answer:', err);
      setError('Failed to submit answer');
    }
  }, [answerSubmitted, user, session, quiz, players, sessionCode]);

  const handleLeave = async () => {
    if (user) {
      await leaveSession(sessionCode, user.uid);
    }
    router.push('/');
  };

  if (loading || loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading message="Loading game..." />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-error mb-4">{error || 'Game not found'}</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const myPlayer = user ? players[user.uid] : null;
  const isSpectator = myPlayer?.role === 'spectator';
  const playerList = Object.entries(players).filter(([, p]) => p.role === 'player');
  const sortedPlayers = [...playerList].sort(([, a], [, b]) => b.score - a.score);
  const currentQuestion: Question | null = quiz?.questions?.[session.currentQuestionIndex] ?? null;
  const myRank = user ? sortedPlayers.findIndex(([id]) => id === user.uid) + 1 : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-border">
        <div className="flex justify-between items-center p-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-primary">{sessionCode}</span>
            {isSpectator && (
              <span className="text-xs bg-secondary/20 text-secondary px-2 py-1 rounded">
                Spectator
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-foreground/70">{myPlayer?.name}</span>
            {!isSpectator && (
              <span className="font-bold text-primary">{myPlayer?.score || 0} pts</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={handleLeave}
              className="p-2 rounded-lg bg-card-bg border border-card-border hover:bg-error/10 hover:border-error transition-colors"
              title="Leave game"
            >
              <Icon path={mdiExitToApp} size={0.8} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {/* Lobby State */}
        {session.status === 'lobby' && (
          <div className="text-center animate-fade-in py-12">
            <div className="mb-8">
              <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Icon path={mdiClockOutline} size={2} className="text-primary" />
              </div>
              <h2 className="text-3xl font-bold mb-2">Waiting for Host</h2>
              <p className="text-foreground/70">The game will start soon...</p>
            </div>

            <div className="card max-w-md mx-auto">
              <h3 className="font-bold mb-4 flex items-center justify-center gap-2">
                <Icon path={mdiAccountGroup} size={1} className="text-primary" />
                Players in Lobby ({playerList.length})
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {playerList.map(([id, player]) => (
                  <span
                    key={id}
                    className={`px-3 py-1 rounded-full text-sm ${
                      user?.uid === id
                        ? 'bg-primary text-white'
                        : 'bg-card-border'
                    }`}
                  >
                    {player.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Question State */}
        {session.status === 'question' && currentQuestion && (
          <div className="animate-fade-in">
            {/* Timer */}
            <div className="mb-6">
              <div className="h-3 bg-card-border rounded-full overflow-hidden">
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
              <div className="text-center mt-2 text-xl font-bold">
                {timeLeft !== null ? `${timeLeft}s` : '...'}
              </div>
            </div>

            {/* Question */}
            <div className="card mb-6">
              <div className="text-sm text-foreground/50 mb-2 text-center">
                Question {session.currentQuestionIndex + 1}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-center">
                {currentQuestion.question}
              </h2>
            </div>

            {/* Answer Options */}
            {!isSpectator ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectAnswer(i)}
                    disabled={answerSubmitted}
                    className={`answer-btn answer-btn-${i} ${
                      selectedAnswer === i ? 'ring-4 ring-white' : ''
                    } ${answerSubmitted && selectedAnswer !== i ? 'opacity-50' : ''}`}
                  >
                    <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-foreground/70">
                <p className="text-xl">Watching as spectator...</p>
              </div>
            )}

            {/* Submitted Indicator */}
            {answerSubmitted && (
              <div className="text-center mt-6 animate-bounce-in">
                <div className="inline-flex items-center gap-2 bg-success/20 text-success px-4 py-2 rounded-full">
                  <Icon path={mdiCheck} size={1} />
                  Answer submitted!
                </div>
              </div>
            )}
          </div>
        )}

        {/* Answer Reveal State */}
        {session.status === 'answer_reveal' && currentQuestion && (
          <div className="animate-fade-in">
            <div className="card mb-6">
              <h2 className="text-2xl font-bold text-center mb-6">
                {currentQuestion.question}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option, i) => {
                  const isCorrect = currentQuestion.correctIndices.includes(i);
                  const isSelected = selectedAnswer === i;

                  return (
                    <div
                      key={i}
                      className={`answer-btn answer-btn-${i} ${
                        isCorrect
                          ? 'ring-4 ring-white animate-pulse'
                          : 'opacity-50'
                      }`}
                    >
                      <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                      {option}
                      {isCorrect && <Icon path={mdiCheck} size={1} className="ml-2 inline" />}
                      {isSelected && !isCorrect && (
                        <Icon path={mdiClose} size={1} className="ml-2 inline" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Result */}
            {!isSpectator && (
              <div className="text-center animate-bounce-in">
                {currentQuestion.correctIndices.includes(selectedAnswer ?? -1) ? (
                  <div className="text-success text-2xl font-bold">
                    ✓ Correct!
                  </div>
                ) : selectedAnswer !== null ? (
                  <div className="text-error text-2xl font-bold">✗ Wrong answer</div>
                ) : (
                  <div className="text-foreground/50 text-xl">No answer submitted</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard State */}
        {session.status === 'leaderboard' && (
          <div className="animate-fade-in">
            <h2 className="text-3xl font-bold text-center mb-6 flex items-center justify-center gap-2">
              <Icon path={mdiTrophy} size={1.2} className="text-accent" />
              Leaderboard
            </h2>

            {!isSpectator && myRank > 0 && (
              <div className="text-center mb-6">
                <span className="text-xl">
                  You are in <span className="font-bold text-primary">#{myRank}</span> place
                </span>
              </div>
            )}

            <div className="card max-w-lg mx-auto">
              <div className="space-y-3">
                {sortedPlayers.slice(0, 10).map(([id, player], index) => (
                  <div
                    key={id}
                    className={`leaderboard-item animate-slide-in ${
                      user?.uid === id ? 'ring-2 ring-primary' : ''
                    }`}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold w-8">{index + 1}</span>
                      <span className="font-medium">
                        {player.name}
                        {user?.uid === id && ' (You)'}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-primary">{player.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Finished State */}
        {session.status === 'finished' && (
          <div className="animate-bounce-in text-center py-8">
            <h2 className="text-4xl font-bold mb-4">🎉 Game Over!</h2>

            {sortedPlayers.length > 0 && (
              <>
                <div className="mb-8">
                  <h3 className="text-xl mb-2">Winner</h3>
                  <div className="text-4xl font-bold text-accent mb-1">
                    🏆 {sortedPlayers[0][1].name}
                  </div>
                  <div className="text-2xl text-primary">{sortedPlayers[0][1].score} points</div>
                </div>

                {!isSpectator && myRank > 0 && (
                  <div className="mb-6">
                    <p className="text-xl">
                      You finished <span className="font-bold text-primary">#{myRank}</span> with{' '}
                      <span className="font-bold">{myPlayer?.score || 0}</span> points
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="card max-w-lg mx-auto mb-8">
              <h3 className="font-bold text-lg mb-4">Final Standings</h3>
              <div className="space-y-2">
                {sortedPlayers.map(([id, player], index) => (
                  <div
                    key={id}
                    className={`leaderboard-item ${user?.uid === id ? 'ring-2 ring-primary' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold w-8">{index + 1}</span>
                      <span className="font-medium">
                        {player.name}
                        {user?.uid === id && ' (You)'}
                      </span>
                    </div>
                    <span className="font-bold text-primary">{player.score}</span>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleLeave} className="btn-primary text-lg py-3 px-8">
              Leave Game
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
