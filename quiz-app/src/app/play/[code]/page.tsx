'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useToast } from '@/components/Toast';
import { ConnectionStatus, useConnectionStatus } from '@/components/ConnectionStatus';
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
  checkPlayerExists,
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
  const [lastSubmitTime, setLastSubmitTime] = useState<number>(0);
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);
  const [reconnected, setReconnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQuestionIndex = useRef<number>(-1);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const { showToast } = useToast();
  const { isOnline, retry, retryCount } = useConnectionStatus();

  // Compute myPlayer early for use in effects
  const myPlayer = user ? players[user.uid] : null;

  // Check for saved session and attempt reconnection
  useEffect(() => {
    const attemptReconnection = async () => {
      if (!sessionCode || !user) return;

      const savedSession = localStorage.getItem('quizer_session');
      if (savedSession) {
        try {
          const { sessionCode: savedCode, playerName: savedName, userId: savedId } = JSON.parse(savedSession);
          if (savedCode === sessionCode && user.uid === savedId) {
            // Attempt reconnection
            const exists = await checkPlayerExists(sessionCode, user.uid);
            if (exists) {
              // Player still in game, continue
              setReconnected(true);
            } else {
              // Player was removed, clear storage
              localStorage.removeItem('quizer_session');
            }
          }
        } catch (err) {
          console.error('Error parsing saved session:', err);
          localStorage.removeItem('quizer_session');
        }
      }
    };

    attemptReconnection();
  }, [sessionCode, user]);

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
            localStorage.removeItem('quizer_session');
            setLoadingSession(false);
            return;
          }
          
          // Reset answer state when moving to new question
          if (sessionData.currentQuestionIndex !== lastQuestionIndex.current) {
            setSelectedAnswer(null);
            setAnswerSubmitted(false);
            setRateLimitCooldown(0);
            if (rateLimitTimerRef.current) {
              clearInterval(rateLimitTimerRef.current);
            }
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
    
    const actualQuestionIndex = getActualQuestionIndex(session.currentQuestionIndex);
    const currentQuestion = quiz.questions[actualQuestionIndex];
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

  // Cleanup rate limit timer on unmount
  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) {
        clearInterval(rateLimitTimerRef.current);
      }
    };
  }, []);

  // Game over cleanup - remove session from localStorage when game finishes
  useEffect(() => {
    if (session?.status === 'finished') {
      localStorage.removeItem('quizer_session');
    }
  }, [session?.status]);

  // Tab close cleanup - clear localStorage when user closes tab
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.removeItem('quizer_session');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Show reconnected UI feedback
  useEffect(() => {
    if (reconnected) {
      showToast('Reconnected to game!', 'success');
    }
  }, [reconnected, showToast]);

  const handleSelectAnswer = useCallback(async (index: number) => {
    if (answerSubmitted || !user || !session || !quiz) return;

    const actualQuestionIndex = getActualQuestionIndex(session.currentQuestionIndex);
    const currentQuestion = quiz.questions[actualQuestionIndex];
    if (!currentQuestion) return;

    // Check if player (not spectator)
    const myPlayer = players[user.uid];
    if (myPlayer?.role === 'spectator') return;

    // Rate limiting check - 2 second minimum delay between submissions
    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime;
    const minDelay = 2000; // 2 seconds

    if (timeSinceLastSubmit < minDelay) {
      const remainingCooldown = Math.ceil((minDelay - timeSinceLastSubmit) / 1000);
      setRateLimitCooldown(remainingCooldown);
      
      // Clear any existing timer
      if (rateLimitTimerRef.current) {
        clearInterval(rateLimitTimerRef.current);
      }
      
      // Start countdown timer
      rateLimitTimerRef.current = setInterval(() => {
        setRateLimitCooldown((prev) => {
          if (prev <= 1) {
            if (rateLimitTimerRef.current) {
              clearInterval(rateLimitTimerRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return;
    }

    setLastSubmitTime(now);
    setSelectedAnswer(index);
    setAnswerSubmitted(true);
    setIsSubmitting(true);

    const timeMs = session.questionStartTime
      ? Date.now() - session.questionStartTime
      : 0;

    const submitOperation = async () => {
      await submitAnswer(
        sessionCode,
        user.uid,
        session.currentQuestionIndex,
        index,
        timeMs
      );
    };

    try {
      if (!isOnline) {
        const success = await retry(submitOperation);
        if (!success) {
          throw new Error('Failed to submit answer after retry');
        }
      } else {
        await submitOperation();
      }
      showToast('Answer submitted!', 'success');
    } catch (err) {
      console.error('Error submitting answer:', err);
      setError('Failed to submit answer');
      showToast('Failed to submit answer', 'error');
      // Allow retry
      setAnswerSubmitted(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [answerSubmitted, user, session, quiz, players, sessionCode, lastSubmitTime, isOnline, retry, showToast]);

  // Save session data when player is confirmed in game
  useEffect(() => {
    if (user && myPlayer && sessionCode) {
      const sessionData = {
        sessionCode,
        playerName: myPlayer.name,
        userId: user.uid,
        joinTimestamp: Date.now(),
      };
      localStorage.setItem('quizer_session', JSON.stringify(sessionData));
    }
  }, [user, myPlayer, sessionCode]);

  const handleLeave = async () => {
    if (user) {
      try {
        await leaveSession(sessionCode, user.uid);
        showToast('Left game successfully', 'info');
      } catch (err) {
        console.error('Error leaving session:', err);
        showToast('Failed to leave game properly', 'error');
      }
    }
    localStorage.removeItem('quizer_session');
    router.push('/');
  };

  // Helper to get actual question index from shuffled order
  const getActualQuestionIndex = (displayIndex: number): number => {
    if (!session?.questionOrder || displayIndex < 0 || displayIndex >= session.questionOrder.length) {
      return displayIndex;
    }
    return session.questionOrder[displayIndex];
  };

  // Compute derived state for render
  const isSpectator = myPlayer?.role === 'spectator';
  const playerList = Object.entries(players).filter(([, p]) => p.role === 'player');
  const sortedPlayers = [...playerList].sort(([, a], [, b]) => b.score - a.score);
  const currentQuestionIndex = session ? getActualQuestionIndex(session.currentQuestionIndex) : -1;
  const currentQuestion: Question | null = (session && quiz) ? (quiz.questions?.[currentQuestionIndex] ?? null) : null;
  const myRank = user ? sortedPlayers.findIndex(([id]) => id === user.uid) + 1 : 0;

  // Keyboard navigation for answers (keys 1-4)
  // Must be before conditional returns to maintain hook order
  useEffect(() => {
    if (!session) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only work during question state
      if (session?.status !== 'question') return;

      // Don't trigger if already submitted
      if (answerSubmitted) return;

      // Don't trigger if rate limited
      if (rateLimitCooldown > 0) return;

      // Don't trigger for spectators
      if (isSpectator) return;

      // Don't trigger if user is typing in an input field
      if (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          (event.target as HTMLElement)?.isContentEditable) {
        return;
      }

      // Don't trigger if a modal/dialog is open
      const openModal = document.querySelector('[role="dialog"], [aria-modal="true"], .modal-open');
      if (openModal) return;

      // Map keys 1-4 to answer indices 0-3
      const keyMap: Record<string, number> = {
        '1': 0, '2': 1, '3': 2, '4': 3
      };

      const answerIndex = keyMap[event.key];
      if (answerIndex !== undefined && currentQuestion && answerIndex < currentQuestion.options.length) {
        event.preventDefault();
        handleSelectAnswer(answerIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session, session?.status, answerSubmitted, rateLimitCooldown, isSpectator, currentQuestion, handleSelectAnswer]);

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

  return (
    <div className="min-h-screen bg-background">
      <ConnectionStatus retryCount={retryCount} />
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
              aria-label="Leave game"
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
              <div className="text-center mt-2 text-xl font-bold" aria-live="polite" aria-atomic="true">
                {timeLeft !== null ? `${timeLeft}s` : '...'}
              </div>
            </div>

            {/* Question */}
            <div className="card mb-6">
              <div className="text-sm text-foreground/50 mb-2 text-center">
                Question {session.currentQuestionIndex + 1}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
                {currentQuestion.question}
              </h2>
              {currentQuestion.image && (
                <div className="mt-4 flex justify-center">
                  <img
                    src={currentQuestion.image}
                    alt="Question illustration"
                    className="max-h-64 object-contain rounded-lg"
                  />
                </div>
              )}
            </div>

            {/* Rate Limit Indicator */}
            {rateLimitCooldown > 0 && (
              <div className="text-center mb-4 animate-fade-in">
                <div className="inline-flex items-center gap-2 bg-warning/20 text-warning px-4 py-2 rounded-full">
                  <Icon path={mdiClockOutline} size={0.8} />
                  Please wait {rateLimitCooldown}s before submitting again
                </div>
              </div>
            )}

            {/* Answer Options */}
            {!isSpectator ? (
              <>
                <div className="text-center text-foreground/50 text-sm mb-2 hidden md:block">
                  Press 1-4 to select an answer
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectAnswer(i)}
                    disabled={answerSubmitted || rateLimitCooldown > 0 || isSubmitting}
                    aria-pressed={selectedAnswer === i}
                    aria-disabled={answerSubmitted || rateLimitCooldown > 0 || isSubmitting}
                    aria-label={`Answer ${String.fromCharCode(65 + i)}: ${option}`}
                    className={`answer-btn answer-btn-${i} ${
                      selectedAnswer === i ? 'ring-4 ring-white' : ''
                    } ${(answerSubmitted || rateLimitCooldown > 0 || isSubmitting) && selectedAnswer !== i ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center">
                        <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                        <span>{option}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSubmitting && selectedAnswer === i && (
                          <span className="inline-flex">
                            <Icon path={mdiClockOutline} size={0.8} className="animate-spin" />
                          </span>
                        )}
                        <kbd className="hidden md:inline-block px-2 py-1 text-xs bg-white/20 rounded font-mono">
                          {i + 1}
                        </kbd>
                      </div>
                    </div>
                  </button>
                ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-foreground/70">
                <p className="text-xl">Watching as spectator...</p>
              </div>
            )}

            {/* Submitted Indicator */}
            {answerSubmitted && (
              <div className="text-center mt-6 animate-bounce-in">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${isSubmitting ? 'bg-accent/20 text-accent' : 'bg-success/20 text-success'}`}>
                  {isSubmitting ? (
                    <>
                      <Icon path={mdiClockOutline} size={1} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Icon path={mdiCheck} size={1} />
                      Answer submitted!
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Answer Reveal State */}
        {session.status === 'answer_reveal' && currentQuestion && (
          <div className="animate-fade-in">
            <div className="card mb-6">
              <h2 className="text-2xl font-bold text-center mb-4">
                {currentQuestion.question}
              </h2>
              {currentQuestion.image && (
                <div className="mb-6 flex justify-center">
                  <img
                    src={currentQuestion.image}
                    alt="Question illustration"
                    className="max-h-64 object-contain rounded-lg"
                  />
                </div>
              )}

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
