import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { SEED_ACTORS, SEED_RELATIONSHIPS } from "./data/seed";

// ─── §6.4 Tripwires (declared actor thresholds, stored as structured data) ──

export const getTripwires = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tripwires").withIndex("by_actor").collect();
  },
});

export const addTripwire = mutation({
  args: {
    actorSlug: v.string(),
    condition: v.string(),
    action: v.string(),
    sourceRef: v.string(),
  },
  handler: async (ctx, { actorSlug, condition, action, sourceRef }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("NOT_AUTHENTICATED");
    return await ctx.db.insert("tripwires", {
      actorSlug,
      condition: condition.trim().slice(0, 500),
      action: action.trim().slice(0, 500),
      sourceRef: sourceRef.trim().slice(0, 300),
      ts: Date.now(),
    });
  },
});

export const deleteTripwire = mutation({
  args: { id: v.id("tripwires") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("NOT_AUTHENTICATED");
    await ctx.db.delete(id);
  },
});

// ─── §6.5 Scenarios (SIMULATION outputs — never merged into evidence) ───────

export const listScenarios = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("scenarios")
      .withIndex("by_ts")
      .order("desc")
      .take(Math.min(limit ?? 20, 50));
  },
});

export const saveScenario = mutation({
  args: {
    title: v.string(),
    relationId: v.optional(v.id("relationships")),
    subjectSlugs: v.array(v.string()),
    kind: v.union(
      v.literal("BRANCH_TREE"),
      v.literal("WARGAME"),
      v.literal("COUNTERFACTUAL"),
    ),
    rounds: v.optional(v.number()),
    payload: v.string(),
  },
  handler: async (ctx, { title, relationId, subjectSlugs, kind, rounds, payload }) => {
    const userId = await getAuthUserId(ctx);
    return await ctx.db.insert("scenarios", {
      title: title.trim().slice(0, 140),
      ...(relationId ? { relationId } : {}),
      subjectSlugs: subjectSlugs.slice(0, 8),
      kind,
      ...(rounds !== undefined ? { rounds } : {}),
      payload: payload.slice(0, 60_000),
      createdBy: userId ?? undefined,
      ts: Date.now(),
    });
  },
});

export const deleteScenario = mutation({
  args: { id: v.id("scenarios") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("NOT_AUTHENTICATED");
    await ctx.db.delete(id);
  },
});

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
        // §3.2 edge dynamics
        symmetry: r.symmetry,
        benefitSource: r.benefitSource,
        benefitTarget: r.benefitTarget,
        breaks: r.breaks,
        coldSpellDays: r.coldSpellDays,
        regimeShifts: r.regimeShifts,
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

    const byRelation = new Map<
      string,
      { latestTs: number; count14d: number; total: number; series: Array<{ ts: number; type: string }> }
    >();
    for (const e of events) {
      const key = String(e.relationId);
      const cur =
        byRelation.get(key) ??
        { latestTs: 0, count14d: 0, total: 0, series: [] };
      cur.total += 1;
      if (e.timestamp > cur.latestTs) cur.latestTs = e.timestamp;
      if (e.timestamp >= cutoff14d) cur.count14d += 1;
      if (e.timestamp >= now - 90 * 86_400_000) {
        cur.series.push({ ts: e.timestamp, type: e.type });
      }
      byRelation.set(key, cur);
    }

    return {
      generatedAt: now,
      markers: Array.from(byRelation.entries()).map(([relationId, m]) => ({
        relationId,
        latestTs: m.latestTs,
        count14d: m.count14d,
        total: m.total,
        series: m.series,
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

// ─── Phase 2: actor mentions ───────────────────────────────────────────────
// The RSS pipeline calls ingestMentions after upserting a publication.
// Matching is deterministic substring matching over canonical names and
// registered aliases — no LLM in the loop, fully auditable (rules 4 & 7).
// Idempotent per (publication, actor) pair (rule 9).

export const ingestMentions = mutation({
  args: {
    pubId: v.id("publications"),
    tankSlug: v.string(),
    ts: v.number(),
    text: v.string(),
  },
  handler: async (ctx, { pubId, tankSlug, ts, text }) => {
    const actors = await ctx.db.query("actors").collect();
    if (actors.length === 0) return { matched: 0 };

    const hay = text.toLowerCase();
    const existing = await ctx.db
      .query("actorMentions")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .collect();
    const already = new Set(existing.map((m) => m.actorSlug));

    let inserted = 0;
    for (const actor of actors) {
      if (already.has(actor.slug)) continue;
      const needles = [actor.name.toLowerCase(), ...actor.aliases.map((a) => a.toLowerCase())]
        .filter((n) => n.length >= 3);
      if (needles.some((n) => hay.includes(n))) {
        await ctx.db.insert("actorMentions", {
          actorSlug: actor.slug,
          pubId,
          tankSlug,
          ts,
        });
        inserted++;
      }
    }
    return { matched: inserted };
  },
});

// Per-actor coverage: daily mention counts for the last N days, plus which
// tanks carried them. Deterministic projection for sparklines / heat halos.
export const getActorCoverage = query({
  args: { actorSlug: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { actorSlug, days }) => {
    const windowDays = Math.min(Math.max(days ?? 30, 7), 90);
    const now = dbNow();
    const cutoff = now - windowDays * 86_400_000;

    const mentions = await ctx.db
      .query("actorMentions")
      .withIndex("by_actor", (q) => q.eq("actorSlug", actorSlug))
      .order("desc")
      .collect();

    const dayMs = 86_400_000;
    const todayStart = Math.floor(now / dayMs) * dayMs;
    const buckets = new Array<number>(windowDays).fill(0);
    const tankCounts: Record<string, number> = {};
    let total = 0;

    for (const m of mentions) {
      if (m.ts < cutoff) continue;
      total++;
      tankCounts[m.tankSlug] = (tankCounts[m.tankSlug] ?? 0) + 1;
      const dayIdx = Math.min(
        windowDays - 1,
        Math.max(0, Math.floor((todayStart - m.ts) / dayMs)),
      );
      buckets[windowDays - 1 - dayIdx] += 1;
    }

    return {
      actorSlug,
      windowDays,
      total,
      buckets,
      tanks: Object.entries(tankCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([slug, count]) => ({ slug, count })),
    };
  },
});

// Recent mentions for one actor, joined with publication titles for display.
export const getActorMentionsRecent = query({
  args: { actorSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { actorSlug, limit }) => {
    const max = Math.min(limit ?? 6, 20);
    const mentions = await ctx.db
      .query("actorMentions")
      .withIndex("by_actor", (q) => q.eq("actorSlug", actorSlug))
      .order("desc")
      .take(max);

    const rows = [];
    for (const m of mentions) {
      const pub = await ctx.db.get(m.pubId);
      if (!pub) continue;
      rows.push({
        _id: m._id,
        ts: m.ts,
        tankSlug: m.tankSlug,
        title: pub.title,
        url: pub.url,
      });
    }
    return rows;
  },
});

// Batch coverage for the Dashboard: daily buckets for many actors in one
// reactive subscription. Bounded to 24 slugs per call.
export const getWatchlistCoverage = query({
  args: { slugs: v.array(v.string()) },
  handler: async (ctx, { slugs }) => {
    const wanted = slugs.slice(0, 24);
    const windowDays = 30;
    const now = dbNow();
    const cutoff = now - windowDays * 86_400_000;
    const dayMs = 86_400_000;
    const todayStart = Math.floor(now / dayMs) * dayMs;

    const rows = [];
    for (const actorSlug of wanted) {
      const mentions = await ctx.db
        .query("actorMentions")
        .withIndex("by_actor", (q) => q.eq("actorSlug", actorSlug))
        .order("desc")
        .collect();
      const buckets = new Array<number>(windowDays).fill(0);
      for (const m of mentions) {
        if (m.ts < cutoff) continue;
        const dayIdx = Math.min(
          windowDays - 1,
          Math.max(0, Math.floor((todayStart - m.ts) / dayMs)),
        );
        buckets[windowDays - 1 - dayIdx] += 1;
      }
      rows.push({ actorSlug, buckets, total: buckets.reduce((s, b) => s + b, 0) });
    }
    return rows;
  },
});

// ─── Phase 2: change log ───────────────────────────────────────────────────
// Append-only. Written by graph mutations (see upsertRelationshipChange
// below and the seed). Queries serve the Dashboard change feed and
// per-actor "new since last visit" badges.

async function logChange(
  ctx: { db: any },
  entry: {
    kind: "EDGE_ADDED" | "EDGE_UPDATED" | "EDGE_REMOVED" | "ACTOR_ADDED";
    slug: string;
    otherSlug?: string;
    relationId?: any;
    detail: string;
  },
) {
  await ctx.db.insert("changeLog", { ...entry, ts: Date.now() });
}

export const getRecentChanges = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const max = Math.min(limit ?? 25, 80);
    return await ctx.db
      .query("changeLog")
      .withIndex("by_ts")
      .order("desc")
      .take(max);
  },
});

export const getActorChanges = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { slug, limit }) => {
    const max = Math.min(limit ?? 10, 40);
    const all = await ctx.db
      .query("changeLog")
      .withIndex("by_ts")
      .order("desc")
      .take(300);
    return all.filter((c) => c.slug === slug || c.otherSlug === slug).slice(0, max);
  },
});

// Count of log entries newer than a timestamp — powers the per-actor and
// global "N new changes since your last visit" badges.
export const getChangesSince = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const all = await ctx.db.query("changeLog").withIndex("by_ts").order("desc").take(400);
    const fresh = all.filter((c) => c.ts > since);
    const byActor = new Map<string, number>();
    for (const c of fresh) {
      byActor.set(c.slug, (byActor.get(c.slug) ?? 0) + 1);
      if (c.otherSlug) byActor.set(c.otherSlug, (byActor.get(c.otherSlug) ?? 0) + 1);
    }
    return { count: fresh.length, byActor: Object.fromEntries(byActor) };
  },
});

// Nightly compaction: keep the append-only change log bounded. Deterministic
// retention policy — never rewrites history, only trims beyond the window.
export const compactChangeLog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const maxRows = 2000;
    const stale = await ctx.db
      .query("changeLog")
      .withIndex("by_ts")
      .order("desc")
      .collect();
    let removed = 0;
    for (let i = maxRows; i < stale.length; i++) {
      await ctx.db.delete(stale[i]._id);
      removed++;
      if (removed >= 500) break; // bounded work per run
    }
    return { removed };
  },
});

// ─── Phase 2: watchlist + per-user view state ─────────────────────────────

async function requireUserId(ctx: { auth: any; db: any }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("NOT_AUTHENTICATED");
  return userId;
}

export const getWatchlist = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("userWatchlists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const toggleWatch = mutation({
  args: { actorSlug: v.string() },
  handler: async (ctx, { actorSlug }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("userWatchlists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existing = rows.find((r) => r.actorSlug === actorSlug);
    if (existing) {
      await ctx.db.delete(existing._id);
      return { watching: false };
    }
    await ctx.db.insert("userWatchlists", {
      userId,
      actorSlug,
      createdAt: Date.now(),
    });
    return { watching: true };
  },
});

export const getViewState = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("userViewState")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    return row?.value ?? null;
  },
});

export const setViewState = mutation({
  args: { key: v.string(), value: v.number() },
  handler: async (ctx, { key, value }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("userViewState")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("userViewState", { userId, key, value });
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

    // Seed the change log so the change feed and "since last visit" badges
    // have real history from first boot.
    const seedTs = Date.now() - 86_400_000;
    await ctx.db.insert("changeLog", {
      kind: "ACTOR_ADDED",
      slug: "*",
      detail: `Registry initialized: ${SEED_ACTORS.length} actors, ${SEED_RELATIONSHIPS.length} relations`,
      ts: seedTs,
    });

    return {
      seeded: true,
      actors: SEED_ACTORS.length,
      relations: SEED_RELATIONSHIPS.length,
    };
  },
});
