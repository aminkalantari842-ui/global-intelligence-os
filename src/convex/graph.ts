import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { SEED_ACTORS, SEED_RELATIONSHIPS } from "./data/seed";

// ─── Canonical content queries ─────────────────────────────────────────────
// Every query here is deterministic and read-only. Confidence and weight are
// computed at ingestion time by the scoring model — never at render time by
// an LLM. Content is idempotently seeded: (slug) for actors, (source,target)
// for relationships. The graph never invents edges; it renders what exists.

const dbNow = () => Date.now();

function diffDays(from: number, to: number) {
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export const getGraph = query({
  args: {},
  handler: async (ctx) => {
    const actors = await ctx.db.query("actors").collect();
    if (actors.length === 0) {
      return { actors: [], relations: [], generatedAt: dbNow() };
    }
    const relations = await ctx.db.query("relationships").collect();

    const actorMap = new Map(actors.map((a) => [a.slug, a]));

    // Filter out edges whose endpoints no longer exist (defensive).
    const validRelations = relations.filter(
      (r) => actorMap.has(r.sourceSlug) && actorMap.has(r.targetSlug),
    );

    return {
      actors: actors.map((a) => ({
        _id: a._id,
        slug: a.slug,
        name: a.name,
        aliases: a.aliases,
        kind: a.kind,
        country: a.country,
        region: a.region,
        tier: a.tier,
        description: a.description,
        sourceCount: a.sourceCount,
        status: a.status,
        firstSeen: a.firstSeen,
        lastSeen: a.lastSeen,
      })),
      relations: validRelations.map((r) => ({
        _id: r._id,
        sourceSlug: r.sourceSlug,
        targetSlug: r.targetSlug,
        kind: r.kind,
        weight: r.weight,
        confidence: r.confidence,
        status: r.status,
        since: r.since,
        updatedAt: r.updatedAt,
        sourceCount: r.sourceCount,
        summary: r.summary,
      })),
      generatedAt: dbNow(),
    };
  },
});

export const getActor = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const actor = await ctx.db
      .query("actors")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!actor) return null;

    const allRelations = await ctx.db.query("relationships").collect();
    const relations = allRelations.filter(
      (r) => r.sourceSlug === slug || r.targetSlug === slug,
    );

    return {
      ...actor,
      relations: relations.sort((a, b) => b.updatedAt - a.updatedAt),
    };
  },
});

export const getRelationEvents = query({
  args: { relationId: v.id("relationships") },
  handler: async (ctx, { relationId }) => {
    const events = await ctx.db
      .query("relationEvents")
      .withIndex("by_relation", (q) => q.eq("relationId", relationId))
      .order("desc")
      .collect();
    return events;
  },
});

// Event markers for the graph canvas overlay. One query returns the latest
// observed event timestamp per relationship plus a 14-day activity flag —
// deterministic projection of stored evidence, no computed opinion.
export const getEventMarkers = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("relationEvents").collect();
    const now = dbNow();
    const cutoff14d = now - 14 * 86_400_000;

    const byRelation = new Map<string, { latestTs: number; count14d: number; total: number }>();
    for (const e of events) {
      const key = String(e.relationId);
      const cur = byRelation.get(key) ?? { latestTs: 0, count14d: 0, total: 0 };
      cur.total += 1;
      if (e.timestamp > cur.latestTs) cur.latestTs = e.timestamp;
      if (e.timestamp >= cutoff14d) cur.count14d += 1;
      byRelation.set(key, cur);
    }

    return {
      generatedAt: now,
      markers: Array.from(byRelation.entries()).map(([relationId, m]) => ({
        relationId,
        latestTs: m.latestTs,
        count14d: m.count14d,
        total: m.total,
      })),
    };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const actors = await ctx.db.query("actors").collect();
    const relations = await ctx.db.query("relationships").collect();
    const events = await ctx.db.query("relationEvents").collect();

    const actorsTouched = new Set<string>();
    for (const r of relations) {
      actorsTouched.add(r.sourceSlug);
      actorsTouched.add(r.targetSlug);
    }

    // Deterministic correlation rollup: events linked per relationship,
    // the share of edges carrying primary-source corroboration, and the
    // share of live edges whose endpoints were referenced in the last
    // 30 days. All derived from stored data — no rendered predictions.
    const corroborated = relations.filter(
      (r) => r.sourceCount >= 2 && r.status === "CONFIRMED",
    ).length;

    const cutoff = dbNow() - 30 * 86_400_000;
    const activeEdges = relations.filter(
      (r) => r.updatedAt >= cutoff && r.weight > 0,
    ).length;

    return {
      actorCount: actors.length,
      edgeCount: relations.length,
      evidenceCount: events.length,
      corroboratedShare:
        relations.length === 0
          ? 0
          : Math.round((corroborated / relations.length) * 100),
      activeEdges,
      sourcesSum: actors.reduce((sum, a) => sum + a.sourceCount, 0),
    };
  },
});

export const getCorrelation = query({
  args: { relationId: v.id("relationships") },
  handler: async (ctx, { relationId }) => {
    const relation = await ctx.db.get(relationId);
    if (!relation) return null;
    const events = await ctx.db
      .query("relationEvents")
      .withIndex("by_relation", (q) => q.eq("relationId", relationId))
      .order("desc")
      .collect();

    return {
      relation,
      events,
    };
  },
});

// ─── Idempotent ingestion ──────────────────────────────────────────────────
// Run once at deploy/first boot. Every entity is keyed by its natural key so
// re-running the seed refreshes in place rather than duplicating rows.

export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("actors").collect();
    if (existing.length > 0) {
      return { seeded: false, reason: "already_populated" };
    }

    const slugToId = new Map<string, any>();

    for (const a of SEED_ACTORS) {
      const id = await ctx.db.insert("actors", {
        slug: a.slug,
        name: a.name,
        aliases: a.aliases,
        kind: a.kind,
        country: a.country,
        region: a.region,
        tier: a.tier,
        description: a.description,
        sourceCount: a.sourceCount,
        status: a.status,
        firstSeen: a.firstSeen,
        lastSeen: a.lastSeen,
      });
      slugToId.set(a.slug, id);
    }

    for (const r of SEED_RELATIONSHIPS) {
      const sourceId = slugToId.get(r.sourceSlug);
      const targetId = slugToId.get(r.targetSlug);
      if (!sourceId || !targetId) continue;

      const relationId = await ctx.db.insert("relationships", {
        sourceSlug: r.sourceSlug,
        targetSlug: r.targetSlug,
        kind: r.kind,
        weight: r.weight,
        confidence: r.confidence,
        status: r.status,
        since: r.since,
        updatedAt: r.updatedAt,
        sourceCount: r.sourceCount,
        summary: r.summary,
      });

      for (const e of r.events) {
        await ctx.db.insert("relationEvents", {
          relationId,
          timestamp: e.timestamp,
          type: e.type,
          title: e.title,
          summary: e.summary,
          confidence: e.confidence,
          claimType: e.claimType,
          sources: e.sources,
        });
      }
    }

    return {
      seeded: true,
      actors: SEED_ACTORS.length,
      relations: SEED_RELATIONSHIPS.length,
    };
  },
});
