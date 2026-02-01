# 🧱 System Architecture — Realtime Quiz Platform

---

## Data Layers

| Purpose | Database |
|--------|----------|
| Quiz storage | Firestore |
| Live game state | Realtime DB |

---

## Firestore Schema

quizzes/{quizId}
- ownerUid
- title
- description
- createdAt
- questions (max 100)
  - question
  - options[4]
  - correctIndex
  - timeLimit

---

## RTDB Schema

sessions/{sessionId}
- hostUid
- quizId
- status
- settings (mode, timers, powerups)
- currentQuestionIndex
- questionStartTime

sessions/{sessionId}/players/{playerId}
- name
- role (player/spectator)
- score
- lastAnswer
- answerTime

sessions/{sessionId}/answers/{questionIndex}/{playerId}
- selectedIndex
- timeMs

---

## Game State Machine

Lobby  
→ Question  
→ Answer Reveal  
→ Leaderboard  
→ Next Question / Finish

---

## Roles

Host — full control  
Player — answer questions  
Spectator — view only  

---

## Sync Strategy

All clients subscribe to:
sessions/{sessionId}

Pure RTDB listeners, no polling.
