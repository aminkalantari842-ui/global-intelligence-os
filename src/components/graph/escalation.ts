// §6.1–6.4 Decision-cycle chains, escalation ladder, and tripwires.
// Pure deterministic functions over stored evidence only — no LLM, no render-
// time scoring (rules 2, 3 & 4). Every output traces back to relationEvents
// rows; undocumented links are labeled as open assumptions, never hidden.

// ─── §6.3 Escalation ladder ─────────────────────────────────────────────────
// Standard rungs shared by all relation kinds. Each observed event type maps
// to a rung height; height 0 = no observed events. The ladder is a fixed
// rubric (documented here, in code), not a model opinion.

export const LADDER_RUNGS: Array<{ rung: number; labelKey: string; descKey: string }> = [
  { rung: 0, labelKey: "ladder.r0", descKey: "ladder.r0d" }, // quiet
  { rung: 1, labelKey: "ladder.r1", descKey: "ladder.r1d" }, // rhetoric
  { rung: 2, labelKey: "ladder.r2", descKey: "ladder.r2d" }, // diplomatic protest
  { rung: 3, labelKey: "ladder.r3", descKey: "ladder.r3d" }, // economic coercion
  { rung: 4, labelKey: "ladder.r4", descKey: "ladder.r4d" }, // gray zone
  { rung: 5, labelKey: "ladder.r5", descKey: "ladder.r5d" }, // shows of force
  { rung: 6, labelKey: "ladder.r6", descKey: "ladder.r6d" }, // limited strikes
  { rung: 7, labelKey: "ladder.r7", descKey: "ladder.r7d" }, // open conflict
];

export const MAX_RUNG = 7;

/** Deterministic event-type → rung mapping (fixed rubric, auditable). */
export const EVENT_RUNG: Record<string, number> = {
  STATEMENT: 1,
  REPORT: 1,
  POSTURE: 2,
  ELECTION: 1,
  REFERENDUM: 1,
  MEETING: 1,
  DIPLOMATIC_SUMMIT: 1,
  AGREEMENT: 0,
  TREATY_SIGNED: 0,
  AMBASSADOR_RECALL: 3,
  RELATIONS_SEVERED: 4,
  RECOGNITION: 1,
  WITHDRAWAL: 3,
  SANCTION: 3,
  SEIZURE: 4,
  BLOCKADE: 5,
  MILITARY_EXERCISE: 5,
  MISSILE_TEST: 5,
  TRANSFER: 4,
  CYBER_ATTACK: 5,
  STRIKE: 6,
};

export interface LadderEvent {
  _id: string;
  timestamp: number;
  type: string;
  escalationRung?: number;
}

/**
 * Current rung = highest rung among events inside the recency window
 * (default 90d). Explicit escalationRung overrides the type mapping when
 * an analyst recorded one.
 */
export function currentRung(events: LadderEvent[], now: number, windowDays = 90): number {
  const cutoff = now - windowDays * 86_400_000;
  let rung = 0;
  for (const e of events) {
    if (e.timestamp < cutoff) continue;
    const r = e.escalationRung ?? EVENT_RUNG[e.type] ?? 1;
    if (r > rung) rung = r;
  }
  return rung;
}

/**
 * §6.3 "speed of rung-climbing": rung change over the last 30d vs the prior
 * 60d. Positive = climbing (escalation), negative = descending (de-escalation).
 */
export function rungVelocity(events: LadderEvent[], now: number): number {
  const r30 = currentRung(events, now, 30);
  const prior: LadderEvent[] = [];
  const cutoff90 = now - 90 * 86_400_000;
  const cutoff30 = now - 30 * 86_400_000;
  for (const e of events) {
    if (e.timestamp >= cutoff90 && e.timestamp < cutoff30) prior.push(e);
  }
  const rPrior = currentRung(prior, Number.MAX_SAFE_INTEGER, 10_000); // no window filter for prior set
  return r30 - rPrior;
}

// ─── §6.2 Reaction chains (documented action → reaction) ────────────────────

export interface ChainEvent extends LadderEvent {
  inResponseTo?: string;
  title: string;
  actorSide: "A" | "B"; // which side of the pair initiated
}

export interface ReactionStep {
  event: ChainEvent;
  responseTo?: ChainEvent;
  /** Documented (has inResponseTo) vs open assumption (sequence-based). */
  documented: boolean;
  /** Lag in days between action and reaction (documented chains only). */
  lagDays?: number;
}

/**
 * Build the reaction chain: documented links first (inResponseTo), then
 * alternating-side sequences as *labeled* open assumptions. Never presents
 * an assumed link as documented (rule: open assumptions are visible).
 */
export function buildReactionChain(events: ChainEvent[]): ReactionStep[] {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const byId = new Map(sorted.map((e) => [e._id, e]));
  const steps: ReactionStep[] = [];

  for (const e of sorted) {
    if (e.inResponseTo) {
      const parent = byId.get(e.inResponseTo);
      steps.push({
        event: e,
        responseTo: parent,
        documented: true,
        lagDays: parent ? Math.round((e.timestamp - parent.timestamp) / 86_400_000) : undefined,
      });
    }
  }
  // Sequence-based assumptions: consecutive alternating-side events without
  // a documented parent.
  const documentedIds = new Set(steps.map((s) => s.event._id));
  let prev: ChainEvent | null = null;
  for (const e of sorted) {
    if (documentedIds.has(e._id)) {
      prev = e;
      continue;
    }
    if (prev && prev.actorSide !== e.actorSide && !e.inResponseTo) {
      steps.push({ event: e, responseTo: prev, documented: false });
    }
    prev = e;
  }
  return steps.sort((a, b) => a.event.timestamp - b.event.timestamp);
}

/**
 * Tit-for-tat pattern detection: proportion of documented reactions that
 * stay on the same or lower rung (proportionate) vs jump higher.
 */
export function titForTat(steps: ReactionStep[]): {
  documented: number;
  proportionate: number;
  escalatory: number;
} {
  let documented = 0;
  let proportionate = 0;
  let escalatory = 0;
  for (const s of steps) {
    if (!s.documented || !s.responseTo) continue;
    documented++;
    const from = s.responseTo.escalationRung ?? EVENT_RUNG[s.responseTo.type] ?? 1;
    const to = s.event.escalationRung ?? EVENT_RUNG[s.event.type] ?? 1;
    if (to > from) escalatory++;
    else proportionate++;
  }
  return { documented, proportionate, escalatory };
}

// ─── §6.4 Tripwires ─────────────────────────────────────────────────────────

export interface Tripwire {
  _id: string;
  actorSlug: string;
  condition: string;
  action: string;
  sourceRef: string;
  ts: number;
}

/**
 * Tripwire proximity: for each tripwire of either actor, measure how close
 * the current ladder rung is to the rung at which the declared action would
 * plausibly trigger. The mapping condition→rung is deterministic keyword
 * scoring over the declared condition text (fixed table, no model).
 */
export function tripwireRung(tw: Tripwire): number {
  const c = tw.condition.toLowerCase();
  if (/strike|attack|invade|war|military action|حمله|جنگ/.test(c)) return 6;
  if (/blockade|siege|quarantine|محاصره/.test(c)) return 5;
  if (/cyber|سایبری/.test(c)) return 5;
  if (/enrich|nuclear|weapon|هسته|موشک/.test(c)) return 5;
  if (/seizure|capture|توقیف/.test(c)) return 4;
  if (/sanction|embargo|تحریم/.test(c)) return 3;
  if (/expel|recall|diplomat|اخراج|فراخوان/.test(c)) return 3;
  return 4; // unspecified → mid-ladder caution
}

export interface TripwireProximity {
  tripwire: Tripwire;
  /** current max rung of that actor's recent events (0–7) */
  currentRung: number;
  /** rung at which the declared action plausibly triggers */
  triggerRung: number;
  /** triggerRung − currentRung, clamped ≥ 0; 0 = AT THRESHOLD */
  distance: number;
}

export function tripwireProximity(
  tripwires: Tripwire[],
  eventsByActor: Map<string, LadderEvent[]>,
  now: number,
): TripwireProximity[] {
  return tripwires
    .map((tw) => {
      const current = currentRung(eventsByActor.get(tw.actorSlug) ?? [], now);
      const trigger = tripwireRung(tw);
      return {
        tripwire: tw,
        currentRung: current,
        triggerRung: trigger,
        distance: Math.max(0, trigger - current),
      };
    })
    .sort((a, b) => a.distance - b.distance);
}
