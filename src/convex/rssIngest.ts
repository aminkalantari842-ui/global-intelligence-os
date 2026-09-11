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
      const categories: string[] = Array.isArray(catRaw) ? catRaw.map((c: unknown) => typeof c === "string" ? c : "").filter(Boolean).slice(0, 5) : [];
      if (title && link) {
        items.push({ title: title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"), link, summary, publishedAt, topics: categories });
      }
    }
  } catch { /* skip malformed feeds */ }
  return items;
}

/** Public action: manually refresh all feeds from the UI. */
export const refreshFeeds = action({
  args: {},
  handler: async (ctx): Promise<{ refreshed: number; total: number }> => {
    const tanks: Array<{ slug: string; feedUrl: string }> = await ctx.runQuery(api.thinkTanks.listEnabled);
    let refreshed = 0;
    for (const tank of tanks) {
      try {
        const res = await fetch(tank.feedUrl, {
          signal: AbortSignal.timeout(15_000),
          headers: { "User-Agent": "GlobalIntelligenceOS/1.0 (RSS reader)" },
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const feedItems = parseFeed(xml);
        for (const item of feedItems.slice(0, 30)) {
          await ctx.runMutation(api.thinkTanks.upsertPublication, {
            thinkTankSlug: tank.slug, title: item.title, url: item.link,
            summary: item.summary, publishedAt: item.publishedAt, topics: item.topics, fetchedAt: Date.now(),
          });
        }
        await ctx.runMutation(api.thinkTanks.updateFetched, { slug: tank.slug, ts: Date.now() });
        refreshed++;
      } catch { /* skip */ }
    }
    return { refreshed, total: tanks.length };
  },
});

/** Internal action: called by cron (uses string path to avoid circular import with _generated/api). */
export const _cronRefresh = internalAction({
  args: {},
  handler: async (ctx): Promise<{ refreshed: number; total: number }> => {
    const tanks: Array<{ slug: string; feedUrl: string }> = await ctx.runQuery(api.thinkTanks.listEnabled);
    let refreshed = 0;
    for (const tank of tanks) {
      try {
        const res = await fetch(tank.feedUrl, {
          signal: AbortSignal.timeout(15_000),
          headers: { "User-Agent": "GlobalIntelligenceOS/1.0 (RSS reader)" },
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const feedItems = parseFeed(xml);
        for (const item of feedItems.slice(0, 30)) {
          await ctx.runMutation(api.thinkTanks.upsertPublication, {
            thinkTankSlug: tank.slug, title: item.title, url: item.link,
            summary: item.summary, publishedAt: item.publishedAt, topics: item.topics, fetchedAt: Date.now(),
          });
        }
        await ctx.runMutation(api.thinkTanks.updateFetched, { slug: tank.slug, ts: Date.now() });
        refreshed++;
      } catch { /* skip */ }
    }
    return { refreshed, total: tanks.length };
  },
});
