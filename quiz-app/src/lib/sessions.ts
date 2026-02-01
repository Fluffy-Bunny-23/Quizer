import { ref, set, push, get, update, onValue, off, remove } from 'firebase/database';
import { rtdb } from './firebase';
import { Session, Player, GameStatus, GameMode, Answer } from '@/types';

// Generate a random 6-character session code
export function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded confusing chars like I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create a new session
export async function createSession(
  hostUid: string,
  quizId: string,
  mode: GameMode = 'manual'
): Promise<string> {
  const code = generateSessionCode();
  const sessionRef = ref(rtdb, `sessions/${code}`);

  const session: Session = {
    hostUid,
    quizId,
    status: 'lobby',
    settings: {
      mode,
      showLeaderboard: true,
    },
    currentQuestionIndex: -1,
    questionStartTime: null,
  };

  await set(sessionRef, session);
  return code;
}

// Get session data
export async function getSession(sessionId: string): Promise<Session | null> {
  const sessionRef = ref(rtdb, `sessions/${sessionId}`);
  const snapshot = await get(sessionRef);
  return snapshot.exists() ? (snapshot.val() as Session) : null;
}

// Subscribe to session changes
export function subscribeToSession(
  sessionId: string,
  callback: (session: Session | null) => void
): () => void {
  const sessionRef = ref(rtdb, `sessions/${sessionId}`);
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
  const playersRef = ref(rtdb, `sessions/${sessionId}/players`);
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
  const playerRef = ref(rtdb, `sessions/${sessionId}/players/${playerId}`);
  const player: Player = {
    name: playerName,
    role,
    score: 0,
    lastAnswer: null,
    answerTime: null,
  };
  await set(playerRef, player);
}

// Update player role
export async function updatePlayerRole(
  sessionId: string,
  playerId: string,
  role: 'player' | 'spectator'
): Promise<void> {
  const playerRef = ref(rtdb, `sessions/${sessionId}/players/${playerId}/role`);
  await set(playerRef, role);
}

// Leave session
export async function leaveSession(sessionId: string, playerId: string): Promise<void> {
  const playerRef = ref(rtdb, `sessions/${sessionId}/players/${playerId}`);
  await remove(playerRef);
}

// Update session status (host only)
export async function updateSessionStatus(
  sessionId: string,
  status: GameStatus
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
  };
  
  if (status === 'lobby') {
    updates.currentQuestionIndex = -1;
    updates.questionStartTime = null;
  }

  await update(ref(rtdb, `sessions/${sessionId}`), updates);
}

// Start next question (host only)
export async function startNextQuestion(sessionId: string): Promise<void> {
  const sessionRef = ref(rtdb, `sessions/${sessionId}`);
  const snapshot = await get(sessionRef);
  
  if (!snapshot.exists()) return;
  
  const session = snapshot.val() as Session;
  const nextIndex = session.currentQuestionIndex + 1;

  await update(sessionRef, {
    currentQuestionIndex: nextIndex,
    questionStartTime: Date.now(),
    status: 'question',
  });

  // Clear previous answers for players
  const playersRef = ref(rtdb, `sessions/${sessionId}/players`);
  const playersSnapshot = await get(playersRef);
  if (playersSnapshot.exists()) {
    const players = playersSnapshot.val() as Record<string, Player>;
    const updates: Record<string, unknown> = {};
    Object.keys(players).forEach((playerId) => {
      updates[`${playerId}/lastAnswer`] = null;
      updates[`${playerId}/answerTime`] = null;
    });
    await update(playersRef, updates);
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
  // Record the answer
  const answerRef = ref(rtdb, `sessions/${sessionId}/answers/${questionIndex}/${playerId}`);
  const answer: Answer = { selectedIndex, timeMs };
  await set(answerRef, answer);

  // Update player's last answer
  await update(ref(rtdb, `sessions/${sessionId}/players/${playerId}`), {
    lastAnswer: selectedIndex,
    answerTime: timeMs,
  });
}

// Get all answers for a question
export async function getQuestionAnswers(
  sessionId: string,
  questionIndex: number
): Promise<Record<string, Answer>> {
  const answersRef = ref(rtdb, `sessions/${sessionId}/answers/${questionIndex}`);
  const snapshot = await get(answersRef);
  return snapshot.exists() ? (snapshot.val() as Record<string, Answer>) : {};
}

// Calculate and update scores after answer reveal
export async function calculateScores(
  sessionId: string,
  questionIndex: number,
  correctIndex: number,
  timeLimit: number
): Promise<void> {
  const answers = await getQuestionAnswers(sessionId, questionIndex);
  const playersRef = ref(rtdb, `sessions/${sessionId}/players`);
  const playersSnapshot = await get(playersRef);

  if (!playersSnapshot.exists()) return;

  const players = playersSnapshot.val() as Record<string, Player>;
  const updates: Record<string, unknown> = {};

  Object.entries(answers).forEach(([playerId, answer]) => {
    if (answer.selectedIndex === correctIndex && players[playerId]) {
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
  await update(ref(rtdb, `sessions/${sessionId}`), {
    status: 'answer_reveal',
  });
}

// Show leaderboard (host only)
export async function showLeaderboard(sessionId: string): Promise<void> {
  await update(ref(rtdb, `sessions/${sessionId}`), {
    status: 'leaderboard',
  });
}

// End game (host only)
export async function endGame(sessionId: string): Promise<void> {
  await update(ref(rtdb, `sessions/${sessionId}`), {
    status: 'finished',
  });
}

// Delete session (host only)
export async function deleteSession(sessionId: string): Promise<void> {
  await remove(ref(rtdb, `sessions/${sessionId}`));
}

// Update game mode
export async function updateGameMode(sessionId: string, mode: GameMode): Promise<void> {
  await update(ref(rtdb, `sessions/${sessionId}/settings`), { mode });
}
