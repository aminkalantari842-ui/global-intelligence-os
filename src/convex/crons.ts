import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Note: The cron reference below requires _generated to exist.
// If this file fails to typecheck, run: bun convex dev --once
const cronRef: any = internal.rssIngest._cronRefresh;
const compactRef: any = internal.graph.compactChangeLog;
const backfillRef: any = internal.translations.backfill;
const articlesRef: any = internal.articles.autoTranslateBatch;
const alertsRef: any = internal.alerts;
const snapshotRef: any = internal.alerts;
const enrichRef: any = internal.enrichment;
const contentAlertsRef: any = internal.contentAlerts;
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

// Alert engine: rule-based evaluation over the stored graph, deduped per
// 12h window. Also refreshes daily actor snapshots for trend analysis.
crons.interval(
  "Evaluate alert rules",
  { hours: 4 },
  (alertsRef as { evaluate: any }).evaluate,
);

crons.daily(
  "Write actor snapshots",
  { hourUTC: 0, minuteUTC: 20 },
  (snapshotRef as { writeSnapshots: any }).writeSnapshots,
);

// Enrichment: auto-tags, key claims, content hashes, author pages (idempotent,
// newest-first). Runs hourly so the board badges stay fresh.
crons.interval(
  "Enrich recent publications",
  { hours: 1 },
  (enrichRef as { enrichRecent: any }).enrichRecent,
);

// Content alerts: keyword/actor/posture rules over the newest publications,
// deduped per rule+article pair.
crons.interval(
  "Evaluate content alert rules",
  { hours: 2 },
  (contentAlertsRef as { evaluateContentRules: any }).evaluateContentRules,
);

// A6: nightly cross-post detection over the last 30 days (bounded per run).
crons.daily(
  "Scan duplicate publications",
  { hourUTC: 2, minuteUTC: 40 },
  (enrichRef as { scanDuplicates: any }).scanDuplicates,
);

export default crons;
