import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { SEED_ACTORS, SEED_RELATIONSHIPS } from "./data/seed";
import {
  ME2026_NEW_ACTORS,
  ME2026_EXISTING_ENRICHMENTS,
  ME2026_SLUG,
} from "./data/me2026Actors";
import { ME2026_BLOCK_EDGES, ME2026_FLASH_EDGES, ME2026_MATRIX } from "./data/me2026Rels";import { T26, buildDecisionCycle,
  buildDescription,
  buildMonitoring,
  type Me2026Edge,
} from "./data/me2026Types";
import { latestSourceTs, resolveSources } from "./data/me2026Sources";

// Single shared analyst workspace (auth removed): watchlists, notes, saved
// views and scenarios are global — one shared intelligence desk.
const WORKSPACE_ID = "shared-workspace";
const DAY = 86_400_000;
const dbNow = () => Date.now();

function diffDays(from: number, to: number) {
  return Math.max(0, Math.round((to - from) / DAY));
}

// ─── §6.4 Tripwires ─────────────────────────────────────────────────────────

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
    return await ctx.db.insert("tripwires", {
      actorSlug,
      condition: condition.trim().slice(0, 500),
      action: action.trim().slice(0, 500),
      sourceRef: sourceRef.trim().slice(0, 300),
      ts: dbNow(),
    });
  },
});

export const deleteTripwire = mutation({
  args: { id: v.id("tripwires") },
  handler: async (ctx, { id }) => {
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
    return await ctx.db.insert("scenarios", {
      title: title.trim().slice(0, 140),
      ...(relationId ? { relationId } : {}),
      subjectSlugs: subjectSlugs.slice(0, 8),
      kind,
      ...(rounds !== undefined ? { rounds } : {}),
      payload: payload.slice(0, 60_000),
      ts: dbNow(),
    });
  },
});

export const deleteScenario = mutation({
  args: { id: v.id("scenarios") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ─── Canonical graph ────────────────────────────────────────────────────────
// Read-only deterministic queries. Confidence/weight are computed at
// ingestion time — never at render time, never by an LLM.

export const getGraph = query({
  args: {},
  handler: async (ctx) => {
    const actors = await ctx.db.query("actors").collect();
    if (actors.length === 0) {
      return { actors: [], relations: [], generatedAt: dbNow() };
    }
    const relations = await ctx.db.query("relationships").collect();
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
        mode: a.mode,
        modeSince: a.modeSince,
        capabilities: a.capabilities,
        internalVars: a.internalVars,
        envVars: a.envVars,
        decisionCycle: a.decisionCycle,
        leaders: a.leaders,
        monitoring: a.monitoring,
      })),
      relations: relations.map((r) => ({
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

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const relations = await ctx.db.query("relationships").collect();
    const actors = await ctx.db.query("actors").collect();
    const evidence = await ctx.db.query("relationEvents").collect();
    const corroborated = relations.filter((r) => r.status === "CONFIRMED").length;
    return {
      actorCount: actors.length,
      edgeCount: relations.length,
      evidenceCount: evidence.length,
      corroboratedShare:
        relations.length > 0
          ? Math.round((corroborated / relations.length) * 100)
          : 0,
      activeEdges: relations.length,
      sourcesSum: relations.reduce((s, r) => s + r.sourceCount, 0),
    };
  },
});

// ─── Evidence markers (Phase 1) ─────────────────────────────────────────────

export const getEventMarkers = query({
  args: {},
  handler: async (ctx) => {
    const now = dbNow();
    const relations = await ctx.db.query("relationships").collect();
    const markers = [];
    for (const r of relations) {
      const events = await ctx.db
        .query("relationEvents")
        .withIndex("by_relation", (q) => q.eq("relationId", r._id))
        .collect();
      events.sort((a, b) => a.timestamp - b.timestamp);
      const latestTs = events.length > 0 ? events[events.length - 1].timestamp : r.updatedAt;
      markers.push({
        relationId: r._id,
        latestTs,
        count14d: events.filter((e) => e.timestamp >= now - 14 * DAY).length,
        total: events.length,
        series: events
          .filter((e) => e.timestamp >= now - 90 * DAY)
          .map((e) => ({ ts: e.timestamp, type: e.type as string })),
      });
    }
    return { generatedAt: now, markers };
  },
});

// ─── Idempotent seed ────────────────────────────────────────────────────────

export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("actors").collect();
    if (existing.length > 0) return { seeded: 0 };
    const now = dbNow();
    const bySlug = new Map<string, any>();
    for (const a of SEED_ACTORS) {
      const row = { ...a, mode: "ACTIVE" as const, modeSince: now };
      const id = await ctx.db.insert("actors", row);
      bySlug.set(a.slug, id);
      await ctx.db.insert("changeLog", {
        kind: "ACTOR_ADDED",
        slug: a.slug,
        detail: `${a.name} added to the registry`,
        ts: now,
      });
    }
    for (const r of SEED_RELATIONSHIPS) {
      const relId = await ctx.db.insert("relationships", {
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
          relationId: relId,
          timestamp: e.timestamp,
          type: e.type,
          title: e.title,
          summary: e.summary,
          confidence: e.confidence,
          claimType: e.claimType,
          sources: e.sources,
        });
      }
      await ctx.db.insert("changeLog", {
        kind: "EDGE_ADDED",
        slug: r.sourceSlug,
        otherSlug: r.targetSlug,
        relationId: relId,
        detail: `${r.kind} ${r.sourceSlug} ↔ ${r.targetSlug} established from evidence`,
        ts: now,
      });
    }
    return { seeded: bySlug.size };
  },
});

// ─── Watchlist + view state (shared workspace) ──────────────────────────────

export const getWatchlist = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("userWatchlists")
      .withIndex("by_user", (q) => q.eq("userId", WORKSPACE_ID))
      .collect();
  },
});

export const toggleWatch = mutation({
  args: { actorSlug: v.string() },
  handler: async (ctx, { actorSlug }) => {
    const rows = await ctx.db
      .query("userWatchlists")
      .withIndex("by_user", (q) => q.eq("userId", WORKSPACE_ID))
      .collect();
    const existing = rows.find((r) => r.actorSlug === actorSlug);
    if (existing) {
      await ctx.db.delete(existing._id);
      return { watching: false };
    }
    await ctx.db.insert("userWatchlists", {
      userId: WORKSPACE_ID,
      actorSlug,
      createdAt: dbNow(),
    });
    return { watching: true };
  },
});

export const getViewState = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("userViewState")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", WORKSPACE_ID).eq("key", key),
      )
      .unique();
    return row?.value ?? null;
  },
});

export const setViewState = mutation({
  args: { key: v.string(), value: v.number() },
  handler: async (ctx, { key, value }) => {
    const row = await ctx.db
      .query("userViewState")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", WORKSPACE_ID).eq("key", key),
      )
      .unique();
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("userViewState", { userId: WORKSPACE_ID, key, value });
  },
});

// ─── Change log ─────────────────────────────────────────────────────────────

export const getChangesSince = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const rows = await ctx.db
      .query("changeLog")
      .withIndex("by_ts")
      .order("desc")
      .take(400);
    const fresh = rows.filter((c) => c.ts > since);
    const byActor: Record<string, number> = {};
    for (const c of fresh) {
      if (c.slug && c.slug !== "*") {
        byActor[c.slug] = (byActor[c.slug] ?? 0) + 1;
      }
      if (c.otherSlug) {
        byActor[c.otherSlug] = (byActor[c.otherSlug] ?? 0) + 1;
      }
    }
    return { count: fresh.length, byActor };
  },
});

export const getRecentChanges = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("changeLog")
      .withIndex("by_ts")
      .order("desc")
      .take(Math.min(limit ?? 20, 60));
  },
});

export const getActorChanges = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { slug, limit }) => {
    const rows = await ctx.db
      .query("changeLog")
      .withIndex("by_ts")
      .order("desc")
      .take(300);
    return rows
      .filter((c) => c.slug === slug || c.otherSlug === slug)
      .slice(0, Math.min(limit ?? 6, 30));
  },
});

export const compactChangeLog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("changeLog")
      .withIndex("by_ts")
      .order("desc")
      .collect();
    const keep = 500;
    let removed = 0;
    for (let i = keep; i < rows.length; i++) {
      await ctx.db.delete(rows[i]._id);
      removed++;
    }
    return { removed };
  },
});

// ─── Coverage (actor mentions in think-tank publications) ───────────────────

export const getWatchlistCoverage = query({
  args: { slugs: v.array(v.string()) },
  handler: async (ctx, { slugs }) => {
    const now = dbNow();
    const out = [];
    for (const slug of slugs.slice(0, 40)) {
      const mentions = await ctx.db
        .query("actorMentions")
        .withIndex("by_actor", (q) => q.eq("actorSlug", slug))
        .collect();
      const buckets = new Array(14).fill(0);
      for (const m of mentions) {
        const ageDays = Math.floor((now - m.ts) / DAY);
        if (ageDays >= 0 && ageDays < 14) buckets[13 - ageDays]++;
      }
      out.push({ actorSlug: slug, buckets });
    }
    return out;
  },
});

export const getActorCoverage = query({
  args: { actorSlug: v.string(), days: v.number() },
  handler: async (ctx, { actorSlug, days }) => {
    const now = dbNow();
    const n = Math.max(7, Math.min(60, days));
    const mentions = await ctx.db
      .query("actorMentions")
      .withIndex("by_actor", (q) => q.eq("actorSlug", actorSlug))
      .collect();
    const buckets = new Array(n).fill(0);
    const tankCount = new Map<string, number>();
    let total = 0;
    for (const m of mentions) {
      const ageDays = Math.floor((now - m.ts) / DAY);
      if (ageDays < 0 || ageDays >= n) continue;
      buckets[n - 1 - ageDays]++;
      total++;
      tankCount.set(m.tankSlug, (tankCount.get(m.tankSlug) ?? 0) + 1);
    }
    const tanks = [...tankCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([slug, count]) => ({ slug, count }));
    return { buckets, total, tanks };
  },
});

export const getActorMentionsRecent = query({
  args: { actorSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { actorSlug, limit }) => {
    const mentions = await ctx.db
      .query("actorMentions")
      .withIndex("by_actor", (q) =>
        q.eq("actorSlug", actorSlug),
      )
      .collect();
    mentions.sort((a, b) => b.ts - a.ts);
    const rows = [];
    for (const m of mentions.slice(0, Math.min(limit ?? 5, 20))) {
      const pub = await ctx.db.get(m.pubId);
      if (!pub) continue;
      rows.push({ _id: m._id, url: pub.url, title: pub.title, ts: m.ts });
    }
    return rows;
  },
});

// ─── Evidence trail ─────────────────────────────────────────────────────────

export const getRelationEvents = query({
  args: { relationId: v.id("relationships") },
  handler: async (ctx, { relationId }) => {
    const events = await ctx.db
      .query("relationEvents")
      .withIndex("by_relation", (q) => q.eq("relationId", relationId))
      .collect();
    events.sort((a, b) => b.timestamp - a.timestamp);
    return events;
  },
});

export const getSnapshotTrend = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { slug, limit }) =>  {
    const rows = await ctx.db
      .query("actorSnapshots")
      .withIndex("by_slug_ts", (q) => q.eq("slug", slug))
      .collect();
    rows.sort((a, b) => a.ts - b.ts);
    return rows.slice(-(limit ?? 30));
  },
});

// ─── ME2026 strategic mapping ingest (2026-09-13 dataset) ───────────────────
// Idempotent, evidence-anchored expansion of the canonical graph:
//   1. ingestMe2026Actors — inserts 57 new actors with full 16-dimension
//      profiles and merges FA aliases + decisionCycle + monitoring into the
//      13 already-seeded actors (never overwrites name/kind/description).
//   2. ingestMe2026Rels — batched upsert of ~150 edges from the relationship
//      matrix, strategic blocks and flashpoints; every edge carries at least
//      one relationEvent citing S01–S35 (single citation → REPORTED_CLAIM;
//      ≥2 → OBSERVED_FACT, which is the deterministic rule in me2026Sources).
// Both are guarded by appSettings keys, so re-running is a no-op and the
// existing seed data is never duplicated.

const ME_ACTORS_KEY = "me2026.actorsDone";
const ME_RELS_KEY = "me2026.relsDone";
const ME_CHUNK = 14; // edges per transaction batch (each edge = 1 event write)

async function setDone(ctx: any, key: string, detail: string) {
  const existing = await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .first();
  if (existing) return;
  await ctx.db.insert("appSettings", { key, value: detail, ts: dbNow() });
}

export const ingestMe2026Actors = mutation({
  args: {},
  handler: async (ctx) => {
    const now = dbNow();
    let added = 0;
    let enriched = 0;

    // 1) New actors — insert with full profile.
    for (const p of ME2026_NEW_ACTORS) {
      const dup = await ctx.db
        .query("actors")
        .withIndex("by_slug", (q) => q.eq("slug", p.slug))
        .first();
      if (dup) continue;
      const firstSeen = T26("2026-09-13");
      await ctx.db.insert("actors", {
        slug: p.slug,
        name: p.nameEn,
        aliases: [p.nameFa, p.nameEn, p.id],
        kind: p.kind,
        country: p.country,
        region: p.region,
        tier: p.tier,
        description: buildDescription(p.dims),
        sourceCount: p.src.length * 6,
        status: p.tier === 1 ? ("ACTIVE" as const) : ("MONITORED" as const),
        firstSeen,
        lastSeen: latestSourceTs(p.src),
        mode: "ACTIVE" as const,
        modeSince: now,
        decisionCycle: buildDecisionCycle(p.dims),
        monitoring: buildMonitoring(p.dims, p.src),
      });
      await ctx.db.insert("changeLog", {
        kind: "ACTOR_ADDED",
        slug: p.slug,
        detail: `ME2026 mapping: ${p.nameFa} (${p.id}) added with 16-dimension profile`,
        ts: now,
      });
      added += 1;
    }

    // 2) Existing actors — merge aliases + decision-cycle/monitoring only.
    for (const e of ME2026_EXISTING_ENRICHMENTS) {
      const row = await ctx.db
        .query("actors")
        .withIndex("by_slug", (q) => q.eq("slug", e.slug))
        .first();
      if (!row) continue;
      const mergedAliases = Array.from(new Set([...(row.aliases ?? []), ...e.aliases]));
      const dims = ["", "", "", e.dims[0], "", e.dims[1], e.dims[2], "", "", "", "", "", "", "", "", e.dims[3]];
      await ctx.db.patch(row._id, {
        aliases: mergedAliases,
        decisionCycle: buildDecisionCycle(dims),
        monitoring: buildMonitoring(dims, e.src),
      });
      enriched += 1;
    }

    await setDone(ctx, ME_ACTORS_KEY, `added=${added}, enriched=${enriched}`);
    return { added, enriched };
  },
});

function edgeEvent(e: Me2026Edge, relTs: number) {
  const type = e.type ?? "POSTURE";
  const isObserved = e.srcs.length >= 2;
  const title = e.title ?? `${e.s} → ${e.t}: ${e.kind}`;
  return {
    timestamp: relTs,
    type,
    title,
    summary: e.summary,
    confidence: Math.max(55, Math.min(92, e.w - 2)),
    claimType: (isObserved ? "OBSERVED_FACT" : "REPORTED_CLAIM") as
      | "OBSERVED_FACT"
      | "REPORTED_CLAIM",
    sources: resolveSources(e.srcs),
  };
}

export const ingestMe2026Rels = mutation({
  args: { start: v.optional(v.number()) },
  handler: async (ctx, { start = 0 }) => {
    const now = dbNow();
    const all: Me2026Edge[] = [...ME2026_MATRIX, ...ME2026_BLOCK_EDGES, ...ME2026_FLASH_EDGES];

    // Pre-req guard: actors must exist first.
    const done = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", ME_ACTORS_KEY))
      .first();
    if (!done) return { done: 0, added: 0, total: all.length, blocked: "run ingestMe2026Actors first" };

    // Slug map for id resolution (dataset id → slug).
    const slugOf = (id: string) => ME2026_SLUG[id] ?? id.toLowerCase();
    const missing: string[] = [];
    for (const e of all) {
      for (const id of [e.s, e.t]) {
        const slug = slugOf(id);
        const a = await ctx.db
          .query("actors")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .first();
        if (!a && !missing.includes(slug)) missing.push(slug);
      }
    }
    if (missing.length > 0) return { done: 0, added: 0, total: all.length, blocked: missing.join(",") };

    // Cursor-batched processing; caller re-invokes until done === total.
    const slice = all.slice(start, start + ME_CHUNK);
    let added = 0;
    for (const e of slice) {
      const sSlug = slugOf(e.s);
      const tSlug = slugOf(e.t);
      const relTs = latestSourceTs(e.srcs);
      const ev = edgeEvent(e, relTs);

      // Directional upsert: exact (source, target) pair.
      const pair = await ctx.db
        .query("relationships")
        .withIndex("by_pair", (q) => q.eq("sourceSlug", sSlug).eq("targetSlug", tSlug))
        .first();
      let relId: any;
      if (pair) {
        // Merge intensity/confidence upward; keep earlier kind unless the
        // incoming edge is stronger (conflict kinds dominate).
        const stronger =
          e.kind === "CONFLICT" || e.w >= pair.weight ? e.kind : pair.kind;
        const weight = Math.max(pair.weight, e.w);
        const confidence = Math.max(pair.confidence, ev.confidence);
        const status =
          pair.status === "CONFIRMED" || isObservedEdge(e)
            ? ("CONFIRMED" as const)
            : ("REPORTED" as const);
        await ctx.db.patch(pair._id, {
          kind: stronger,
          weight,
          confidence,
          status,
          updatedAt: Math.max(pair.updatedAt, relTs),
          sourceCount: pair.sourceCount + 1,
          summary:
            pair.summary.length > 20 && pair.summary !== e.summary
              ? `${pair.summary} ‖ ${e.summary}`.slice(0, 600)
              : e.summary,
        });
        relId = pair._id;
      } else {
        relId = await ctx.db.insert("relationships", {
          sourceSlug: sSlug,
          targetSlug: tSlug,
          kind: e.kind,
          weight: e.w,
          confidence: ev.confidence,
          status: isObservedEdge(e) ? ("CONFIRMED" as const) : ("REPORTED" as const),
          since: relTs,
          updatedAt: relTs,
          sourceCount: 1,
          summary: e.summary,
        });
        await ctx.db.insert("changeLog", {
          kind: "EDGE_ADDED",
          slug: sSlug,
          otherSlug: tSlug,
          relationId: relId,
          detail: `ME2026: ${e.kind} ${sSlug} ↔ ${tSlug} established from evidence`,
          ts: now,
        });
      }
      await ctx.db.insert("relationEvents", { relationId: relId, ...ev });
      added += 1;
    }

    const doneCount = start + added;
    if (doneCount >= all.length) {
      await setDone(ctx, ME_RELS_KEY, `edges=${all.length}`);
    }
    return { done: doneCount, added, total: all.length };
  },
});

function isObservedEdge(e: Me2026Edge) {
  return e.srcs.length >= 2;
}

// One-click orchestration for the client: run actors once, then loop rels.
export const ingestMe2026Status = query({
  args: {},
  handler: async (ctx) => {
    const actors = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", ME_ACTORS_KEY))
      .first();
    const rels = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", ME_RELS_KEY))
      .first();
    return { actorsDone: Boolean(actors), relsDone: Boolean(rels) };
  },
});
