// §4.4 Rule-based alerting over the stored graph. Every alert links back to
// its evidence (relation / events), never invents a claim (rule 1). Rules
// are deterministic functions of stored data only.

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DAY = 86_400_000;
const BUCKET_MS = 12 * 3_600_000;

// §6.3/§6.4 ladder & tripwire helpers — fixed rubric, identical to the
// client copy in src/components/graph/escalation.ts (single source of truth
// duplicated intentionally: Convex runtime cannot import client modules).
const EVENT_RUNG: Record<string, number> = {
  STATEMENT: 1, REPORT: 1, POSTURE: 2, ELECTION: 1, REFERENDUM: 1,
  MEETING: 1, DIPLOMATIC_SUMMIT: 1, AGREEMENT: 0, TREATY_SIGNED: 0,
  AMBASSADOR_RECALL: 3, RELATIONS_SEVERED: 4, RECOGNITION: 1,
  WITHDRAWAL: 3, SANCTION: 3, SEIZURE: 4, BLOCKADE: 5,
  MILITARY_EXERCISE: 5, MISSILE_TEST: 5, TRANSFER: 4, CYBER_ATTACK: 5, STRIKE: 6,
};

function eventRung(type: string, explicit?: number): number {
  return explicit ?? EVENT_RUNG[type] ?? 1;
}

/** Max rung across recent events involving an actor. */
function actorRung(events: Array<{ timestamp: number; type: string; escalationRung?: number }>, now: number): number {
  const cutoff = now - 90 * DAY;
  let rung = 0;
  for (const e of events) {
    if (e.timestamp < cutoff) continue;
    const r = eventRung(e.type, e.escalationRung);
    if (r > rung) rung = r;
  }
  return rung;
}

/** Declared condition → trigger rung (keyword table, deterministic). */
function tripwireTriggerRung(condition: string): number {
  const c = condition.toLowerCase();
  if (/strike|attack|invade|war|military action|حمله|جنگ/.test(c)) return 6;
  if (/blockade|siege|quarantine|محاصره/.test(c)) return 5;
  if (/cyber|سایبری/.test(c)) return 5;
  if (/enrich|nuclear|weapon|هسته|موشک/.test(c)) return 5;
  if (/seizure|capture|توقیف/.test(c)) return 4;
  if (/sanction|embargo|تحریم/.test(c)) return 3;
  if (/expel|recall|diplomat|اخراج|فراخوان/.test(c)) return 3;
  return 4;
}

interface RelRow {
  _id: any;
  sourceSlug: string;
  targetSlug: string;
  kind: string;
  weight: number;
  confidence: number;
  status: string;
  since: number;
  updatedAt: number;
}

/** Evaluate all alert rules; dedupe per (rule, subjects, 12h window). */
export const evaluate = mutation({
  args: {},
  handler: async (ctx): Promise<{ created: number; rules: string[] }> => {
    const now = Date.now();
    const bucket = Math.floor(now / BUCKET_MS);
    const actors = await ctx.db.query("actors").collect();
    const relations = (await ctx.db.query("relationships").collect()) as RelRow[];
    const events = await ctx.db.query("relationEvents").collect();

    const actorMap = new Map(actors.map((a) => [a.slug, a]));

    const recent = await ctx.db
      .query("alerts")
      .withIndex("by_ts")
      .order("desc")
      .take(200);
    const seen = new Set(
      recent.map(
        (a) => `${a.rule}:${[...a.actorSlugs].sort().join("|")}:${Math.floor(a.ts / BUCKET_MS)}`,
      ),
    );

    const rulesFired = new Set<string>();
    let created = 0;

    const HOSTILE = new Set([
      "STRIKE",
      "SANCTION",
      "BLOCKADE",
      "SEIZURE",
      "CYBER_ATTACK",
      "MISSILE_TEST",
    ]);
    const ADVERSARIAL = new Set([
      "TENSION",
      "CONFLICT",
      "SANCTIONS",
      "COMPETITION",
      "PROXY_SUPPORT",
    ]);

    async function insert(
      rule: string,
      severity: "HIGH" | "MEDIUM" | "LOW",
      actorSlugs: string[],
      title: string,
      detail: string,
      relationId?: any,
    ) {
      const key = `${rule}:${[...actorSlugs].sort().join("|")}:${bucket}`;
      if (seen.has(key)) return false;
      seen.add(key);
      await ctx.db.insert("alerts", {
        rule,
        severity,
        actorSlugs,
        title,
        detail,
        ts: now,
        ...(relationId ? { relationId } : {}),
      });
      created++;
      rulesFired.add(rule);
      return true;
    }

    // ── Rule 1: new tie between two tier-1 actors (HIGH) ──
    for (const r of relations) {
      const t1 = actorMap.get(r.sourceSlug)?.tier ?? 3;
      const t2 = actorMap.get(r.targetSlug)?.tier ?? 3;
      if (t1 === 1 && t2 === 1 && now - r.since <= 30 * DAY) {
        await insert(
          "new_t1_edge",
          "HIGH",
          [r.sourceSlug, r.targetSlug],
          `New tie between priority actors: ${r.sourceSlug} ↔ ${r.targetSlug}`,
          `${r.kind} · intensity ${r.weight} · confidence ${r.confidence}%`,
          r._id,
        );
      }
    }

    // Group events per relation once.
    const byRelation = new Map<string, Array<{ timestamp: number; type: string }>>();
    for (const e of events) {
      const k = String(e.relationId);
      const list = byRelation.get(k);
      if (list) list.push({ timestamp: e.timestamp, type: e.type });
      else byRelation.set(k, [{ timestamp: e.timestamp, type: e.type }]);
    }

    // ── Rule 2: hostile event cluster (HIGH) ──
    for (const [rid, evts] of byRelation) {
      const rel = relations.find((x) => String(x._id) === rid);
      if (!rel) continue;
      const hostileCount = evts.filter(
        (e) => now - e.timestamp <= 45 * DAY && HOSTILE.has(e.type),
      ).length;
      if (hostileCount >= 2) {
        await insert(
          "intensity_jump",
          "HIGH",
          [rel.sourceSlug, rel.targetSlug],
          `Hostile event cluster: ${rel.sourceSlug} ↔ ${rel.targetSlug}`,
          `${hostileCount} hostile events within 45 days — possible escalation.`,
          rel._id,
        );
      }
    }

    // ── Rule 3: event compression (MEDIUM) ──
    for (const [rid, evts] of byRelation) {
      const rel = relations.find((x) => String(x._id) === rid);
      if (!rel) continue;
      const week = evts.filter((e) => now - e.timestamp <= 7 * DAY).length;
      if (week >= 4) {
        await insert(
          "event_compression",
          "MEDIUM",
          [rel.sourceSlug, rel.targetSlug],
          `Event compression: ${rel.sourceSlug} ↔ ${rel.targetSlug}`,
          `${week} events in 7 days on one edge — unusual tempo.`,
          rel._id,
        );
      }
    }

    // ── Rule 4: multi-front sync (MEDIUM) ──
    const perActor = new Map<string, number>();
    for (const r of relations) {
      if (!ADVERSARIAL.has(r.kind) || now - r.updatedAt > 7 * DAY) continue;
      perActor.set(r.sourceSlug, (perActor.get(r.sourceSlug) ?? 0) + 1);
      perActor.set(r.targetSlug, (perActor.get(r.targetSlug) ?? 0) + 1);
    }
    for (const [slug, n] of perActor) {
      if (n >= 3) {
        await insert(
          "multi_front",
          "MEDIUM",
          [slug],
          `Multi-front activity: ${slug}`,
          `${n} adversarial edges active within 7 days.`,
        );
      }
    }

    // ── Rule 6: ladder climb (§6.3, MEDIUM) ──
    // Actor's recent-event rung rose ≥2 within 90d — rapid escalation.
    const eventsByActor = new Map<string, Array<{ timestamp: number; type: string; escalationRung?: number }>>();
    {
      const relById = new Map(relations.map((r) => [String(r._id), r]));
      for (const e of events) {
        const rel = relById.get(String(e.relationId));
        if (!rel) continue;
        const row = { timestamp: e.timestamp, type: e.type, escalationRung: e.escalationRung };
        if (!eventsByActor.has(rel.sourceSlug)) eventsByActor.set(rel.sourceSlug, []);
        if (!eventsByActor.has(rel.targetSlug)) eventsByActor.set(rel.targetSlug, []);
        eventsByActor.get(rel.sourceSlug)!.push(row);
        eventsByActor.get(rel.targetSlug)!.push(row);
      }
    }
    for (const [slug, evts] of eventsByActor) {
      const recent = evts.filter((e) => now - e.timestamp <= 30 * DAY);
      const prior = evts.filter((e) => now - e.timestamp > 30 * DAY && now - e.timestamp <= 90 * DAY);
      const rRecent = recent.length ? Math.max(...recent.map((e) => eventRung(e.type, e.escalationRung))) : 0;
      const rPrior = prior.length ? Math.max(...prior.map((e) => eventRung(e.type, e.escalationRung))) : 0;
      if (rRecent - rPrior >= 2) {
        await insert(
          "ladder_climb",
          "MEDIUM",
          [slug],
          `Escalation ladder climb: ${slug}`,
          `Rung moved ${rPrior} → ${rRecent} over 90 days (fixed rubric over observed events).`,
        );
      }
    }

    // ── Rule 7: tripwire proximity (§6.4, HIGH when at threshold) ──
    const tripwires = await ctx.db.query("tripwires").collect();
    for (const tw of tripwires) {
      const current = actorRung(eventsByActor.get(tw.actorSlug) ?? [], now);
      const trigger = tripwireTriggerRung(tw.condition);
      const distance = trigger - current;
      if (distance <= 0) {
        await insert(
          "tripwire_at_threshold",
          "HIGH",
          [tw.actorSlug],
          `Tripwire at threshold: ${tw.actorSlug}`,
          `Declared condition approached: "${tw.condition.slice(0, 120)}" → ${tw.action.slice(0, 120)}`,
        );
      } else if (distance === 1) {
        await insert(
          "tripwire_near",
          "MEDIUM",
          [tw.actorSlug],
          `Tripwire one rung away: ${tw.actorSlug}`,
          `Condition "${tw.condition.slice(0, 120)}" — one escalation rung from the declared trigger.`,
        );
      }
    }

    // ── Rule 5: coverage gap on tier-1 actors (LOW) ──
    for (const a of actors) {
      if (a.tier !== 1) continue;
      const hasFresh = relations.some(
        (r) =>
          (r.sourceSlug === a.slug || r.targetSlug === a.slug) &&
          now - r.updatedAt <= 30 * DAY,
      );
      if (!hasFresh) {
        await insert(
          "coverage_gap",
          "LOW",
          [a.slug],
          `Coverage gap: ${a.slug}`,
          "Tier-1 actor without fresh evidence for 30+ days — check source health.",
        );
      }
    }

    return { created, rules: [...rulesFired] };
  },
});

export const listAlerts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("alerts")
      .withIndex("by_ts")
      .order("desc")
      .take(Math.min(limit ?? 40, 100));
  },
});

export const acknowledge = mutation({
  args: { id: v.id("alerts") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { acknowledged: true });
  },
});

// ─── §2.1 Snapshot writer (daily, idempotent) ───────────────────────────────

export const writeSnapshots = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ written: number }> => {
    const now = Date.now();
    const dayStart = Math.floor(now / DAY) * DAY;
    const last = await ctx.db
      .query("actorSnapshots")
      .withIndex("by_slug_ts")
      .order("desc")
      .take(1);
    if (last[0]?.ts === dayStart) return { written: 0 };

    const actors = await ctx.db.query("actors").collect();
    for (const a of actors) {
      await ctx.db.insert("actorSnapshots", {
        slug: a.slug,
        ts: dayStart,
        tier: a.tier,
        mode: a.mode ?? a.status,
        sourceCount: a.sourceCount,
        capabilities: a.capabilities,
        internalVars: a.internalVars,
      });
    }
    return { written: actors.length };
  },
});
