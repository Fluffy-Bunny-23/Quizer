'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@mdi/react';
import { mdiGoogle, mdiAccountGroup, mdiGamepadVariant, mdiTrophy } from '@mdi/js';

export default function Home() {
  const { user, loading, signInWithGoogle, isHost } = useAuth();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loading message="Loading Quizer..." />
      </div>
    );
  }

  const handleHostLogin = async () => {
    try {
      await signInWithGoogle();
      router.push('/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleJoinGame = () => {
    if (joinCode.trim().length >= 4) {
      router.push(`/join/${joinCode.trim().toUpperCase()}`);
    }
  };

  // If user is already logged in as host, show dashboard option
  if (user && isHost) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex justify-between items-center p-4 max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-primary">Quizer</h1>
          <ThemeToggle />
        </header>
        <main className="flex flex-col items-center justify-center px-4 py-12">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Welcome back, {user.displayName || 'Host'}!</h2>
            <p className="text-foreground/70">Ready to host some quizzes?</p>
          </div>
          <div className="flex flex-col gap-4 w-full max-w-md">
            <button
              onClick={() => router.push('/dashboard')}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Icon path={mdiGamepadVariant} size={1} />
              Go to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex justify-between items-center p-4 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-primary animate-pulse-glow">⚡ Quizer</h1>
        <ThemeToggle />
      </header>

      {/* Hero Section */}
      <main className="flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center mb-12 animate-slide-in">
          <h2 className="text-5xl md:text-6xl font-extrabold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Live Quiz Games
          </h2>
          <p className="text-xl text-foreground/70 max-w-xl mx-auto">
            Create and host interactive quizzes. Compete in real-time with friends!
          </p>
        </div>

        {/* Feature Icons */}
        <div className="flex gap-8 mb-12 animate-fade-in">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <Icon path={mdiGamepadVariant} size={1.5} className="text-primary" />
            </div>
            <span className="text-sm text-foreground/70">Play Live</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center">
              <Icon path={mdiAccountGroup} size={1.5} className="text-secondary" />
            </div>
            <span className="text-sm text-foreground/70">Multiplayer</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <Icon path={mdiTrophy} size={1.5} className="text-accent" />
            </div>
            <span className="text-sm text-foreground/70">Leaderboard</span>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-6 w-full max-w-2xl">
          {/* Host Card */}
          <div className="card animate-slide-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Icon path={mdiGoogle} size={1} className="text-primary" />
              Host a Quiz
            </h3>
            <p className="text-foreground/70 mb-6">
              Sign in with Google to create quizzes and host live game sessions.
            </p>
            <button
              onClick={handleHostLogin}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Icon path={mdiGoogle} size={1} />
              Sign in with Google
            </button>
          </div>

          {/* Join Card */}
          <div className="card animate-slide-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Icon path={mdiAccountGroup} size={1} className="text-secondary" />
              Join a Game
            </h3>
            <p className="text-foreground/70 mb-6">
              Enter a game code to join an active quiz session as a player.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Game Code"
                maxLength={8}
                className="input flex-1 text-center text-xl font-mono tracking-widest uppercase"
                onKeyDown={(e) => e.key === 'Enter' && handleJoinGame()}
              />
              <button
                onClick={handleJoinGame}
                disabled={joinCode.trim().length < 4}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-foreground/50 text-sm">
        <p>Built with ⚡ Next.js and Firebase</p>
      </footer>
    </div>
  );
}
