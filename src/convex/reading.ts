// Think-tank board workspace: persisted column layout, reading progress,
// reading lists, and analyst highlights. All writes go through explicit
// whitelist mutations; reads are reactive so every client stays in sync.
// The workspace key is shared (single intelligence desk — auth removed).

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const WORKSPACE = "shared-desk";

// ─── Column layout (order / pin / width / view mode) ────────────────────────

export const getLayout = query({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    return await ctx.db
      .query("boardLayouts")
      .withIndex("by_user", (q) => q.eq("userId", WORKSPACE))
      .collect()
      .then((rows) => rows.find((r) => r.name === (name ?? "default")) ?? null);
  },
});

export const saveLayout = mutation({
  args: {
    order: v.array(v.string()),
    pinned: v.array(v.string()),
    widths: v.any(),
    viewMode: v.optional(
      v.union(v.literal("comfortable"), v.literal("compact"), v.literal("list")),
    ),
  },
  handler: async (ctx, { order, pinned, widths, viewMode }) => {
    const name = "default";
    const now = Date.now();
    const existing = await ctx.db
      .query("boardLayouts")
      .withIndex("by_user", (q) => q.eq("userId", WORKSPACE))
      .collect()
      .then((rows) => rows.find((r) => r.name === name));
    if (existing) {
      await ctx.db.patch(existing._id, { order, pinned, widths, viewMode, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("boardLayouts", {
      userId: WORKSPACE,
      name,
      order,
      pinned,
      widths,
      viewMode,
      updatedAt: now,
    });
  },
});

// ─── Reading progress & resume ──────────────────────────────────────────────

export const getReadingStates = query({
  args: { pubIds: v.array(v.id("publications")) },
  handler: async (ctx, { pubIds }) => {
    const out: Record<string, { progress: number; triage: string; lastReadAt: number }> = {};
    for (const pubId of pubIds.slice(0, 100)) {
      const row = await ctx.db
        .query("readingStates")
        .withIndex("by_pub", (q) => q.eq("pubId", pubId))
        .unique();
      if (row) out[pubId] = { progress: row.progress, triage: row.triage, lastReadAt: row.lastReadAt };
    }
    return out;
  },
});

export const setReadingProgress = mutation({
  args: { pubId: v.id("publications"), progress: v.number() },
  handler: async (ctx, { pubId, progress }) => {
    const p = Math.min(1, Math.max(0, progress));
    const row = await ctx.db
      .query("readingStates")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .unique();
    const triage = p >= 0.95 ? "READ" : p > 0.02 ? "READING" : "UNREAD";
    if (row) {
      await ctx.db.patch(row._id, { progress: p, triage, lastReadAt: Date.now() });
    } else {
      await ctx.db.insert("readingStates", {
        pubId,
        userId: WORKSPACE,
        progress: p,
        triage,
        lastReadAt: Date.now(),
      });
    }
  },
});

// ─── Reading lists / read-later ─────────────────────────────────────────────

export const listReadingLists = query({
  handler: async (ctx) => {
    const lists = await ctx.db
      .query("readingLists")
      .withIndex("by_user", (q) => q.eq("userId", WORKSPACE))
      .collect();
    const out = [];
    for (const l of lists) {
      const items = await ctx.db
        .query("readingListItems")
        .withIndex("by_list", (q) => q.eq("listId", l._id))
        .collect();
      out.push({
        _id: l._id,
        name: l.name,
        count: items.length,
        pubIds: items.sort((a, b) => b.addedAt - a.addedAt).map((i) => i.pubId),
      });
    }
    return out;
  },
});

export const createList = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const clean = name.trim().slice(0, 80);
    if (!clean) throw new Error("Name required");
    const existing = await ctx.db
      .query("readingLists")
      .withIndex("by_user", (q) => q.eq("userId", WORKSPACE))
      .collect();
    if (existing.some((l) => l.name === clean)) return existing.find((l) => l.name === clean)!._id;
    return await ctx.db.insert("readingLists", { userId: WORKSPACE, name: clean, createdAt: Date.now() });
  },
});

export const deleteList = mutation({
  args: { listId: v.id("readingLists") },
  handler: async (ctx, { listId }) => {
    const items = await ctx.db
      .query("readingListItems")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();
    for (const i of items) await ctx.db.delete(i._id);
    await ctx.db.delete(listId);
  },
});

export const toggleListItem = mutation({
  args: { listId: v.id("readingLists"), pubId: v.id("publications") },
  handler: async (ctx, { listId, pubId }) => {
    const items = await ctx.db
      .query("readingListItems")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();
    const hit = items.find((i) => i.pubId === pubId);
    if (hit) {
      await ctx.db.delete(hit._id);
      return "removed" as const;
    }
    await ctx.db.insert("readingListItems", { listId, pubId, addedAt: Date.now() });
    return "added" as const;
  },
});

// ─── Highlights & private annotations ───────────────────────────────────────

export const getHighlights = query({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) => {
    return await ctx.db
      .query("articleHighlights")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .collect();
  },
});

export const addHighlight = mutation({
  args: {
    pubId: v.id("publications"),
    quote: v.string(),
    note: v.optional(v.string()),
    lang: v.optional(v.union(v.literal("FA"), v.literal("EN"))),
  },
  handler: async (ctx, { pubId, quote, note, lang }) => {
    const clean = quote.trim().slice(0, 600);
    if (!clean) throw new Error("Quote required");
    return await ctx.db.insert("articleHighlights", {
      pubId,
      userId: WORKSPACE,
      quote: clean,
      note: note?.trim().slice(0, 2000),
      lang,
      createdAt: Date.now(),
    });
  },
});

export const updateHighlightNote = mutation({
  args: { id: v.id("articleHighlights"), note: v.string() },
  handler: async (ctx, { id, note }) => {
    await ctx.db.patch(id, { note: note.trim().slice(0, 2000) });
  },
});

export const deleteHighlight = mutation({
  args: { id: v.id("articleHighlights") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ─── Deterministic analytics for headers & map strip ────────────────────────

/** Triage chip counts for the board toolbar. */
export const getTriageCounts = query({
  handler: async (ctx) => {
    const rows = await ctx.db.query("readingStates").collect();
    const counts = { UNREAD: 0, READING: 0, READ: 0 };
    for (const r of rows) counts[r.triage] += 1;
    return counts;
  },
});

/** 14-day daily counts per topic for header sparklines. */
export const getTopicTrends = query({
  args: { topics: v.array(v.string()), days: v.optional(v.number()) },
  handler: async (ctx, { topics, days }) => {
    const n = days ?? 14;
    const dayMs = 86_400_000;
    const start = Math.floor(Date.now() / dayMs) * dayMs - (n - 1) * dayMs;
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(4000);
    const series: Record<string, number[]> = {};
    for (const topic of topics) series[topic] = new Array(n).fill(0);
    for (const p of pubs) {
      if (p.publishedAt < start) break;
      const topic = p.topicFa;
      if (!topic || !(topic in series)) continue;
      series[topic][Math.min(n - 1, Math.floor((p.publishedAt - start) / dayMs))] += 1;
    }
    return series;
  },
});

/** Country coverage of recent classified publications for the world strip. */
export const getCoverageByCountry = query({
  args: { hours: v.optional(v.number()) },
  handler: async (ctx, { hours }) => {
    const windowMs = (hours ?? 168) * 3_600_000;
    const cutoff = Date.now() - windowMs;
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(2000);
    const tanks = await ctx.db
      .query("thinkTanks")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    const countryBySlug = new Map(tanks.map((t) => [t.slug, t.country]));
    const counts: Record<string, number> = {};
    for (const p of pubs) {
      if (p.publishedAt < cutoff) break;
      const country = countryBySlug.get(p.thinkTankSlug) ?? "Other";
      counts[country] = (counts[country] ?? 0) + 1;
    }
    return counts;
  },
});

/** Recent "continue reading" list for the resume affordance. */
export const getResumeFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("readingStates")
      .withIndex("by_user_last", (q) => q.eq("userId", WORKSPACE))
      .order("desc")
      .take(limit ?? 8);
    const out: Array<{
      pubId: Id<"publications">;
      title: string;
      progress: number;
      lastReadAt: number;
    }> = [];
    for (const r of rows) {
      if (r.triage !== "READING" || r.progress <= 0.02) continue;
      const pub = await ctx.db.get(r.pubId);
      if (!pub) continue;
      out.push({ pubId: r.pubId, title: pub.title, progress: r.progress, lastReadAt: r.lastReadAt });
    }
    return out.slice(0, limit ?? 8);
  },
});
