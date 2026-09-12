import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Note: The cron reference below requires _generated to exist.
// If this file fails to typecheck, run: bun convex dev --once
const cronRef: any = internal.rssIngest._cronRefresh;
const compactRef: any = internal.graph.compactChangeLog;
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

export default crons;
