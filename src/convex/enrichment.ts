// Deterministic enrichment & signal layer over stored publications.
// No LLM anywhere in this file (rules 2 & 4): every score, tag, class and
// stat is a transparent function of stored rows, so results are reproducible
// and auditable. Powers board badges, the Signals strip, calibration and CSV/JSON export.

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { contentHashOf, slugifyName } from "./lib";

const DAY = 86_400_000;
const dbNow = () => Date.now();

// ─── C2 Auto-tag vocabulary (deterministic keyword → tag) ───────────────────
const TAG_VOCAB: Array<[string, RegExp]> = [
  ["deterrence", /\bdeterren|deter|بازدارندگی|بازدارندگی\b/i],
  ["sanctions", /\bsanction|embargo|تحریم/i],
  ["cyber", /\bcyber|hack|ransomware|سایبری|هکر/i],
  ["nuclear", /\bnuclear|enrichment|IAEA|هسته‌ای|هسته\b/i],
  ["missiles", /\bmissile|ballistic|cruise|موشک/i],
  ["drones", /\bdrone|UAV| unmanned|پهپاد/i],
  ["energy", /\benergy|oil|gas|OPEC|LNG|انرژی|نفت|گاز/i],
  ["trade", /\btrade|tariff|export control|تجارت|تعرفه/i],
  ["maritime", /\bstrait|hormuz|south china sea|naval|ناو|تنگه/i],
  ["Taiwan", /\btaiwan|تایوان\b/i],
  ["Iran", /\biran|tehran|ایران|تهران/i],
  ["Russia", /\brussia|moscow|putin|روسیه|مسکو/i],
  ["China", /\bchina|beijing|چین|پکن/i],
  ["US", /\bunited states|washington|pentagon|آمریکا|واشنگتن/i],
  ["NATO", /\bnato|ناتو/i],
  ["Gaza", /\bgaza|اسرائیل|غزه|israel/i],
  ["Ukraine", /\bukraine|kyiv|اوکراین/i],
  ["intelligence", /\bintelligence|espionage|MOIS|MI6|CIA|اطلاعاتی/i],
  ["terror", /\bterror|proxy militia|حشد|تروریست/i],
  ["AI-tech", /\bartificial intelligence|semiconductor|chip|هوش مصنوعی|تراشه/i],
  ["peace-talks", /\bceasefire|negotiat|talks|آتش‌بس|مذاکره/i],
];

/** Tags for a title+summary. Deterministic, order-stable, max 4. */
export function autoTagsOf(title: string, summary: string): string[] {
  const hay = `${title} ${summary}`;
  const tags: string[] = [];
  for (const [tag, re] of TAG_VOCAB) {
    if (tags.length >= 4) break;
    if (re.test(hay)) tags.push(tag);
  }
  return tags;
}

/** C3 length class from available text length (summary proxy until full text). */
export function lengthClassOf(text: string): "BRIEF" | "ANALYSIS" | "MAJOR_REPORT" {
  const n = text.length;
  if (n < 300) return "BRIEF";
  if (n < 900) return "ANALYSIS";
  return "MAJOR_REPORT";
}

/** C5 key-claim sentence scoring: position + keyword density. */
const CLAIM_WORDS = [
  "argues", "warns", "assesses", "recommends", "concludes", "estimates",
  "likely", "should", "must", "will", "risks", "urges", "claims",
  "می‌گوید", "هشدار", "ارزیابی", "توصیه", "احتمال", "باید",
];

export function keyClaimsOf(text: string, max = 3): string[] {
  const sentences = text
    .split(/(?<=[.!?؟])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 400);
  if (sentences.length === 0) return [];
  const scored = sentences.map((s, i) => {
    const lower = s.toLowerCase();
    let score = i < 3 ? 3 : i > sentences.length - 3 ? 1 : 0; // position weight
    for (const w of CLAIM_WORDS) if (lower.includes(w)) score += 2;
    return { s, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .filter((x) => x.score >= 2)
    .map((x) => x.s.slice(0, 300));
}

// ─── Hourly enrichment worker: tags + key claims + hash for recent pubs ─────

/** Backfill enrichment fields on the newest 300 publications. Idempotent. */
export const enrichRecent = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ enriched: number }> => {
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(300);
    let enriched = 0;
    for (const p of pubs) {
      if (p.autoTags && p.keyClaims && p.contentHash && p.lengthClass) continue;
      const text = `${p.title} ${p.summary}`;
      await ctx.db.patch(p._id, {
        autoTags: p.autoTags ?? autoTagsOf(p.title, p.summary),
        keyClaims: p.keyClaims ?? keyClaimsOf(p.summary || p.title),
        contentHash: p.contentHash ?? contentHashOf(p.title),
        lengthClass: p.lengthClass ?? lengthClassOf(p.summary),
      });
      enriched++;
    }
    return { enriched };
  },
});

// ─── A4 Authors: build author pages from publication author strings ─────────

/** Upsert author pages for the newest publications. Deterministic slugs. */
export const buildAuthors = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ authors: number }> => {
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(400);
    const seen = new Map<string, { tank: string; count: number; last: number }>();
    for (const p of pubs) {
      if (!p.author) continue;
      // Split multi-author bylines.
      for (const name of p.author.split(/;|,| and | & /).map((s) => s.trim())) {
        if (name.length < 4 || name.length > 80) continue;
        const slug = slugifyName(name);
        const cur = seen.get(slug);
        seen.set(slug, {
          tank: p.thinkTankSlug,
          count: (cur?.count ?? 0) + 1,
          last: Math.max(cur?.last ?? 0, p.publishedAt),
        });
      }
    }
    let authors = 0;
    for (const [slug, agg] of seen) {
      const existing = await ctx.db
        .query("authorPages")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { pubCount: agg.count, lastPubAt: agg.last });
      } else {
        await ctx.db.insert("authorPages", {
          slug,
          name: slug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          tankSlug: agg.tank,
          pubCount: agg.count,
          lastPubAt: agg.last,
        });
        authors++;
      }
    }
    return { authors };
  },
});

export const listAuthors = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("authorPages").collect();
    return rows.sort((a, b) => b.pubCount - a.pubCount).slice(0, limit ?? 40);
  },
});

export const getAuthorFeed = query({
  args: { authorSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { authorSlug, limit }) => {
    const author = await ctx.db
      .query("authorPages")
      .withIndex("by_slug", (q) => q.eq("slug", authorSlug))
      .unique();
    if (!author) return { author: null, pubs: [] };
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_thinktank", (q) => q.eq("thinkTankSlug", author.tankSlug))
      .order("desc")
      .take(400);
    const needle = author.name.toLowerCase();
    return {
      author,
      pubs: pubs
        .filter((p) => (p.author ?? "").toLowerCase().includes(needle))
        .slice(0, limit ?? 30),
    };
  },
});

// ─── B4 Author watchlist ────────────────────────────────────────────────────

const WS = "shared-workspace";

export const getAuthorWatchlist = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db.query("authorWatchlist").withIndex("by_user", (q) => q.eq("userId", WS)).collect(),
});

export const toggleAuthorWatch = mutation({
  args: { authorSlug: v.string() },
  handler: async (ctx, { authorSlug }) => {
    const rows = await ctx.db
      .query("authorWatchlist")
      .withIndex("by_user", (q) => q.eq("userId", WS))
      .collect();
    const existing = rows.find((r) => r.authorSlug === authorSlug);
    if (existing) {
      await ctx.db.delete(existing._id);
      return { watching: false };
    }
    await ctx.db.insert("authorWatchlist", { userId: WS, authorSlug, createdAt: dbNow() });
    return { watching: true };
  },
});

// ─── A6 Duplicate / cross-post detection ────────────────────────────────────

/** Shingle Jaccard over 4-word grams of titles (deterministic near-dup). */
function shingles(text: string, k = 4): Set<string> {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + k <= words.length; i++) out.add(words.slice(i, i + k).join(" "));
  if (out.size === 0 && words.length > 0) out.add(words.join(" "));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Scan recent pubs (30d) across different tanks for near-dups. */
export const scanDuplicates = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ found: number }> => {
    const cutoff = dbNow() - 30 * DAY;
    const pubs = (await ctx.db.query("publications").collect()).filter(
      (p) => p.publishedAt >= cutoff && p.title.length > 25,
    );
    const byTank = new Map<string, typeof pubs>();
    for (const p of pubs) {
      const arr = byTank.get(p.thinkTankSlug) ?? [];
      arr.push(p);
      byTank.set(p.thinkTankSlug, arr);
    }
    let found = 0;
    const tanks = [...byTank.keys()];
    const shingleCache = new Map<string, Set<string>>();
    const sh = (p: (typeof pubs)[number]) => {
      let s = shingleCache.get(p._id);
      if (!s) {
        s = shingles(p.title);
        shingleCache.set(p._id, s);
      }
      return s;
    };
    for (let i = 0; i < tanks.length; i++) {
      for (let j = i + 1; j < tanks.length; j++) {
        for (const a of byTank.get(tanks[i]) ?? []) {
          for (const b of byTank.get(tanks[j]) ?? []) {
            // Same content hash OR high shingle overlap → candidate.
            const score = a.contentHash && a.contentHash === b.contentHash ? 1 : jaccard(sh(a), sh(b));
            if (score < 0.6) continue;
            const existing = await ctx.db
              .query("dupCandidates")
              .withIndex("by_ts", (q) => q.gte("ts", 0))
              .take(4000);
            const dup = existing.find(
              (d) =>
                (d.aId === a._id && d.bId === b._id) || (d.aId === b._id && d.bId === a._id),
            );
            if (dup) continue;
            await ctx.db.insert("dupCandidates", {
              aId: a._id,
              bId: b._id,
              score: Math.round(score * 100) / 100,
              status: "OPEN",
              ts: dbNow(),
            });
            found++;
            if (found >= 40) return { found }; // bounded per run
          }
        }
      }
    }
    return { found };
  },
});

export const listDupCandidates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("dupCandidates")
      .withIndex("by_ts", (q) => q.gte("ts", 0))
      .order("desc")
      .take(limit ?? 25);
    const out = [];
    for (const d of rows) {
      const [a, b] = await Promise.all([ctx.db.get(d.aId), ctx.db.get(d.bId)]);
      if (!a || !b) continue;
      out.push({
        _id: d._id,
        score: d.score,
        status: d.status,
        a: { id: a._id, title: a.title, tank: a.thinkTankSlug, url: a.url, ts: a.publishedAt },
        b: { id: b._id, title: b.title, tank: b.thinkTankSlug, url: b.url, ts: b.publishedAt },
      });
    }
    return out;
  },
});

export const resolveDup = mutation({
  args: { id: v.id("dupCandidates"), status: v.union(v.literal("MERGED"), v.literal("REJECTED")) },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { status });
  },
});

// ─── B2/B3 Velocity + deterministic anomaly detection ───────────────────────

export const getVelocity = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    const window = days ?? 30;
    const cutoff = dbNow() - window * DAY;
    const pubs = (await ctx.db.query("publications").collect()).filter((p) => p.publishedAt >= cutoff);

    // Per-tank daily buckets.
    const perTank: Record<string, number[]> = {};
    const perTopic: Record<string, number[]> = {};
    const dayCount = window;
    const bucketOf = (ts: number) => Math.floor((dbNow() - ts) / DAY);

    for (const p of pubs) {
      const b = Math.min(dayCount - 1, bucketOf(p.publishedAt));
      if (b < 0) continue;
      (perTank[p.thinkTankSlug] ??= new Array(dayCount).fill(0))[b] += 1;
      if (p.topicFa) (perTopic[p.topicFa] ??= new Array(dayCount).fill(0))[b] += 1;
    }
    return { days: window, perTank, perTopic };
  },
});

/** Weekly z-score spikes: tank output or topic share beyond 2σ over 12 weeks. */
export const getAnomalies = query({
  args: {},
  handler: async (ctx) => {
    const pubs = (await ctx.db.query("publications").collect()).filter(
      (p) => p.publishedAt >= dbNow() - 12 * 7 * DAY,
    );
    const weekOf = (ts: number) => Math.floor((dbNow() - ts) / (7 * DAY));
    const weekly: Record<string, number[]> = {};
    for (const p of pubs) {
      const w = weekOf(p.publishedAt);
      if (w >= 12) continue;
      (weekly[p.thinkTankSlug] ??= new Array(12).fill(0))[11 - w] += 1;
    }
    const anomalies: Array<{ slug: string; week: number; count: number; z: number }> = [];
    for (const [slug, counts] of Object.entries(weekly)) {
      const n = counts.length;
      const mean = counts.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
      counts.forEach((c, i) => {
        const z = (c - mean) / sd;
        if (z >= 2 && i === 11) anomalies.push({ slug, week: i, count: c, z: Math.round(z * 10) / 10 });
      });
    }
    return anomalies.sort((a, b) => b.z - a.z).slice(0, 8);
  },
});

// ─── B5 First movers: which tank published a shared story first ─────────────

export const getFirstMovers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const cutoff = dbNow() - 14 * DAY;
    const pubs = (await ctx.db.query("publications").collect()).filter(
      (p) => p.publishedAt >= cutoff && p.title.length > 25,
    );
    // Cluster by contentHash, then report the earliest + deltas.
    const groups = new Map<string, typeof pubs>();
    for (const p of pubs) {
      if (!p.contentHash) continue;
      const arr = groups.get(p.contentHash) ?? [];
      arr.push(p);
      groups.set(p.contentHash, arr);
    }
    const out = [];
    for (const [, grp] of groups) {
      if (grp.length < 2) continue;
      const sorted = [...grp].sort((a, b) => a.publishedAt - b.publishedAt);
      const first = sorted[0];
      out.push({
        hash: first.contentHash,
        firstTank: first.thinkTankSlug,
        firstTs: first.publishedAt,
        firstTitle: first.title,
        followers: sorted.slice(1, 6).map((p) => ({
          tank: p.thinkTankSlug,
          lagH: Math.round(((p.publishedAt - first.publishedAt) / 3_600_000) * 10) / 10,
          title: p.title,
        })),
      });
    }
    return out.sort((a, b) => b.firstTs - a.firstTs).slice(0, limit ?? 12);
  },
});

// ─── E5 Coverage heat by actor × tank (mentions matrix) ─────────────────────

export const getCoverageHeat = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const mentions = await ctx.db.query("actorMentions").collect();
    const matrix: Record<string, Record<string, number>> = {};
    for (const m of mentions) {
      (matrix[m.actorSlug] ??= {})[m.tankSlug] = (matrix[m.actorSlug]?.[m.tankSlug] ?? 0) + 1;
    }
    // Rank actors by total coverage; return top N with per-tank counts.
    const rows = Object.entries(matrix)
      .map(([actorSlug, perTank]) => ({
        actorSlug,
        total: Object.values(perTank).reduce((a, b) => a + b, 0),
        perTank,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit ?? 18);
    const tankTotals: Record<string, number> = {};
    for (const r of rows)
      for (const [tank, n] of Object.entries(r.perTank))
        tankTotals[tank] = (tankTotals[tank] ?? 0) + n;
    return { rows, tankTotals };
  },
});

// ─── E4 Leading/lagging calibration (deterministic proxy) ───────────────────
// For each tank: among its recent publications, how many contain content that
// appears in a relationEvent within ±14d on the same pair — publications
// BEFORE the event count as "leading" (they predicted/flagged it).

export const getCalibration = query({
  args: {},
  handler: async (ctx) => {
    const DAY2 = DAY;
    const pubs = (await ctx.db.query("publications").collect()).filter(
      (p) => p.publishedAt >= dbNow() - 120 * DAY2,
    );
    const events = await ctx.db.query("relationEvents").collect();
    const eventTs = events.map((e) => e.timestamp);
    const eventTexts = events.map((e) => `${e.title} ${e.summary}`.toLowerCase());

    const perTank: Record<string, { pubs: number; aligned: number; leading: number }> = {};
    for (const p of pubs.slice(0, 800)) {
      const s = (perTank[p.thinkTankSlug] ??= { pubs: 0, aligned: 0, leading: 0 });
      s.pubs++;
      const hay = `${p.title} ${p.summary}`.toLowerCase();
      // Lexical anchor: share ≥2 distinctive 4-grams with an event text.
      const pSh = shingles(`${p.title} ${p.summary}`, 4);
      for (let i = 0; i < eventTexts.length; i++) {
        const eSh = shingles(eventTexts[i], 4);
        let inter = 0;
        for (const x of pSh) if (eSh.has(x)) inter++;
        if (inter < 2) continue;
        s.aligned++;
        if (p.publishedAt < eventTs[i]) s.leading++;
        break;
      }
    }
    return Object.entries(perTank)
      .map(([slug, s]) => ({
        slug,
        pubs: s.pubs,
        aligned: s.aligned,
        leading: s.leading,
        leadingRate: s.aligned > 0 ? Math.round((s.leading / s.aligned) * 100) : 0,
      }))
      .filter((r) => r.aligned >= 2)
      .sort((a, b) => b.leadingRate - a.leadingRate)
      .slice(0, 15);
  },
});

// ─── J1 Corpus export (CSV/JSON over the current filter) ────────────────────

export const exportCorpus = query({
  args: {
    tankSlug: v.optional(v.string()),
    topicFa: v.optional(v.string()),
    days: v.optional(v.number()),
    format: v.optional(v.union(v.literal("csv"), v.literal("json"))),
  },
  handler: async (ctx, { tankSlug, topicFa, days, format }) => {
    const cutoff = days ? dbNow() - days * DAY : 0;
    let pubs = await ctx.db.query("publications").collect();
    if (tankSlug) pubs = pubs.filter((p) => p.thinkTankSlug === tankSlug);
    if (topicFa) pubs = pubs.filter((p) => p.topicFa === topicFa);
    if (cutoff) pubs = pubs.filter((p) => p.publishedAt >= cutoff);
    pubs.sort((a, b) => b.publishedAt - a.publishedAt);
    const rows = pubs.slice(0, 2000).map((p) => ({
      id: p._id,
      tank: p.thinkTankSlug,
      title: p.title,
      url: p.url,
      publishedAt: new Date(p.publishedAt).toISOString(),
      topicFa: p.topicFa ?? "",
      author: p.author ?? "",
      tags: (p.autoTags ?? []).join("|"),
      lengthClass: p.lengthClass ?? "",
    }));
    if (format === "csv") {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const header = "id,tank,title,url,publishedAt,topicFa,author,tags,lengthClass";
      const body = rows
        .map((r) =>
          [r.id, r.tank, r.title, r.url, r.publishedAt, r.topicFa, r.author, r.tags, r.lengthClass]
            .map((x) => esc(String(x)))
            .join(","),
        )
        .join("\n");
      return { mime: "text/csv;charset=utf-8", body: `${header}\n${body}`, count: rows.length };
    }
    return { mime: "application/json;charset=utf-8", body: JSON.stringify(rows, null, 2), count: rows.length };
  },
});

// ─── K1 Translation provenance panel data ───────────────────────────────────

export const getTranslationProvenance = query({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) => {
    const content = await ctx.db
      .query("articleContent")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .unique();
    if (!content) return null;
    return {
      model: content.model,
      chars: content.chars,
      status: content.status,
      createdAt: content.createdAt,
      textFaLen: content.textFa.length,
      textEnLen: content.textEn.length,
    };
  },
});

/** Invalidate a stored article so the next open re-extracts + re-translates. */
export const retranslate = mutation({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) => {
    const content = await ctx.db
      .query("articleContent")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .unique();
    if (content) await ctx.db.delete(content._id);
    return { cleared: true };
  },
});

// ─── K4 Source-of-source chain: article refs (cited links) ──────────────────

/** Harvest citations from stored article bodies (deterministic link regex). */
export const harvestRefs = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ done: number }> => {
    const contents = await ctx.db.query("articleContent").collect();
    let done = 0;
    for (const c of contents.slice(0, 60)) {
      const existing = await ctx.db
        .query("articleRefs")
        .withIndex("by_pub", (q) => q.eq("pubId", c.pubId))
        .take(1);
      if (existing.length > 0) continue;
      const urls = [...new Set(c.textEn.match(/https?:\/\/[^\s)"'<>\]]+/g) ?? [])]
        .filter((u) => !u.includes("doi.org") || true)
        .slice(0, 20)
        .map((u) => {
          let host = "";
          try {
            host = new URL(u).hostname;
          } catch {
            host = "";
          }
          const tank = c.url ? safeHost(c.url) : "";
          const kind = /\.(gov|mil)$/.test(host) ? "GOV_MIL" : host && host === tank ? "INTERNAL" : "EXTERNAL";
          return { url: u.slice(0, 400), kind: kind as "EXTERNAL" | "INTERNAL" | "GOV_MIL" };
        })
        .filter((r) => r.url.length > 12);
      if (urls.length === 0) continue;
      for (const r of urls) {
        await ctx.db.insert("articleRefs", { pubId: c.pubId, url: r.url, kind: r.kind });
      }
      done++;
    }
    return { done };
  },
});

export const getArticleRefs = query({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) =>
    await ctx.db
      .query("articleRefs")
      .withIndex("by_pub", (q) => q.eq("pubId", pubId))
      .collect(),
});

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
