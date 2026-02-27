"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

/**
 * Poker Academy — Tap-to-answer trainer (no typing)
 *
 * Game modes:
 *  1) Hand Recognition (fast drills)
 *  2) Outs Practice (identify draw + outs)
 *  3) Decision Lab (outs + pot odds + fold/call/raise)
 */

// ------------------------ Card helpers ------------------------

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
const SUITS = ["♠", "♥", "♦", "♣"] as const;

type Rank = (typeof RANKS)[number];
type Suit = (typeof SUITS)[number];

type PlayingCard = { rank: Rank; suit: Suit; id: string };

type Mode = "HAND" | "OUTS" | "DECISION";

type Spot = {
  hole: [PlayingCard, PlayingCard];
  flop: [PlayingCard, PlayingCard, PlayingCard];
  pot: number;
  betToCall: number;
  solution: {
    bestHandLabel: string;
    drawLabel: string;
    outs: number;            // draw outs (used for MCQ + decision engine)
    improvementOuts: number; // improvement outs (informational)
    potOddsPct: number;
    decision: "Fold" | "Call" | "Raise";
    decisionWhy: string;
    explainer: Explainer;
  };
};

type Explainer = {
  steps: { title: string; text: string }[];
  summary: string;
  commonMistakes: string[];
};

function makeDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit, id: `${rank}${suit}` });
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rankValue(r: Rank): number {
  return RANKS.indexOf(r); // 0..12
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

// ------------------------ Minimal flop evaluator (trainer-level) ------------------------

type EvalResult = {
  bestHandLabel: string;
  drawLabel: string;
  outs: number;            // draw outs only (flush/straight)
  improvementOuts: number; // outs that upgrade an already-made hand
};

function countByRank(cards: PlayingCard[]) {
  const m = new Map<Rank, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

function countBySuit(cards: PlayingCard[]) {
  const m = new Map<Suit, number>();
  for (const c of cards) m.set(c.suit, (m.get(c.suit) ?? 0) + 1);
  return m;
}

function uniqueSortedRankVals(cards: PlayingCard[]) {
  const set = new Set<number>();
  for (const c of cards) set.add(rankValue(c.rank));
  return Array.from(set).sort((a, b) => a - b);
}

function hasPairTripsQuads(cards: PlayingCard[]) {
  const byRank = countByRank(cards);
  const counts = Array.from(byRank.values()).sort((a, b) => b - a);
  const pairs = counts.filter((c) => c === 2).length;
  const trips = counts.filter((c) => c === 3).length;
  const quads = counts.filter((c) => c === 4).length;
  return { pairs, trips, quads };
}

function isMadeFlush(cards: PlayingCard[]) {
  const bySuit = countBySuit(cards);
  return Array.from(bySuit.values()).some((v) => v >= 5);
}

function isMadeStraight(cards: PlayingCard[]) {
  const vals = uniqueSortedRankVals(cards);
  const valsWithWheel = vals.includes(12) ? [...vals, -1] : vals; // Ace low as -1
  valsWithWheel.sort((a, b) => a - b);

  let run = 1;
  for (let i = 1; i < valsWithWheel.length; i++) {
    if (valsWithWheel[i] === valsWithWheel[i - 1] + 1) {
      run++;
      if (run >= 5) return true;
    } else if (valsWithWheel[i] !== valsWithWheel[i - 1]) {
      run = 1;
    }
  }
  return false;
}

function straightDrawType(hole: PlayingCard[], flop: PlayingCard[]) {
  const cards = [...hole, ...flop];
  const vals = uniqueSortedRankVals(cards);
  const valsWithWheel = vals.includes(12) ? [...vals, -1] : vals;
  valsWithWheel.sort((a, b) => a - b);

  const uniq = Array.from(new Set(valsWithWheel));

  function comb4(a: number[]) {
    const res: number[][] = [];
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++)
        for (let k = j + 1; k < a.length; k++)
          for (let l = k + 1; l < a.length; l++) res.push([a[i], a[j], a[k], a[l]]);
    return res;
  }

  let oesd = false;
  let gutshot = false;

  for (const c of comb4(uniq)) {
    const t = [...c]
      .map((v) => (v === -1 ? 0 : v))
      .sort((x, y) => x - y);

    const span = t[3] - t[0];
    if (span === 3) {
      oesd = true;
    } else if (span === 4) {
      const needed = new Set<number>();
      for (let v = t[0]; v <= t[3]; v++) needed.add(v);
      for (const v of t) needed.delete(v);
      if (needed.size === 1) gutshot = true;
    }
  }

  return { oesd, gutshot };
}

function evalOnFlop(hole: [PlayingCard, PlayingCard], flop: [PlayingCard, PlayingCard, PlayingCard]): EvalResult {
  const cards = [...hole, ...flop];
  const { quads, trips, pairs } = hasPairTripsQuads(cards);
  const madeFlush = isMadeFlush(cards);
  const madeStraight = isMadeStraight(cards);

  let bestHandLabel = "High Card";
  if (madeFlush && madeStraight) bestHandLabel = "Straight Flush";
  else if (quads) bestHandLabel = "Four of a Kind";
  else if (trips && pairs) bestHandLabel = "Full House";
  else if (madeFlush) bestHandLabel = "Flush";
  else if (madeStraight) bestHandLabel = "Straight";
  else if (trips) bestHandLabel = "Three of a Kind";
  else if (pairs >= 2) bestHandLabel = "Two Pair";
  else if (pairs === 1) bestHandLabel = "One Pair";

  const flushCounts = countBySuit(cards);
  const maxSuit = Math.max(...Array.from(flushCounts.values()));
  const isFlushDraw = maxSuit === 4;

  const { oesd, gutshot } = straightDrawType(hole, flop);

  let outs = 0;
  let drawLabel = "None";

  if (!madeFlush && !madeStraight) {
    if (isFlushDraw && oesd) {
      outs = 15;
      drawLabel = "Combo Draw (Flush + Straight)";
    } else if (isFlushDraw) {
      outs = 9;
      drawLabel = "Flush Draw";
    } else if (oesd) {
      outs = 8;
      drawLabel = "Open-Ended Straight Draw";
    } else if (gutshot) {
      outs = 4;
      drawLabel = "Gutshot Straight Draw";
    }
  }

  const improvementOuts = calcImprovementOuts(bestHandLabel);
  return { bestHandLabel, drawLabel, outs, improvementOuts };
}

function potOddsPct(pot: number, callAmt: number) {
  return (callAmt / (pot + callAmt)) * 100;
}

function approxEquityFromOuts(outs: number) {
  return Math.min(100, outs * 4);
}

function recommendDecision(bestHand: string, outs: number, reqPct: number) {
  const strongMade = [
    "Two Pair",
    "Three of a Kind",
    "Straight",
    "Flush",
    "Full House",
    "Four of a Kind",
    "Straight Flush",
  ].includes(bestHand);
  if (strongMade) return "Raise" as const;

  const equity = approxEquityFromOuts(outs);
  if (outs >= 15) return "Raise" as const;
  if (equity + 2 >= reqPct) return "Call" as const;
  return "Fold" as const;
}

// Conservative improvement outs for already-made hands
// These are cards that upgrade the hand to the next tier.
function calcImprovementOuts(bestHandLabel: string): number {
  if (bestHandLabel === "High Card") return 6;       // pair either hole card (3 each)
  if (bestHandLabel === "One Pair") return 5;        // 2 for trips + ~3 for two pair
  if (bestHandLabel === "Two Pair") return 4;        // 2+2 remaining rank cards → full house
  if (bestHandLabel === "Three of a Kind") return 7; // 1 for quads + ~6 full house outs
  if (bestHandLabel === "Full House") return 1;      // one remaining card for quads
  return 0; // Straight, Flush, SF — no meaningful improvement outs to teach
}

function buildExplainer(sol: {
  bestHandLabel: string;
  drawLabel: string;
  outs: number;
  improvementOuts: number;
  pot: number;
  call: number;
  potOdds: number;
  decision: "Fold" | "Call" | "Raise";
  decisionWhy: string;
}): Explainer {
  const eq = approxEquityFromOuts(sol.outs);
  const po = Math.round(sol.potOdds * 10) / 10;
  const totalOuts = sol.outs + sol.improvementOuts;

  const steps = [
    {
      title: "1) What is my best hand right now?",
      text: `Look at your 2 cards + the 3 flop cards. Your best made hand is: ${sol.bestHandLabel}.`,
    },
    {
      title: "2) Do I have a draw?",
      text:
        sol.drawLabel === "None"
          ? "No strong draw. That means you are mostly relying on your made hand."
          : `Yes. Your draw is: ${sol.drawLabel}.`,
    },
    {
      title: "3) Draw outs?",
      text:
        sol.outs > 0
          ? `Draw outs complete a flush or straight draw. Here: ${sol.outs} draw outs. (Flush≈9, OESD≈8, Gutshot≈4, Combo≈15)`
          : "No flush or straight draw — 0 draw outs.",
    },
    {
      title: "3b) Improvement outs?",
      text:
        sol.improvementOuts > 0
          ? `Improvement outs upgrade your already-made hand (e.g. one pair→trips, two pair→full house, set→quads). Your ${sol.bestHandLabel} has ~${sol.improvementOuts} improvement outs. Total outs = ${sol.outs} + ${sol.improvementOuts} = ${totalOuts}.`
          : `Your made hand (${sol.bestHandLabel}) has no significant improvement outs to count. Total outs = ${totalOuts}.`,
    },
    {
      title: "4) Pot odds (price)",
      text: `Pot is $${sol.pot}. Call is $${sol.call}. Pot odds = call ÷ (pot + call) = ${sol.call} ÷ ${sol.pot + sol.call} ≈ ${po}%.`,
    },
    {
      title: "5) Compare",
      text:
        sol.outs > 0
          ? `Rule of 4: draw outs×4 ≈ % by river. ${sol.outs}×4 ≈ ${eq}%. If your % ≥ ${po}%, calling is OK.`
          : "No draw % to compare. If you are not strong, folding is usually best.",
    },
    {
      title: "6) Decision",
      text: `Best play: ${sol.decision} — ${sol.decisionWhy}`,
    },
  ];

  const commonMistakes: string[] = [
    "Pot odds is NOT call ÷ pot. It's call ÷ (pot + call).",
    "Counting outs that don't actually help (fake outs).",
    "Chasing tiny draws with expensive calls.",
  ];

  const summary = `Answer: ${sol.bestHandLabel} • ${sol.drawLabel} • Draw Outs: ${sol.outs}, Improvement: ${sol.improvementOuts}, Total: ${totalOuts} • Pot odds: ${po}% • Decision: ${sol.decision}.`;

  return { steps, summary, commonMistakes };
}

// Plain-language reason for the decision (1 line, 15-year-old friendly)
function buildDecisionWhy(
  decision: "Fold" | "Call" | "Raise",
  bestHandLabel: string,
  outs: number,
  equity: number,
  potOdds: number
): string {
  const strongMade = [
    "Two Pair", "Three of a Kind", "Straight", "Flush",
    "Full House", "Four of a Kind", "Straight Flush",
  ].includes(bestHandLabel);
  const po = Math.round(potOdds);
  if (decision === "Raise") {
    if (strongMade && outs >= 15) return "Strong hand + big draw — raise for value and charge opponents.";
    if (strongMade) return "Strong made hand — raise for value and protect equity.";
    return `Massive draw (${outs} outs ≈ ${equity}% equity) — raise to build the pot.`;
  }
  if (decision === "Call") {
    return `Your equity (~${equity}%) beats the price (~${po}%) — calling is profitable.`;
  }
  return `Your equity (~${equity}%) is below the price (~${po}%) — too expensive to draw.`;
}

// ------------------------ Spot generator ------------------------

function genSpot(mode: Mode): Spot {
  const deck = shuffle(makeDeck());
  const hole: [PlayingCard, PlayingCard] = [deck[0], deck[1]];
  const flop: [PlayingCard, PlayingCard, PlayingCard] = [deck[2], deck[3], deck[4]];

  let pot = [40, 50, 60, 80, 100, 120][Math.floor(Math.random() * 6)];
  let betToCall = [10, 15, 20, 25, 30][Math.floor(Math.random() * 5)];

  if (mode === "HAND" || mode === "OUTS") {
    pot = 0;
    betToCall = 0;
  }

  const ev = evalOnFlop(hole, flop);
  const reqPct = betToCall ? potOddsPct(pot, betToCall) : 0;
  const decision = mode === "DECISION" ? recommendDecision(ev.bestHandLabel, ev.outs, reqPct) : "Call";

  const finalDecision = mode === "DECISION" ? decision : "Call";
  const eq = Math.min(100, ev.outs * 4);
  const decisionWhy = buildDecisionWhy(finalDecision, ev.bestHandLabel, ev.outs, eq, reqPct);

  const explainer = buildExplainer({
    bestHandLabel: ev.bestHandLabel,
    drawLabel: ev.drawLabel,
    outs: ev.outs,
    improvementOuts: ev.improvementOuts,
    pot,
    call: betToCall,
    potOdds: reqPct,
    decision: finalDecision,
    decisionWhy,
  });

  return {
    hole,
    flop,
    pot,
    betToCall,
    solution: {
      bestHandLabel: ev.bestHandLabel,
      drawLabel: ev.drawLabel,
      outs: ev.outs,
      improvementOuts: ev.improvementOuts,
      potOddsPct: Math.round(reqPct * 10) / 10,
      decision: finalDecision,
      decisionWhy,
      explainer,
    },
  };
}

// ------------------------ Self-tests (lightweight) ------------------------

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Test failed: ${msg}`);
}

function runSelfTests() {
  assert(Math.abs(potOddsPct(80, 20) - 20) < 1e-9, "potOddsPct(80,20) should be 20% (20/(80+20))");
  assert(Math.abs(potOddsPct(60, 20) - 25) < 1e-9, "potOddsPct(60,20) should be 25% (20/(60+20))");
  assert(approxEquityFromOuts(9) === 36, "Rule of 4: 9 outs => 36%");
  assert(approxEquityFromOuts(15) === 60, "Rule of 4: 15 outs => 60%");
  const deck = makeDeck();
  assert(deck.length === 52, "Deck should contain 52 cards");
  assert(new Set(deck.map((c) => c.id)).size === 52, "All cards should be unique");
}

try {
  runSelfTests();
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e);
}

// ------------------------ UI components ------------------------

function PokerCard({ c, hc = true }: { c: PlayingCard; hc?: boolean }) {
  const red = c.suit === "♥" || c.suit === "♦";
  if (hc) {
    // High-contrast: white card, real playing-card look
    const col = red ? "text-red-600" : "text-gray-900";
    return (
      <div className="w-16 h-24 rounded-lg border border-slate-200 bg-white shadow-md flex flex-col justify-between p-1.5 select-none">
        <div className={`flex flex-col leading-none ${col}`}>
          <span className="text-sm font-bold">{c.rank}</span>
          <span className="text-sm">{c.suit}</span>
        </div>
        <div className={`flex flex-col leading-none items-end rotate-180 ${col}`}>
          <span className="text-sm font-bold">{c.rank}</span>
          <span className="text-sm">{c.suit}</span>
        </div>
      </div>
    );
  }
  // Classic dark card
  return (
    <div className="w-16 h-24 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800 to-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.45)] flex items-center justify-center select-none">
      <div className="text-xl font-semibold tracking-wide">
        <span className={red ? "text-rose-300" : "text-slate-100"}>{c.rank}</span>
        <span className={red ? "text-rose-300" : "text-slate-100"}>{c.suit}</span>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "w-full text-left rounded-2xl border px-4 py-3 transition " +
        (active ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10")
      }
    >
      <div className="text-sm font-semibold text-slate-100">{label}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </button>
  );
}

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs border " +
        (ok ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-200")
      }
    >
      {children}
    </span>
  );
}

function ChoiceButton({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={
        "rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-slate-100 " +
        "focus-visible:ring-emerald-400/40 focus-visible:ring-offset-0 " +
        (selected ? "!border-emerald-400/50 !bg-emerald-500/15 !text-emerald-200" : "")
      }
    >
      {label}
    </Button>
  );
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function makeMCQNumbers(correct: number, deltas: number[], min = 0, max = 100) {
  const opts = deltas.map((d) => correct + d).filter((n) => n >= min && n <= max);
  return uniq([correct, ...opts]).sort((a, b) => a - b);
}

function makeMCQPotOdds(correctPct: number) {
  // Round to nearest 0.5 for display consistency
  const c = Math.round(correctPct * 2) / 2;
  const deltas = [-10, -5, -2.5, 2.5, 5, 10];
  const opts = deltas.map((d) => Math.round((c + d) * 2) / 2).filter((v) => v >= 0 && v <= 100);
  const all = uniq([c, ...opts]);
  // Keep 6 options max (include correct)
  const trimmed = all.length > 6 ? [c, ...opts.slice(0, 5)] : all;
  // Shuffle for fairness
  return shuffle(trimmed);
}

// ------------------------ Main ------------------------

const HAND_OPTIONS = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

const DRAW_OPTIONS = ["None", "Flush Draw", "Open-Ended Straight Draw", "Gutshot Straight Draw", "Combo Draw (Flush + Straight)"] as const;

const DECISION_OPTIONS = ["Fold", "Call", "Raise"] as const;

export default function PokerAcademyCanvasGame() {
  const [mode, setMode] = useState<Mode>("DECISION");
  const [spot, setSpot] = useState<Spot>(() => genSpot("DECISION"));
  const [showSolution, setShowSolution] = useState(false);

  // selections (no typing)
  const [bestHand, setBestHand] = useState<string>("");
  const [drawType, setDrawType] = useState<string>("");
  const [outs, setOuts] = useState<number | null>(null);
  const [potOdds, setPotOdds] = useState<number | null>(null);
  const [decision, setDecision] = useState<string>("");

  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(1);
  const [highContrast, setHighContrast] = useState(true);

  const level = useMemo(() => Math.floor(xp / 100) + 1, [xp]);
  const levelProgress = useMemo(() => xp % 100, [xp]);

  const sol = spot.solution;

  const showSolutionRef = useRef(showSolution);
  showSolutionRef.current = showSolution;

  function resetInputs() {
    setBestHand("");
    setDrawType("");
    setOuts(null);
    setPotOdds(null);
    setDecision("");
  }

  function newSpot(nextMode: Mode = mode) {
    setSpot(genSpot(nextMode));
    resetInputs();
    setShowSolution(false);
    setLast(null);
    setRound((r) => r + 1);
  }

  function score() {
    const bh = normalize(bestHand);
    const dt = normalize(drawType);

    const bestSol = normalize(sol.bestHandLabel);
    const drawSol = normalize(sol.drawLabel);

    const bestOk =
      !!bh &&
      (bh === bestSol ||
        bh.includes(bestSol) ||
        bestSol.includes(bh) ||
        (bestSol === "one pair" && bh.includes("pair") && !bh.includes("two")));

    const drawOk =
      mode === "HAND"
        ? true
        : drawSol === "none"
          ? dt === "" || dt === "none" || dt.includes("none")
          : !!dt &&
            (dt.includes(drawSol) ||
              drawSol.includes(dt) ||
              (drawSol.includes("flush") && dt.includes("flush")) ||
              (drawSol.includes("open") && dt.includes("open")) ||
              (drawSol.includes("gutshot") && dt.includes("gut")) ||
              (drawSol.includes("combo") && (dt.includes("combo") || (dt.includes("flush") && dt.includes("straight")))));

    const outsOk = mode === "HAND" ? true : outs !== null ? Math.abs(outs - sol.outs) <= 1 : false;

    const potOddsOk =
      mode !== "DECISION" ? true : potOdds !== null ? Math.abs(potOdds - sol.potOddsPct) <= 2 : false;

    const decisionOk = mode !== "DECISION" ? true : normalize(decision) === normalize(sol.decision);

    let gained = 0;
    if (bestOk) gained += 45;
    if (drawOk) gained += 15;
    if (outsOk) gained += 20;
    if (potOddsOk) gained += 10;
    if (decisionOk) gained += 10;

    const passed = gained >= (mode === "HAND" ? 40 : mode === "OUTS" ? 55 : 70);

    if (passed) {
      setStreak((s) => s + 1);
      gained += Math.min(20, (streak + 1) * 2);
    } else {
      setStreak(0);
    }

    setXp((x) => x + gained);
    setShowSolution(true);

    return { gained, passed, bestOk, drawOk, outsOk, potOddsOk, decisionOk };
  }

  const [last, setLast] = useState<null | ReturnType<typeof score>>(null);

  function onCheck() {
    if (showSolution) return;
    const res = score();
    setLast(res);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (!showSolutionRef.current) onCheck();
      else newSpot();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, spot]);

  function switchMode(next: Mode) {
    setMode(next);
    setRound(1);
    setStreak(0);
    setShowSolution(false);
    setLast(null);
    setSpot(genSpot(next));
    resetInputs();
  }

  const visibleSteps = useMemo(() => {
    const steps = sol.explainer.steps;
    if (mode === "HAND") return steps.filter((s) => s.title.startsWith("1)"));
    if (mode === "OUTS") return steps.filter((s) =>
      s.title.startsWith("1)") || s.title.startsWith("2)") || s.title.startsWith("3)")  || s.title.startsWith("3b)")
    );
    return steps;
  }, [mode, sol.explainer.steps]);

  // Multiple-choice sets
  const outsChoices = useMemo(() => {
    if (mode === "HAND") return [] as number[];
    return shuffle(makeMCQNumbers(sol.outs, [-2, -1, 1, 2, 4], 0, 20)).slice(0, 6);
  }, [mode, sol.outs]);

  const potOddsChoices = useMemo(() => {
    if (mode !== "DECISION") return [] as number[];
    return makeMCQPotOdds(sol.potOddsPct);
  }, [mode, sol.potOddsPct]);

  const canCheck = useMemo(() => {
    if (mode === "HAND") return bestHand.length > 0;
    if (mode === "OUTS") return bestHand.length > 0 && drawType.length > 0 && outs !== null;
    return bestHand.length > 0 && drawType.length > 0 && outs !== null && potOdds !== null && decision.length > 0;
  }, [mode, bestHand, drawType, outs, potOdds, decision]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tracking-tight">Poker Academy</div>
            <div className="text-sm text-slate-400">Tap answers • No typing • Clean dark mode</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-emerald-500/10 text-emerald-200 border border-emerald-400/20" variant="outline">
              Level {level}
            </Badge>
            <Badge className="bg-white/5 text-slate-200 border border-white/10" variant="outline">
              XP {xp}
            </Badge>
            <Badge className={"border " + (streak ? "bg-emerald-500/10 text-emerald-200 border-emerald-400/20" : "bg-white/5 text-slate-200 border-white/10")} variant="outline">
              Streak {streak}
            </Badge>
          </div>
        </div>

        <Card className="rounded-2xl border-white/10 bg-white/5">
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="grid md:grid-cols-3 gap-2">
              <ModeButton active={mode === "HAND"} label="1) Hand Recognition" sub="Fast: pick the best hand" onClick={() => switchMode("HAND")} />
              <ModeButton active={mode === "OUTS"} label="2) Outs Practice" sub="Pick draw + outs" onClick={() => switchMode("OUTS")} />
              <ModeButton active={mode === "DECISION"} label="3) Decision Lab" sub="Outs + pot odds → move" onClick={() => switchMode("DECISION")} />
            </div>

            <Separator className="bg-white/10" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-400">Level progress</div>
                <div className="text-sm text-slate-200">{levelProgress}/100</div>
              </div>
              <Progress value={levelProgress} />
            </div>

            <Separator className="bg-white/10" />

            <div className="grid lg:grid-cols-2 gap-4">
              {/* LEFT: Cards */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Round {round}</div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setHighContrast((v) => !v)}
                        className="text-xs text-slate-400 hover:text-slate-200 touch-manipulation"
                        title="Toggle card style"
                      >
                        {highContrast ? "◑ Cards: light" : "◐ Cards: dark"}
                      </button>
                      <div className="text-xs text-slate-400">Enter = Check / Next</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-slate-400 mb-2">Your cards</div>
                    <div className="flex gap-2">
                      <PokerCard c={spot.hole[0]} hc={highContrast} />
                      <PokerCard c={spot.hole[1]} hc={highContrast} />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-slate-400 mb-2">Flop</div>
                    <div className="flex gap-2">
                      <PokerCard c={spot.flop[0]} hc={highContrast} />
                      <PokerCard c={spot.flop[1]} hc={highContrast} />
                      <PokerCard c={spot.flop[2]} hc={highContrast} />
                    </div>
                  </div>

                  {mode === "DECISION" && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-slate-400">Pot</div>
                        <div className="text-xl font-semibold text-slate-100">${spot.pot}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-slate-400">To call</div>
                        <div className="text-xl font-semibold text-slate-100">${spot.betToCall}</div>
                      </div>
                    </div>
                  )}

                  {mode === "DECISION" && (
                    <div className="mt-3 text-xs text-emerald-200/90">Formula: pot odds = call ÷ (pot + call)</div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold">Memory cheats</div>
                  <div className="mt-2 text-sm text-slate-300 space-y-1">
                    <div>
                      Flush draw ≈ <span className="font-semibold text-emerald-200">9</span> outs
                    </div>
                    <div>
                      Open-ended straight ≈ <span className="font-semibold text-emerald-200">8</span> outs
                    </div>
                    <div>
                      Gutshot straight ≈ <span className="font-semibold text-emerald-200">4</span> outs
                    </div>
                    <div>
                      Combo draw ≈ <span className="font-semibold text-emerald-200">15</span> outs
                    </div>
                    <div className="pt-2 text-emerald-200/80">Rule of 4 (on flop): outs × 4 ≈ % to hit by river</div>
                  </div>
                </div>
              </div>

              {/* RIGHT: Tap answers */}
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Tap your answers</div>
                    <div className="text-xs text-slate-400">No typing</div>
                  </div>

                  <div className="mt-4 space-y-4">
                    {/* Best Hand */}
                    <div className="space-y-2">
                      <div className="text-xs text-slate-400">Best hand</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {HAND_OPTIONS.map((h) => (
                          <ChoiceButton
                            key={h}
                            label={h}
                            selected={bestHand === h}
                            disabled={showSolution}
                            onClick={() => setBestHand(h)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Draw type + Outs */}
                    {mode !== "HAND" && (
                      <>
                        <div className="space-y-2">
                          <div className="text-xs text-slate-400">Draw type</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {DRAW_OPTIONS.map((d) => (
                              <ChoiceButton
                                key={d}
                                label={d}
                                selected={drawType === d}
                                disabled={showSolution}
                                onClick={() => setDrawType(d)}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs text-slate-400">Outs</div>
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            {outsChoices.map((n) => (
                              <ChoiceButton
                                key={n}
                                label={String(n)}
                                selected={outs === n}
                                disabled={showSolution}
                                onClick={() => setOuts(n)}
                              />
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Pot odds + Decision */}
                    {mode === "DECISION" && (
                      <>
                        <div className="space-y-2">
                          <div className="text-xs text-slate-400">Pot odds %</div>
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                            {potOddsChoices.map((p) => (
                              <ChoiceButton
                                key={p}
                                label={`${p}%`}
                                selected={potOdds === p}
                                disabled={showSolution}
                                onClick={() => setPotOdds(p)}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs text-slate-400">Decision</div>
                          <div className="grid grid-cols-3 gap-2">
                            {DECISION_OPTIONS.map((d) => (
                              <ChoiceButton
                                key={d}
                                label={d}
                                selected={decision === d}
                                disabled={showSolution}
                                onClick={() => setDecision(d)}
                              />
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={onCheck}
                        disabled={showSolution || !canCheck}
                        className="rounded-2xl bg-emerald-600/80 hover:bg-emerald-600 text-slate-950"
                      >
                        Check
                      </Button>
                      <Button
                        onClick={() => newSpot()}
                        variant="outline"
                        className={
                          "rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-slate-100 " +
                          (showSolution ? "!border-emerald-400/30 !bg-emerald-500/10 !text-emerald-200" : "")
                        }
                      >
                        {showSolution ? "Next" : "Skip"}
                      </Button>
                    </div>

                    {last && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">Result</div>
                          <Badge className={last.passed ? "bg-emerald-500/10 text-emerald-200 border border-emerald-400/20" : "bg-white/5 text-slate-200 border border-white/10"} variant="outline">
                            +{last.gained} XP
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Pill ok={last.bestOk}>Best hand</Pill>
                          {mode !== "HAND" && <Pill ok={last.drawOk}>Draw</Pill>}
                          {mode !== "HAND" && <Pill ok={last.outsOk}>Outs</Pill>}
                          {mode === "DECISION" && <Pill ok={last.potOddsOk}>Pot odds</Pill>}
                          {mode === "DECISION" && <Pill ok={last.decisionOk}>Decision</Pill>}
                        </div>
                        <div className="text-sm text-slate-300">
                          {last.passed ? "Nice. You're thinking correctly." : "Not yet. Use the explanation below and you'll get it."}
                        </div>
                      </div>
                    )}

                    {showSolution && (
                      <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 space-y-3">
                        <div className="text-sm font-semibold text-emerald-200">Correct answer</div>
                        <div className="text-sm text-slate-100">
                          <div>
                            <span className="text-slate-300">Best hand:</span> <span className="text-emerald-200">{sol.bestHandLabel}</span>
                          </div>
                          {mode !== "HAND" && (
                            <div>
                              <span className="text-slate-300">Draw:</span> <span className="text-emerald-200">{sol.drawLabel}</span>
                            </div>
                          )}
                          {mode !== "HAND" && (
                            <>
                              <div>
                                <span className="text-slate-300">Draw Outs:</span> <span className="text-emerald-200">{sol.outs}</span>
                              </div>
                              <div>
                                <span className="text-slate-300">Improvement Outs:</span> <span className="text-emerald-200">~{sol.improvementOuts}</span>
                              </div>
                              <div>
                                <span className="text-slate-300">Total Outs:</span> <span className="text-emerald-200 font-semibold">{sol.outs + sol.improvementOuts}</span>
                              </div>
                            </>
                          )}
                          {mode === "DECISION" && (
                            <div>
                              <span className="text-slate-300">Pot odds:</span> <span className="text-emerald-200">{sol.potOddsPct}%</span>
                            </div>
                          )}
                          {mode === "DECISION" && (
                            <>
                              <div>
                                <span className="text-slate-300">Decision:</span> <span className="text-emerald-200">{sol.decision}</span>
                              </div>
                              <div className="mt-1 text-xs text-slate-400 leading-snug">{sol.decisionWhy}</div>
                            </>
                          )}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-sm font-semibold">What went wrong (simple)</div>
                          <div className="mt-2 text-sm text-slate-300 space-y-1">
                            {!last?.bestOk && (
                              <div>
                                • Your <span className="font-semibold text-emerald-200">best hand</span> choice didn’t match.
                              </div>
                            )}
                            {mode !== "HAND" && !last?.drawOk && (
                              <div>
                                • Your <span className="font-semibold text-emerald-200">draw type</span> choice was off.
                              </div>
                            )}
                            {mode !== "HAND" && !last?.outsOk && (
                              <div>
                                • Your <span className="font-semibold text-emerald-200">outs</span> number was off.
                              </div>
                            )}
                            {mode === "DECISION" && !last?.potOddsOk && (
                              <div>
                                • Your <span className="font-semibold text-emerald-200">pot odds</span> number was off.
                              </div>
                            )}
                            {mode === "DECISION" && !last?.decisionOk && (
                              <div>
                                • Your <span className="font-semibold text-emerald-200">decision</span> didn’t match the math.
                              </div>
                            )}
                            {last?.passed && <div>• Nothing major. Just keep repeating until it feels automatic.</div>}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-sm font-semibold">How the right answer is achieved</div>
                          <div className="mt-2 space-y-3">
                            {visibleSteps.map((s, idx) => (
                              <div key={idx} className="space-y-1">
                                <div className="text-xs font-semibold text-emerald-200">{s.title}</div>
                                <div className="text-sm text-slate-300">{s.text}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => newSpot()}
                          className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold py-4 text-base mt-1 touch-manipulation"
                        >
                          Next →
                        </button>
                      </div>
                    )}

                    <div className="pt-2 text-xs text-slate-400">
                      {mode === "HAND" && "Goal: instantly name your hand."}
                      {mode === "OUTS" && "Goal: see the draw + outs."}
                      {mode === "DECISION" && "Goal: math → correct move."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
