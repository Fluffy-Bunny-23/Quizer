# Quizer - Project Stack

A comprehensive overview of the technologies powering this Kahoot-style multiplayer quiz platform.

---

## Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16 | React framework with App Router |
| **React** | 19 | UI library with concurrent features |
| **TypeScript** | 5 | Type-safe development (strict mode) |

---

## Styling & UI

| Technology | Version | Purpose |
|------------|---------|---------|
| **Tailwind CSS** | 4 | Utility-first CSS framework |
| **PostCSS** | - | CSS processing pipeline |
| **@mdi/js** | 7 | Material Design Icons (JS) |
| **@mdi/react** | - | React wrapper for MDI icons |

---

## Backend & Database

| Technology | Purpose |
|------------|---------|
| **Firebase Authentication** | User auth (Google OAuth, Anonymous) |
| **Cloud Firestore** | Quiz storage (persistent data) |
| **Firebase Realtime DB** | Live game sessions (ephemeral state) |

### Data Architecture
- **Firestore**: Stores quiz definitions, questions, metadata
- **RTDB**: Manages live game sessions, player states, leaderboards

---

## Development Tools

| Tool | Purpose |
|------|---------|
| **ESLint 9** | Linting with Next.js core-web-vitals + TypeScript rules |
| **PostCSS** | CSS processing for Tailwind |

---

## Key Features

### Frontend
- Server-side rendering (SSR) ready
- Dark/light theme support
- Accessibility-focused with keyboard navigation
- Responsive design with Tailwind utilities

### Realtime
- WebSocket-based subscriptions (no polling)
- Live game state synchronization
- Instant leaderboard updates

### Security
- Firebase Security Rules for data access
- Input sanitization utilities
- XSS pattern detection

---

## Project Structure

```
quiz-app/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # Reusable React components
│   ├── contexts/         # Auth & Theme contexts
│   ├── lib/              # Firebase & utilities
│   ├── types/            # TypeScript interfaces
│   └── globals.css       # Tailwind + custom styles
├── public/               # Static assets
└── config files          # Next.js, Firebase, ESLint, etc.
```

---

## Quick Commands

```bash
npm run dev     # Start development server
npm run lint    # Run ESLint
npm run build   # Production build
```

---

## Environment Requirements

### Required Env Variables
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_DATABASE_URL
```

---

*Last updated: February 2026*
