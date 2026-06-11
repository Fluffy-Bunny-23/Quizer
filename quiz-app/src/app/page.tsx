'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loading } from '@/components/Loading';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@mdi/react';
import {
  mdiGoogle,
  mdiAccountGroup,
  mdiGamepadVariant,
  mdiTrophy,
} from '@mdi/js';

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
          <h1
            onClick={() => router.push('/dashboard')}
            className="text-2xl font-bold text-primary cursor-pointer flex items-center gap-2 hover:opacity-80 transition-opacity"
            aria-label="Quizer - Go to dashboard"
          >
            <img src="/icon.svg" alt="" className="w-7 h-7" />
            Quizer
          </h1>
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
              aria-label="Go to dashboard"
            >
              <Icon path={mdiGamepadVariant} size={1} aria-hidden="true" />
              Go to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* ===== Animated Background ===== */}
      <div className="fixed inset-0 bg-grid pointer-events-none z-0" />

      {/* Floating Shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        <div className="floating-shape floating-shape-1" style={{
          width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
          top: '5%', left: '-5%',
        }} />
        <div className="floating-shape floating-shape-2" style={{
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
          bottom: '-10%', right: '-10%',
        }} />
        <div className="floating-shape floating-shape-3" style={{
          width: 200, height: 200,
          background: 'radial-gradient(circle, rgba(251,191,36,0.06) 0%, transparent 70%)',
          top: '50%', left: '60%',
        }} />

        {/* Decorative small shapes */}
        <div className="floating-shape floating-shape-1" style={{
          width: 12, height: 12,
          background: 'var(--primary)',
          opacity: 0.12,
          top: '15%', left: '20%',
          animationDelay: '-2s',
        }} />
        <div className="floating-shape floating-shape-diamond floating-shape-2" style={{
          width: 16, height: 16,
          background: 'var(--secondary)',
          opacity: 0.1,
          top: '30%', left: '75%',
          animationDelay: '-5s',
        }} />
        <div className="floating-shape floating-shape-3" style={{
          width: 8, height: 8,
          background: 'var(--accent)',
          opacity: 0.15,
          top: '70%', left: '15%',
          animationDelay: '-8s',
        }} />
        <div className="floating-shape floating-shape-diamond floating-shape-1" style={{
          width: 20, height: 20,
          background: 'var(--primary)',
          opacity: 0.08,
          top: '80%', left: '80%',
          animationDelay: '-3s',
        }} />
      </div>

      {/* ===== Header ===== */}
      <header className="relative z-10 flex justify-between items-center p-4 max-w-6xl mx-auto">
        <h1
          onClick={() => router.push('/dashboard')}
          className="text-2xl font-bold text-primary cursor-pointer flex items-center gap-2 hover:opacity-80 transition-opacity"
          aria-label="Quizer - Go to dashboard"
        >
          <img src="/icon.svg" alt="" className="w-8 h-8" />
          Quizer
        </h1>
        <ThemeToggle />
      </header>

      {/* ===== Hero Section ===== */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 py-8 md:py-16" role="main">
        {/* Heading */}
        <div className="text-center mb-8 animate-slide-in">
          <p className="text-sm uppercase tracking-[0.3em] text-foreground/40 mb-4 font-semibold">
            Realtime multiplayer quiz platform
          </p>
          <h2
            className="font-display text-7xl sm:text-8xl md:text-9xl leading-none tracking-tight mb-4"
            style={{
              background: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 40%, #fbbf24 70%, #fef08a 100%)',
              backgroundSize: '200% auto',
              backgroundPosition: '0% center',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradient-reveal 1.5s ease-out forwards',
            }}
          >
            LIVE QUIZ
            <br />
            <span className="text-foreground" style={{ WebkitTextFillColor: 'var(--foreground)' }}>
              GAMES
            </span>
          </h2>
          <p className="text-lg text-foreground/60 max-w-xl mx-auto leading-relaxed">
            Create and host interactive quizzes. Compete in real-time with friends!
          </p>
        </div>

        {/* Feature Badges */}
        <div className="flex gap-4 md:gap-8 mb-10 md:mb-14 animate-fade-in" role="list" aria-label="Features">
          {[
            { icon: mdiGamepadVariant, label: 'Play Live', color: 'var(--primary)' },
            { icon: mdiAccountGroup, label: 'Multiplayer', color: 'var(--secondary)' },
            { icon: mdiTrophy, label: 'Leaderboard', color: 'var(--accent)' },
          ].map((feature, i) => (
            <div
              key={feature.label}
              className="flex flex-col items-center gap-2"
              role="listitem"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div
                className="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm border"
                style={{
                  background: `color-mix(in srgb, ${feature.color} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${feature.color} 25%, transparent)`,
                }}
                aria-hidden="true"
              >
                <Icon path={feature.icon} size={1.3} style={{ color: feature.color }} />
              </div>
              <span className="text-xs md:text-sm font-medium text-foreground/60 tracking-wide uppercase">
                {feature.label}
              </span>
            </div>
          ))}
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-6 w-full max-w-2xl">
          {/* Host Card */}
          <div className="card animate-slide-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Icon path={mdiGoogle} size={1} className="text-primary" aria-hidden="true" />
              Host a Quiz
            </h3>
            <p className="text-foreground/70 mb-6">
              Sign in with Google to create quizzes and host live game sessions.
            </p>
            <button
              onClick={handleHostLogin}
              className="btn-primary w-full flex items-center justify-center gap-2"
              aria-label="Sign in with Google to host quizzes"
            >
              <Icon path={mdiGoogle} size={1} aria-hidden="true" />
              Sign in with Google
            </button>
          </div>

          {/* Join Card */}
          <div className="card animate-slide-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Icon path={mdiAccountGroup} size={1} className="text-secondary" aria-hidden="true" />
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
                aria-label="Enter game code"
                aria-describedby="game-code-help"
              />
              <button
                onClick={handleJoinGame}
                disabled={joinCode.trim().length < 4}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                aria-disabled={joinCode.trim().length < 4}
                aria-label="Join game"
              >
                Join
              </button>
            </div>
            <span id="game-code-help" className="sr-only">Enter a 4 to 8 character game code to join a quiz</span>
          </div>
        </div>
      </main>

      {/* ===== Footer ===== */}
      <footer className="relative z-10 text-center py-8 text-foreground/30 text-xs tracking-wider uppercase" role="contentinfo">
        <p>Built with Next.js and Firebase</p>
      </footer>
    </div>
  );
}
