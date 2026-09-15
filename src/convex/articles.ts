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
import { AI_CHAT_URL, AI_MODEL, aiApiKey } from "./aiConfig";

const AI_URL = AI_CHAT_URL;
const MODEL = AI_MODEL;
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
  textEn?: string; // extracted original text (EN/FA split pane)
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

/**
 * Reader-mode extraction ladder. r.jina.ai is tried twice (it rate-limits
 * bursts without a key); if it still refuses, we fetch the raw HTML and
 * strip tags locally — enough for sites that serve plain articles.
 */
function cleanReaderText(text: string): string {
  return text
    .replace(/\(http[s]?:\/\/[^)]+\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/#{1,4}\s/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractViaJina(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { "User-Agent": UA, Accept: "text/plain" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`jina ${res.status}`);
  const text = cleanReaderText(await res.text());
  if (text.length < 200) throw new Error("jina too short");
  return text;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

async function extractDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`direct ${res.status}`);
  const text = htmlToText(await res.text());
  if (text.length < 200) throw new Error("direct too short");
  return text;
}

/** Try the ladder in order; throw only when every rung fails. */
async function extractArticleText(url: string): Promise<string> {
  const attempts: Array<() => Promise<string>> = [
    () => extractViaJina(url, 30_000),
    () => extractViaJina(url, 45_000),
    () => extractDirect(url),
  ];
  const errors: string[] = [];
  for (const rung of attempts) {
    try {
      const text = await rung();
      if (text.length >= 200) return text;
    } catch (err) {
      errors.push(err instanceof Error ? err.message.slice(0, 80) : "failed");
    }
  }
  throw new Error(`all extractors failed: ${errors.join(" | ")}`);
}

// ─── Translation (chunked, full article) ────────────────────────────────────

async function callModel(system: string, user: string): Promise<string> {
  const apiKey = aiApiKey();
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
  opts?: { force?: boolean },
): Promise<{ ok: boolean; reason?: string }> {
  const existing = (await ctx.runQuery(internal.articles.fetchArticle, { pubId })) as
    | { status: string; textFa: string; chars: number }
    | null;
  if (
    !opts?.force &&
    existing?.status === "READY" &&
    existing.textFa.length > 0 &&
    existing.chars >= 200
  ) {
    return { ok: true, reason: "cached" };
  }
  const pub = (await ctx.runQuery(internal.articles.fetchPub, { pubId })) as
    | { url: string; title: string; summary: string }
    | null;
  if (!pub) return { ok: false, reason: "not_found" };

  // 1) Extract source text. Never silently downgrade: on hard failure of the
  //    full ladder we keep the old GOOD row (if any) and report FAILED without
  //    overwriting; only a row that never had full text gets the summary stub.
  let textEn = "";
  let failed = false;
  try {
    textEn = await extractArticleText(pub.url);
  } catch {
    failed = true;
    const hadGoodText = !!existing && existing.status === "READY" && existing.chars >= 200;
    if (hadGoodText) return { ok: false, reason: "kept_cached" };
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

/**
 * Reader entry point with retry semantics: re-run the extraction ladder when
 * the cached row is missing/stub/FAILED, or when the analyst forces it
 * ("re-extract from source" button). Overwrite is allowed for the stub case.
 */
export const openArticle = action({
  args: { pubId: v.id("publications"), force: v.optional(v.boolean()) },
  handler: async (ctx, { pubId, force }): Promise<ReaderRow | null> => {
    const res = await ensureArticleHelper(ctx as unknown as RunnerCtx, pubId, {
      force: force === true,
    });
    if (res.reason === "kept_cached") {
      // Previous good translation still intact; surface it with its original status.
      const row = (await ctx.runQuery(internal.articles.fetchArticle, { pubId })) as
        | { titleFa: string; textFa: string; textEn: string; status: string; url: string }
        | null;
      return row;
    }
    const row = (await ctx.runQuery(internal.articles.fetchArticle, { pubId })) as
      | { titleFa: string; textFa: string; textEn: string; status: string; url: string }
      | null;
    return row;
  },
});

/**
 * One-click re-extraction from the original source. Bypasses the cache,
 * re-runs the full ladder, retranslates, and restores status to READY.
 */
export const reextractArticle = action({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }): Promise<ReaderRow | null> => {
    const row = await ensureArticleHelper(ctx as unknown as RunnerCtx, pubId, { force: true });
    if (row.reason === "kept_cached") {
      return (await ctx.runQuery(internal.articles.fetchArticle, { pubId })) as ReaderRow | null;
    }
    return (await ctx.runQuery(internal.articles.fetchArticle, { pubId })) as ReaderRow | null;
  },
});

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

// ─── Board v3: triage states, priority sort, ticker, full-text search ───────
// All deterministic reads over stored rows — no scoring at render beyond
// simple arithmetic over stored evidence (rule 2).

export interface BoardItemV3 extends BoardItem {
  triage: "UNREAD" | "READING" | "READ"; // deterministic from readingStates
  progress: number; // 0..1
  priority: number; // deterministic 0..100
  autoTags: string[]; // C2 deterministic vocabulary tags
  lengthClass: "BRIEF" | "ANALYSIS" | "MAJOR_REPORT" | null; // C3
  actorSlugs: string[]; // E1 clickable graph links (max 3)
}

const TIER_BOOST: Record<string, number> = { S: 40, "A+": 32, A: 24, "B+": 16 };

/** Feed with triage + deterministic priority (tier boost + recency decay). */
export const getTopicFeedV3 = query({
  args: {
    topic: v.string(),
    limit: v.optional(v.number()),
    triage: v.optional(v.union(v.literal("UNREAD"), v.literal("READING"), v.literal("READ"))),
    sort: v.optional(v.union(v.literal("recent"), v.literal("priority"))),
  },
  handler: async (ctx, { topic, limit, triage, sort }): Promise<BoardItemV3[]> => {
    const take = (limit ?? 30) + 120; // overfetch so post-filter/sort still fills the page
    const rows = await ctx.db
      .query("publications")
      .withIndex("by_topic", (q) => q.eq("topicFa", topic))
      .order("desc")
      .take(take);
    const now = Date.now();
    const out: BoardItemV3[] = [];
    for (const pub of rows) {
      const art = await ctx.db
        .query("articleContent")
        .withIndex("by_pub", (q) => q.eq("pubId", pub._id))
        .unique();
      const rs = await ctx.db
        .query("readingStates")
        .withIndex("by_pub", (q) => q.eq("pubId", pub._id))
        .unique();
      const tier =
        (
          await ctx.db
            .query("thinkTanks")
            .withIndex("by_slug", (q) => q.eq("slug", pub.thinkTankSlug))
            .unique()
        )?.tier ?? "B+";
      const ageH = Math.max(0, (now - pub.publishedAt) / 3_600_000);
      const recency = Math.max(0, 48 - ageH); // 48h linear decay
      const priority = Math.min(100, (TIER_BOOST[tier] ?? 16) + recency);
      const tri = rs?.triage ?? "UNREAD";
      if (triage && tri !== triage) continue;
      // E1: actor mentions for this publication (clickable → graph).
      const mentions = await ctx.db
        .query("actorMentions")
        .withIndex("by_pub", (q) => q.eq("pubId", pub._id))
        .take(3);
      out.push({
        _id: pub._id,
        title: pub.title,
        url: pub.url,
        summary: pub.summary,
        publishedAt: pub.publishedAt,
        thinkTankSlug: pub.thinkTankSlug,
        topicFa: pub.topicFa ?? topic,
        hasArticle: art?.status === "READY",
        triage: tri,
        progress: rs?.progress ?? 0,
        priority: Math.round(priority),
        autoTags: pub.autoTags ?? [],
        lengthClass: pub.lengthClass ?? null,
        actorSlugs: mentions.map((m) => m.actorSlug),
      });
      if (out.length >= (limit ?? 30)) break;
    }
    if ((sort ?? "recent") === "priority") {
      out.sort((a, b) => b.priority - a.priority || b.publishedAt - a.publishedAt);
    }
    return out;
  },
});

export interface TickerRow {
  _id: string;
  title: string;
  topicFa: string;
  thinkTankSlug: string;
  publishedAt: number;
}

/** Live "just published" ticker: latest classified items across all topics. */
export const getTicker = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<TickerRow[]> => {
    const rows = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(limit ?? 14);
    return rows.map((p) => ({
      _id: p._id,
      title: p.title,
      topicFa: p.topicFa ?? "geopolitics",
      thinkTankSlug: p.thinkTankSlug,
      publishedAt: p.publishedAt,
    }));
  },
});

export interface SearchHit {
  _id: string;
  title: string;
  topicFa: string;
  thinkTankSlug: string;
  publishedAt: number;
  snippet: string; // matched fragment around the query term
  where: "TITLE" | "SUMMARY" | "FULLTEXT";
}

/** Persian/English full-text search across title, summary and cached translations. */
export const searchFullText = query({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { q, limit }): Promise<SearchHit[]> => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 3) return [];
    const max = Math.min(limit ?? 12, 25);
    const hits: SearchHit[] = [];
    // 1) Title / summary scan (recent first)
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(1500);
    for (const p of pubs) {
      if (hits.length >= max) break;
      const title = p.title.toLowerCase();
      const summary = p.summary.toLowerCase();
      if (title.includes(needle) || summary.includes(needle)) {
        const hay = title.includes(needle) ? p.title : p.summary;
        const idx = hay.toLowerCase().indexOf(needle);
        const start = Math.max(0, idx - 40);
        hits.push({
          _id: p._id,
          title: p.title,
          topicFa: p.topicFa ?? "geopolitics",
          thinkTankSlug: p.thinkTankSlug,
          publishedAt: p.publishedAt,
          snippet: (start > 0 ? "…" : "") + hay.slice(start, idx + needle.length + 60) + "…",
          where: title.includes(needle) ? "TITLE" : "SUMMARY",
        });
      }
    }
    // 2) Cached Persian full-text scan (only if not already found)
    if (hits.length < max) {
      const found = new Set(hits.map((h) => h._id));
      for (const p of pubs) {
        if (hits.length >= max) break;
        if (found.has(p._id)) continue;
        const art = await ctx.db
          .query("articleContent")
          .withIndex("by_pub", (x) => x.eq("pubId", p._id))
          .unique();
        if (!art || art.status !== "READY") continue;
        const idx = art.textFa.toLowerCase().indexOf(needle);
        if (idx < 0) continue;
        const start = Math.max(0, idx - 40);
        hits.push({
          _id: p._id,
          title: p.title,
          topicFa: p.topicFa ?? "geopolitics",
          thinkTankSlug: p.thinkTankSlug,
          publishedAt: p.publishedAt,
          snippet: (start > 0 ? "…" : "") + art.textFa.slice(start, idx + needle.length + 60) + "…",
          where: "FULLTEXT",
        });
      }
    }
    return hits;
  },
});

export interface SimilarRow {
  _id: string;
  title: string;
  thinkTankSlug: string;
  publishedAt: number;
  score: number; // 0..100 deterministic TF-IDF cosine over token sets
}

/** "More like this" — deterministic TF-IDF over title+summary tokens. */
export const getSimilar = query({
  args: { pubId: v.id("publications"), limit: v.optional(v.number()) },
  handler: async (ctx, { pubId, limit }): Promise<SimilarRow[]> => {
    const max = limit ?? 5;
    const STOP = new Set([
      "the", "of", "and", "to", "in", "for", "on", "a", "an", "is", "are", "with", "as", "by", "at", "from",
      "and", "در", "به", "از", "که", "این", "با", "برای", "است", "های", "می",
    ]);
    const toks = (s: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const raw of s.toLowerCase().split(/[\s\p{P}]+/u)) {
        if (raw.length < 3 || STOP.has(raw)) continue;
        m.set(raw, (m.get(raw) ?? 0) + 1);
      }
      return m;
    };
    const self = await ctx.db.get(pubId);
    if (!self) return [];
    const selfToks = toks(`${self.title} ${self.summary}`);
    if (selfToks.size === 0) return [];
    // Candidate pool: same topic first, then recent.
    const sameTopic = await ctx.db
      .query("publications")
      .withIndex("by_topic", (q) => q.eq("topicFa", self.topicFa ?? ""))
      .order("desc")
      .take(60);
    const pool = sameTopic.some((p) => p._id === pubId)
      ? sameTopic
      : [...sameTopic, self];
    const out: SimilarRow[] = [];
    for (const p of pool) {
      if (p._id === pubId) continue;
      const t = toks(`${p.title} ${p.summary}`);
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (const [k, va] of selfToks) na += va * va;
      for (const [k, vb] of t) {
        nb += vb * vb;
        const va = selfToks.get(k);
        if (va) dot += va * vb;
      }
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      if (denom <= 0) continue;
      const score = Math.round((dot / denom) * 100);
      if (score < 8) continue;
      out.push({ _id: p._id, title: p.title, thinkTankSlug: p.thinkTankSlug, publishedAt: p.publishedAt, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, max);
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

/** C5 key-claim highlights: the cached deterministic top sentences. */
export const getPubClaims = query({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) => {
    const pub = await ctx.db.get(pubId);
    if (!pub) return null;
    return { keyClaims: pub.keyClaims ?? [], autoTags: pub.autoTags ?? [] };
  },
});
