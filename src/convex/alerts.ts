// §4.4 Rule-based alerting over the stored graph. Every alert links back to
// its evidence (relation / events), never invents a claim (rule 1). Rules
// are deterministic functions of stored data only.

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DAY = 86_400_000;
const BUCKET_MS = 12 * 3_600_000;

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
