// Quiz Types (Firestore)
export interface Question {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  timeLimit: number; // seconds
}

export interface Quiz {
  id?: string;
  ownerUid: string;
  title: string;
  description: string;
  createdAt: Date | string;
  questions: Question[];
}

// Session Types (RTDB)
export type GameStatus = 'lobby' | 'question' | 'answer_reveal' | 'leaderboard' | 'finished';
export type GameMode = 'manual' | 'auto';
export type PlayerRole = 'player' | 'spectator';

export interface SessionSettings {
  mode: GameMode;
  showLeaderboard: boolean;
}

export interface Session {
  hostUid: string;
  quizId: string;
  status: GameStatus;
  settings: SessionSettings;
  currentQuestionIndex: number;
  questionStartTime: number | null;
  players?: Record<string, Player>;
}

export interface Player {
  name: string;
  role: PlayerRole;
  score: number;
  lastAnswer: number | null;
  answerTime: number | null;
}

export interface Answer {
  selectedIndex: number;
  timeMs: number;
}

// Auth Types
export type UserRole = 'host' | 'player' | 'spectator';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  role?: UserRole;
}
