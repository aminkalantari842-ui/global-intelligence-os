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
        // §2.2 extended actor classes
        v.literal("INTERNATIONAL_ORG"), // UN, GCC, BRICS…
        v.literal("TRANSNATIONAL_MOVEMENT"), // movements, armed networks
        v.literal("STATE_ENTERPRISE"), // SOEs with geopolitical role
        v.literal("MEDIA_NETWORK"), // influence channels
        v.literal("INFRASTRUCTURE"), // pipelines, corridors, straits
        v.literal("DEV_BANK"),
      ),
      country: v.string(), // primary country of origin / seat, ISO short name
      region: v.string(),
      tier: v.number(), // monitoring tier 1–5 (1 = priority coverage)
      description: v.string(),
      sourceCount: v.number(), // independent sources referencing actor, 90d
      status: v.union(v.literal("ACTIVE"), v.literal("MONITORED")),
      firstSeen: v.number(), // epoch ms — first ingestion
      lastSeen: v.number(), // epoch ms — most recent source reference
      // ─── §2.1/§2.3 actor enrichment (optional, snapshot-able) ───
      mode: v.optional(
        v.union(
          v.literal("ACTIVE"),
          v.literal("MONITORED"),
          v.literal("DORMANT"),
          v.literal("DISSOLVED"),
        ),
      ),
      modeSince: v.optional(v.number()),
      // Capability indices 0–100, deterministic, timestamped at write.
      capabilities: v.optional(
        v.object({
          military: v.number(),
          economic: v.number(),
          diplomatic: v.number(),
          intelligence: v.number(),
          cultural: v.number(),
          energy: v.number(),
        }),
      ),
      // Internal variables (belong to the actor).
      internalVars: v.optional(
        v.object({
          politicalStability: v.number(),
          regimeDurability: v.number(),
          publicOpinion: v.number(),
          sanctionsPressure: v.number(),
          macroEconomy: v.number(),
          cohesion: v.number(),
        }),
      ),
      // Environmental variables (dependence / exposure).
      envVars: v.optional(
        v.object({
          energyDependence: v.number(),
          tradeDependence: v.number(),
          supplyVulnerability: v.number(),
          geographicSensitivity: v.number(),
        }),
      ),
      // Decision cycle (documented, not modeled).
      decisionCycle: v.optional(
        v.object({
          hardCore: v.string(),
          commandStructure: v.string(),
          doctrine: v.string(),
          strategicCulture: v.string(),
          planningHorizon: v.string(),
        }),
      ),
      leaders: v.optional(
        v.array(
          v.object({ name: v.string(), role: v.string(), since: v.number() }),
        ),
      ),
      // §2.3 monitoring heart: what / why / with which sources.
      monitoring: v.optional(
        v.object({ what: v.string(), why: v.string(), sources: v.string() }),
      ),
    })
      .index("by_slug", ["slug"])
      .index("by_status", ["status"])
      .index("by_mode", ["mode"]),

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
        // §3.1 extended kinds
        v.literal("INTERDEPENDENCE"),
        v.literal("MEDIATION"),
        v.literal("DETERRENCE"),
        v.literal("NON_AGGRESSION"),
        v.literal("TREATY"),
        v.literal("SECURITY_CONSULT"),
        v.literal("INTEL_SHARING"),
        v.literal("TRANSIT_ACCESS"),
        v.literal("DEBT_AID"),
        v.literal("DEPENDENCY"),
      ),
      weight: v.number(), // 0–100 engagement intensity, deterministic model
      confidence: v.number(), // 0–100: corroboration × source quality × freshness
      status: v.union(
        v.literal("CONFIRMED"),
        v.literal("REPORTED"),
        v.literal("DISPUTED"),
      ),
      since: v.number(),
      updatedAt: v.number(),
      sourceCount: v.number(),
      summary: v.string(),
      // ─── §3.2 edge dynamics (all deterministic at ingest) ───
      symmetry: v.optional(
        v.union(v.literal("SYMMETRIC"), v.literal("ASYMMETRIC")),
      ),
      // Who benefits: share of benefit carried by source vs target (0–100).
      benefitSource: v.optional(v.number()),
      benefitTarget: v.optional(v.number()),
      breaks: v.optional(v.number()), // documented ruptures count
      coldSpellDays: v.optional(v.number()), // longest documented chill
      regimeShifts: v.optional(
        v.array(
          v.object({
            from: v.string(),
            to: v.string(),
            ts: v.number(),
          }),
        ),
      ),
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
      feedType: v.union(
        v.literal("RSS"),
        v.literal("ATOM"),
        v.literal("SITEMAP"),
        v.literal("SCRAPE"),
      ),
      enabled: v.boolean(),
      tier: v.optional(v.string()), // "S" | "A+" | "A" | "B+"
      clusters: v.optional(v.array(v.string())),
      lastFetched: v.optional(v.number()),
      // ─── A2 Per-source health monitor (deterministic counters) ───
      errorStreak: v.optional(v.number()), // consecutive failed fetches
      lastError: v.optional(v.string()),
      lastLatencyMs: v.optional(v.number()),
      lastItemCount: v.optional(v.number()),
      addedBy: v.optional(v.string()), // "SEED" | "USER"
      custom: v.optional(v.boolean()), // user-added source (deletable)
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
      // A4 Author & program parsing (RSS <dc:creator> / byline).
      author: v.optional(v.string()),
      // C2 deterministic auto-tags (deterrence, cyber, sanctions…).
      autoTags: v.optional(v.array(v.string())),
      // C3 length class: brief <1800 chars, analysis <6000, major report ≥6000.
      lengthClass: v.optional(
        v.union(v.literal("BRIEF"), v.literal("ANALYSIS"), v.literal("MAJOR_REPORT")),
      ),
      // A6 cross-post detection (same content from two programs).
      contentHash: v.optional(v.string()),
      // C5 key-claim highlighting — top scored sentences, cached.
      keyClaims: v.optional(v.array(v.string())),
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
        // §5.1 extended event types
        v.literal("ELECTION"),
        v.literal("REFERENDUM"),
        v.literal("TREATY_SIGNED"),
        v.literal("MILITARY_EXERCISE"),
        v.literal("MISSILE_TEST"),
        v.literal("BLOCKADE"),
        v.literal("SEIZURE"),
        v.literal("DIPLOMATIC_SUMMIT"),
        v.literal("AMBASSADOR_RECALL"),
        v.literal("RELATIONS_SEVERED"),
        v.literal("WITHDRAWAL"),
        v.literal("RECOGNITION"),
        v.literal("CYBER_ATTACK"),
        v.literal("DOMESTIC_UPHEAVAL"),
      ),
      title: v.string(),
      summary: v.string(),
      confidence: v.number(),
      claimType: v.union(
        v.literal("OBSERVED_FACT"),
        v.literal("REPORTED_CLAIM"),
        v.literal("ASSESSMENT"),
      ),
      // §6.2 documented reaction chain: this event explicitly responds to
      // another event (statement "in response to…").
      inResponseTo: v.optional(v.id("relationEvents")),
      // §5.4 richer time & place.
      timeFrom: v.optional(v.number()),
      timeTo: v.optional(v.number()),
      timePrecision: v.optional(
        v.union(v.literal("EXACT"), v.literal("APPROX")),
      ),
      place: v.optional(
        v.object({
          country: v.string(),
          city: v.optional(v.string()),
          lat: v.optional(v.number()),
          lon: v.optional(v.number()),
        }),
      ),
      escalationRung: v.optional(v.number()), // §6.3 escalation ladder rung
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
      userId: v.string(),
      actorSlug: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // ─── Per-user View State (Phase 2) ────────────────────────────────────
    // Generic key/value store per user: "lastSeen" (timestamp of the last
    // processed change-log entry), "timeWindow" (graph time-scrub days).
    userViewState: defineTable({
      userId: v.string(),
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

    // ─── §2.1 Actor Snapshots (historical time-slices) ───────────────────
    // Point-in-time capture of all indices for trend analysis and
    // "actor at time t" replay. Append-only.
    actorSnapshots: defineTable({
      slug: v.string(),
      ts: v.number(),
      tier: v.number(),
      mode: v.optional(v.string()),
      sourceCount: v.number(),
      capabilities: v.optional(
        v.object({
          military: v.number(),
          economic: v.number(),
          diplomatic: v.number(),
          intelligence: v.number(),
          cultural: v.number(),
          energy: v.number(),
        }),
      ),
      internalVars: v.optional(
        v.object({
          politicalStability: v.number(),
          regimeDurability: v.number(),
          publicOpinion: v.number(),
          sanctionsPressure: v.number(),
          macroEconomy: v.number(),
          cohesion: v.number(),
        }),
      ),
    }).index("by_slug_ts", ["slug", "ts"]),

    // ─── §3.3 Network Metrics (computed at ingest, deterministic) ────────
    networkMetrics: defineTable({
      ts: v.number(),
      scope: v.string(), // "global" or a region name
      nodeCount: v.number(),
      density: v.number(), // 0–1
      centrality: v.array(
        v.object({
          slug: v.string(),
          degree: v.number(),
          betweenness: v.number(),
          closeness: v.number(),
        }),
      ),
      brokers: v.array(v.string()),
      blocks: v.array(
        v.object({
          label: v.string(),
          members: v.array(v.string()),
          cohesion: v.number(),
        }),
      ),
    }).index("by_ts", ["ts"]),

    // ─── §4.4 Alerts (rule-based, evidence-linked) ───────────────────────
    alerts: defineTable({
      rule: v.string(),
      severity: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")),
      actorSlugs: v.array(v.string()),
      relationId: v.optional(v.id("relationships")),
      title: v.string(),
      detail: v.string(),
      ts: v.number(),
      acknowledged: v.optional(v.boolean()),
    }).index("by_ts", ["ts"]),

    // ─── §4.1/§4.2 Source Registry ─────────────────────────────────────
    sourceRegistry: defineTable({
      slug: v.string(),
      name: v.string(),
      kind: v.union(
        v.literal("WIRE"),
        v.literal("NATIONAL_MEDIA"),
        v.literal("OFFICIAL_DOCUMENT"),
        v.literal("SANCTION_LIST"),
        v.literal("OSINT"),
        v.literal("FINANCIAL_DATA"),
        v.literal("SOCIAL_SPEECH"),
      ),
      regions: v.array(v.string()),
      languages: v.array(v.string()),
      baseCredibility: v.number(),
      knownBias: v.optional(v.string()),
      calibrationScore: v.optional(v.number()),
      lastFetched: v.optional(v.number()),
      errorRate: v.optional(v.number()),
      enabled: v.boolean(),
    })
      .index("by_slug", ["slug"])
      .index("by_kind", ["kind"]),

    // ─── §5.3 Claim Graph ─────────────────────────────────────────────
    claims: defineTable({
      text: v.string(),
      claimType: v.union(
        v.literal("OBSERVED_FACT"),
        v.literal("REPORTED_CLAIM"),
        v.literal("ASSESSMENT"),
      ),
      actorSlugs: v.array(v.string()),
      status: v.union(
        v.literal("OPEN"),
        v.literal("CORROBORATED"),
        v.literal("CONTESTED"),
        v.literal("RETRACTED"),
      ),
      sources: v.array(
        v.object({ sourceSlug: v.string(), url: v.string(), date: v.string() }),
      ),
      supports: v.optional(v.array(v.id("claims"))),
      contradicts: v.optional(v.array(v.id("claims"))),
      relationId: v.optional(v.id("relationships")),
      ts: v.number(),
    }).index("by_ts", ["ts"]),

    // ─── §6.4 Tripwires (declared thresholds) ─────────────────────────
    tripwires: defineTable({
      actorSlug: v.string(),
      condition: v.string(),
      action: v.string(),
      sourceRef: v.string(),
      ts: v.number(),
    }).index("by_actor", ["actorSlug"]),

    // ─── §6.5 Scenario trees & wargaming (SIMULATION outputs) ────────
    // Every row is a labeled simulation derived from the stored graph state
    // at run time. Branch probabilities are deterministic model outputs over
    // stored weights; simulations NEVER merge into observed data (rule: all
    // outputs carry owner "SIMULATION" and evidenceIds of their anchors).
    scenarios: defineTable({
      title: v.string(),
      relationId: v.optional(v.id("relationships")),
      subjectSlugs: v.array(v.string()),
      kind: v.union(
        v.literal("BRANCH_TREE"),
        v.literal("WARGAME"),
        v.literal("COUNTERFACTUAL"),
      ),
      rounds: v.optional(v.number()),
      payload: v.string(), // JSON: branches/steps with rungs, probabilities, paths
      anchoredEvidence: v.optional(v.array(v.id("relationEvents"))),
      ts: v.number(),
    }).index("by_ts", ["ts"]),

    // ─── §7.3 Assessments / predictions with calibration ─────────────
    assessments: defineTable({
      subject: v.string(),
      text: v.string(),
      probability: v.number(),
      horizonTs: v.number(),
      owner: v.union(v.literal("MODEL"), v.literal("ANALYST")),
      status: v.union(
        v.literal("OPEN"),
        v.literal("RESOLVED_TRUE"),
        v.literal("RESOLVED_FALSE"),
        v.literal("EXPIRED"),
      ),
      brierScore: v.optional(v.number()),
      evidenceIds: v.optional(v.array(v.id("relationEvents"))),
      ts: v.number(),
    }).index("by_status", ["status"]),

    // ─── §9.2 Analyst notes (provenanced annotations) ──────────────────
    userNotes: defineTable({
      userId: v.string(),
      authorName: v.string(),
      targetType: v.union(
        v.literal("ACTOR"),
        v.literal("EDGE"),
        v.literal("EVENT"),
      ),
      targetId: v.string(),
      body: v.string(),
      ts: v.number(),
    }).index("by_target", ["targetType", "targetId"]),

    // ─── Wargame Studio (SIMULATION runs with full provenance) ────────
    // Every run stores its exact config (params = deterministic inputs),
    // the transcript, and optional AI analysis (critique/brief, ASSESSMENT
    // class, never merged into evidence). AI text never sets rungs.
    wargames: defineTable({
      title: v.string(),
      aSlug: v.string(),
      bSlug: v.string(),
      mode: v.union(v.literal("PAIR"), v.literal("BLOC")),
      config: v.string(), // JSON: full WargameConfig incl. seed + basis grade
      transcript: v.string(), // JSON: rounds + final rungs (SIMULATION data)
      outcome: v.string(),
      basisGrade: v.string(),
      aiAnalysis: v.optional(v.string()), // JSON: { critique, narrative, brief }
      model: v.optional(v.string()),
      ts: v.number(),
    }).index("by_ts", ["ts"]),

    // ─── §9.2 Saved views (filters + time slice) ─────────────────────
    savedViews: defineTable({
      userId: v.string(),
      name: v.string(),
      filters: v.string(),
      timeSlice: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // ─── Think-tank board: persisted column layout (order/pin/width) ──
    boardLayouts: defineTable({
      userId: v.string(), // shared workspace key
      name: v.string(), // "default"
      order: v.array(v.string()), // topic ids in display order
      pinned: v.array(v.string()),
      widths: v.any(), // JSON { [topicId]: widthPx }
      viewMode: v.optional(
        v.union(v.literal("comfortable"), v.literal("compact"), v.literal("list")),
      ),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // ─── Reading progress & resume (per publication) ─────────────────
    readingStates: defineTable({
      pubId: v.id("publications"),
      userId: v.string(),
      progress: v.number(), // 0..1 scroll fraction
      lastReadAt: v.number(),
      triage: v.union(
        v.literal("UNREAD"),
        v.literal("READING"),
        v.literal("READ"),
      ),
    })
      .index("by_pub", ["pubId"])
      .index("by_user_last", ["userId", "lastReadAt"]),

    // ─── Reading lists / read-later queue ────────────────────────────
    readingLists: defineTable({
      userId: v.string(),
      name: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    readingListItems: defineTable({
      listId: v.id("readingLists"),
      pubId: v.id("publications"),
      addedAt: v.number(),
    }).index("by_list", ["listId"]),

    // ─── Analyst highlights & private annotations on articles ────────
    articleHighlights: defineTable({
      pubId: v.id("publications"),
      userId: v.string(),
      quote: v.string(),
      note: v.optional(v.string()),
      lang: v.optional(v.union(v.literal("FA"), v.literal("EN"))),
      createdAt: v.number(),
    })
      .index("by_pub", ["pubId"])
      .index("by_user", ["userId"]),

    // ─── C4 Citation & reference harvesting (sources-of-sources) ──────
    articleRefs: defineTable({
      pubId: v.id("publications"),
      url: v.string(),
      kind: v.union(
        v.literal("EXTERNAL"),
        v.literal("INTERNAL"), // same domain as the tank
        v.literal("GOV_MIL"), // .gov/.mil/official
      ),
    }).index("by_pub", ["pubId"]),

    // ─── A4 Author & program pages (first-class entities) ────────────
    authorPages: defineTable({
      slug: v.string(), // slugified name
      name: v.string(),
      tankSlug: v.string(),
      bio: v.optional(v.string()),
      pubCount: v.number(),
      lastPubAt: v.optional(v.number()),
    }).index("by_slug", ["slug"]),

    // ─── B4 Author watchlist ─────────────────────────────────────────
    authorWatchlist: defineTable({
      userId: v.string(),
      authorSlug: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // ─── A6 Duplicate / cross-post candidates (deterministic scan) ───
    dupCandidates: defineTable({
      aId: v.id("publications"),
      bId: v.id("publications"),
      score: v.number(), // 0..1 shingle Jaccard
      status: v.union(v.literal("OPEN"), v.literal("MERGED"), v.literal("REJECTED")),
      ts: v.number(),
    }).index("by_ts", ["ts"]),

    // ─── H1 Content alert rules (saved queries, reuses alerts table) ──
    contentAlertRules: defineTable({
      userId: v.string(),
      kind: v.union(v.literal("KEYWORD"), v.literal("ACTOR"), v.literal("TANK_SHIFT")),
      value: v.string(), // keyword text / actorSlug / "tank:topic"
      enabled: v.boolean(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // ─── H1/H2 fired content alerts (deduped per 12h bucket) ─────────
    contentAlerts: defineTable({
      ruleId: v.id("contentAlertRules"),
      pubId: v.id("publications"),
      title: v.string(),
      detail: v.string(),
      ts: v.number(),
    }).index("by_ts", ["ts"]),

    // ─── D-layer AI analysis artifacts (ASSESSMENT class) ────────────
    // Every artifact stores its exact evidence anchor: pubId + model + ts.
    // AI text is never merged into observed data (rule 4 & 5 preserved).
    aiArtifacts: defineTable({
      pubIds: v.array(v.id("publications")),
      kind: v.union(
        v.literal("BRIEF"),
        v.literal("THESIS"),
        v.literal("RED_TEAM"),
        v.literal("SUMMARY"),
        v.literal("COMPARE"),
        v.literal("RADAR"),
        v.literal("TREND"),
        v.literal("DIGEST"),
        v.literal("CORPUS_QA"),
      ),
      text: v.string(),
      model: v.string(),
      level: v.optional(v.string()), // summary level TLDR/EXEC/OUTLINE
      query: v.optional(v.string()), // RADAR topic / TREND window / QA question
      ts: v.number(),
    }).index("by_pubs", ["pubIds"]),

    // ─── E5 News wire registry (news–analysis delta view) ────────────
    newsWires: defineTable({
      slug: v.string(),
      name: v.string(),
      feedUrl: v.string(),
      enabled: v.boolean(),
    }).index("by_slug", ["slug"]),

    newsItems: defineTable({
      wireSlug: v.string(),
      title: v.string(),
      url: v.string(),
      publishedAt: v.number(),
      fetchedAt: v.number(),
    })
      .index("by_wire", ["wireSlug"])
      .index("by_published", ["publishedAt"]),

    // ─── J3 API/webhook out (push new publications) ─────────────────
    appSettings: defineTable({
      key: v.string(),
      value: v.string(),
      ts: v.number(),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
