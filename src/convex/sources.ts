// §4.1/§4.2 Source Registry — the monitoring layer's source book.
//
// Every source class that can feed the evidence pipeline is registered here
// with a base credibility score, known editorial bias (labeled, never hidden —
// rule 3), regional expertise and periodic calibration headroom. The RSS
// think-tank pipeline references registry entries by slug; future wire/OSINT
// pipelines register here the same way.
//
// Deterministic: scores are stored constants + computed health from fetch
// metadata. No LLM (rules 2 & 4).

import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ─── Seed registry ──────────────────────────────────────────────────────────
// baseCredibility 0–100: editorial standards, corrections policy, track record.
// calibrationScore is the §4.2 recursive-assessment headroom — future cron
// compares past claims vs outcomes and updates it; until then it mirrors base.
const REGISTRY_SEED: Array<{
  slug: string;
  name: string;
  kind:
    | "WIRE"
    | "NATIONAL_MEDIA"
    | "OFFICIAL_DOCUMENT"
    | "SANCTION_LIST"
    | "OSINT"
    | "FINANCIAL_DATA"
    | "SOCIAL_SPEECH";
  regions: string[];
  languages: string[];
  baseCredibility: number;
  knownBias?: string;
}> = [
  // Wire services — multi-region, corrections culture, high corroboration value
  { slug: "reuters", name: "Reuters", kind: "WIRE", regions: ["global"], languages: ["en"], baseCredibility: 92 },
  { slug: "ap", name: "Associated Press", kind: "WIRE", regions: ["global"], languages: ["en"], baseCredibility: 92 },
  { slug: "afp", name: "Agence France-Presse", kind: "WIRE", regions: ["global"], languages: ["en", "fr"], baseCredibility: 90 },
  { slug: "tass", name: "TASS", kind: "WIRE", regions: ["eurasia"], languages: ["ru", "en"], baseCredibility: 62, knownBias: "State-aligned (RU) — treat unilateral claims as REPORTED_CLAIM" },
  { slug: "xinhua", name: "Xinhua", kind: "WIRE", regions: ["east-asia"], languages: ["zh", "en"], baseCredibility: 64, knownBias: "State-aligned (CN) — official positions relayed verbatim" },
  { slug: "irna", name: "IRNA", kind: "NATIONAL_MEDIA", regions: ["mideast"], languages: ["fa", "en"], baseCredibility: 58, knownBias: "State-aligned (IR) — official positions relayed verbatim" },
  { slug: "aljazeera", name: "Al Jazeera", kind: "NATIONAL_MEDIA", regions: ["mideast"], languages: ["ar", "en"], baseCredibility: 74, knownBias: "Qatari state-aligned editorial line on Gulf topics" },

  // Official documents — primary sources, verbatim authority
  { slug: "un-docs", name: "United Nations Documents (GA/SC/HRC)", kind: "OFFICIAL_DOCUMENT", regions: ["global"], languages: ["en", "fr", "ar", "zh", "ru", "es"], baseCredibility: 96, knownBias: "Positional record, not factual arbiter" },
  { slug: "whitehouse", name: "White House Statements", kind: "OFFICIAL_DOCUMENT", regions: ["global"], languages: ["en"], baseCredibility: 88 },
  { slug: "mfa-iran", name: "Iran MFA Statements", kind: "OFFICIAL_DOCUMENT", regions: ["mideast"], languages: ["fa", "en"], baseCredibility: 80 },

  // Sanction lists — authoritative for the specific fact of listing
  { slug: "ofac-sdn", name: "US OFAC SDN List", kind: "SANCTION_LIST", regions: ["global"], languages: ["en"], baseCredibility: 98 },
  { slug: "eu-sanctions", name: "EU Consolidated Sanctions List", kind: "SANCTION_LIST", regions: ["global"], languages: ["en"], baseCredibility: 98 },
  { slug: "un-sc-sanctions", name: "UN Security Council Consolidated List", kind: "SANCTION_LIST", regions: ["global"], languages: ["en"], baseCredibility: 98 },

  // OSINT — observed fact only with documented provenance
  { slug: "flight-radar", name: "Flight Tracking (ADS-B)", kind: "OSINT", regions: ["global"], languages: ["en"], baseCredibility: 70, knownBias: "Raw observation; interpretation requires corroboration" },
  { slug: "marine-traffic", name: "Maritime Tracking (AIS)", kind: "OSINT", regions: ["global"], languages: ["en"], baseCredibility: 70, knownBias: "Raw observation; AIS can be spoofed" },
  { slug: "satellite-imagery", name: "Commercial Satellite Imagery", kind: "OSINT", regions: ["global"], languages: ["en"], baseCredibility: 85 },

  // Financial / trade data — structural facts
  { slug: "imf-dots", name: "IMF Direction of Trade Statistics", kind: "FINANCIAL_DATA", regions: ["global"], languages: ["en"], baseCredibility: 94 },
  { slug: "unctad", name: "UNCTAD Trade & Maritime Data", kind: "FINANCIAL_DATA", regions: ["global"], languages: ["en"], baseCredibility: 90 },

  // Social / speech — always REPORTED_CLAIM
  { slug: "official-speeches", name: "Official Speeches & Social Statements", kind: "SOCIAL_SPEECH", regions: ["global"], languages: ["multi"], baseCredibility: 55, knownBias: "Rhetorical intent, not factual record — claim type REPORTED_CLAIM" },
];

/** Idempotent seed — run once via dashboard or on first deployment. */
export const seedRegistry = internalMutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    for (const s of REGISTRY_SEED) {
      const existing = await ctx.db
        .query("sourceRegistry")
        .withIndex("by_slug", (q) => q.eq("slug", s.slug))
        .first();
      if (existing) continue;
      await ctx.db.insert("sourceRegistry", {
        slug: s.slug,
        name: s.name,
        kind: s.kind,
        regions: s.regions,
        languages: s.languages,
        baseCredibility: s.baseCredibility,
        knownBias: s.knownBias,
        calibrationScore: s.baseCredibility,
        enabled: true,
      });
      inserted++;
    }
    return { inserted, total: REGISTRY_SEED.length };
  },
});

/** One-shot public bootstrap (idempotent) callable from the UI. */
export const ensureSeeded = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("sourceRegistry").first();
    if (!existing) {
      await ctx.runMutation(internal.sources.seedRegistry, {});
    }
  },
});

// ─── Readouts ───────────────────────────────────────────────────────────────

/** §4.3 source-health board: freshness, error rate, calibration per source. */
export const getRegistryWithHealth = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("sourceRegistry").collect();
    return rows
      .map((r) => {
        const staleHours = r.lastFetched
          ? Math.floor((Date.now() - r.lastFetched) / 3_600_000)
          : null;
        const health =
          r.lastFetched == null
            ? ("NEVER_FETCHED" as const)
            : staleHours! > 72
              ? ("STALE" as const)
              : r.errorRate != null && r.errorRate > 0.25
                ? ("DEGRADED" as const)
                : ("HEALTHY" as const);
        return { ...r, staleHours, health };
      })
    .sort((a, b) => b.baseCredibility - a.baseCredibility);
  },
});

/** Weighted source weight lookup used by the evidence pipeline. */
export const getSourceWeight = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const s = await ctx.db
      .query("sourceRegistry")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!s) return null;
    return {
      slug: s.slug,
      weight: Math.min(100, (s.baseCredibility + (s.calibrationScore ?? s.baseCredibility)) / 2),
      knownBias: s.knownBias ?? null,
    };
  },
});
