# AGENTS.md — Quizer Development Guide

This document provides everything an AI agent needs to work effectively in this codebase.

## Project Overview

**Quizer** is a Kahoot-style realtime multiplayer quiz platform built with Next.js and Firebase. It allows hosts to create quizzes and players to join live sessions with realtime leaderboards, scoring, and both manual and automatic game modes.

**Key characteristics**:
- Monorepo structure (Next.js app in `quiz-app/`)
- Dual Firebase backend: Firestore (quiz storage) + Realtime DB (game sessions)
- Realtime event-driven architecture (no polling)
- TypeScript strict mode
- Dark/light theme support
- Accessibility-focused with keyboard navigation

---

## Quick Start Commands

All commands run from `/workspaces/Quizer/quiz-app/` unless noted.

### Development
```bash
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run lint         # Run ESLint
npm run build        # Build for production
npm run start        # Start production server
```

### Testing
```bash
npm test             # Run tests (if configured)
```

### Firebase Emulators (when available)
```bash
./start-emulators.sh       # Start Firebase emulators
node seed-emulators.js     # Seed test data
```

---

## Directory Structure

```
quiz-app/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Home page
│   │   ├── layout.tsx          # Root layout (uses ErrorBoundary + Providers)
│   │   ├── providers.tsx       # Context providers (Auth, Theme, Toast)
│   │   ├── quiz/
│   │   │   └── new/page.tsx    # Quiz builder page
│   │   │   └── [id]/page.tsx   # Quiz edit page
│   │   ├── session/
│   │   │   └── new/page.tsx    # Create session page
│   │   │   └── [id]/page.tsx   # Host session control page
│   │   ├── play/[code]/page.tsx # Player question/answer page
│   │   ├── join/[code]/page.tsx # Player join session page
│   │   └── dashboard/page.tsx  # Host quiz list page
│   ├── contexts/               # React Context providers
│   │   ├── AuthContext.tsx     # User auth state & methods
│   │   └── ThemeContext.tsx    # Dark/light theme state
│   ├── components/             # Reusable components
│   │   ├── ErrorBoundary.tsx   # Global error catcher
│   │   ├── Loading.tsx         # Loading spinner
│   │   ├── LoadingButton.tsx   # Button with loading state
│   │   ├── ThemeToggle.tsx     # Dark/light toggle
│   │   ├── Toast.tsx           # Toast notifications
│   │   ├── ImageUpload.tsx     # Image upload component
│   │   └── ConnectionStatus.tsx # Firebase connection indicator
│   ├── lib/
│   │   ├── firebase.ts         # Firebase initialization & helpers
│   │   ├── sessions.ts         # Session/game logic (RTDB operations)
│   │   ├── utils.ts            # Validation & sanitization helpers
│   │   └── migration.ts        # Data migration utilities
│   ├── types/
│   │   └── index.ts            # All TypeScript interfaces
│   └── globals.css             # Tailwind + custom CSS
├── public/                     # Static assets
├── tsconfig.json               # TypeScript config (strict mode, @ alias)
├── eslint.config.mjs           # ESLint config (Next.js core-web-vitals + TypeScript)
├── next.config.ts              # Next.js config
├── postcss.config.mjs          # PostCSS config (Tailwind)
├── firebase.json               # Firebase Hosting config
├── firestore.rules             # Firestore security rules
├── database.rules.json         # Realtime DB security rules
└── package.json                # Dependencies & scripts
```

---

## Technology Stack

| Layer | Tech | Notes |
|-------|------|-------|
| **Frontend** | Next.js 16, React 19 | App Router, SSR ready |
| **Styling** | Tailwind CSS 4, PostCSS | Configured with @tailwindcss/postcss |
| **Icons** | @mdi/js, @mdi/react | Material Design Icons v7 |
| **Backend** | Firebase (auth, Firestore, RTDB) | Emulator support in dev |
| **Language** | TypeScript 5 | Strict mode enabled |
| **Linting** | ESLint 9 | Next.js core rules + TypeScript rules |

---

## Code Patterns & Conventions

### File Naming
- **Pages**: PascalCase files (`page.tsx`)
- **Components**: PascalCase files (`ErrorBoundary.tsx`)
- **Utils/Contexts**: Descriptive names (`AuthContext.tsx`, `sessions.ts`)
- **Private files**: camelCase in utils

### Component Structure
**Client components** (user interactions) are marked with `'use client'`:
```tsx
'use client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
// ... component code
```

**Server components** (default) are implicit—no marker needed.

### TypeScript Patterns

**All types defined in** `src/types/index.ts`:
```typescript
// Quiz types (stored in Firestore)
interface Question {
  question: string;
  options: string[];
  correctIndices: number[];  // supports multiple correct answers
  timeLimit: number;
  image?: string; // base64 encoded
}

interface Quiz {
  id?: string;
  ownerUid: string;
  title: string;
  description: string;
  createdAt: Date | string;
  questions: Question[];
}

// Session types (realtime RTDB)
type GameStatus = 'lobby' | 'question' | 'answer_reveal' | 'leaderboard' | 'finished';
type GameMode = 'manual' | 'auto';
type PlayerRole = 'player' | 'spectator';

interface Session {
  hostUid: string;
  quizId: string;
  status: GameStatus;
  settings: SessionSettings;
  currentQuestionIndex: number;
  questionStartTime: number | null;
  players?: Record<string, Player>;
  questionOrder?: number[]; // for shuffle support
}

interface Player {
  name: string;
  role: PlayerRole;
  score: number;
  lastAnswer: number | null;
  answerTime: number | null;
}
```

### Context Providers Pattern
All contexts:
1. Created with `createContext<Type | undefined>(undefined)`
2. Provide both state and methods
3. Used through custom hooks (`useAuth()`, `useTheme()`)
4. Wrapped in `Providers` component in `app/providers.tsx`

Example:
```tsx
'use client';
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
  // Setup logic
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

### Validation Pattern
Used in quiz builder (`src/app/quiz/new/page.tsx`):
- `validate*()` functions return error messages or null
- `is*()` functions return booleans for UI controls
- Inline state for field errors: `{fieldName: errorMessage | null}`

```typescript
const validateTitle = (title: string): string | null => {
  if (!title.trim()) return 'Title is required';
  if (title.trim().length < 3) return 'Title must be at least 3 characters';
  if (title.length > 100) return 'Title must be 100 characters or less';
  return null;
};

const isValidTitle = (title: string): boolean => {
  return title.trim().length >= 3 && title.length <= 100;
};
```

### Firebase Module Pattern
All Firebase operations isolated in `src/lib/`:
- `firebase.ts`: Initialization, getters with error handling
- `sessions.ts`: RTDB operations (create, subscribe, update)
- Getters throw if not initialized: `getAuth()`, `getDb()`, `getRtdb()`
- Subscription functions return unsubscribe callbacks

Example:
```typescript
// Create session with shuffle support
export async function createSession(
  hostUid: string,
  quizId: string,
  mode: GameMode = 'manual',
  shuffleQuestions: boolean = false,
  questionCount: number = 0
): Promise<string> {
  const code = await generateSessionCode();
  // Create session with questionOrder...
}

// Subscribe to changes
export function subscribeToSession(
  sessionId: string,
  callback: (session: Session | null) => void
): () => void {
  const sessionRef = ref(getRtdb(), `sessions/${sessionId}`);
  const listener = onValue(sessionRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  return () => off(sessionRef, 'value', listener);
}
```

### Logging
- **Errors**: `console.error('Context:', error)` (descriptive prefix)
- **Info**: `console.log('🔥 Message')` (emoji prefix for visual distinction)
- **Warnings**: `console.warn('⚠️ Message')`
- **Never log secrets**: API keys, auth tokens, passwords

### Input Sanitization
Use `sanitizeInput()` from `src/lib/utils.ts` for:
- Player names
- Quiz titles/descriptions
- Any user-provided text

Use `containsXSSPatterns()` to validate user input for XSS.

### Error Handling
- **Firestore queries**: Wrap in try/catch, return null on error
- **Auth operations**: Catch and log with `console.error()`
- **Components**: ErrorBoundary catches React errors globally
- **RTDB subscriptions**: Handle snapshot.exists() check before accessing data

---

## Game Architecture

### Data Flow

1. **Quiz Creation** (Firestore):
   - Host creates quiz on `/quiz/new`
   - Stored in `quizzes/{quizId}` document
   - Host (`ownerUid`) identified by Google auth

2. **Session Creation** (RTDB):
   - Host starts session → generates 6-char code (collision detection)
   - Creates `sessions/{code}` with quiz reference
   - Players join with code on `/join/{code}`
   - Session auto-deleted when finished

3. **Game Loop**:
   ```
   Lobby (players joining)
   → Question (show question, start timer)
   → Answer Reveal (show correct answer + scores)
   → Leaderboard (show rankings)
   → Next Question / Finished
   ```

4. **Realtime Sync**:
   - All clients subscribe to `sessions/{code}`
   - Changes broadcast instantly (no polling)
   - Host controls status transitions
   - Answers locked when time ends or host advances

### Session Code Generation
- 6 characters: `[A-Z2-9]` (excludes confusing: I, O, 0, 1)
- Collision detection: checks if code exists before returning
- Max 10 retries (exponentially rare)

### Shuffle Implementation
- Fisher-Yates shuffle in `sessions.ts`
- If `shuffleQuestions: true`, questions order randomized on session create
- Order stored in `Session.questionOrder` array
- Client uses this array to fetch questions in shuffled order

---

## Authentication & Authorization

### Auth Flow

1. **Google Login** (hosts):
   - `AuthContext.signInWithGoogle()` → Firebase Google provider
   - Sets `user.isAnonymous = false`

2. **Anonymous Login** (players):
   - `AuthContext.signInAsGuest()` → Firebase anonymous auth
   - Sets `user.isAnonymous = true`

3. **Role Detection**:
   ```typescript
   const isHost = user !== null && !user.isAnonymous;
   ```

### Security Rules

**Firestore** (`firestore.rules`):
- Users can read/write their own quizzes
- Quizzes are indexed by `ownerUid`

**Realtime DB** (`database.rules.json`):
- Hosts control session state changes
- Players can only submit answers
- Spectators are read-only
- Answer structure: `sessions/{code}/answers/{questionIndex}/{playerId}`

---

## Common Tasks & Patterns

### Add a New Quiz Feature
1. Update type in `src/types/index.ts`
2. Add UI in `src/app/quiz/new/page.tsx` or `src/app/quiz/[id]/page.tsx`
3. Add Firestore save logic
4. Update validation in page component

**Example**: Adding a category field:
```typescript
// types/index.ts
interface Quiz {
  // ... existing
  category?: string;
}

// quiz/new/page.tsx
const [category, setCategory] = useState('');
// Add input field, validation, save to Firestore
```

### Add a Game Feature (e.g., new session state)
1. Update `GameStatus` type in `types/index.ts`
2. Add state transition logic to host control page (`session/[id]/page.tsx`)
3. Add UI for new state on player/spectator pages (`play/[code]/page.tsx`)
4. Update RTDB subscription handlers

**Example**: Adding power-ups:
```typescript
// types/index.ts
type PowerUpType = 'double_points' | 'freeze_time';

interface SessionSettings {
  // ... existing
  enablePowerUps?: boolean;
}

interface Player {
  // ... existing
  activePowerUp?: PowerUpType | null;
}
```

### Add a Validation Rule
1. Add `validate*()` function in page component or `utils.ts`
2. Call on input change, store error in state
3. Display error message below field
4. Disable submit button if any errors exist

**Example**:
```typescript
const [error, setError] = useState<string | null>(null);

const handleInput = (value: string) => {
  setValue(value);
  setError(validateInput(value));
};
```

### Subscribe to Realtime Updates
```typescript
import { subscribeToSession } from '@/lib/sessions';

useEffect(() => {
  const unsubscribe = subscribeToSession(sessionId, (session) => {
    if (session) {
      // Update local state
      setSession(session);
    }
  });

  return () => unsubscribe(); // Cleanup on unmount
}, [sessionId]);
```

### Handle Firebase Initialization
```typescript
import { waitForFirebaseInit, getDb } from '@/lib/firebase';

try {
  await waitForFirebaseInit();
  const db = getDb();
  // Use db...
} catch (error) {
  console.error('Firebase error:', error);
  setError('Failed to connect to database');
}
```

---

## Testing & Debugging

### Browser Testing
- Dev server: `npm run dev` → http://localhost:3000
- Open DevTools (F12) to check network, console, React Profiler
- Check Connection Status component (if visible) for Firebase status

### Firebase Emulators
When available:
```bash
./start-emulators.sh    # Start Auth (9099), Firestore (8080), RTDB (9000)
node seed-emulators.js  # Load test data
npm run dev              # Dev server will auto-detect and use emulators
```

### Debugging Tips
1. **Check console**: Look for Firebase initialization logs, auth errors
2. **Check Network tab**: Verify RTDB subscriptions are active (WebSocket)
3. **React DevTools**: Inspect component tree, context values, state
4. **TypeScript**: Run `tsc --noEmit` to check types without building
5. **ESLint**: Run `npm run lint` to find style issues

### Common Issues
| Issue | Cause | Fix |
|-------|-------|-----|
| Firebase not initialized | Env vars missing or page load race condition | Check env vars, use `waitForFirebaseInit()` |
| Subscriptions not updating | Unsubscribe not called | Ensure cleanup function returns unsubscribe |
| Stale data in UI | Context not updated | Check subscription is active, state is updated in callback |
| Session not found | Code typo or session deleted | Verify session code, check RTDB |
| Auth state flickers | Race condition on mount | Use `mountedRef` pattern to avoid state updates on unmounted components |

---

## Deployment

### Firebase Hosting Setup
```bash
npm run build
firebase deploy --only hosting
```

### Environment Variables
Required for production (`NEXT_PUBLIC_*` are exposed to browser):
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_DATABASE_URL
```

### Verifying Deployment
1. Check Firebase Console for RTDB/Firestore activity
2. Test session creation and joining in production
3. Monitor console for errors

---

## Project-Specific Gotchas

1. **RTDB vs Firestore**: Quizzes (stored data) go to Firestore. Sessions (ephemeral game state) go to RTDB. Don't mix them.

2. **Question Ordering**: If `settings.shuffleQuestions` is true, use `session.questionOrder` array to access questions in correct order.

3. **Session Code Collisions**: Always use `generateSessionCode()` instead of creating codes manually. It includes collision detection.

4. **Realtime Subscriptions**: Always return unsubscribe callback from subscription functions. Call it in `useEffect` cleanup.

5. **Auth State Timing**: Firebase auth can take ~100ms to initialize. Use `waitForFirebaseInit()` or rely on `AuthContext` which handles this.

6. **Multiple Correct Answers**: `correctIndices` is now an array (can have multiple correct answers). Update UI if changing from single-select to multi-select.

7. **Hydration**: Use `suppressHydrationWarning` in `layout.tsx` for theme toggle (client state differs from server).

8. **Date Serialization**: `createdAt` in Quiz can be `Date | string`. Always check type when reading from Firestore.

9. **Player Not Found**: Spectators added to session but never in `players` object if role is 'spectator'. Check `players` existence before accessing.

10. **Emulator Persistence**: Emulator data is NOT persistent across restarts. Seed with test data each time.

---

## Contributing Checklist

Before submitting changes:
- [ ] Run `npm run lint` and fix issues
- [ ] Run `npm run build` to verify production build
- [ ] Test on dev server at http://localhost:3000
- [ ] Verify TypeScript: `tsc --noEmit`
- [ ] Update types if adding new fields
- [ ] Add validation for user inputs
- [ ] Use `sanitizeInput()` for user-provided text
- [ ] Ensure RTDB subscriptions are cleaned up
- [ ] Test auth flows (Google login, anonymous)
- [ ] Check dark/light theme toggle works
- [ ] Verify error messages are user-friendly

---

## Useful Resources

- **Next.js Docs**: https://nextjs.org/docs (App Router guide)
- **Firebase Docs**: https://firebase.google.com/docs (Auth, Firestore, RTDB)
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **Tailwind CSS**: https://tailwindcss.com/docs (utility classes)
- **Material Design Icons**: https://mdi.js.org/ (icon list)
- **React 19**: https://react.dev (hooks, context)

---

## Questions?

If you encounter issues or patterns not documented here:
1. Check related files (e.g., similar pages or components)
2. Search for existing code patterns
3. Review TypeScript types for expected shapes
4. Check Firebase security rules for access issues
5. Use browser DevTools to inspect state and network activity
