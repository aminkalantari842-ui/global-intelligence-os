// Retrieval + persistence layer for AI analysis. Kept separate from
// aiAnalysis.ts (actions) to avoid Convex self-referential type inference.
// All reads are plain queries over stored rows; saveArtifact writes an
// ASSESSMENT-class artifact with full provenance (pubIds, model, ts).

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AI_MODEL } from "./aiConfig";

const MODEL = AI_MODEL;

// ─── Reads ──────────────────────────────────────────────────────────────────

export const pubFetch = query({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) => {
    const p = await ctx.db.get(pubId);
    if (!p) return null;
    const content = await ctx.db
      .query("articleContent")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .unique();
    return {
      _id: p._id,
      title: p.title,
      summary: p.summary,
      tank: p.thinkTankSlug,
      text: content?.textFa || content?.textEn || p.summary,
      hasFullText: Boolean(content),
    };
  },
});

export const pubFetchMany = query({
  args: { pubIds: v.array(v.id("publications")) },
  handler: async (ctx, { pubIds }) => {
    const out = [];
    for (const id of pubIds.slice(0, 6)) {
      const p = await ctx.db.get(id);
      if (!p) continue;
      const content = await ctx.db
        .query("articleContent")
        .withIndex("by_pub", (q) => q.eq("pubId", id))
        .unique();
      out.push({
        _id: p._id,
        title: p.title,
        tank: p.thinkTankSlug,
        text: (content?.textFa || content?.textEn || p.summary).slice(0, 9000),
      });
    }
    return out;
  },
});

export const topicPubs = query({
  args: { topic: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { topic, limit }) => {
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_topic", (q) => q.eq("topicFa", topic))
      .order("desc")
      .take(limit ?? 8);
    const out = [];
    for (const p of pubs) {
      const content = await ctx.db
        .query("articleContent")
        .withIndex("by_pub", (q) => q.eq("pubId", p._id))
        .unique();
      out.push({
        _id: p._id,
        title: p.title,
        tank: p.thinkTankSlug,
        text: content?.textFa || content?.textEn || p.summary,
      });
    }
    return out;
  },
});

export const recentPubs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(limit ?? 12);
    const out = [];
    for (const p of pubs) {
      const content = await ctx.db
        .query("articleContent")
        .withIndex("by_pub", (q) => q.eq("pubId", p._id))
        .unique();
      out.push({
        _id: p._id,
        title: p.title,
        tank: p.thinkTankSlug,
        text: content?.textFa || content?.textEn || "",
      });
    }
    return out;
  },
});

export const retrievalCorpus = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(limit ?? 250);
    const out = [];
    for (const p of pubs) {
      const content = await ctx.db
        .query("articleContent")
        .withIndex("by_pub", (q) => q.eq("pubId", p._id))
        .unique();
      out.push({
        _id: p._id,
        title: p.title,
        tank: p.thinkTankSlug,
        text: content?.textFa || content?.textEn || p.summary,
        ts: p.publishedAt,
      });
    }
    return out;
  },
});

export const digestCorpus = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 36 * 3_600_000;
    const pubs = (await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(120))
      .filter((p) => p.publishedAt >= cutoff);
    return pubs.slice(0, 14).map((p) => ({
      _id: p._id,
      title: p.title,
      tank: p.thinkTankSlug,
      summary: p.summary,
      topicFa: p.topicFa,
      ts: p.publishedAt,
    }));
  },
});

// Cached-artifact lookup by exact (pubIds, kind) — used by the per-article
// knowledge graph so re-opening an article costs zero model calls.
export const getArtifact = query({
  args: {
    pubIds: v.array(v.id("publications")),
    kind: v.union(
      v.literal("ARTICLE_GRAPH"),
      v.literal("BRIEF"),
      v.literal("THESIS"),
      v.literal("RED_TEAM"),
      v.literal("SUMMARY"),
      v.literal("CHAT"),
    ),
  },
  handler: async (ctx, { pubIds, kind }) => {
    const rows = await ctx.db
      .query("aiArtifacts")
      .withIndex("by_pubs", (q) => q.eq("pubIds", pubIds))
      .collect();
    return rows.filter((r) => r.kind === kind).map((r) => ({ text: r.text, model: r.model, ts: r.ts }));
  },
});

// ─── Artifact persistence (ASSESSMENT class, full provenance) ──────────────

export const saveArtifact = mutation({
  args: {
    pubIds: v.array(v.id("publications")),
    kind: v.union(
      v.literal("BRIEF"), v.literal("THESIS"), v.literal("RED_TEAM"),
      v.literal("SUMMARY"), v.literal("COMPARE"), v.literal("RADAR"),
      v.literal("TREND"), v.literal("DIGEST"), v.literal("CORPUS_QA"),
      v.literal("CHAT"), v.literal("ARTICLE_GRAPH"),
    ),
    text: v.string(),
    model: v.string(),
    level: v.optional(v.string()),
    query: v.optional(v.string()),
  },
  handler: async (ctx, { pubIds, kind, text, model, level, query }) => {
    const existing = await ctx.db
      .query("aiArtifacts")
      .withIndex("by_pubs", (q) => q.eq("pubIds", pubIds))
      .collect();
    for (const e of existing) {
      if (e.kind === kind && e.level === level && e.query === query) {
        await ctx.db.delete(e._id);
      }
    }
    return await ctx.db.insert("aiArtifacts", {
      pubIds,
      kind,
      text,
      model,
      level,
      query,
      ts: Date.now(),
    });
  },
});

export const MODEL_NAME = MODEL;
