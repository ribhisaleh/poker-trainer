# Poker Academy — Task Tracker

## ✅ Completed

### Infrastructure
- [x] Scaffold Next.js 16 project (App Router, TypeScript, Tailwind v4)
- [x] Init shadcn/ui with 5 components: card, button, badge, progress, separator
- [x] Convert `poker_odds_hand_trainer_canvas_game.jsx` → `poker-trainer.tsx` with `"use client"`
- [x] Wire `app/page.tsx` to render `<PokerAcademyCanvasGame />`
- [x] Push to GitHub: `ribhisaleh/poker-trainer`
- [x] Deploy to Vercel: `poker-trainer-lilac.vercel.app`
- [x] Add `.claude/` to `.gitignore`

### PWA
- [x] Create `public/manifest.json` with Poker Trainer Academy branding
- [x] Generate 3 PNG icons via `scripts/generate-icons.mjs` (sharp + SVG spade): 192, 512, 180px
- [x] Update `app/layout.tsx` with full metadata, manifest link, and iOS `appleWebApp` config

### Mobile UX
- [x] Add full-width "Next →" button inside solution panel (replaces text prompt)
- [x] `touch-manipulation` class on tappable elements

### Phase 1: Outs Upgrade + Card Visuals
- [x] Add `calcImprovementOuts(bestHandLabel)` — conservative per-hand counts
- [x] Extend `EvalResult` and `Spot.solution` types with `improvementOuts: number`
- [x] Update `evalOnFlop`, `buildExplainer` (new steps 3 + 3b), `genSpot`
- [x] Solution panel now shows: Draw Outs / Improvement Outs / Total Outs
- [x] Redesign `PokerCard` as white real-card (rank + suit corners, red/dark by suit)
- [x] Add `highContrast` toggle (default ON) — "Cards: light / dark" button in header

---

## 🔲 Next Tasks (Planned)

### Phase 2: Turn & River Support
- [ ] Show turn card (4th community card) and river card (5th)
- [ ] Update `evalOnFlop` → `evalBoard` to handle 4-card and 5-card boards
- [ ] Update draw detection and outs after turn (Rule of 2, not Rule of 4)
- [ ] Add game stage indicator: "Flop / Turn / River"
- [ ] Animate card reveals for turn and river

### Phase 3: Hand History & Stats
- [ ] Track session stats: accuracy per mode, avg XP per round
- [ ] Show hand history (last 5 spots with correct/incorrect indicators)
- [ ] Persist XP/level across sessions using `localStorage`

### Phase 4: Additional Training Modes
- [ ] "Equity vs Range" mode — estimate hand vs opponent range
- [ ] "Bet Sizing" mode — how much to bet with strong hands/draws
- [ ] Timed mode — answer within N seconds for bonus XP

### Polish
- [ ] Add sound effects (tap feedback, correct/incorrect)
- [ ] Haptic feedback on mobile (Vibration API)
- [ ] Dark/light theme toggle for full app (currently only cards toggle)

### UI Overhaul — Casino Aesthetic (Completed)
- [x] Deep green felt table: radial gradient + SVG fractal noise texture in `globals.css` (`.casino-bg`)
- [x] Glassmorphism panels: `backdrop-blur-md/sm + bg-black/30-40 + border border-white/[0.08]` on all panels
- [x] Gold HUD: Level / XP / Streak badges + result XP badge → amber-400
- [x] Gold mode selector: active mode tab → amber-400 border/bg
- [x] Gold pot/call boxes: amber border + amber text for chip amounts
- [x] Floating cards: `shadow-[0_20px_50px_rgba(0,0,0,0.75),0_4px_12px_rgba(0,0,0,0.5)]` on both card styles
- [x] Trainer feedback: kept emerald (correct/incorrect indicators unchanged — clean readable contrast)

---

## Review

**What we built:**
A fully deployed PWA poker training app at `poker-trainer-lilac.vercel.app`. Single `poker-trainer.tsx` file (~1037 lines) contains all game logic and UI. Three training modes: Hand Recognition → Outs Practice → Decision Lab. Tap-only UI (no typing). XP + streak system. High-contrast real card design with toggle. Phase 1 outs system distinguishes draw outs vs improvement outs with 6-step explanation walkthrough.

**Architecture decision:** All logic lives in one file intentionally — keeps it navigable and avoids over-engineering for a single-page trainer.
