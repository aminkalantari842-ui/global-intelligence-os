// Full-text article pipeline: real extraction, deterministic topic
// classification, and cached Persian full-text translation.
//
// Extraction: r.jina.ai reader-mode proxy converts any article URL to clean
// markdown text — works against the think tanks that block raw scrapers
// (CSIS, RAND, …). Source URL is always stored (rule 5, provenance).
//
// Classification: deterministic Persian keyword scoring over title+summary —
// no LLM in the taxonomy loop (rules 3 & 4). Every publication lands in
// exactly one topic column (highest score wins, ties break by priority).
//
// Translation: full source text → Persian via TokenRouter, chunked for long
// articles, cached per publication (rule 9).

import { internalAction, internalMutation, internalQuery, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const AI_URL = "https://api.tokenrouter.com/v1/chat/completions";
const MODEL = "z-ai/glm-5.3-free";
const SEPARATOR = "\n@@FA@@\n";
const CHUNK_CHARS = 3500; // per-request source budget (safe for context)

interface ArticleRow {
  status: string;
  textFa: string;
  titleFa: string;
  url: string;
  [key: string]: unknown;
}

interface ReaderRow {
  titleFa: string;
  textFa: string;
  status: string;
  url: string;
}

// ─── Persian topic taxonomy (deterministic classifier) ──────────────────────

interface TopicDef {
  id: string;
  keywords: string[];
}

const TOPICS: TopicDef[] = [
  {
    id: "military",
    keywords: [
      "military", "defense", "defence", "army", "navy", "air force", "missile",
      "drone", "strike", "war", "warfare", "combat", "troops", "soldier",
      "nuclear", "deterren", "arsenal", "weapon", "artillery", "brigade",
      "military operation", "ceasefire", "offensive", "airbase", "warship",
    ],
  },
  {
    id: "security",
    keywords: [
      "security", "intelligence", "terror", "jihadis", "militant", "insurgen",
      "cyber", "espionage", "spy", "hacking", "counterterrorism", "radical",
      "extremis", "assassin", "sabotage", "hostage", "proliferation",
      "sanction evasion", "border security", "houthi", "hezbollah", "hamas",
      "proxy",
    ],
  },
  {
    id: "geopolitics",
    keywords: [
      "geopolitic", "foreign policy", "diploma", "summit", "negotiation",
      "treaty", "alliance", "nato", "un security council", "bilateral",
      "multilateral", "strategic competition", "great power", "sphere of influence",
      "regional order", "normalization", "embargo", "statecraft",
    ],
  },
  {
    id: "economy",
    keywords: [
      "econom", "trade", "tariff", "inflation", "gdp", "market", "investment",
      "opec", "oil price", "gas price", "currency", "banking", "finance",
      "budget", "debt", "growth forecast", "recession", "supply chain",
      "commerce", "export", "import", "wto", "imf", "world bank",
    ],
  },
  {
    id: "energy",
    keywords: [
      "energy", "oil", "natural gas", "lng", "petroleum", "renewable",
      "solar", "wind power", "nuclear deal", "electricity grid", "pipeline",
      "strait of hormuz", "crude", "refinery", "energy security",
      "energy transition", "barrel",
    ],
  },
  {
    id: "tech",
    keywords: [
      "artificial intelligence", " ai ", "chip", "semiconductor", "technology",
      "space", "satellite", "quantum", "biotech", "surveillance tech",
      "export controls", "innovation", "digital", "platform regulation",
      "crypto", "blockchain", "hypersonic tech",
    ],
  },
  {
    id: "governance",
    keywords: [
      "election", "governance", "parliament", "constitution", "human rights",
      "protest", "civil society", "corruption", "judicial", "authoritarian",
      "democra", "referendum", "legislation", "policy reform", "migration",
      "refugee", "public health", "pandemic", "climate policy",
    ],
  },
];

/** Deterministic Persian keyword classifier — highest score wins. */
export function classifyTopicFa(title: string, summary: string): string {
  const hay = ` ${title.toLowerCase()} ${summary.toLowerCase()} `;
  let best = "geopolitics"; // neutral default column
  let bestScore = 0;
  let bestPriority = -1;

  for (let i = 0; i < TOPICS.length; i++) {
    const topic = TOPICS[i];
    let score = 0;
    for (const kw of topic.keywords) {
      if (hay.includes(kw)) score += kw.includes(" ") ? 2 : 1;
    }
    // Ties break by earlier taxonomy priority (military > security > …).
    if (score > bestScore || (score === bestScore && score > 0 && bestPriority === -1)) {
      best = topic.id;
      bestScore = score;
      bestPriority = i;
    } else if (score > 0 && bestScore === 0) {
      best = topic.id;
      bestScore = score;
      bestPriority = i;
    }
  }
  return best;
}

// ─── Extraction ─────────────────────────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Reader-mode extraction via r.jina.ai — clean text, bypasses bot walls. */
async function extractArticleText(url: string): Promise<string> {
  const readerUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(readerUrl, {
    headers: { "User-Agent": UA, Accept: "text/plain" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`extract ${res.status}`);
  const text = await res.text();
  // Trim navigation boilerplate markers the reader adds; keep the substance.
  return text
    .replace(/\(http[s]?:\/\/[^)]+\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/#{1,4}\s/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Translation (chunked, full article) ────────────────────────────────────

async function callModel(system: string, user: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY_NOT_CONFIGURED");
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI returned no content");
  return content;
}

const CHUNK_SYSTEM =
  "You are a professional Persian (Farsi) translator of geopolitical and " +
  "think-tank analysis. Translate the user's text into fluent formal Persian. " +
  "Keep proper nouns accurate with their conventional Persian renderings. " +
  "Output ONLY the translation — no commentary, no notes.";

async function translateFull(text: string): Promise<string> {
  const chunks: string[] = [];
  let rest = text.slice(0, 40_000); // hard cap: very long paywalls
  while (rest.length > 0) {
    chunks.push(rest.slice(0, CHUNK_CHARS));
    rest = rest.slice(CHUNK_CHARS);
  }
  const parts: string[] = [];
  for (const chunk of chunks) {
    parts.push(await callModel(CHUNK_SYSTEM, chunk));
  }
  return parts.join("\n\n");
}

// ─── Convex functions ───────────────────────────────────────────────────────

/** Get cached article row for a publication. */
export const fetchArticle = internalQuery({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }): Promise<ArticleRow | null> => {
    return await ctx.db
      .query("articleContent")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .unique();
  },
});

/**
 * Shared pipeline: extract (if needed) → translate → cache. Plain helper —
 * Convex actions cannot invoke other actions, so both the reader entry point
 * and the cron worker call this function directly.
 */
interface RunnerCtx {
  runQuery: (ref: any, args: any) => Promise<any>;
  runMutation: (ref: any, args: any) => Promise<any>;
}

async function ensureArticleHelper(
  ctx: RunnerCtx,
  pubId: any,
): Promise<{ ok: boolean; reason?: string }> {
  const existing = (await ctx.runQuery(internal.articles.fetchArticle, { pubId })) as
    | { status: string; textFa: string }
    | null;
  if (existing?.status === "READY" && existing.textFa.length > 0) {
    return { ok: true, reason: "cached" };
  }

  const pub = (await ctx.runQuery(internal.articles.fetchPub, { pubId })) as
    | { url: string; title: string; summary: string }
    | null;
  if (!pub) return { ok: false, reason: "not_found" };

  // 1) Extract source text (fall back to RSS summary on hard failure).
  let textEn = "";
  let failed = false;
  try {
    textEn = await extractArticleText(pub.url);
    if (textEn.length < 200) throw new Error("too short");
  } catch {
    failed = true;
    textEn = pub.summary ?? "";
  }
  if (!textEn.trim()) return { ok: false, reason: "empty" };

  // 2) Title+lede first (fast visible output), then the full body.
  const head = await callModel(
    "You are a professional Persian (Farsi) translator. Output ONLY the " +
      "translation, no commentary.",
    `Title: ${pub.title}\n\nLede: ${textEn.slice(0, 1200)}`,
  );

  // 3) Full body translation (chunked).
  const bodyFa = failed ? head : await translateFull(textEn);

  await ctx.runMutation(internal.articles.storeArticle, {
    pubId,
    url: pub.url,
    textEn: textEn.slice(0, 40_000),
    titleFa: head.split("\n")[0]?.trim() ?? pub.title,
    textFa: `${head}\n\n${bodyFa}`.slice(0, 120_000),
    model: MODEL,
    status: failed ? "FAILED" : "READY",
    chars: textEn.length,
  });
  return { ok: true, reason: failed ? "summary_fallback" : "extracted" };
}

export const fetchPub = internalQuery({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }): Promise<any> => {
    return await ctx.db.get(pubId);
  },
});

export const storeArticle = internalMutation({
  args: {
    pubId: v.id("publications"),
    url: v.string(),
    textEn: v.string(),
    titleFa: v.string(),
    textFa: v.string(),
    model: v.string(),
    status: v.union(v.literal("READY"), v.literal("FAILED")),
    chars: v.number(),
  },
  handler: async (ctx, row): Promise<any> => {
    const existing = await ctx.db
      .query("articleContent")
      .withIndex("by_pub", (q) => q.eq("pubId", row.pubId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("articleContent", { ...row, createdAt: Date.now() });
  },
});

/** Topic classification for one publication (deterministic). */
export const classifyPub = internalMutation({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }): Promise<string | null> => {
    const pub = await ctx.db.get(pubId);
    if (!pub) return null;
    const topicFa = classifyTopicFa(pub.title, pub.summary);
    await ctx.db.patch(pubId, { topicFa });
    return topicFa;
  },
});

/** Batch classifier: fills missing topicFa on the newest publications. */
export const classifyRecent = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ classified: number }> => {
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(400);
    let classified = 0;
    for (const pub of pubs) {
      if (pub.topicFa) continue;
      const topicFa = classifyTopicFa(pub.title, pub.summary);
      await ctx.db.patch(pub._id, { topicFa });
      classified++;
    }
    return { classified };
  },
});

/**
 * Auto-translate worker: classifies recent items, then ensures the newest
 * articles have full Persian text. Bounded per run.
 */
export const autoTranslateBatch = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<{ processed: number }> => {
    const max = Math.min(limit ?? 6, 12);
    const pubs = (await (ctx as unknown as RunnerCtx).runQuery(internal.articles.listRecent, {})) as Array<{
      _id: any;
      url: string;
      title: string;
      summary: string;
      topicFa?: string;
    }>;

    // Classify anything unclassified first (free — deterministic).
    for (const p of pubs) {
      if (!p.topicFa) {
        await ctx.runMutation(internal.articles.classifyPub, { pubId: p._id });
      }
    }

    let processed = 0;
    for (const p of pubs) {
      if (processed >= max) break;
      const existing = (await ctx.runQuery(internal.articles.fetchArticle, {
        pubId: p._id,
      })) as { status: string } | null;
      if (existing?.status === "READY") continue;
      try {
        await ensureArticleHelper(ctx as unknown as RunnerCtx, p._id);
        processed++;
      } catch {
        continue; // keep the batch alive on individual failures
      }
    }
    return { processed };
  },
});

export const listRecent = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<any>> => {
    return await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(60);
  },
});

/**
 * Reader entry point: ensures the full Persian article exists (extract →
 * translate → cache) and returns it. Cached rows return instantly.
 */
export const openArticle = action({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }): Promise<ReaderRow | null> => {
    await ensureArticleHelper(ctx as unknown as RunnerCtx, pubId);
    const row = (await ctx.runQuery(internal.articles.fetchArticle, { pubId })) as
      | { titleFa: string; textFa: string; status: string; url: string }
      | null;
    return row;
  },
});

// ─── Public queries for the topic board ─────────────────────────────────────
// Board feeds are pure reads over classified publications; the heavy
// extraction/translation lives in actions above.

import { query } from "./_generated/server";

export interface BoardItem {
  _id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: number;
  thinkTankSlug: string;
  topicFa: string;
  hasArticle: boolean; // full Persian text already cached?
}

/** One page of classified publications per topic for the vertical columns. */
export const getTopicFeed = query({
  args: { topic: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { topic, limit }): Promise<BoardItem[]> => {
    const rows = await ctx.db
      .query("publications")
      .withIndex("by_topic", (q) => q.eq("topicFa", topic))
      .order("desc")
      .take(limit ?? 30);
    const out: BoardItem[] = [];
    for (const pub of rows) {
      const art = await ctx.db
        .query("articleContent")
        .withIndex("by_pub", (q) => q.eq("pubId", pub._id))
        .unique();
      out.push({
        _id: pub._id,
        title: pub.title,
        url: pub.url,
        summary: pub.summary,
        publishedAt: pub.publishedAt,
        thinkTankSlug: pub.thinkTankSlug,
        topicFa: pub.topicFa ?? topic,
        hasArticle: art?.status === "READY",
      });
    }
    return out;
  },
});

/** Sidebar badge: how many new items per topic in the last N hours. */
export const getTopicCounts = query({
  args: { hours: v.optional(v.number()) },
  handler: async (ctx, { hours }): Promise<Record<string, number>> => {
    const windowMs = (hours ?? 24) * 3_600_000;
    const cutoff = Date.now() - windowMs;
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(600);
    const counts: Record<string, number> = {};
    for (const p of pubs) {
      if (p.publishedAt < cutoff) break;
      const t = p.topicFa ?? "geopolitics";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  },
});
