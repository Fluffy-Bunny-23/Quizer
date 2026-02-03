import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth as firebaseGetAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getDatabase, Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '',
};

// Check if Firebase is properly configured
const isConfigured = firebaseConfig.apiKey && firebaseConfig.projectId;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let rtdb: Database | null = null;

if (typeof window !== 'undefined' && isConfigured) {
  // Initialize Firebase only on the client side and if configured
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = firebaseGetAuth(app);
    db = getFirestore(app);
    rtdb = getDatabase(app);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

// Helper to get Auth or throw error
export function getAuth(): Auth {
  if (!auth) throw new Error('Firebase Auth not initialized');
  return auth;
}

// Helper to get Firestore or throw error
export function getDb(): Firestore {
  if (!db) throw new Error('Firebase Firestore not initialized');
  return db;
}

// Helper to get RTDB or throw error
export function getRtdb(): Database {
  if (!rtdb) throw new Error('Firebase Realtime Database not initialized');
  return rtdb;
}

// Helper to check if Firebase is initialized
export function isFirebaseInitialized(): boolean {
  return rtdb !== null && auth !== null && db !== null;
}

// Helper to wait for Firebase initialization (client-side only)
export async function waitForFirebaseInit(maxWaitMs: number = 5000): Promise<void> {
  // Check if Firebase is properly configured
  if (!isConfigured) {
    throw new Error('Firebase is not properly configured. Check environment variables.');
  }
  
  const startTime = Date.now();
  while (!isFirebaseInitialized()) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error('Firebase initialization timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

export { auth, db, rtdb };
export default app;
