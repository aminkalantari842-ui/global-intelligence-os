import { internalAction, action } from "./_generated/server";
import { api } from "./_generated/api";
import { XMLParser } from "fast-xml-parser";

const xmlParser = new XMLParser({ ignoreAttributes: false });

interface FeedItem {
  title: string;
  link: string;
  summary: string;
  publishedAt: number;
  topics: string[];
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

function parseFeed(xml: string): FeedItem[] {
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
        : [];
      if (title && link) items.push({ title, link, summary, publishedAt, topics: categories });
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
}

interface TankRow {
  slug: string;
  name: string;
  website?: string;
  feedUrl: string;
}

/** Core refresh shared by the public action and the cron. */
async function refreshAllTanks(
  runQuery: (ref: unknown, args: object) => Promise<unknown>,
  runMutation: (ref: unknown, args: object) => Promise<unknown>,
): Promise<{ refreshed: number; failed: number; fallbackUsed: number; total: number; inserted: number; empty: TankFetchResult[] }> {
  const tanks = (await runQuery(api.thinkTanks.listEnabled, {})) as TankRow[];

  let inserted = 0;

  const results: TankFetchResult[] = await pooled(tanks, 6, async (tank) => {
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

      const fresh = feedItems.slice(0, 25);
      if (fresh.length > 0) {
        // One batch mutation per tank: upserts + mention extraction +
        // lastFetched update in a single function call (usage-optimized).
        const res = (await runMutation(api.thinkTanks.ingestBatch, {
          tankSlug: tank.slug,
          items: fresh.map((item) => ({
            title: item.title,
            url: item.link,
            summary: item.summary,
            publishedAt: item.publishedAt,
            topics: item.topics,
          })),
          fetchedAt: Date.now(),
        })) as { inserted?: number } | null;
        inserted += res?.inserted ?? 0;
      }
      return { slug: tank.slug, name: tank.name, ok: fresh.length > 0, items: fresh.length, source: fresh.length > 0 ? source : "none" };
    } catch {
      return { slug: tank.slug, name: tank.name, ok: false, items: 0, source: "none" as const };
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
  args: {},
  handler: async (ctx) =>
    refreshAllTanks(
      (ref, args) => ctx.runQuery(ref as never, args as never),
      (ref, args) => ctx.runMutation(ref as never, args as never),
    ),
});

/** Internal action: called by cron every 2 hours. */
export const _cronRefresh = internalAction({
  args: {},
  handler: async (ctx) =>
    refreshAllTanks(
      (ref, args) => ctx.runQuery(ref as never, args as never),
      (ref, args) => ctx.runMutation(ref as never, args as never),
    ),
});
