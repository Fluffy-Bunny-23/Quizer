'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInAnonymously,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<User>;
  signOut: () => Promise<void>;
  isHost: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    
    if (!auth) {
      // Schedule state update in microtask to avoid synchronous setState warning
      queueMicrotask(() => {
        if (mountedRef.current) setLoading(false);
      });
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) throw new Error('Firebase not initialized');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInAsGuest = async () => {
    if (!auth) throw new Error('Firebase not initialized');
    const result = await signInAnonymously(auth);
    return result.user;
  };

  const signOut = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  };

  // Hosts are authenticated users (Google login), players are anonymous
  const isHost = user !== null && !user.isAnonymous;

  const value = {
    user,
    loading,
    signInWithGoogle,
    signInAsGuest,
    signOut,
    isHost,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
