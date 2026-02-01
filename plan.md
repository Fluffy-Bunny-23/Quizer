# 🧭 Development Plan — Kahoot-Style Realtime Quiz App

Tech Stack:
Next.js (React) • Firebase Auth • Firestore • Realtime DB • Firebase Hosting

---

## Phase 1 — Project Foundation
- Create Firebase project
- Enable:
  - Google Auth
  - Anonymous Auth
  - Firestore
  - Realtime Database
- Create Next.js app
- Install Firebase SDK
- Setup Firebase config + environment variables
- Setup theme system (dark/light toggle)
- Add MDI3 icons

---

## Phase 2 — Authentication System
- Google login for hosts
- Anonymous login for players
- Nickname capture screen
- Auth context provider
- Role detection (host vs player)

---

## Phase 3 — Quiz Builder (Firestore)
- Dashboard page (host only)
- Create quiz
- Edit quiz
- Delete quiz
- Question editor:
  - Question text
  - 4 options
  - Correct answer selector
  - Time limit per question
- Validation (≤100 questions, no images)
- Save to Firestore

---

## Phase 4 — Game Session System (RTDB)
- Generate session code
- Create session node
- Lobby page
- Player join system
- Spectator/player toggle

---

## Phase 5 — Core Game Loop
- Load quiz questions
- Start question
- Show timer
- Player answer submission
- Lock answers when time ends
- Reveal answer
- Score calculation
- Leaderboard display
- Next question / finish

---

## Phase 6 — Game Modes
- Manual mode (host control)
- Auto mode (timer driven)

---

## Phase 7 — UI/UX Polish
- Bright + flashy animations
- Dark blue theme
- Light/Dark toggle
- Answer button animations
- Leaderboard animations
- Correct answer highlight
- MDI3 icons

---

## Phase 8 — Deployment
- Firebase Hosting setup
- Build project
- Configure rewrites
- Deploy
