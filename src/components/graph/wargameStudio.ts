// Wargame Studio engine — evidence-grounded, deterministic, interactive.
// Extends wargame.ts (pair duels) with:
//   §A calibration : starting rungs + basis grade derive from REAL stored
//                    evidence (marker series), never invented.
//   §C mechanics   : doctrine-parameterized behavior, capability attrition,
//                    reaction lags, seeded Monte-Carlo envelopes, bloc duels.
//   §D/§E          : human-in-the-loop moves with deterministic opponent AI.
// No LLM anywhere in this file (rule 2/4): the AI layer lives in Convex
// actions and only narrates/critiques — it never computes rungs.

import type { GraphActor, GraphRelation } from "./types";
import { dispositionOf } from "./wargame";
import { HOSTILE_KINDS } from "./wargameShared";

export const DAY = 86_400_000;

// Re-export hostile set for callers.
export { dispositionOf };
export const HOSTILE = HOSTILE_KINDS;
export const COOPERATIVE = new Set([
  "ALLIANCE", "TREATY", "COOPERATION", "INTEL_SHARING", "SECURITY_CONSULT",
  "NON_AGGRESSION", "INTERDEPENDENCE", "DEBT_AID", "MEDIATION",
]);

// ─── §A Evidence calibration ────────────────────────────────────────────────

export interface EvidenceBasis {
  grade: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  eventCount90d: number;
  lastEventTs: number | null;
  meanConfidence: number;
}

/**
 * Grade the evidence basis for a pair from real marker series + edges.
 * Deterministic thresholds, auditable.
 */
export function assessBasis(
  events: Array<{ ts: number; type: string }>,
  edges: GraphRelation[],
  now: number,
): EvidenceBasis {
  const in90 = events.filter((e) => e.ts >= now - 90 * DAY);
  const lastEventTs = events.length ? Math.max(...events.map((e) => e.ts)) : null;
  const meanConfidence = edges.length
    ? Math.round(edges.reduce((s, r) => s + r.confidence, 0) / edges.length)
    : 0;
  const reasons: string[] = [];
  let score = 0;
  if (in90.length >= 5) { score += 2; } else if (in90.length >= 2) { score += 1; }
  else reasons.push("few_recent_events");
  if (lastEventTs && now - lastEventTs <= 30 * DAY) { score += 1; }
  else reasons.push("stale_coverage");
  if (meanConfidence >= 55) { score += 1; } else reasons.push("low_edge_confidence");
  if (edges.length >= 2) { score += 1; } else reasons.push("single_edge_pair");
  const grade = score >= 4 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW";
  return { grade, reasons, eventCount90d: in90.length, lastEventTs, meanConfidence };
}

/** Recency-weighted hostile signal: recent events weigh more (linear decay). */
function recencyRung(
  events: Array<{ ts: number; type: string }>,
  now: number,
  rungOf: (type: string) => number,
): number {
  let acc = 0;
  let wSum = 0;
  for (const e of events) {
    if (e.ts < now - 90 * DAY) continue;
    const w = 1 - (now - e.ts) / (90 * DAY); // 1 → 0
    acc += rungOf(e.type) * w;
    wSum += w;
  }
  return wSum > 0 ? acc / wSum : 0;
}

const IMPORTED_RUNG: Record<string, number> = {
  STATEMENT: 1, REPORT: 1, POSTURE: 2, MEETING: 1, DIPLOMATIC_SUMMIT: 1,
  AGREEMENT: 0, TREATY_SIGNED: 0, AMBASSADOR_RECALL: 3, RELATIONS_SEVERED: 4,
  RECOGNITION: 1, WITHDRAWAL: 3, SANCTION: 3, SEIZURE: 4, BLOCKADE: 5,
  MILITARY_EXERCISE: 5, MISSILE_TEST: 5, TRANSFER: 4, CYBER_ATTACK: 5, STRIKE: 6,
  ELECTION: 1, REFERENDUM: 1, DOMESTIC_UPHEAVAL: 2,
};

/**
 * Calibrated starting rungs from real events (mirrors escalation.ts rubric).
 * Falls back to the edge-kind default when no events exist.
 */
export function calibratedStartRungs(
  events: Array<{ ts: number; type: string }>,
  edges: GraphRelation[],
  now: number,
): { a: number; b: number } {
  const hostile = edges.some((r) => HOSTILE.has(r.kind));
  const coop = edges.some((r) => COOPERATIVE.has(r.kind));
  const fallback = hostile ? 4 : coop ? 1 : 2;
  const r = recencyRung(events, now, (t) => IMPORTED_RUNG[t] ?? 1);
  if (r <= 0.01) return { a: fallback, b: fallback };
  const a = Math.max(0, Math.min(7, Math.round(r)));
  const b = a;
  return { a, b };
}

// ─── §C Doctrine + capabilities (deterministic from stored profile) ─────────

export interface DoctrineParams {
  /** 0 = dovish … 1 = hawkish. From strategic culture keywords + hostile share. */
  aggression: number;
  /** Capability ceiling: how high on the ladder the actor can operate. */
  ceiling: number;
  /** Reaction lag in days (documented pattern → simulated round pace). */
  lagDays: number;
}

const CULTURE_AGGRESSION: Record<string, number> = {
  threatener: 0.85,
  aggressive: 0.85,
  revisionist: 0.7,
  opportunistic: 0.55,
  opportunist: 0.55,
  assurancer: 0.3,
  guarantor: 0.25,
  defensive: 0.3,
  status: 0.4,
};

export function doctrineOf(
  actor: GraphActor,
  relations: GraphRelation[],
): DoctrineParams {
  const culture = (actor as unknown as {
    decisionCycle?: { strategicCulture?: string };
    capabilities?: { military?: number; economic?: number; energy?: number };
  });
  const text = (culture.decisionCycle?.strategicCulture ?? "").toLowerCase();
  let aggression = -1;
  for (const [k, v] of Object.entries(CULTURE_AGGRESSION)) {
    if (text.includes(k)) { aggression = Math.max(aggression, v); }
  }
  if (aggression < 0) {
    // Deterministic fallback from edge mix (same idea as dispositionOf but graded).
    const mine = relations.filter((r) => r.sourceSlug === actor.slug || r.targetSlug === actor.slug);
    const hostileShare = mine.length ? mine.filter((r) => HOSTILE.has(r.kind)).length / mine.length : 0.4;
    aggression = Math.min(0.9, 0.25 + hostileShare * 0.7);
  }
  const cap = culture.capabilities;
  const ceiling = cap
    ? Math.max(2, Math.min(7, Math.round(((cap.military ?? 50) * 0.5 + (cap.economic ?? 50) * 0.3 + (cap.energy ?? 50) * 0.2) / 15)))
    : 6;
  const lagDays = aggression > 0.7 ? 2 : aggression > 0.45 ? 4 : 7;
  return { aggression, ceiling, lagDays };
}

// ─── Seeded RNG (LCG) — reproducible Monte-Carlo ────────────────────────────

export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ─── Core duel stepper (shared by auto-run, MC, and interactive play) ───────

export interface SideState {
  slug: string;
  name: string;
  rung: number;
  doctrine: DoctrineParams;
  disposition: ReturnType<typeof dispositionOf>;
  endurance: number; // rounds of high-intensity it can sustain
}

export interface DuelParams {
  pressure: number; // 0–1 normalized hostility between the sides
  maxRounds: number;
  /** Optional human control of side A or B. */
  humanSide?: "A" | "B" | null;
  seed?: number;
}

export interface DuelRound {
  round: number;
  aRung: number;
  bRung: number;
  aMove: "climb" | "hold" | "descend" | "command";
  bMove: "climb" | "hold" | "descend" | "command";
  aCommand?: string;
  bCommand?: string;
  simTimeDays: number; // cumulative simulated days (reaction lags)
}

export const HUMAN_MOVES = [
  { key: "HOLD", dRung: 0, labelKey: "wg.move.hold" },
  { key: "DEESCALATE", dRung: -2, labelKey: "wg.move.deescalate" },
  { key: "OFFER_TALKS", dRung: -1, labelKey: "wg.move.talks" },
  { key: "POSTURE", dRung: 1, labelKey: "wg.move.posture" },
  { key: "COERCION", dRung: 2, labelKey: "wg.move.coercion" },
  { key: "STRIKE", dRung: 3, labelKey: "wg.move.strike" },
] as const;
export type HumanMoveKey = (typeof HUMAN_MOVES)[number]["key"];

function clampRung(r: number, ceiling: number): number {
  return Math.max(0, Math.min(7, Math.min(ceiling, Math.round(r))));
}

/** One deterministic engine step for the non-commanded side. */
function engineMove(
  self: SideState,
  opp: SideState,
  pressure: number,
  rand: () => number,
): number {
  const d = self.doctrine;
  const delta =
    self.disposition === "AGGRESSOR"
      ? pressure >= 0.4 ? 1 + (rand() < d.aggression - 0.6 ? 1 : 0) : 0
      : self.disposition === "OPPORTUNIST"
        ? opp.rung >= 4 && pressure >= 0.5
          ? 1
          : pressure >= 0.7
            ? 1
            : rand() < 0.25
              ? -1
              : 0
        : opp.rung >= 5 && pressure >= 0.7
          ? 1
          : -1;
  // Endurance: exhausted sides stop climbing.
  const fatigue = self.endurance <= 0 ? Math.min(0, delta) : delta;
  return clampRung(self.rung + fatigue, d.ceiling);
}

export function initSide(actor: GraphActor, relations: GraphRelation[], rung: number): SideState {
  const cap = (actor as unknown as { capabilities?: { military?: number } }).capabilities;
  return {
    slug: actor.slug,
    name: actor.name,
    rung,
    doctrine: doctrineOf(actor, relations),
    disposition: dispositionOf(actor.slug, relations),
    endurance: cap?.military !== undefined ? Math.max(2, Math.round(cap.military / 18)) : 5,
  };
}

/**
 * Interactive step: the human command for one side (or null = full auto).
 * Deterministic given (state, commands, seed).
 */
export function stepDuel(
  a: SideState,
  b: SideState,
  params: DuelParams,
  aCommand?: HumanMoveKey,
  bCommand?: HumanMoveKey,
): { a: SideState; b: SideState; round: DuelRound } {
  const rand = lcg((params.seed ?? 1) * 7919 + a.rung * 31 + b.rung * 17);
  const roundNo = 1; // caller tracks numbering
  let aNext: number;
  let bNext: number;
  let aMove: DuelRound["aMove"] = "hold";
  let bMove: DuelRound["bMove"] = "hold";

  if (aCommand) {
    const mv = HUMAN_MOVES.find((m) => m.key === aCommand)!;
    aNext = clampRung(a.rung + mv.dRung, a.doctrine.ceiling);
    aMove = "command";
  } else {
    aNext = engineMove(a, b, params.pressure, rand);
    aMove = aNext > a.rung ? "climb" : aNext < a.rung ? "descend" : "hold";
  }
  if (bCommand) {
    const mv = HUMAN_MOVES.find((m) => m.key === bCommand)!;
    bNext = clampRung(b.rung + mv.dRung, b.doctrine.ceiling);
    bMove = "command";
  } else {
    bNext = engineMove(b, a, params.pressure, rand);
    bMove = bNext > b.rung ? "climb" : bNext < b.rung ? "descend" : "hold";
  }

  // De-escalation contagion: if one side steps down ≥2, the other drifts down.
  if (a.rung - aNext >= 2 && bNext > b.rung - 1 && b.disposition !== "AGGRESSOR") {
    bNext = clampRung(bNext - 1, b.doctrine.ceiling);
  }
  if (b.rung - bNext >= 2 && aNext > a.rung - 1 && a.disposition !== "AGGRESSOR") {
    aNext = clampRung(aNext - 1, a.doctrine.ceiling);
  }

  const lag = Math.round((a.doctrine.lagDays + b.doctrine.lagDays) / 2);
  const simTimeDays = lag;
  return {
    a: { ...a, rung: aNext, endurance: aNext >= 5 ? a.endurance - 1 : Math.min(5, a.endurance + 1) },
    b: { ...b, rung: bNext, endurance: bNext >= 5 ? b.endurance - 1 : Math.min(5, b.endurance + 1) },
    round: {
      round: roundNo,
      aRung: aNext,
      bRung: bNext,
      aMove,
      bMove,
      aCommand,
      bCommand,
      simTimeDays: lag,
    },
  };
}

export function duelOutcome(aRung: number, bRung: number): WargameOutcome {
  const diff = aRung - bRung;
  return aRung >= 6 && bRung >= 6
    ? "MUTUAL_ESCALATION"
    : aRung <= 1 && bRung <= 1
      ? "MUTUAL_DEFUSE"
      : diff >= 2
        ? "A_DOMINANT"
        : diff <= -2
          ? "B_DOMINANT"
          : "STALEMATE";
}

export type WargameOutcome =
  | "STALEMATE"
  | "A_DOMINANT"
  | "B_DOMINANT"
  | "MUTUAL_ESCALATION"
  | "MUTUAL_DEFUSE";

/** Full auto wargame (non-interactive), doctrine-parameterized. */
export function runAutoWargame(
  a: SideState,
  b: SideState,
  params: DuelParams,
): { rounds: DuelRound[]; outcome: WargameOutcome } {
  const rand = lcg(params.seed ?? 42);
  const rounds: DuelRound[] = [];
  let cur: { a: SideState; b: SideState } = { a, b };
  let simDays = 0;
  for (let i = 1; i <= params.maxRounds; i++) {
    const step = stepDuel(cur.a, cur.b, { ...params, seed: (params.seed ?? 42) + i });
    simDays += step.round.simTimeDays;
    rounds.push({ ...step.round, round: i, simTimeDays: simDays });
    cur = { a: step.a, b: step.b };
  }
  return { rounds, outcome: duelOutcome(cur.a.rung, cur.b.rung) };
}

// ─── §C Monte-Carlo envelopes (confidence-bounded jitter) ───────────────────

export interface McFan {
  round: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface McResult {
  fan: McFan[];
  fanB: McFan[];
  outcomes: Record<WargameOutcome, number>;
  runs: number;
  seed: number;
}

/**
 * Monte-Carlo re-runs with jitter bounded by edge confidence: low-confidence
 * bases fan wider, high-confidence ones stay near the deterministic spine.
 * Fully reproducible via the seed.
 */
export function monteCarlo(
  a: SideState,
  b: SideState,
  params: DuelParams,
  confidence: number,
  runs = 40,
  seed = 20260913,
): McResult {
  const spread = Math.max(0.15, 1 - confidence / 100); // 0.15 … 1.0
  const fan: McFan[] = [];
  const fanB: McFan[] = [];
  const outcomes: Record<WargameOutcome, number> = {
    STALEMATE: 0, A_DOMINANT: 0, B_DOMINANT: 0,
    MUTUAL_ESCALATION: 0, MUTUAL_DEFUSE: 0,
  };
  const aPaths: number[][] = [];
  const bPaths: number[][] = [];
  for (let r = 0; r < runs; r++) {
    const rand = lcg(seed + r * 104729);
    // Jitter the pressure and the starting rungs within the confidence bound.
    const jA = clampRung(a.rung + Math.round((rand() - 0.5) * 2 * spread * 2), a.doctrine.ceiling);
    const jB = clampRung(b.rung + Math.round((rand() - 0.5) * 2 * spread * 2), b.doctrine.ceiling);
    const jPressure = Math.max(0, Math.min(1, params.pressure + (rand() - 0.5) * spread));
    let sa: SideState = { ...a, rung: jA };
    let sb: SideState = { ...b, rung: jB };
    const pa: number[] = [jA];
    const pb: number[] = [jB];
    for (let i = 0; i < params.maxRounds; i++) {
      const step = stepDuel(sa, sb, { ...params, pressure: jPressure, seed: seed + r * 131 + i });
      sa = step.a;
      sb = step.b;
      pa.push(sa.rung);
      pb.push(sb.rung);
    }
    outcomes[duelOutcome(sa.rung, sb.rung)]++;
    aPaths.push(pa);
    bPaths.push(pb);
  }
  const n = params.maxRounds + 1;
  for (let i = 0; i < n; i++) {
    const colA = aPaths.map((p) => p[Math.min(i, p.length - 1)]).sort((x, y) => x - y);
    const colB = bPaths.map((p) => p[Math.min(i, p.length - 1)]).sort((x, y) => x - y);
    const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
    fan.push({ round: i, p10: q(colA, 0.1), p50: q(colA, 0.5), p90: q(colA, 0.9) });
    fanB.push({ round: i, p10: q(colB, 0.1), p50: q(colB, 0.5), p90: q(colB, 0.9) });
  }
  return { fan, fanB, outcomes, runs, seed };
}

// ─── §C Bloc duels (coalitions from the polarity blocks) ────────────────────

export interface BlocSide {
  name: string;
  members: GraphActor[];
  slug: string; // anchor member
  rung: number;
  doctrine: DoctrineParams;
  disposition: ReturnType<typeof dispositionOf>;
  endurance: number;
}

/**
 * Build a bloc around an anchor: the anchor plus its 1-hop cooperative
 * partners (alliance/treaty/intel-sharing), capped — deterministic.
 */
export function buildBloc(
  anchor: GraphActor,
  relations: GraphRelation[],
  actorsBySlug: Map<string, GraphActor>,
  rung: number,
): BlocSide {
  const partners = new Set<string>([anchor.slug]);
  for (const r of relations) {
    if (!COOPERATIVE.has(r.kind) || r.weight < 45) continue;
    if (r.sourceSlug === anchor.slug) partners.add(r.targetSlug);
    else if (r.targetSlug === anchor.slug) partners.add(r.sourceSlug);
  }
  const members = [...partners]
    .map((s) => actorsBySlug.get(s))
    .filter((a): a is GraphActor => !!a)
    .slice(0, 6);
  const doctrine = doctrineOf(anchor, relations);
  const agg = Math.min(
    0.95,
    members.reduce((s, m) => s + doctrineOf(m, relations).aggression, 0) / members.length,
  );
  const ceiling = Math.max(...members.map((m) => doctrineOf(m, relations).ceiling));
  const cap = (anchor as unknown as { capabilities?: { military?: number } }).capabilities;
  return {
    name: members.map((m) => m.name).join(" + "),
    members,
    slug: anchor.slug,
    rung,
    doctrine: { ...doctrine, aggression: agg, ceiling },
    disposition: dispositionOf(anchor.slug, relations),
    endurance: cap?.military !== undefined ? Math.max(3, Math.round(cap.military / 14)) : 6,
  };
}

export function runBlocWargame(
  sideA: BlocSide,
  sideB: BlocSide,
  params: DuelParams,
): { rounds: DuelRound[]; outcome: WargameOutcome } {
  const rand = lcg(params.seed ?? 7);
  const rounds: DuelRound[] = [];
  let aRung = sideA.rung;
  let bRung = sideB.rung;
  let simDays = 0;
  for (let i = 1; i <= params.maxRounds; i++) {
    const mvA =
      sideA.disposition === "AGGRESSOR"
        ? params.pressure >= 0.4 ? 1 + (rand() < sideA.doctrine.aggression - 0.6 ? 1 : 0) : 0
        : bRung >= 4 && params.pressure >= 0.5 ? 1 : params.pressure >= 0.7 ? 1 : -1;
    const mvB =
      sideB.disposition === "AGGRESSOR"
        ? params.pressure >= 0.4 ? 1 + (rand() < sideB.doctrine.aggression - 0.6 ? 1 : 0) : 0
        : aRung >= 4 && params.pressure >= 0.5 ? 1 : params.pressure >= 0.7 ? 1 : -1;
    aRung = clampRung(aRung + mvA, sideA.doctrine.ceiling);
    bRung = clampRung(bRung + mvB, sideB.doctrine.ceiling);
    simDays += Math.round((sideA.doctrine.lagDays + sideB.doctrine.lagDays) / 2);
    rounds.push({
      round: i,
      aRung,
      bRung,
      aMove: mvA > 0 ? "climb" : mvA < 0 ? "descend" : "hold",
      bMove: mvB > 0 ? "climb" : mvB < 0 ? "descend" : "hold",
      simTimeDays: simDays,
    });
  }
  return { rounds, outcome: duelOutcome(aRung, bRung) };
}

// ─── Parameters (customization §D) ──────────────────────────────────────────

export interface WargameConfig {
  aSlug: string;
  bSlug: string;
  mode: "PAIR" | "BLOC";
  startA: number;
  startB: number;
  pressure: number; // 0–1
  rounds: number;
  humanSide: "A" | "B" | null;
  seed: number;
  confidence: number;
  basis: EvidenceBasis["grade"];
}

export const DEFAULT_CONFIG: Omit<WargameConfig, "aSlug" | "bSlug" | "startA" | "startB" | "confidence" | "basis"> = {
  mode: "PAIR",
  pressure: 0.6,
  rounds: 8,
  humanSide: null,
  seed: 42,
};
