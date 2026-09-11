import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Note: The cron reference below requires _generated to exist.
// If this file fails to typecheck, run: bun convex dev --once
const cronRef: any = internal.rssIngest._cronRefresh;
crons.interval(
  "Refresh think tank RSS feeds",
  { hours: 2 },
  cronRef,
);

export default crons;
