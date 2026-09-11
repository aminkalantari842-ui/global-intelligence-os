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
  },
  handler: async (ctx, { tankSlug, limit }) => {
    if (tankSlug) {
      const pubs = await ctx.db
        .query("publications")
        .withIndex("by_thinktank", (q) => q.eq("thinkTankSlug", tankSlug))
        .order("desc")
        .take(limit ?? 50);
      return pubs;
    }
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(limit ?? 50);
    return pubs;
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
