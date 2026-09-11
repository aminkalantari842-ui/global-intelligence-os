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

/** Fetch a feed with timeout; returns parsed items or []. */
async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
  const res = await fetch(feedUrl, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      "User-Agent": "GlobalIntelligenceOS/2.0 (+think-tank-monitor)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseFeed(xml);
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
      const title = typeof raw.title === "string" ? raw.title : "";
      let link = "";
      if (typeof raw.link === "string") link = raw.link;
      else if (raw.link && typeof raw.link === "object") {
        const l = raw.link as Record<string, unknown>;
        link = (l["@_href"] as string) ?? (l["#text"] as string) ?? "";
      }
      const descRaw = raw.description ?? raw.summary ?? raw.content;
      const summary = typeof descRaw === "string" ? descRaw.replace(/<[^>]+>/g, "").trim().slice(0, 600) : "";
      const dateStr = raw.pubDate ?? raw.published ?? raw.updated;
      const publishedAt = typeof dateStr === "string" ? new Date(dateStr).getTime() || Date.now() : Date.now();
      const catRaw = raw.category;
      const categories: string[] = Array.isArray(catRaw)
        ? catRaw.map((c: unknown) => typeof c === "string" ? c : (typeof c === "object" && c && "#text" in (c as object) ? String((c as Record<string, unknown>)["#text"]) : "")).filter(Boolean).slice(0, 5)
        : [];
      if (title && link) {
        items.push({ title: title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim(), link, summary, publishedAt, topics: categories });
      }
    }
  } catch { /* skip malformed feeds */ }
  return items;
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

interface TankFetchResult {
  slug: string;
  ok: boolean;
  items: number;
}

/** Core refresh shared by the public action and the cron. */
async function refreshAllTanks(
  runQuery: (ref: unknown, args: object) => Promise<unknown>,
  runMutation: (ref: unknown, args: object) => Promise<unknown>,
): Promise<{ refreshed: number; failed: number; total: number; inserted: number }> {
  const tanks = (await runQuery(api.thinkTanks.listEnabled, {})) as Array<{
    slug: string;
    feedUrl: string;
  }>;

  let inserted = 0;

  const results: TankFetchResult[] = await pooled(tanks, 6, async (tank) => {
    try {
      const feedItems = await fetchFeed(tank.feedUrl);
      const fresh = feedItems.slice(0, 25);
      for (const item of fresh) {
        await runMutation(api.thinkTanks.upsertPublication, {
          thinkTankSlug: tank.slug,
          title: item.title,
          url: item.link,
          summary: item.summary,
          publishedAt: item.publishedAt,
          topics: item.topics,
          fetchedAt: Date.now(),
        });
        inserted++;
      }
      await runMutation(api.thinkTanks.updateFetched, { slug: tank.slug, ts: Date.now() });
      return { slug: tank.slug, ok: true, items: fresh.length };
    } catch {
      return { slug: tank.slug, ok: false, items: 0 };
    }
  });

  return {
    refreshed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    total: tanks.length,
    inserted,
  };
}

/** Public action: manually refresh all feeds from the UI. */
export const refreshFeeds = action({
  args: {},
  handler: async (ctx): Promise<{ refreshed: number; failed: number; total: number; inserted: number }> =>
    refreshAllTanks(
      (ref, args) => ctx.runQuery(ref as never, args as never),
      (ref, args) => ctx.runMutation(ref as never, args as never),
    ),
});

/** Internal action: called by cron every 2 hours. */
export const _cronRefresh = internalAction({
  args: {},
  handler: async (ctx): Promise<{ refreshed: number; failed: number; total: number; inserted: number }> =>
    refreshAllTanks(
      (ref, args) => ctx.runQuery(ref as never, args as never),
      (ref, args) => ctx.runMutation(ref as never, args as never),
    ),
});
