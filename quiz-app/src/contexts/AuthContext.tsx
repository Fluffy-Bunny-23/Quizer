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
import { getAuth, waitForFirebaseInit } from '@/lib/firebase';

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
    
    const setupAuth = async () => {
      try {
        await waitForFirebaseInit();
        const auth = getAuth();
        
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (mountedRef.current) {
            setUser(user);
            setLoading(false);
          }
        });

        return () => {
          unsubscribe();
        };
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        if (mountedRef.current) setLoading(false);
      }
    };

    const cleanup = setupAuth();
    
    return () => {
      mountedRef.current = false;
      cleanup.then(fn => fn?.()).catch(() => {});
    };
  }, []);

  const signInWithGoogle = async () => {
    await waitForFirebaseInit();
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInAsGuest = async () => {
    await waitForFirebaseInit();
    const auth = getAuth();
    const result = await signInAnonymously(auth);
    return result.user;
  };

  const signOut = async () => {
    try {
      const auth = getAuth();
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
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
