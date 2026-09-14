import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { classifyTopicFa } from "./articles";
import { lengthClassOf } from "./enrichment";
import { slugifyName } from "./lib";

export const listEnabled = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("thinkTanks").withIndex("by_enabled", (q) => q.eq("enabled", true)).collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db.query("thinkTanks").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
  },
});

export const updateFetched = mutation({
  args: { slug: v.string(), ts: v.number() },
  handler: async (ctx, { slug, ts }) => {
    const tank = await ctx.db.query("thinkTanks").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();      if (tank) await ctx.db.patch(tank._id, { lastFetched: ts });
  },
});

// ─── A2 Source-catalog CRUD + health (deterministic counters) ──────────

/** Record one fetch outcome. Called by rssIngest after each attempt. */
export const recordHealth = mutation({
  args: {
    tankSlug: v.string(),
    ok: v.boolean(),
    latencyMs: v.number(),
    itemCount: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { tankSlug, ok, latencyMs, itemCount, error }) => {
    const tank = await ctx.db
      .query("thinkTanks")
      .withIndex("by_slug", (q) => q.eq("slug", tankSlug))
      .unique();
    if (!tank) return;
    const streak = ok ? 0 : (tank.errorStreak ?? 0) + 1;
    await ctx.db.patch(tank._id, {
      lastLatencyMs: latencyMs,
      lastItemCount: itemCount,
      errorStreak: streak,
      lastError: ok ? undefined : (error ?? "failed").slice(0, 160),
    });
  },
});

/** Full catalog including disabled sources (managers' view). */
export const listAllSources = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("thinkTanks").withIndex("by_slug").collect();
  },
});

/** Add a source from the UI. Duplicate slugs are rejected. */
export const addSource = mutation({
  args: {
    name: v.string(),
    country: v.string(),
    region: v.string(),
    website: v.optional(v.string()),
    feedUrl: v.string(),
    feedType: v.union(v.literal("RSS"), v.literal("ATOM"), v.literal("SITEMAP"), v.literal("SCRAPE")),
    tier: v.optional(v.string()),
    clusters: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const slug = slugifyName(a.name);
    const existing = await ctx.db
      .query("thinkTanks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error("SOURCE_EXISTS");
    return await ctx.db.insert("thinkTanks", {
      slug,
      name: a.name.trim().slice(0, 160),
      country: a.country.trim().slice(0, 80),
      region: a.region.trim().slice(0, 80),
      website: a.website?.trim() || undefined,
      feedUrl: a.feedUrl.trim(),
      feedType: a.feedType,
      enabled: true,
      tier: a.tier,
      clusters: a.clusters,
      description: (a.description ?? "").trim().slice(0, 400) || "Added from the source catalog.",
      addedBy: "USER",
      custom: true,
      errorStreak: 0,
    });
  },
});

/** Edit an existing source's connection fields. */
export const updateSource = mutation({
  args: {
    id: v.id("thinkTanks"),
    name: v.optional(v.string()),
    feedUrl: v.optional(v.string()),
    feedType: v.optional(v.union(v.literal("RSS"), v.literal("ATOM"), v.literal("SITEMAP"), v.literal("SCRAPE"))),
    tier: v.optional(v.string()),
    clusters: v.optional(v.array(v.string())),
    website: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = patch.name.trim().slice(0, 160);
    if (patch.feedUrl !== undefined) clean.feedUrl = patch.feedUrl.trim();
    if (patch.feedType !== undefined) clean.feedType = patch.feedType;
    if (patch.tier !== undefined) clean.tier = patch.tier || undefined;
    if (patch.clusters !== undefined) clean.clusters = patch.clusters;
    if (patch.website !== undefined) clean.website = patch.website.trim() || undefined;
    await ctx.db.patch(id, clean);
  },
});

/** Enable/disable a source (disabled sources skip the cron). */
export const toggleSource = mutation({
  args: { id: v.id("thinkTanks"), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    await ctx.db.patch(id, { enabled });
  },
});

/** Delete a user-added source (seed rows are protected). */
export const deleteSource = mutation({
  args: { id: v.id("thinkTanks") },
  handler: async (ctx, { id }) => {
    const tank = await ctx.db.get(id);
    if (!tank) return;
    if (!tank.custom) throw new Error("SEED_SOURCES_PROTECTED");
    await ctx.db.delete(id);
  },
});

export const listPublications = query({
  args: {
    tankSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { tankSlug, limit, search }) => {
    const maxLimit = limit ?? 50;

    let pubs;
    if (tankSlug) {
      pubs = await ctx.db
        .query("publications")
        .withIndex("by_thinktank", (q) => q.eq("thinkTankSlug", tankSlug))
        .order("desc")
        .take(maxLimit * 2); // fetch more for search filtering
    } else {
      pubs = await ctx.db
        .query("publications")
        .withIndex("by_published")
        .order("desc")
        .take(maxLimit * 2);
    }

    // Client-side search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      pubs = pubs.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          p.thinkTankSlug.toLowerCase().includes(q) ||
          p.topics.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return pubs.slice(0, maxLimit);
  },
});

/** Get publication counts + metadata per tank for the sidebar (single pass). */
export const getTankStats = query({
  args: {},
  handler: async (ctx) => {
    const tanks = await ctx.db.query("thinkTanks").withIndex("by_enabled", (q) => q.eq("enabled", true)).collect();

    type Stat = {
      count: number;
      lastPublished: number | null;
      name: string;
      slug: string;
      country: string;
      region: string;
      website: string | undefined;
      tier: string | undefined;
      clusters: string[] | undefined;
      description: string;
      lastFetched: number | null;
    };
    const stats: Record<string, Stat> = {};
    for (const tank of tanks) {
      stats[tank.slug] = {
        count: 0,
        lastPublished: null,
        name: tank.name,
        slug: tank.slug,
        country: tank.country,
        region: tank.region,
        website: tank.website,
        tier: tank.tier,
        clusters: tank.clusters,
        description: tank.description,
        lastFetched: tank.lastFetched ?? null,
      };
    }

    // Single pass over publications: count + latest date per tank.
    const allPubs = await ctx.db.query("publications").collect();
    for (const pub of allPubs) {
      const s = stats[pub.thinkTankSlug];
      if (!s) continue;
      s.count++;
      if (s.lastPublished === null || pub.publishedAt > s.lastPublished) {
        s.lastPublished = pub.publishedAt;
      }
    }

    return stats;
  },
});

/** Get overall stats. */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const tanks = await ctx.db.query("thinkTanks").withIndex("by_enabled", (q) => q.eq("enabled", true)).collect();
    const pubs = await ctx.db.query("publications").collect();

    const regions: Record<string, number> = {};
    for (const tank of tanks) {
      regions[tank.region] = (regions[tank.region] ?? 0) + 1;
    }

    const totalPubs = pubs.length;
    const now = Date.now();
    const dayAgo = now - 86_400_000;
    const weekAgo = now - 7 * 86_400_000;
    const pubsLastDay = pubs.filter((p) => p.publishedAt >= dayAgo).length;
    const pubsLastWeek = pubs.filter((p) => p.publishedAt >= weekAgo).length;

    // Collect all unique topics
    const topicSet = new Set<string>();
    for (const pub of pubs) {
      for (const topic of pub.topics) {
        topicSet.add(topic);
      }
    }

    return {
      tankCount: tanks.length,
      totalPubs,
      pubsLastDay,
      pubsLastWeek,
      regions,
      topicCount: topicSet.size,
      lastRefresh: tanks.reduce((max, t) => Math.max(max, t.lastFetched ?? 0), 0),
    };
  },
});

/** Get top topics across all publications. */
export const getTopTopics = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const pubs = await ctx.db.query("publications").collect();
    const topicCounts: Record<string, number> = {};
    for (const pub of pubs) {
      for (const topic of pub.topics) {
        topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
      }
    }
    return Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit ?? 20)
      .map(([topic, count]) => ({ topic, count }));
  },
});

export const upsertPublication = mutation({
  args: {
    thinkTankSlug: v.string(),
    title: v.string(),
    url: v.string(),
    summary: v.string(),
    publishedAt: v.number(),
    topics: v.array(v.string()),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("publications").withIndex("by_url", (q) => q.eq("url", args.url)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        summary: args.summary,
        fetchedAt: args.fetchedAt,
      });
      return existing._id;
    }
    return await ctx.db.insert("publications", args);
  },
});

/**
 * Batch ingestion: one mutation per tank per refresh instead of one per
 * publication. Upserts every item, runs deterministic actor-mention
 * extraction inline, and updates lastFetched — a ~50× reduction in
 * function invocations on the 2-hour cron.
 */
export const ingestBatch = mutation({
  args: {
    tankSlug: v.string(),
    items: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        summary: v.string(),
        publishedAt: v.number(),
        topics: v.array(v.string()),
        author: v.optional(v.string()),
      }),
    ),
    fetchedAt: v.number(),
    latencyMs: v.optional(v.number()),
  },
  handler: async (ctx, { tankSlug, items, fetchedAt, latencyMs }) => {
    const pubIds: Array<{ id: any; text: string; ts: number }> = [];
    let inserted = 0;

    for (const item of items) {
      const existing = await ctx.db
        .query("publications")
        .withIndex("by_url", (q) => q.eq("url", item.url))
        .unique();
      let id: any;
      if (existing) {
        const patch: Record<string, unknown> = {
          title: item.title,
          summary: item.summary,
          fetchedAt,
        };
        // Classify on first sight only — topic assignment is immutable once set.
        if (!existing.topicFa) patch.topicFa = classifyTopicFa(item.title, item.summary);
        // Fill enrichment fields on first sight too (immutable after set).
        if (!existing.author && item.author) patch.author = item.author;
        if (!existing.lengthClass) patch.lengthClass = lengthClassOf(item.summary);
        await ctx.db.patch(existing._id, patch);
        id = existing._id;
      } else {
        id = await ctx.db.insert("publications", {
          thinkTankSlug: tankSlug,
          ...item,
          topicFa: classifyTopicFa(item.title, item.summary),
          fetchedAt,
          lengthClass: lengthClassOf(item.summary),
        });
        inserted++;
      }
      pubIds.push({ id, text: `${item.title} ${item.summary}`.slice(0, 2000), ts: item.publishedAt });
    }

    // Keep throttle metadata + health fresh only when the feed yielded items.
    if (items.length > 0) {
      const tank = await ctx.db
        .query("thinkTanks")
        .withIndex("by_slug", (q) => q.eq("slug", tankSlug))
        .unique();
      if (tank)
        await ctx.db.patch(tank._id, {
          lastFetched: fetchedAt,
          errorStreak: 0,
          lastError: undefined,
          lastLatencyMs: latencyMs,
          lastItemCount: items.length,
        });
    }

    // Inline deterministic mention extraction (same logic as graph.ingestMentions).
    let matched = 0;
    if (pubIds.length > 0) {
      const actors = await ctx.db.query("actors").collect();
      for (const { id, text, ts } of pubIds) {
        const hay = text.toLowerCase();
        const already = new Set(
          (
            await ctx.db
              .query("actorMentions")
              .withIndex("by_pub", (q) => q.eq("pubId", id))
              .collect()
          ).map((m) => m.actorSlug),
        );
        for (const actor of actors) {
          if (already.has(actor.slug)) continue;
          const needles = [actor.name.toLowerCase(), ...actor.aliases.map((a) => a.toLowerCase())]
            .filter((n) => n.length >= 3);
          if (needles.some((n) => hay.includes(n))) {
            await ctx.db.insert("actorMentions", {
              actorSlug: actor.slug,
              pubId: id,
              tankSlug,
              ts,
            });
            matched++;
          }
        }
      }
    }

    return { inserted, matched, total: items.length };
  },
});
