import { ref, set, get, update, onValue, off, remove } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { getRtdb } from './firebase';
import { Session, Player, GameStatus, GameMode, Answer } from '@/types';
import { sanitizeInput } from './utils';

// Fisher-Yates shuffle algorithm
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Generate a random 6-character session code with collision detection
export async function generateSessionCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded confusing chars like I, O, 0, 1
  const maxRetries = 10;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    // Check if code already exists
    const existing = await getSession(code);
    if (!existing) {
      return code; // Code is unique
    }
    // Collision detected, try again
  }

  throw new Error('Failed to generate unique session code after maximum retries');
}

// Create a new session
export async function createSession(
  hostUid: string,
  quizId: string,
  mode: GameMode = 'manual',
  shuffleQuestions: boolean = false,
  questionCount: number = 0,
  questionsPerSession: number = questionCount
): Promise<string> {
  const code = await generateSessionCode();
  const sessionRef = ref(getRtdb(), `sessions/${code}`);

  // Clamp questionsPerSession to valid range
  const actualCount = Math.max(1, Math.min(questionsPerSession, questionCount));

  // Generate the full set of indices
  let indices = Array.from({ length: questionCount }, (_, i) => i);

  // If we need fewer questions than available, randomly select a subset
  if (actualCount < questionCount) {
    indices = shuffleArray(indices).slice(0, actualCount);
  }

  // If shuffle is enabled, shuffle the (possibly subset) indices
  const questionOrder = shuffleQuestions ? shuffleArray(indices) : indices;

  const session: Session = {
    hostUid,
    quizId,
    status: 'lobby',
    settings: {
      mode,
      showLeaderboard: true,
      shuffleQuestions,
    },
    currentQuestionIndex: -1,
    questionStartTime: null,
    questionOrder,
  };

  await set(sessionRef, session);
  return code;
}

// Get session data
export async function getSession(sessionId: string): Promise<Session | null> {
  const sessionRef = ref(getRtdb(), `sessions/${sessionId}`);
  const snapshot = await get(sessionRef);
  return snapshot.exists() ? (snapshot.val() as Session) : null;
}

// Subscribe to session changes
export function subscribeToSession(
  sessionId: string,
  callback: (session: Session | null) => void
): () => void {
  const sessionRef = ref(getRtdb(), `sessions/${sessionId}`);
  const listener = onValue(sessionRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as Session) : null);
  });

  return () => off(sessionRef, 'value', listener);
}

// Subscribe to players in a session
export function subscribeToPlayers(
  sessionId: string,
  callback: (players: Record<string, Player>) => void
): () => void {
  const playersRef = ref(getRtdb(), `sessions/${sessionId}/players`);
  const listener = onValue(playersRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as Record<string, Player>) : {});
  });

  return () => off(playersRef, 'value', listener);
}

// Join session as player
export async function joinSession(
  sessionId: string,
  playerId: string,
  playerName: string,
  role: 'player' | 'spectator' = 'player'
): Promise<void> {
  const playerRef = ref(getRtdb(), `sessions/${sessionId}/players/${playerId}`);
  // Sanitize player name to prevent XSS (max 30 chars as per UI constraint)
  const sanitizedName = sanitizeInput(playerName, 30);
  // Only include required fields - lastAnswer and answerTime are optional
  const player = {
    name: sanitizedName,
    role,
    score: 0,
  };
  await set(playerRef, player);
}

// Update player role
export async function updatePlayerRole(
  sessionId: string,
  playerId: string,
  role: 'player' | 'spectator'
): Promise<void> {
  const playerRef = ref(getRtdb(), `sessions/${sessionId}/players/${playerId}/role`);
  await set(playerRef, role);
}

// Leave session
export async function leaveSession(sessionId: string, playerId: string): Promise<void> {
  const playerRef = ref(getRtdb(), `sessions/${sessionId}/players/${playerId}`);
  await remove(playerRef);
}

// Update session status (host only)
export async function updateSessionStatus(
  sessionId: string,
  status: GameStatus
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    lastActivity: Date.now(),
  };
  
  if (status === 'lobby') {
    updates.currentQuestionIndex = -1;
    updates.questionStartTime = null;
  }

  await update(ref(getRtdb(), `sessions/${sessionId}`), updates);
}

// Start next question (host only)
export async function startNextQuestion(sessionId: string): Promise<void> {
  const sessionRef = ref(getRtdb(), `sessions/${sessionId}`);
  const snapshot = await get(sessionRef);
  
  if (!snapshot.exists()) return;
  
  const session = snapshot.val() as Session;
  const nextIndex = session.currentQuestionIndex + 1;

  await update(sessionRef, {
    currentQuestionIndex: nextIndex,
    questionStartTime: Date.now(),
    lastActivity: Date.now(),
    status: 'question',
  });

  // Clear previous answers for players by removing the fields (not setting to null)
  const playersRef = ref(getRtdb(), `sessions/${sessionId}/players`);
  const playersSnapshot = await get(playersRef);
  if (playersSnapshot.exists()) {
    const players = playersSnapshot.val() as Record<string, Player>;
    // Use remove() to delete fields instead of setting to null (which fails validation)
    const removePromises = Object.keys(players).map((playerId) =>
      Promise.all([
        remove(ref(getRtdb(), `sessions/${sessionId}/players/${playerId}/lastAnswer`)),
        remove(ref(getRtdb(), `sessions/${sessionId}/players/${playerId}/answerTime`)),
      ])
    );
    await Promise.all(removePromises);
  }
}

// Submit answer (player only)
export async function submitAnswer(
  sessionId: string,
  playerId: string,
  questionIndex: number,
  selectedIndex: number,
  timeMs: number
): Promise<void> {
  const auth = getAuth();
  console.log('🔥 Entering submitAnswer function');
  console.log('🔥 Parameters:', { 
    sessionId, 
    playerId, 
    questionIndex, 
    selectedIndex, 
    timeMs,
    authUid: auth.currentUser?.uid,
    isAuthenticated: !!auth.currentUser,
    isAnonymous: auth.currentUser?.isAnonymous
  });
  
  if (!auth.currentUser) {
    console.error('❌ Auth check failed: No current user');
    throw new Error('User not authenticated');
  }
  
  if (auth.currentUser.uid !== playerId) {
    console.error('❌ Auth check failed: UID mismatch');
    throw new Error(`Player ID mismatch: auth.uid=${auth.currentUser.uid}, playerId=${playerId}`);
  }
  
  console.log('🔥 Auth checks passed, preparing to write answer...');
  
  // Record the answer
  const answerRef = ref(getRtdb(), `sessions/${sessionId}/answers/${questionIndex}/${playerId}`);
  const answer: Answer = { selectedIndex, timeMs };
  
  console.log('🔥 Writing to path:', `sessions/${sessionId}/answers/${questionIndex}/${playerId}`);
  console.log('🔥 Answer data:', answer);
  
  try {
    console.log('🔥 Calling set() for answer...');
    await set(answerRef, answer);
    console.log('✅ Answer recorded successfully');
  } catch (err) {
    console.error('❌ Caught error in set():', typeof err, err);
    // Log all properties of the error
    if (err && typeof err === 'object') {
      console.error('❌ Error properties:', Object.keys(err));
      console.error('❌ Error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    }
    const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
    const errorCode = (err as { code?: string }).code;
    console.error('❌ Failed to record answer:', { errorMessage, errorCode, errorType: typeof err });
    throw new Error(`Failed to record answer: ${errorMessage || 'Unknown'} (${errorCode || 'no code'})`);
  }

  // Update player's last answer
  try {
    const playerUpdateRef = ref(getRtdb(), `sessions/${sessionId}/players/${playerId}`);
    const playerUpdate = {
      lastAnswer: selectedIndex,
      answerTime: timeMs,
    };
    console.log('🔥 Updating player at path:', `sessions/${sessionId}/players/${playerId}`);
    console.log('🔥 Player update data:', playerUpdate);
    await update(playerUpdateRef, playerUpdate);
    console.log('✅ Player last answer updated');
  } catch (err) {
    const errorDetails = err instanceof Error ? { message: err.message, name: err.name } : { raw: String(err) };
    console.error('❌ Caught error in update():', typeof err, err);
    if (err && typeof err === 'object') {
      console.error('❌ Error properties:', Object.keys(err));
      console.error('❌ Error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    }
    const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
    const errorCode = (err as { code?: string }).code;
    console.error('❌ Failed to update player:', { errorMessage, errorCode, errorType: typeof err });
    throw new Error(`Failed to update player: ${errorMessage || 'Unknown'} (${errorCode || 'no code'})`);
  }

  // Note: We don't update lastActivity here because only the host (non-anonymous) can update the session root
  // The activity timestamp is already updated by the host when they change game state
  console.log('✅ submitAnswer completed');
}

// Get all answers for a question
export async function getQuestionAnswers(
  sessionId: string,
  questionIndex: number
): Promise<Record<string, Answer>> {
  const answersRef = ref(getRtdb(), `sessions/${sessionId}/answers/${questionIndex}`);
  const snapshot = await get(answersRef);
  return snapshot.exists() ? (snapshot.val() as Record<string, Answer>) : {};
}

export async function calculateScores(
  sessionId: string,
  questionIndex: number,
  correctIndices: number[],
  timeLimit: number
): Promise<void> {
  const answers = await getQuestionAnswers(sessionId, questionIndex);
  const playersRef = ref(getRtdb(), `sessions/${sessionId}/players`);
  const playersSnapshot = await get(playersRef);

  if (!playersSnapshot.exists()) return;

  const players = playersSnapshot.val() as Record<string, Player>;
  const updates: Record<string, unknown> = {};

  Object.entries(answers).forEach(([playerId, answer]) => {
    if (correctIndices.includes(answer.selectedIndex) && players[playerId]) {
      // Speed-based scoring: Max 1000 points, decreases with time
      const maxPoints = 1000;
      const timeFraction = Math.min(answer.timeMs / (timeLimit * 1000), 1);
      const points = Math.round(maxPoints * (1 - timeFraction * 0.5)); // 50% time penalty max
      updates[`${playerId}/score`] = (players[playerId].score || 0) + points;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(playersRef, updates);
  }
}

// Show answer reveal (host only)
export async function showAnswerReveal(sessionId: string): Promise<void> {
  await update(ref(getRtdb(), `sessions/${sessionId}`), {
    status: 'answer_reveal',
  });
}

// Show leaderboard (host only)
export async function showLeaderboard(sessionId: string): Promise<void> {
  await update(ref(getRtdb(), `sessions/${sessionId}`), {
    status: 'leaderboard',
  });
}

// End game (host only)
export async function endGame(sessionId: string): Promise<void> {
  await update(ref(getRtdb(), `sessions/${sessionId}`), {
    status: 'finished',
  });
}

// Delete session (host only)
export async function deleteSession(sessionId: string): Promise<void> {
  await remove(ref(getRtdb(), `sessions/${sessionId}`));
}

// Update game mode
export async function updateGameMode(sessionId: string, mode: GameMode): Promise<void> {
  await update(ref(getRtdb(), `sessions/${sessionId}/settings`), { mode });
}

// Cleanup old sessions
export async function cleanupOldSessions(maxAgeHours: number = 24): Promise<void> {
  const sessionsRef = ref(getRtdb(), 'sessions');
  const snapshot = await get(sessionsRef);

  if (!snapshot.exists()) return;

  const sessions = snapshot.val();
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  const updates: Record<string, null> = {};

  Object.entries(sessions).forEach(([sessionId, session]: [string, any]) => {
    // Check if session is finished or too old
    const lastActivity = session.lastActivity || session.questionStartTime || 0;
    const isFinished = session.status === 'finished';
    const isOld = now - lastActivity > maxAgeMs;

    if (isFinished || isOld) {
      updates[sessionId] = null;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(sessionsRef, updates);
  }
}

// Check if a player exists in a session
export async function checkPlayerExists(
  sessionId: string,
  playerId: string
): Promise<boolean> {
  const playerRef = ref(getRtdb(), `sessions/${sessionId}/players/${playerId}`);
  const snapshot = await get(playerRef);
  return snapshot.exists();
}

// Update last activity timestamp
export async function updateLastActivity(sessionId: string): Promise<void> {
  await update(ref(getRtdb(), `sessions/${sessionId}`), {
    lastActivity: Date.now(),
  });
}
