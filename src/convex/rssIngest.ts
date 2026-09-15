import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({ ignoreAttributes: false });

interface FeedItem {
  title: string;
  link: string;
  summary: string;
  publishedAt: number;
  topics: string[];
  author?: string;
}

/** Stable browser-like UA — some CDNs reject unknown agents outright. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Fetch a feed with timeout; returns parsed items or []. */
async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
  const res = await fetch(feedUrl, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      "User-Agent": UA,
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseFeed(xml);
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Extract a plain-text author from RSS/Atom author fields. */
function extractAuthor(raw: Record<string, unknown>): string | undefined {
  const candidates: unknown[] = [
    raw["dc:creator"],
    raw.author,
    (raw as Record<string, unknown>)["itunes:author"],
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return stripCdata(c).replace(/<[^>]+>/g, "").trim().slice(0, 120);
    }
    if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      const name = o.name ?? o["#text"];
      if (typeof name === "string" && name.trim()) {
        return stripCdata(name).trim().slice(0, 120);
      }
    }
  }
  return undefined;
}

/** Sitemap: newest <url> entries (loc + lastmod) as pseudo-items. */
function parseSitemap(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  try {
    const doc = xmlParser.parse(xml) as Record<string, unknown>;
    const set = (doc.urlset as Record<string, unknown>)?.url;
    const urls: Record<string, unknown>[] = set
      ? Array.isArray(set) ? set : [set]
      : [];
    for (const u of urls) {
      const loc = typeof u.loc === "string" ? u.loc.trim() : "";
      if (!loc) continue;
      const lastmod = typeof u.lastmod === "string" ? new Date(u.lastmod).getTime() : NaN;
      const slugPart = loc.replace(/\/$/, "").split("/").pop() ?? "";
      const title = decodeURIComponent(slugPart)
        .replace(/[-_]+/g, " ")
        .replace(/\.(html?|php|aspx)$/i, "")
        .trim()
        .slice(0, 160);
      if (!title) continue;
      items.push({
        title,
        link: loc,
        summary: "",
        publishedAt: Number.isFinite(lastmod) ? lastmod : Date.now(),
        topics: [],
      });
    }
  } catch {
    /* skip malformed */
  }
  return items;
}

function parseFeed(xml: string): FeedItem[] {
  // Sitemap detection first.
  if (/<urlset/i.test(xml.slice(0, 500))) return parseSitemap(xml);

  const items: FeedItem[] = [];
  try {
    const doc = xmlParser.parse(xml) as Record<string, unknown>;
    const channel = (doc.rss as Record<string, unknown>)?.channel as Record<string, unknown> | undefined;
    const rawEntries = channel?.item ?? (doc.feed as Record<string, unknown>)?.entry;
    const rawItems: Record<string, unknown>[] = rawEntries
      ? Array.isArray(rawEntries) ? rawEntries : [rawEntries]
      : [];
    for (const raw of rawItems) {
      const title = stripCdata(typeof raw.title === "string" ? raw.title : "").trim();
      let link = "";
      if (typeof raw.link === "string") link = raw.link;
      else if (raw.link && typeof raw.link === "object") {
        const l = raw.link as Record<string, unknown>;
        link = (l["@_href"] as string) ?? (l["#text"] as string) ?? "";
      }
      const descRaw = raw.description ?? raw.summary ?? raw["content:encoded"] ?? raw.content;
      const summary =
        typeof descRaw === "string"
          ? stripCdata(descRaw).replace(/<[^>]+>/g, "").trim().slice(0, 600)
          : "";
      const dateStr = raw.pubDate ?? raw.published ?? raw.updated;
      const publishedAt = typeof dateStr === "string" ? new Date(dateStr).getTime() || Date.now() : Date.now();
      const catRaw = raw.category;
      const categories: string[] = Array.isArray(catRaw)
        ? catRaw
            .map((c: unknown) =>
              typeof c === "string"
                ? c
                : typeof c === "object" && c && "#text" in (c as object)
                  ? String((c as Record<string, unknown>)["#text"])
                  : "",
            )
            .filter(Boolean)
            .slice(0, 5)
        : typeof catRaw === "string"
          ? [stripCdata(catRaw).trim()]
          : [];
      const author = extractAuthor(raw);
      if (title && link) items.push({ title, link, summary, publishedAt, topics: categories, author });
    }
  } catch {
    /* skip malformed feeds */
  }
  return items;
}

/**
 * Fallback mirror: Google News RSS restricted to the institution's domain.
 * Used when a first-party feed is unreachable, blocked, or returns HTML —
 * a very common pattern for think-tank CDNs with bot protection.
 */
function mirrorUrl(website?: string): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    if (!host || host.includes("news.google.com")) return null;
    return `https://news.google.com/rss/search?q=site:${host}&hl=en-US&gl=US&ceid=US:en`;
  } catch {
    return null;
  }
}

/**
 * Second-chance mirror: Bing News RSS for the same domain. Unlike Google
 * News, Bing wraps links in apiclick.aspx with the real URL in the `url`
 * query parameter — recoverable, so extraction can reach the original
 * article. Toggled as an extra rung, never replaces a healthy primary feed.
 */
function bingMirrorUrl(website?: string): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    if (!host || host.includes("bing.com")) return null;
    return `https://www.bing.com/news/search?q=site:${encodeURIComponent(host)}&format=RSS`;
  } catch {
    return null;
  }
}

/** Run promise-producing tasks with bounded parallelism. */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface TankFetchResult {
  slug: string;
  name: string;
  ok: boolean;
  items: number;
  source: "primary" | "fallback" | "none";
  latencyMs: number;
  error?: string;
}

interface TankRow {
  slug: string;
  name: string;
  website?: string;
  feedUrl: string;
}

/**
 * Unwrap aggregator redirect wrappers so stored article URLs point at the
 * real publisher page (extraction must reach the original think tank).
 *
 *  - Bing News apiclick.aspx: real URL in the `url` query parameter.
 *  - Google News /rss/articles/<id>: old-format ids are base64 payloads that
 *    may contain the URL inline; new-format ids (AU_yq…) are opaque and
 *    cannot be decoded server-side anymore — those are left untouched and
 *    resolve only through the Bing mirror at ingest time.
 */
export function unwrapAggregatorUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("bing.com")) {
      const real = u.searchParams.get("url");
      if (real && /^https?:\/\//.test(real)) return real;
    }
    if (u.hostname.includes("news.google.com")) {
      const m = u.pathname.match(/\/articles\/([A-Za-z0-9_-]+)/);
      if (m) {
        let b = m[1].replace(/-/g, "+").replace(/_/g, "/");
        b += "=".repeat((4 - (b.length % 4)) % 4);
        try {
          const raw = atob(b);
          const hit = raw.match(/https?:\/\/[\x20-\x7e]+/);
          if (hit) return hit[0].split(/\s/)[0];
        } catch {
          /* not decodable — leave as-is */
        }
      }
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Core refresh shared by the public action, single-tank action, and cron.
 * Tracks per-source health: latency, item count, error streak, last error.
 */
async function refreshAllTanks(
  runQuery: (ref: unknown, args: object) => Promise<unknown>,
  runMutation: (ref: unknown, args: object) => Promise<unknown>,
  onlySlug?: string,
): Promise<{ refreshed: number; failed: number; fallbackUsed: number; total: number; inserted: number; empty: TankFetchResult[] }> {
  const allTanks = (await runQuery(api.thinkTanks.listEnabled, {})) as Array<
    TankRow & { _id: unknown }
  >;
  const tanks = onlySlug ? allTanks.filter((t) => t.slug === onlySlug) : allTanks;

  let inserted = 0;

  const results: TankFetchResult[] = await pooled(tanks, 6, async (tank) => {
    const t0 = Date.now();
    try {
      // 1) Primary feed
      let feedItems = await fetchFeed(tank.feedUrl);
      let source: TankFetchResult["source"] = "primary";

      // 2) Fallback: Google News domain mirror when primary is blocked/empty
      if (feedItems.length === 0) {
        const mirror = mirrorUrl(tank.website);
        if (mirror) {
          feedItems = await fetchFeed(mirror);
          if (feedItems.length > 0) source = "fallback";
        }
      }

      // 2b) Second chance: Bing News mirror — its links carry the real URL in
      // a query param, so extraction can actually reach the publisher page
      // (Google News new-format ids cannot be decoded server-side anymore).
      if (feedItems.length === 0) {
        const bing = bingMirrorUrl(tank.website);
        if (bing) {
          feedItems = (await fetchFeed(bing)).map((it) => ({ ...it, link: unwrapAggregatorUrl(it.link) }));
          if (feedItems.length > 0) source = "fallback";
        }
      }

      const latencyMs = Date.now() - t0;
      const fresh = feedItems.slice(0, 25);
      if (fresh.length > 0) {
        // One batch mutation per tank: upserts + mention extraction +
        // lastFetched + health counters in a single function call.
        const res = (await runMutation(api.thinkTanks.ingestBatch, {
          tankSlug: tank.slug,
          items: fresh.map((item) => ({
            title: item.title,
            url: unwrapAggregatorUrl(item.link),
            summary: item.summary,
            publishedAt: item.publishedAt,
            topics: item.topics,
            author: item.author,
          })),
          fetchedAt: Date.now(),
          latencyMs,
        })) as { inserted?: number } | null;
        inserted += res?.inserted ?? 0;
      } else {
        // Empty feed: record health, keep lastFetched untouched.
        await runMutation(api.thinkTanks.recordHealth, {
          tankSlug: tank.slug,
          ok: false,
          latencyMs,
          itemCount: 0,
          error: "empty feed",
        });
      }
      return {
        slug: tank.slug,
        name: tank.name,
        ok: fresh.length > 0,
        items: fresh.length,
        source: fresh.length > 0 ? source : "none",
        latencyMs,
        error: fresh.length > 0 ? undefined : "empty feed",
      };
    } catch (err) {
      const latencyMs = Date.now() - t0;
      const error = err instanceof Error ? err.message.slice(0, 140) : "fetch failed";
      try {
        await runMutation(api.thinkTanks.recordHealth, {
          tankSlug: tank.slug,
          ok: false,
          latencyMs,
          itemCount: 0,
          error,
        });
      } catch {
        /* health row best-effort */
      }
      return { slug: tank.slug, name: tank.name, ok: false, items: 0, source: "none" as const, latencyMs, error };
    }
  });

  const okResults = results.filter((r) => r.ok);
  return {
    refreshed: okResults.filter((r) => r.source !== "fallback").length,
    fallbackUsed: okResults.filter((r) => r.source === "fallback").length,
    failed: results.filter((r) => !r.ok).length,
    total: tanks.length,
    inserted,
    empty: results.filter((r) => !r.ok),
  };
}

/** Public action: manually refresh all feeds from the UI. */
export const refreshFeeds = action({
  args: { tankSlug: v.optional(v.string()) },
  handler: async (ctx, { tankSlug }) =>
    refreshAllTanks(
      (ref, args) => ctx.runQuery(ref as never, args as never),
      (ref, args) => ctx.runMutation(ref as never, args as never),
      tankSlug ?? undefined,
    ),
});

/** Internal action: called by cron every 6 hours. */
export const _cronRefresh = internalAction({
  args: {},
  handler: async (ctx) =>
    refreshAllTanks(
      (ref, args) => ctx.runQuery(ref as never, args as never),
      (ref, args) => ctx.runMutation(ref as never, args as never),
    ),
});
