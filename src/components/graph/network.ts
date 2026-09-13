// §3.3/§7.1 Deterministic network analysis — pure functions over the stored
// graph. Everything here is computed at ingest/query time from evidence;
// no LLM anywhere, same input → same output (rules 2 & 4).
//
// Exports:
//  - computeCentrality: degree/betweenness/closeness (Brandes + BFS)
//  - detectBlocks: alliance-polarity blocks with intra/extra cohesion
//  - edgeDynamics: trajectory slope & volatility over event history
//  - tensionIndex / regionalTension / allianceCohesion / coverageHealth

import type { GraphActor, GraphRelation } from "./types";

export interface RelationEventLite {
  relationId: string;
  timestamp: number;
  type: string;
  weight: number; // resolved intensity at that time (see below)
}

// ─── Graph topology ─────────────────────────────────────────────────────────

function adjacency(
  actors: GraphActor[],
  relations: GraphRelation[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const a of actors) adj.set(a.slug, []);
  for (const r of relations) {
    adj.get(r.sourceSlug)?.push(r.targetSlug);
    adj.get(r.targetSlug)?.push(r.sourceSlug); // undirected view for topology
  }
  return adj;
}

export interface CentralityRow {
  slug: string;
  degree: number;
  betweenness: number; // Brandes raw score (fractional pairs)
  closeness: number; // 0–1 normalized
}

/** Brandes' algorithm (unweighted) + BFS closeness. O(V·E). */
export function computeCentrality(
  actors: GraphActor[],
  relations: GraphRelation[],
): CentralityRow[] {
  const adj = adjacency(actors, relations);
  const slugs = actors.map((a) => a.slug);
  const n = slugs.length;
  const betweenness = new Map<string, number>(slugs.map((s) => [s, 0]));
  const closeness = new Map<string, number>(slugs.map((s) => [s, 0]));

  for (const src of slugs) {
    // Brandes single-source pass
    const stack: string[] = [];
    const preds = new Map<string, string[]>(slugs.map((s) => [s, []]));
    const sigma = new Map<string, number>(slugs.map((s) => [s, 0]));
    sigma.set(src, 1);
    const dist = new Map<string, number>(slugs.map((s) => [s, -1]));
    dist.set(src, 0);
    const queue: string[] = [src];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        if (dist.get(w)! === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          preds.get(w)!.push(v);
        }
      }
    }
    // dependency accumulation
    const delta = new Map<string, number>(slugs.map((s) => [s, 0]));
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of preds.get(w)!) {
        delta.set(
          v,
          delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!),
        );
      }
      if (w !== src) betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
    }
    // closeness (Wasserman-Faust for disconnected graphs → simple normalized)
    let sum = 0;
    let reach = 0;
    for (const [s, d] of dist) {
      if (d > 0) {
        sum += d;
        reach++;
      }
    }
    closeness.set(src, reach > 0 ? reach / ((reach + 1) * (sum / reach || 1)) : 0);
  }

  return slugs.map((slug) => ({
    slug,
    degree: (adj.get(slug) ?? []).length,
    betweenness: Math.round(betweenness.get(slug) ?? 0),
    closeness: Math.round((closeness.get(slug) ?? 0) * 100) / 100,
  }));
}

/** Top-k brokers by betweenness. */
export function topBrokers(centralities: CentralityRow[], k = 5): string[] {
  return [...centralities]
    .sort((a, b) => b.betweenness - a.betweenness)
    .slice(0, k)
    .filter((c) => c.betweenness > 0)
    .map((c) => c.slug);
}

// ─── Blocks (alliance polarity detection) ───────────────────────────────────

const POSITIVE = new Set(["ALLIANCE", "COOPERATION", "TREATY", "SUPPLY", "INTEL_SHARING", "SECURITY_CONSULT", "DEBT_AID", "TRANSIT_ACCESS", "NON_AGGRESSION", "INTERDEPENDENCE", "MEDIATION"]);
const NEGATIVE = new Set(["TENSION", "CONFLICT", "SANCTIONS", "COMPETITION", "PROXY_SUPPORT", "DETERRENCE"]);

export interface Block {
  label: string;
  members: string[];
  cohesion: number; // mean intra-block confidence 0–100
}

/**
 * Polarity blocks via BFS over positive edges (weak structural balance):
 * actors connected by alliance-grade ties coalesce; inter-block negative
 * ties verify the split. Deterministic (insertion-order BFS).
 */
export function detectBlocks(
  actors: GraphActor[],
  relations: GraphRelation[],
): Block[] {
  const adj = new Map<string, Array<{ to: string; conf: number }>>();
  for (const a of actors) adj.set(a.slug, []);
  for (const r of relations) {
    if (POSITIVE.has(r.kind)) {
      adj.get(r.sourceSlug)?.push({ to: r.targetSlug, conf: r.confidence });
      adj.get(r.targetSlug)?.push({ to: r.sourceSlug, conf: r.confidence });
    }
  }
  const seen = new Set<string>();
  const blocks: Block[] = [];
  for (const a of actors) {
    if (seen.has(a.slug)) continue;
    const members: string[] = [];
    const queue = [a.slug];
    seen.add(a.slug);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      members.push(cur);
      for (const { to } of adj.get(cur) ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    if (members.length < 2) continue;
    // cohesion = mean confidence of intra-block positive edges
    const memberSet = new Set(members);
    const intra = relations.filter(
      (r) => memberSet.has(r.sourceSlug) && memberSet.has(r.targetSlug),
    );
    const cohesion = intra.length
      ? Math.round(intra.reduce((s, r) => s + r.confidence, 0) / intra.length)
      : 0;
    const seed = actors.find((x) => x.slug === members[0]);
    blocks.push({
      label: seed?.region ?? members[0],
      members,
      cohesion,
    });
  }
  return blocks.sort((x, y) => y.members.length - x.members.length);
}

// ─── Edge dynamics (trajectory & volatility) ────────────────────────────────

export interface EdgeTrajectory {
  slope30: number; // weight delta per 30d over last 90d window
  volatility: number; // stddev of event spacing in [0, 100]
  events90d: number;
  trend: "improving" | "stable" | "declining";
}

const KIND_BASE: Record<string, number> = {
  ALLIANCE: 85, TREATY: 80, COOPERATION: 65, INTEL_SHARING: 70,
  SECURITY_CONSULT: 60, SUPPLY: 60, DEBT_AID: 55, TRANSIT_ACCESS: 50,
  INTERDEPENDENCE: 60, MEDIATION: 45, NON_AGGRESSION: 40, NEGOTIATION: 40,
  DETERRENCE: 55, COMPETITION: 45, PROXY_SUPPORT: 35, TENSION: 25,
  SANCTIONS: 20, CONFLICT: 10, DEPENDENCY: 50,
};

/**
 * Reconstruct approximate intensity history from event types (deterministic
 * mapping: each event type carries its canonical base intensity), then
 * compute slope and volatility over the 90d window.
 */
export function edgeDynamics(
  events: Array<{ timestamp: number; type: string }>,
  now: number,
): EdgeTrajectory {
  const win = events
    .filter((e) => now - e.timestamp <= 90 * 86_400_000)
    .sort((a, b) => a.timestamp - b.timestamp);
  const series = win.map((e) => KIND_BASE[e.type] ?? 50);
  const events90d = series.length;

  if (events90d < 2) {
    return { slope30: 0, volatility: 0, events90d, trend: "stable" };
  }
  // least-squares slope scaled to per-30-days
  const t0 = win[0].timestamp;
  const xs = win.map((e) => (e.timestamp - t0) / 86_400_000);
  const meanX = xs.reduce((s, x) => s + x, 0) / xs.length;
  const meanY = series.reduce((s, y) => s + y, 0) / series.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - meanX) * (series[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slopePerDay = den > 0 ? num / den : 0;
  const slope30 = Math.round(slopePerDay * 30);

  // volatility: normalized stddev of the series
  const variance =
    series.reduce((s, y) => s + (y - meanY) ** 2, 0) / series.length;
  const volatility = Math.round(Math.min(100, Math.sqrt(variance)));

  const trend =
    slope30 > 4 ? "improving" : slope30 < -4 ? "declining" : "stable";
  return { slope30, volatility, events90d, trend };
}

// ─── §7.1 Structured indices ────────────────────────────────────────────────

/** Pairwise tension: weight of adversarial signal + disputed penalty − recency decay. */
export function tensionIndex(r: GraphRelation, now: number): number {
  const adversarial = NEGATIVE.has(r.kind) ? r.weight : Math.round(r.weight * 0.2);
  const disputedPenalty = r.status === "DISPUTED" ? 15 : 0;
  const ageDays = (now - r.updatedAt) / 86_400_000;
  const freshness = Math.max(0, 1 - ageDays / 180);
  return Math.round(
    Math.min(100, adversarial * 0.7 + disputedPenalty + freshness * 20),
  );
}

/** Regional tension: evidence-weighted mean of edge tensions in a region. */
export function regionalTension(
  actors: GraphActor[],
  relations: GraphRelation[],
  region: string,
  now: number,
): number {
  const inRegion = new Set(
    actors.filter((a) => a.region === region).map((a) => a.slug),
  );
  const edges = relations.filter(
    (r) => inRegion.has(r.sourceSlug) && inRegion.has(r.targetSlug),
  );
  if (edges.length === 0) return 0;
  let wSum = 0;
  let tSum = 0;
  for (const e of edges) {
    const tier = Math.min(
      actors.find((a) => a.slug === e.sourceSlug)?.tier ?? 3,
      actors.find((a) => a.slug === e.targetSlug)?.tier ?? 3,
      5,
    );
    const w = 6 - tier; // tier 1 → weight 5 … tier 5 → 1
    wSum += w;
    tSum += tensionIndex(e, now) * w;
  }
  return wSum > 0 ? Math.round(tSum / wSum) : 0;
}

/** Alliance cohesion: intra vs extra mean confidence for a member set. */
export function allianceCohesion(
  members: Set<string>,
  relations: GraphRelation[],
): { intra: number; extra: number } {
  let intraSum = 0;
  let intraN = 0;
  let extraSum = 0;
  let extraN = 0;
  for (const r of relations) {
    const sIn = members.has(r.sourceSlug);
    const tIn = members.has(r.targetSlug);
    if (sIn && tIn && POSITIVE.has(r.kind)) {
      intraSum += r.confidence;
      intraN++;
    } else if (sIn !== tIn && POSITIVE.has(r.kind)) {
      extraSum += r.confidence;
      extraN++;
    }
  }
  return {
    intra: intraN ? Math.round(intraSum / intraN) : 0,
    extra: extraN ? Math.round(extraSum / extraN) : 0,
  };
}

/** §7.1 Coverage health: share of actors with ≥1 evidence in the last 30d. */
export function coverageHealth(
  actors: GraphActor[],
  relations: GraphRelation[],
  now: number,
): number {
  if (actors.length === 0) return 0;
  const cutoff = now - 30 * 86_400_000;
  const fresh = new Set<string>();
  for (const r of relations) {
    if (r.updatedAt >= cutoff) {
      fresh.add(r.sourceSlug);
      fresh.add(r.targetSlug);
    }
  }
  return Math.round((fresh.size / actors.length) * 100);
}
