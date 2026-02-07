// Mock Firebase before importing sessions module
const mockSet = jest.fn();
const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
const mockOnValue = jest.fn();
const mockOff = jest.fn();

// Create a mock ref object that can be returned
const createMockRef = (path: string) => ({ _path: path });

jest.mock('firebase/database', () => ({
  ref: jest.fn((db, path) => createMockRef(path)),
  set: mockSet,
  get: mockGet,
  update: mockUpdate,
  remove: mockRemove,
  onValue: mockOnValue,
  off: mockOff,
}));

jest.mock('../firebase', () => ({
  getRtdb: jest.fn(() => ({})),
}));

import {
  generateSessionCode,
  createSession,
  getSession,
  subscribeToSession,
  subscribeToPlayers,
  joinSession,
  updatePlayerRole,
  leaveSession,
  updateSessionStatus,
  startNextQuestion,
  submitAnswer,
  getQuestionAnswers,
  calculateScores,
  showAnswerReveal,
  showLeaderboard,
  endGame,
  deleteSession,
  updateGameMode,
  cleanupOldSessions,
  checkPlayerExists,
  updateLastActivity,
} from '../sessions';

describe('generateSessionCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      exists: () => false,
      val: () => null,
    });
  });

  it('should generate a 6-character code', async () => {
    const code = await generateSessionCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it('should not contain confusing characters (I, O, 0, 1)', async () => {
    // Generate multiple codes to check
    for (let i = 0; i < 10; i++) {
      const code = await generateSessionCode();
      expect(code).not.toContain('I');
      expect(code).not.toContain('O');
      expect(code).not.toContain('0');
      expect(code).not.toContain('1');
    }
  });

  it('should retry on collision', async () => {
    mockGet
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ status: 'lobby' }),
      }) // First collision
      .mockResolvedValueOnce({
        exists: () => false,
        val: () => null,
      }); // Second succeeds

    const code = await generateSessionCode();
    expect(code).toHaveLength(6);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('should throw error after max retries', async () => {
    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => ({ status: 'lobby' }),
    });

    await expect(generateSessionCode()).rejects.toThrow(
      'Failed to generate unique session code after maximum retries'
    );
  });
});

describe('createSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ exists: () => false });
    mockSet.mockResolvedValue(undefined);
  });

  it('should create a session with manual mode', async () => {
    const code = await createSession('host-123', 'quiz-456', 'manual', false, 5);

    expect(code).toHaveLength(6);
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        hostUid: 'host-123',
        quizId: 'quiz-456',
        status: 'lobby',
        settings: {
          mode: 'manual',
          showLeaderboard: true,
          shuffleQuestions: false,
        },
        currentQuestionIndex: -1,
        questionStartTime: null,
        questionOrder: [0, 1, 2, 3, 4],
      })
    );
  });

  it('should create a session with shuffled questions', async () => {
    const code = await createSession('host-123', 'quiz-456', 'auto', true, 5);

    expect(mockSet).toHaveBeenCalled();
    const sessionData = mockSet.mock.calls[0][1];
    expect(sessionData.questionOrder).toHaveLength(5);
    expect(sessionData.settings.shuffleQuestions).toBe(true);
  });

  it('should create session with empty question order when count is 0', async () => {
    await createSession('host-123', 'quiz-456', 'manual', false, 0);

    const sessionData = mockSet.mock.calls[0][1];
    expect(sessionData.questionOrder).toEqual([]);
  });
});

describe('getSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return session data if exists', async () => {
    const mockSession = {
      hostUid: 'host-123',
      quizId: 'quiz-456',
      status: 'lobby',
    };
    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => mockSession,
    });

    const session = await getSession('ABC123');
    expect(session).toEqual(mockSession);
  });

  it('should return null if session does not exist', async () => {
    mockGet.mockResolvedValue({
      exists: () => false,
    });

    const session = await getSession('ABC123');
    expect(session).toBeNull();
  });
});

describe('subscribeToSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call callback with session data', () => {
    const mockSession = { hostUid: 'host-123', status: 'lobby' };
    mockOnValue.mockImplementation((ref, callback) => {
      callback({
        exists: () => true,
        val: () => mockSession,
      });
    });

    const callback = jest.fn();
    subscribeToSession('ABC123', callback);

    expect(callback).toHaveBeenCalledWith(mockSession);
  });

  it('should call callback with null if session does not exist', () => {
    mockOnValue.mockImplementation((ref, callback) => {
      callback({
        exists: () => false,
      });
    });

    const callback = jest.fn();
    subscribeToSession('ABC123', callback);

    expect(callback).toHaveBeenCalledWith(null);
  });

  it('should return unsubscribe function', () => {
    mockOnValue.mockReturnValue(() => {});

    const unsubscribe = subscribeToSession('ABC123', jest.fn());
    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
    expect(mockOff).toHaveBeenCalled();
  });
});

describe('subscribeToPlayers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call callback with players data', () => {
    const mockPlayers = {
      player1: { name: 'Alice', score: 100 },
      player2: { name: 'Bob', score: 200 },
    };
    mockOnValue.mockImplementation((ref, callback) => {
      callback({
        exists: () => true,
        val: () => mockPlayers,
      });
    });

    const callback = jest.fn();
    subscribeToPlayers('ABC123', callback);

    expect(callback).toHaveBeenCalledWith(mockPlayers);
  });

  it('should call callback with empty object if no players exist', () => {
    mockOnValue.mockImplementation((ref, callback) => {
      callback({
        exists: () => false,
      });
    });

    const callback = jest.fn();
    subscribeToPlayers('ABC123', callback);

    expect(callback).toHaveBeenCalledWith({});
  });
});

describe('joinSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should add player to session', async () => {
    await joinSession('ABC123', 'player-1', 'Alice', 'player');

    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Alice',
        role: 'player',
        score: 0,
        lastAnswer: null,
        answerTime: null,
      })
    );
  });

  it('should sanitize player name', async () => {
    await joinSession('ABC123', 'player-1', '<script>alert(1)</script>', 'player');

    const playerData = mockSet.mock.calls[0][1];
    expect(playerData.name).not.toContain('<script>');
  });

  it('should truncate player name to 30 characters', async () => {
    const longName = 'A'.repeat(50);
    await joinSession('ABC123', 'player-1', longName, 'player');

    const playerData = mockSet.mock.calls[0][1];
    expect(playerData.name.length).toBeLessThanOrEqual(30);
  });

  it('should add spectator to session', async () => {
    await joinSession('ABC123', 'spec-1', 'Viewer', 'spectator');

    const playerData = mockSet.mock.calls[0][1];
    expect(playerData.role).toBe('spectator');
  });
});

describe('updatePlayerRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('should update player role', async () => {
    await updatePlayerRole('ABC123', 'player-1', 'spectator');

    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      'spectator'
    );
  });
});

describe('leaveSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemove.mockResolvedValue(undefined);
  });

  it('should remove player from session', async () => {
    await leaveSession('ABC123', 'player-1');

    expect(mockRemove).toHaveBeenCalled();
  });
});

describe('updateSessionStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should update session status', async () => {
    await updateSessionStatus('ABC123', 'question');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'question',
        lastActivity: expect.any(Number),
      })
    );
  });

  it('should reset question data when returning to lobby', async () => {
    await updateSessionStatus('ABC123', 'lobby');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'lobby',
        currentQuestionIndex: -1,
        questionStartTime: null,
        lastActivity: expect.any(Number),
      })
    );
  });
});

describe('startNextQuestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should advance to next question', async () => {
    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => ({
        currentQuestionIndex: 0,
      }),
    });

    await startNextQuestion('ABC123');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        currentQuestionIndex: 1,
        questionStartTime: expect.any(Number),
        lastActivity: expect.any(Number),
        status: 'question',
      })
    );
  });

  it('should clear player answers when starting next question', async () => {
    mockGet
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          currentQuestionIndex: 0,
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          player1: { name: 'Alice', score: 100 },
          player2: { name: 'Bob', score: 200 },
        }),
      });

    await startNextQuestion('ABC123');

    // Check that player answers are cleared
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('should do nothing if session does not exist', async () => {
    mockGet.mockResolvedValue({
      exists: () => false,
    });

    await startNextQuestion('ABC123');

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('submitAnswer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should record player answer', async () => {
    await submitAnswer('ABC123', 'player-1', 2, 1, 5000);

    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      {
        selectedIndex: 1,
        timeMs: 5000,
      }
    );
  });

  it('should update player last answer', async () => {
    await submitAnswer('ABC123', 'player-1', 2, 1, 5000);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      {
        lastAnswer: 1,
        answerTime: 5000,
      }
    );
  });
});

describe('getQuestionAnswers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return answers for a question', async () => {
    const mockAnswers = {
      player1: { selectedIndex: 0, timeMs: 3000 },
      player2: { selectedIndex: 1, timeMs: 5000 },
    };
    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => mockAnswers,
    });

    const answers = await getQuestionAnswers('ABC123', 0);
    expect(answers).toEqual(mockAnswers);
  });

  it('should return empty object if no answers exist', async () => {
    mockGet.mockResolvedValue({
      exists: () => false,
    });

    const answers = await getQuestionAnswers('ABC123', 0);
    expect(answers).toEqual({});
  });
});

describe('calculateScores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should calculate scores for correct answers', async () => {
    mockGet
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          player1: { selectedIndex: 0, timeMs: 3000 },
          player2: { selectedIndex: 1, timeMs: 5000 },
          player3: { selectedIndex: 2, timeMs: 10000 },
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          player1: { name: 'Alice', score: 0 },
          player2: { name: 'Bob', score: 0 },
          player3: { name: 'Charlie', score: 0 },
        }),
      });

    await calculateScores('ABC123', 0, [0], 20);

    expect(mockUpdate).toHaveBeenCalled();
    const updates = mockUpdate.mock.calls[0][1];
    expect(updates['player1/score']).toBeGreaterThan(0); // Correct answer
    expect(updates['player2/score']).toBeUndefined(); // Wrong answer
    expect(updates['player3/score']).toBeUndefined(); // Wrong answer
  });

  it('should handle multiple correct indices', async () => {
    mockGet
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          player1: { selectedIndex: 0, timeMs: 3000 },
          player2: { selectedIndex: 1, timeMs: 5000 },
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          player1: { name: 'Alice', score: 0 },
          player2: { name: 'Bob', score: 0 },
        }),
      });

    await calculateScores('ABC123', 0, [0, 1], 20);

    const updates = mockUpdate.mock.calls[0][1];
    expect(updates['player1/score']).toBeGreaterThan(0);
    expect(updates['player2/score']).toBeGreaterThan(0);
  });

  it('should award higher scores for faster answers', async () => {
    mockGet
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          fastPlayer: { selectedIndex: 0, timeMs: 1000 },
          slowPlayer: { selectedIndex: 0, timeMs: 10000 },
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          fastPlayer: { name: 'Fast', score: 0 },
          slowPlayer: { name: 'Slow', score: 0 },
        }),
      });

    await calculateScores('ABC123', 0, [0], 20);

    const updates = mockUpdate.mock.calls[0][1];
    expect(updates['fastPlayer/score']).toBeGreaterThan(updates['slowPlayer/score']);
  });

  it('should do nothing if no players exist', async () => {
    mockGet
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({}),
      })
      .mockResolvedValueOnce({
        exists: () => false,
      });

    await calculateScores('ABC123', 0, [0], 20);

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('showAnswerReveal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should update status to answer_reveal', async () => {
    await showAnswerReveal('ABC123');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { status: 'answer_reveal' }
    );
  });
});

describe('showLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should update status to leaderboard', async () => {
    await showLeaderboard('ABC123');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { status: 'leaderboard' }
    );
  });
});

describe('endGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should update status to finished', async () => {
    await endGame('ABC123');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { status: 'finished' }
    );
  });
});

describe('deleteSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemove.mockResolvedValue(undefined);
  });

  it('should remove session', async () => {
    await deleteSession('ABC123');

    expect(mockRemove).toHaveBeenCalled();
  });
});

describe('updateGameMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should update game mode', async () => {
    await updateGameMode('ABC123', 'auto');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { mode: 'auto' }
    );
  });
});

describe('cleanupOldSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should remove finished sessions', async () => {
    const now = Date.now();
    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => ({
        session1: { status: 'finished', lastActivity: now },
        session2: { status: 'lobby', lastActivity: now },
      }),
    });

    await cleanupOldSessions(24);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        session1: null,
      })
    );
  });

  it('should remove old inactive sessions', async () => {
    const now = Date.now();
    const oldTime = now - 25 * 60 * 60 * 1000; // 25 hours ago

    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => ({
        oldSession: { status: 'lobby', lastActivity: oldTime },
        newSession: { status: 'lobby', lastActivity: now },
      }),
    });

    await cleanupOldSessions(24);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        oldSession: null,
      })
    );
  });

  it('should do nothing if no sessions exist', async () => {
    mockGet.mockResolvedValue({
      exists: () => false,
    });

    await cleanupOldSessions(24);

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('checkPlayerExists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true if player exists', async () => {
    mockGet.mockResolvedValue({
      exists: () => true,
    });

    const exists = await checkPlayerExists('ABC123', 'player-1');
    expect(exists).toBe(true);
  });

  it('should return false if player does not exist', async () => {
    mockGet.mockResolvedValue({
      exists: () => false,
    });

    const exists = await checkPlayerExists('ABC123', 'player-1');
    expect(exists).toBe(false);
  });
});

describe('updateLastActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('should update last activity timestamp', async () => {
    await updateLastActivity('ABC123');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lastActivity: expect.any(Number),
      })
    );
  });
});
