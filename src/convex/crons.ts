import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Note: The cron reference below requires _generated to exist.
// If this file fails to typecheck, run: bun convex dev --once
const cronRef: any = internal.rssIngest._cronRefresh;
const compactRef: any = internal.graph.compactChangeLog;
const backfillRef: any = internal.translations.backfill;
const articlesRef: any = internal.articles.autoTranslateBatch;
crons.interval(
  "Refresh think tank RSS feeds",
  { hours: 6 },
  cronRef,
);

// Nightly compaction: keep the append-only change log bounded.
crons.daily(
  "Compact change log",
  { hourUTC: 1, minuteUTC: 30 },
  compactRef,
);

// Warm the FA translation cache for the newest publications. Bounded batch
// (20 items/run); every 2 hours keeps pace with the RSS refresh.
crons.interval(
  "Backfill FA translations",
  { hours: 2 },
  backfillRef,
);

// Hourly: classify recent items into topic columns + extract & translate the
// newest full articles so the Persian board is ready before users open it.
crons.hourly(
  "Auto-translate newest articles",
  { minuteUTC: 15 },
  articlesRef,
  { limit: 6 },
);

export default crons;
