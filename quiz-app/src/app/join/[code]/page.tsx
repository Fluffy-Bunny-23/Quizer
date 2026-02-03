'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSession, joinSession } from '@/lib/sessions';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiAccount, mdiEye, mdiPlay } from '@mdi/js';

export default function JoinGame() {
  const { user, signInAsGuest } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionCode = (params.code as string)?.toUpperCase();

  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<'player' | 'spectator'>('player');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  // Check if session exists
  useEffect(() => {
    const checkSession = async () => {
      if (!sessionCode) return;
      
      try {
        const session = await getSession(sessionCode);
        if (!session) {
          setError('Game not found. Check the code and try again.');
          setSessionValid(false);
        } else if (session.status !== 'lobby') {
          setError('This game is no longer accepting players.');
          setSessionValid(false);
        } else {
          setSessionValid(true);
        }
      } catch (err) {
        console.error('Error checking session:', err);
        setError('Failed to check game. Please try again.');
        setSessionValid(false);
      }
    };

    checkSession();
  }, [sessionCode]);

  const handleJoin = async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    if (nickname.trim().length < 2) {
      setError('Nickname must be at least 2 characters');
      return;
    }

    if (nickname.trim().length > 20) {
      setError('Nickname must be 20 characters or less');
      return;
    }

    setJoining(true);
    setError('');

    try {
      // Sign in anonymously if not already signed in
      let playerId = user?.uid;
      if (!user) {
        // signInAsGuest returns a Promise that resolves when auth is complete
        const guestUser: any = await signInAsGuest();
        // Try to derive the UID from the result first, then from the updated auth context
        playerId =
          guestUser?.uid ??
          guestUser?.user?.uid ??
          playerId ??
          (user && 'uid' in user ? (user as any).uid : undefined);
      } else {
        playerId = user.uid;
      }

      if (!playerId) {
        throw new Error('Unable to determine player ID after sign-in.');
      }
      // Join the session with the player ID
      await joinSession(sessionCode, playerId, nickname.trim(), role);
      
      // Navigate to play page
      router.push(`/play/${sessionCode}`);
    } catch (err) {
      console.error('Error joining game:', err);
      setError('Failed to join game. Please try again.');
      setJoining(false);
    }
  };

  if (!sessionCode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card text-center">
          <p className="text-error mb-4">Invalid game code</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (sessionValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading message="Checking game..." />
      </div>
    );
  }

  if (sessionValid === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card text-center max-w-md">
          <p className="text-error mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex justify-between items-center p-4 max-w-6xl mx-auto">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors"
        >
          <Icon path={mdiArrowLeft} size={1} />
          <span>Back</span>
        </button>
        <h1 className="text-2xl font-bold text-primary">⚡ Quizer</h1>
        <ThemeToggle />
      </header>

      <main className="max-w-md mx-auto p-4 py-8">
        <div className="card animate-slide-in">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold mb-2">Join Game</h2>
            <div className="text-2xl font-mono font-bold text-primary tracking-widest">
              {sessionCode}
            </div>
          </div>

          {error && (
            <div className="bg-error/10 border border-error text-error px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Nickname */}
            <div>
              <label className="block text-sm text-foreground/70 mb-2">Your Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your name"
                className="input text-lg text-center"
                maxLength={20}
                autoFocus
              />
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-sm text-foreground/70 mb-2">Join as</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setRole('player')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    role === 'player'
                      ? 'border-primary bg-primary/10'
                      : 'border-card-border hover:border-primary/50'
                  }`}
                >
                  <Icon
                    path={mdiAccount}
                    size={1.5}
                    className={`mx-auto mb-2 ${role === 'player' ? 'text-primary' : 'text-foreground/50'}`}
                  />
                  <h4 className="font-bold">Player</h4>
                  <p className="text-xs text-foreground/70">Answer questions</p>
                </button>
                <button
                  onClick={() => setRole('spectator')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    role === 'spectator'
                      ? 'border-secondary bg-secondary/10'
                      : 'border-card-border hover:border-secondary/50'
                  }`}
                >
                  <Icon
                    path={mdiEye}
                    size={1.5}
                    className={`mx-auto mb-2 ${role === 'spectator' ? 'text-secondary' : 'text-foreground/50'}`}
                  />
                  <h4 className="font-bold">Spectator</h4>
                  <p className="text-xs text-foreground/70">Watch only</p>
                </button>
              </div>
            </div>

            {/* Join Button */}
            <button
              onClick={handleJoin}
              disabled={joining || !nickname.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2 text-lg py-4 disabled:opacity-50"
            >
              <Icon path={mdiPlay} size={1} />
              {joining ? 'Joining...' : 'Join Game'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
