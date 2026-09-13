// §6.5 Scenario trees, wargaming, and counterfactual analysis — a
// deterministic multi-round action–reaction model over the stored graph.
//
// HARD LABELING RULE (§6.5/§8): every output of this module is a SIMULATION.
// It never writes to relationships, never merges with observed data, and the
// UI renders it with a SIMULATION badge. Branch probabilities are transparent
// functions of stored weights/confidences (rules 2–4: no LLM, no render-time
// invention — same graph state + same inputs → same tree, every time).

import type { GraphActor, GraphRelation } from "./types";

// ─── Shared deterministic model ─────────────────────────────────────────────

/** Hostile relation kinds drive escalation dynamics. */
export const HOSTILE = new Set([
  "TENSION",
  "CONFLICT",
  "SANCTIONS",
  "COMPETITION",
  "PROXY_SUPPORT",
]);

/** Cooperative kinds dampen escalation. */
const COOPERATIVE = new Set([
  "ALLIANCE",
  "TREATY",
  "COOPERATION",
  "INTEL_SHARING",
  "SECURITY_CONSULT",
  "NON_AGGRESSION",
]);

/**
 * Disposition of an actor in the simulation — derived deterministically from
 * its stored relations (strategic culture proxy: hostile share of edges).
 */
export type Disposition = "AGGRESSOR" | "ASSURANCER" | "OPPORTUNIST";

export function dispositionOf(slug: string, relations: GraphRelation[]): Disposition {
  const mine = relations.filter((r) => r.sourceSlug === slug || r.targetSlug === slug);
  if (mine.length === 0) return "OPPORTUNIST";
  const hostile = mine.filter((r) => HOSTILE.has(r.kind)).length;
  const coop = mine.filter((r) => COOPERATIVE.has(r.kind)).length;
  const hostileShare = hostile / mine.length;
  const coopShare = coop / mine.length;
  if (hostileShare >= 0.4) return "AGGRESSOR";
  if (coopShare >= 0.4) return "ASSURANCER";
  return "OPPORTUNIST";
}

/** Escalation rung scale 0–7 (mirrors escalation.ts rubric). */
const RUNG_MIN = 0;
const RUNG_MAX = 7;

/**
 * One action–reaction exchange between two actors at current rungs.
 * Deterministic: the move is fixed by disposition + rung + edge pressure;
 * no randomness anywhere. Returns the rungs after the exchange.
 */
function exchange(
  aDisp: Disposition,
  bDisp: Disposition,
  aRung: number,
  bRung: number,
  pressure: number, // 0–1: normalized hostility of the connecting edge set
): { aRung: number; bRung: number } {
  const climb = (disp: Disposition, opponentRung: number, p: number): number => {
    // Base drift toward the opponent's rung (matching behavior), modulated
    // by disposition and pressure. Integer arithmetic keeps it exact.
    let delta = 0;
    if (disp === "AGGRESSOR") delta = p >= 0.5 ? 1 : 0;
    else if (disp === "OPPORTUNIST") delta = opponentRung >= 4 && p >= 0.5 ? 1 : p >= 0.7 ? 1 : 0;
    else delta = opponentRung >= 5 && p >= 0.7 ? 1 : -1; // assurancer de-escalates unless pressed hard
    return delta;
  };
  const da = climb(aDisp, bRung, pressure);
  const db = climb(bDisp, aRung, pressure);
  return {
    aRung: Math.max(RUNG_MIN, Math.min(RUNG_MAX, aRung + da)),
    bRung: Math.max(RUNG_MIN, Math.min(RUNG_MAX, bRung + db)),
  };
}

// ─── §6.5 Branch tree (from current edge state) ─────────────────────────────

export interface BranchNode {
  id: string;
  depth: number;
  /** Escalation rungs [a, b] at this node */
  rungs: [number, number];
  /** Transparent probability product along the path (basis points, /10000) */
  probabilityBp: number;
  parent?: string;
  labelKey: "branch.escalate" | "branch.hold" | "branch.defuse";
  /** Anchor: the stored edge state this branch was derived from. */
  edgeWeight: number;
  edgeConfidence: number;
}

export interface BranchTree {
  kind: "BRANCH_TREE";
  relationId: string;
  aSlug: string;
  bSlug: string;
  startRungs: [number, number];
  nodes: BranchNode[];
  /** Evidence anchors recorded for provenance. */
  anchors: { weight: number; confidence: number; status: string; kinds: string[] };
}

/**
 * Build a 3-branch, 2-deep scenario tree from the current state of one edge.
 * Branch probabilities are deterministic functions of edge weight/confidence:
 *   escalate = weight/100 × (100−conf+30)/100 … clamped, hold = remainder.
 * Same edge → same tree (rule 9).
 */
export function buildBranchTree(relation: GraphRelation): BranchTree {
  const w = Math.max(0, Math.min(100, relation.weight));
  const c = Math.max(0, Math.min(100, relation.confidence));
  const hostile = HOSTILE.has(relation.kind);
  const coop = COOPERATIVE.has(relation.kind);

  // Basis-point probabilities (sum to 10000). Hostile edges favor escalation;
  // cooperative edges favor de-escalation; confidence sharpens the split.
  const rawEsc = hostile ? (w + (100 - c) * 0.3) / 1.3 : coop ? w * 0.15 : w * 0.45;
  const rawDef = coop ? (w + (100 - c) * 0.3) / 1.3 : hostile ? w * 0.2 : w * 0.3;
  const escBp = Math.round(Math.min(7800, Math.max(600, rawEsc * 78)));
  const defBp = Math.round(Math.min(7800, Math.max(600, rawDef * 78)));
  const holdBp = Math.max(400, 10_000 - escBp - defBp);
  const norm = 10_000 / (escBp + holdBp + defBp);
  const P1 = Math.round(escBp * norm);
  const P3 = Math.round(defBp * norm);
  const P2 = 10_000 - P1 - P3;

  const start: [number, number] = hostile
    ? [4, 4]
    : coop
      ? [1, 1]
      : [2, 2];
  const [aSlug, bSlug] = [relation.sourceSlug, relation.targetSlug];

  const nodes: BranchNode[] = [];
  let seq = 0;
  const branchDefs: Array<{
    labelKey: BranchNode["labelKey"];
    bp: number;
    dA: number;
    dB: number;
  }> = [
    { labelKey: "branch.escalate", bp: P1, dA: 2, dB: 2 },
    { labelKey: "branch.hold", bp: P2, dA: 0, dB: 0 },
    { labelKey: "branch.defuse", bp: P3, dA: -2, dB: -2 },
  ];

  for (const b of branchDefs) {
    const r1a = Math.max(RUNG_MIN, Math.min(RUNG_MAX, start[0] + b.dA));
    const r1b = Math.max(RUNG_MIN, Math.min(RUNG_MAX, start[1] + b.dB));
    const id1 = `n${seq++}`;
    nodes.push({
      id: id1,
      depth: 1,
      rungs: [r1a, r1b],
      probabilityBp: b.bp,
      labelKey: b.labelKey,
      edgeWeight: w,
      edgeConfidence: c,
    });
    // Depth 2: continuation proportional to the same branch tendency.
    const sub: Array<{ labelKey: BranchNode["labelKey"]; frac: number }> = [
      { labelKey: "branch.escalate", frac: 0.3 },
      { labelKey: "branch.hold", frac: 0.4 },
      { labelKey: "branch.defuse", frac: 0.3 },
    ];
    for (const s of sub) {
      const shift =
        b.labelKey === "branch.escalate"
          ? 1
          : b.labelKey === "branch.defuse"
            ? -1
            : 0;
      const adj = s.labelKey === b.labelKey ? shift * 2 : shift;
      const r2a = Math.max(RUNG_MIN, Math.min(RUNG_MAX, r1a + adj));
      const r2b = Math.max(RUNG_MIN, Math.min(RUNG_MAX, r1b + adj));
      nodes.push({
        id: `n${seq++}`,
        depth: 2,
        rungs: [r2a, r2b],
        probabilityBp: Math.round((b.bp * s.frac) | 0),
        parent: id1,
        labelKey: s.labelKey,
        edgeWeight: w,
        edgeConfidence: c,
      });
    }
  }

  return {
    kind: "BRANCH_TREE",
    relationId: relation._id,
    aSlug,
    bSlug,
    startRungs: start,
    nodes,
    anchors: {
      weight: w,
      confidence: c,
      status: relation.status,
      kinds: [relation.kind],
    },
  };
}

// ─── §6.5 Wargame (multi-round action–reaction) ─────────────────────────────

export interface WargameRound {
  round: number;
  aRung: number;
  bRung: number;
  aDisp: Disposition;
  bDisp: Disposition;
  /** What changed this round (deterministic narrative keys). */
  aMove: "climb" | "hold" | "descend";
  bMove: "climb" | "hold" | "descend";
}

export interface WargameResult {
  kind: "WARGAME";
  aSlug: string;
  bSlug: string;
  rounds: WargameRound[];
  outcome:
    | "STALEMATE"
    | "A_DOMINANT"
    | "B_DOMINANT"
    | "MUTUAL_ESCALATION"
    | "MUTUAL_DEFUSE";
  pressureBp: number; // normalized hostility of the edge set, basis points
}

/**
 * Run an N-round deterministic wargame. Pressure derives from the stored
 * edges between (or absent edges around) the two actors.
 */
export function runWargame(
  a: GraphActor,
  b: GraphActor,
  relations: GraphRelation[],
  rounds = 6,
): WargameResult {
  const between = relations.filter(
    (r) =>
      (r.sourceSlug === a.slug && r.targetSlug === b.slug) ||
      (r.sourceSlug === b.slug && r.targetSlug === a.slug),
  );
  const hostileN = between.filter((r) => HOSTILE.has(r.kind)).length;
  const coopN = between.filter((r) => COOPERATIVE.has(r.kind)).length;
  const pressure = between.length
    ? Math.max(0, Math.min(1, (hostileN * 1.0 - coopN * 0.6) / between.length + 0.35))
    : 0.35;

  const aDisp = dispositionOf(a.slug, relations);
  const bDisp = dispositionOf(b.slug, relations);
  let aRung = between.some((r) => HOSTILE.has(r.kind)) ? 4 : 2;
  let bRung = aRung;

  const steps: WargameRound[] = [];
  const moveOf = (prev: number, next: number): "climb" | "hold" | "descend" =>
    next > prev ? "climb" : next < prev ? "descend" : "hold";

  for (let i = 1; i <= rounds; i++) {
    const next = exchange(aDisp, bDisp, aRung, bRung, pressure);
    steps.push({
      round: i,
      aRung: next.aRung,
      bRung: next.bRung,
      aDisp,
      bDisp,
      aMove: moveOf(aRung, next.aRung),
      bMove: moveOf(bRung, next.bRung),
    });
    aRung = next.aRung;
    bRung = next.bRung;
  }

  const diff = aRung - bRung;
  const outcome: WargameResult["outcome"] =
    aRung >= 6 && bRung >= 6
      ? "MUTUAL_ESCALATION"
      : aRung <= 1 && bRung <= 1
        ? "MUTUAL_DEFUSE"
        : diff >= 2
          ? "A_DOMINANT"
          : diff <= -2
            ? "B_DOMINANT"
            : "STALEMATE";

  return {
    kind: "WARGAME",
    aSlug: a.slug,
    bSlug: b.slug,
    rounds: steps,
    outcome,
    pressureBp: Math.round(pressure * 10_000),
  };
}

// ─── §6.5 Counterfactual (remove/weaken an edge, re-path influence) ─────────

export interface CounterfactualResult {
  kind: "COUNTERFACTUAL";
  removedRelationId: string;
  /** Alternate influence paths A→C that survive without the removed edge. */
  alternatePaths: Array<{ path: string[]; strength: number }>;
  /** Simple reachability delta for the pair. */
  lostConnectivity: boolean;
}

/**
 * Remove one edge and find alternate influence routes between its endpoints
 * through the remaining graph (BFS with strength = product of normalized
 * confidences). Deterministic and evidence-anchored: only real stored edges
 * form paths (rule 1).
 */
export function runCounterfactual(
  relation: GraphRelation,
  actors: GraphActor[],
  relations: GraphRelation[],
): CounterfactualResult {
  const remaining = relations.filter((r) => r._id !== relation._id);
  const adj = new Map<string, Array<{ to: string; conf: number }>>();
  for (const a of actors) adj.set(a.slug, []);
  for (const r of remaining) {
    adj.get(r.sourceSlug)?.push({ to: r.targetSlug, conf: r.confidence });
    adj.get(r.targetSlug)?.push({ to: r.sourceSlug, conf: r.confidence });
  }

  const paths: Array<{ path: string[]; strength: number }> = [];
  // BFS up to depth 4, collecting up to 3 shortest alternate paths.
  const queue: Array<{ node: string; path: string[]; strength: number }> = [
    { node: relation.sourceSlug, path: [relation.sourceSlug], strength: 1 },
  ];
  const visited = new Set<string>([relation.sourceSlug]);
  while (queue.length > 0 && paths.length < 3) {
    const cur = queue.shift()!;
    if (cur.node === relation.targetSlug && cur.path.length > 1) {
      paths.push({ path: cur.path, strength: Math.round(cur.strength * 10_000) / 10_000 });
      continue;
    }
    if (cur.path.length > 4) continue;
    for (const { to, conf } of adj.get(cur.node) ?? []) {
      if (cur.path.includes(to)) continue;
      if (!visited.has(to) || to === relation.targetSlug) {
        if (to !== relation.targetSlug) visited.add(to);
        queue.push({
          node: to,
          path: [...cur.path, to],
          strength: cur.strength * (conf / 100),
        });
      }
    }
  }

  return {
    kind: "COUNTERFACTUAL",
    removedRelationId: relation._id,
    alternatePaths: paths,
    lostConnectivity: paths.length === 0,
  };
}

// ─── Serialization for storage (scenarios.payload) ──────────────────────────

export type SimulationPayload = BranchTree | WargameResult | CounterfactualResult;

export function serializeSimulation(sim: SimulationPayload): string {
  return JSON.stringify(sim);
}

export function parseSimulation(json: string): SimulationPayload | null {
  try {
    return JSON.parse(json) as SimulationPayload;
  } catch {
    return null;
  }
}

export { HOSTILE as HOSTILE_KINDS };
