import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ─── Actor Intelligence ────────────────────────────────────────────────
    // A canonical geopolitical actor (state, institution, organization).
    // Every field is attributable: sourceCount = number of independent
    // sources that reference the actor in the last 90 days.
    actors: defineTable({
      slug: v.string(), // stable canonical id, e.g. "iran"
      name: v.string(), // canonical display name
      aliases: v.array(v.string()), // language variants, acronyms
      kind: v.union(
        v.literal("STATE"),
        v.literal("STATE_INSTITUTION"),
        v.literal("MILITARY_ORG"),
        v.literal("NON_STATE"),
        v.literal("ORGANIZATION"),
        v.literal("COMPANY"),
        v.literal("THINK_TANK"),
      ),
      country: v.string(), // primary country of origin / seat, ISO short name
      region: v.string(),
      tier: v.number(), // monitoring tier 1–5 (1 = priority coverage)
      description: v.string(),
      sourceCount: v.number(), // independent sources referencing actor, 90d
      status: v.union(v.literal("ACTIVE"), v.literal("MONITORED")),
      firstSeen: v.number(), // epoch ms — first ingestion
      lastSeen: v.number(), // epoch ms — most recent source reference
    })
      .index("by_slug", ["slug"])
      .index("by_status", ["status"]),

    // ─── Relationships ─────────────────────────────────────────────────────
    // An evidence-backed, directed pair between two canonical actors.
    // Never silently merged: conflicting assessments surface as DISPUTED.
    relationships: defineTable({
      sourceSlug: v.string(), // actor A (origin of the relation)
      targetSlug: v.string(), // actor B (counterparty)
      kind: v.union(
        v.literal("ALLIANCE"),
        v.literal("COOPERATION"),
        v.literal("NEGOTIATION"),
        v.literal("SUPPLY"),
        v.literal("PROXY_SUPPORT"),
        v.literal("COMPETITION"),
        v.literal("TENSION"),
        v.literal("SANCTIONS"),
        v.literal("CONFLICT"),
      ),
      weight: v.number(), // 0–100 engagement intensity, deterministic model
      confidence: v.number(), // 0–100: corroboration × source quality × freshness
      status: v.union(
        v.literal("CONFIRMED"), // corroborated by independent primary sources
        v.literal("REPORTED"), // single-source or secondhand reporting
        v.literal("DISPUTED"), // sources disagree — surfaced, never merged
      ),
      since: v.number(), // epoch ms — first evidence of the relation
      updatedAt: v.number(), // epoch ms — most recent supporting evidence
      sourceCount: v.number(), // independent sources supporting this edge
      summary: v.string(), // evidence summary, kept neutral
    })
      .index("by_source", ["sourceSlug"])
      .index("by_target", ["targetSlug"])
      .index("by_pair", ["sourceSlug", "targetSlug"])
      .index("by_status", ["status"]),

    // ─── Think Tank Registry ───────────────────────────────────────────────
    // tier = analytical influence class (S / A+ / A / B+) — internal rating, not official rank.
    // clusters = topic clusters the tank belongs to (security, foreign-policy, iran-mideast, ...)
    thinkTanks: defineTable({
      name: v.string(),
      slug: v.string(),
      country: v.string(),
      region: v.string(),
      website: v.optional(v.string()),
      feedUrl: v.string(),
      feedType: v.union(v.literal("RSS"), v.literal("ATOM")),
      enabled: v.boolean(),
      tier: v.optional(v.string()), // "S" | "A+" | "A" | "B+"
      clusters: v.optional(v.array(v.string())),
      lastFetched: v.optional(v.number()),
      description: v.string(),
    })
      .index("by_slug", ["slug"])
      .index("by_enabled", ["enabled"])
      .index("by_tier", ["tier"]),

    // ─── Publications (from Think Tank RSS feeds) ──────────────────────────
    publications: defineTable({
      thinkTankSlug: v.string(),
      title: v.string(),
      url: v.string(),
      summary: v.string(),
      publishedAt: v.number(),
      topics: v.array(v.string()),
      fetchedAt: v.number(),
      // Persian topic-column assignment from the deterministic classifier
      // (security / military / economy / ...). null until classified.
      topicFa: v.optional(v.string()),
    })
      .index("by_thinktank", ["thinkTankSlug"])
      .index("by_published", ["publishedAt"])
      .index("by_url", ["url"])
      .index("by_topic", ["topicFa", "publishedAt"]),

    // ─── Full Article Content (extracted + translated) ─────────────────────
    // One row per publication, keyed by publication id. English extraction
    // happens via reader-mode fetch; the Persian full text is cached so the
    // in-app reader tab opens instantly after first extraction (rule 9).
    articleContent: defineTable({
      pubId: v.id("publications"),
      url: v.string(),
      textEn: v.string(), // extracted source text (reader mode)
      titleFa: v.string(),
      textFa: v.string(), // full Persian translation
      model: v.string(), // translation model, provenance (rule 5)
      status: v.union(
        v.literal("READY"),
        v.literal("FAILED"), // extraction blocked — UI falls back to summary
      ),
      chars: v.number(),
      createdAt: v.number(),
    }).index("by_pub", ["pubId"]),

    // ─── Relation Evidence ─────────────────────────────────────────────────
    // Timeline events attached to a relationship. Every event carries typed
    // sources with a stance so any claim can be traced to origin.
    relationEvents: defineTable({
      relationId: v.id("relationships"),
      timestamp: v.number(), // epoch ms — when the event occurred / was reported
      type: v.union(
        v.literal("STATEMENT"),
        v.literal("MEETING"),
        v.literal("SANCTION"),
        v.literal("STRIKE"),
        v.literal("TRANSFER"),
        v.literal("REPORT"),
        v.literal("AGREEMENT"),
        v.literal("POSTURE"),
      ),
      title: v.string(),
      summary: v.string(),
      confidence: v.number(), // 0–100
      claimType: v.union(
        v.literal("OBSERVED_FACT"), // independently verifiable
        v.literal("REPORTED_CLAIM"), // asserted by a source, unverified
        v.literal("ASSESSMENT"), // analytic interpretation
      ),
      sources: v.array(
        v.object({
          publication: v.string(),
          title: v.string(),
          url: v.string(),
          date: v.string(), // ISO date
          stance: v.union(
            v.literal("CORROBORATING"),
            v.literal("REPORTING"),
            v.literal("SKEPTICAL"),
          ),
        }),
      ),
    }).index("by_relation", ["relationId", "timestamp"]),

    // ─── Actor Mentions (Phase 2) ─────────────────────────────────────────
    // Every time a think-tank publication references an actor (name or
    // alias), one mention row links actor → publication. Written by the RSS
    // pipeline, idempotent per (publication, actor) pair. Powers coverage
    // sparklines, heat halos and per-actor recent-mention feeds.
    actorMentions: defineTable({
      actorSlug: v.string(),
      pubId: v.id("publications"),
      tankSlug: v.string(),
      ts: v.number(), // publication timestamp
    })
      .index("by_actor", ["actorSlug", "ts"])
      .index("by_pub", ["pubId"]),

    // ─── Change Log (Phase 2) ─────────────────────────────────────────────
    // Append-only audit trail of graph mutations. Enables "what changed
    // since my last visit", per-actor new-change badges and history replay.
    changeLog: defineTable({
      kind: v.union(
        v.literal("EDGE_ADDED"),
        v.literal("EDGE_UPDATED"),
        v.literal("EDGE_REMOVED"),
        v.literal("ACTOR_ADDED"),
      ),
      slug: v.string(), // primary actor affected
      otherSlug: v.optional(v.string()), // counterparty for edge changes
      relationId: v.optional(v.id("relationships")),
      detail: v.string(),
      ts: v.number(),
    }).index("by_ts", ["ts"]),

    // ─── Per-user Watchlist (Phase 2) ─────────────────────────────────────
    userWatchlists: defineTable({
      userId: v.id("users"),
      actorSlug: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // ─── Per-user View State (Phase 2) ────────────────────────────────────
    // Generic key/value store per user: "lastSeen" (timestamp of the last
    // processed change-log entry), "timeWindow" (graph time-scrub days).
    userViewState: defineTable({
      userId: v.id("users"),
      key: v.string(),
      value: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_key", ["userId", "key"]),

    // ─── Translation Cache (FA) ───────────────────────────────────────────
    // One immutable row per unique title+body pair, keyed by SHA-256.
    // Translations are content artifacts with provenance (model recorded);
    // the LLM never touches intelligence data, only language conversion.
    translations: defineTable({
      hash: v.string(),
      titleFa: v.string(),
      summaryFa: v.string(),
      model: v.string(),
      createdAt: v.number(),
    }).index("by_hash", ["hash"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
