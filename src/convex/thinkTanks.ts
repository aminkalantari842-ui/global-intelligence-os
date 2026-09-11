import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
    const tank = await ctx.db.query("thinkTanks").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (tank) await ctx.db.patch(tank._id, { lastFetched: ts });
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

/** Get publication counts per tank for the sidebar. */
export const getTankStats = query({
  args: {},
  handler: async (ctx) => {
    const tanks = await ctx.db.query("thinkTanks").withIndex("by_enabled", (q) => q.eq("enabled", true)).collect();
    const stats: Record<string, { count: number; lastPublished: number | null; name: string; slug: string; country: string; region: string; description: string; lastFetched: number | null }> = {};

    for (const tank of tanks) {
      const pubs = await ctx.db
        .query("publications")
        .withIndex("by_thinktank", (q) => q.eq("thinkTankSlug", tank.slug))
        .order("desc")
        .take(1);

      stats[tank.slug] = {
        count: 0, // will be filled below
        lastPublished: pubs.length > 0 ? pubs[0].publishedAt : null,
        name: tank.name,
        slug: tank.slug,
        country: tank.country,
        region: tank.region,
        description: tank.description,
        lastFetched: tank.lastFetched ?? null,
      };
    }

    // Count publications per tank
    const allPubs = await ctx.db.query("publications").collect();
    for (const pub of allPubs) {
      if (stats[pub.thinkTankSlug]) {
        stats[pub.thinkTankSlug].count++;
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
