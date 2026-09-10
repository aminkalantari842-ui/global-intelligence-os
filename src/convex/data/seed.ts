// Canonical seed dataset for the actor relationship graph.
// Ingested idempotently: each actor is keyed by slug, each relationship by
// (sourceSlug, targetSlug). Re-running the seed never duplicates rows —
// it refreshes content in place.
//
// Provenance rule: every relationship and every event carries typed sources
// with publication, URL and stance. Nothing is asserted without attribution.

export interface SeedSource {
  publication: string;
  title: string;
  url: string;
  date: string;
  stance: "CORROBORATING" | "REPORTING" | "SKEPTICAL";
}

export interface SeedEvent {
  timestamp: number;
  type:
    | "STATEMENT"
    | "MEETING"
    | "SANCTION"
    | "STRIKE"
    | "TRANSFER"
    | "REPORT"
    | "AGREEMENT"
    | "POSTURE";
  title: string;
  summary: string;
  confidence: number;
  claimType: "OBSERVED_FACT" | "REPORTED_CLAIM" | "ASSESSMENT";
  sources: SeedSource[];
}

export interface SeedRelationship {
  sourceSlug: string;
  targetSlug: string;
  kind:
    | "ALLIANCE"
    | "COOPERATION"
    | "NEGOTIATION"
    | "SUPPLY"
    | "PROXY_SUPPORT"
    | "COMPETITION"
    | "TENSION"
    | "SANCTIONS"
    | "CONFLICT";
  weight: number;
  confidence: number;
  status: "CONFIRMED" | "REPORTED" | "DISPUTED";
  since: number;
  updatedAt: number;
  sourceCount: number;
  summary: string;
  events: SeedEvent[];
}

export interface SeedActor {
  slug: string;
  name: string;
  aliases: string[];
  kind:
    | "STATE"
    | "STATE_INSTITUTION"
    | "MILITARY_ORG"
    | "NON_STATE"
    | "ORGANIZATION"
    | "COMPANY"
    | "THINK_TANK";
  country: string;
  region: string;
  tier: number;
  description: string;
  sourceCount: number;
  status: "ACTIVE" | "MONITORED";
  firstSeen: number;
  lastSeen: number;
}

// Fixed reference epoch so seed data is deterministic across runs.
const T = (iso: string) => new Date(iso).getTime();

export const SEED_ACTORS: SeedActor[] = [
  {
    slug: "iran",
    name: "Iran",
    aliases: ["ایران", "Islamic Republic of Iran", "IR", "جمهوری اسلامی ایران"],
    kind: "STATE",
    country: "Iran",
    region: "Middle East",
    tier: 1,
    description:
      "Regional power with an interconnected deterrence posture spanning missile forces, proxy networks, and energy leverage. Sanctions-economy dynamics and nuclear negotiation cycles drive most of its external behavior.",
    sourceCount: 214,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-08"),
  },
  {
    slug: "israel",
    name: "Israel",
    aliases: ["ישראל", "State of Israel", "IL"],
    kind: "STATE",
    country: "Israel",
    region: "Middle East",
    tier: 1,
    description:
      "Maintains a declared prevention doctrine against nuclear proliferation in the region, backed by standing strike capability and deep security integration with Western partners.",
    sourceCount: 198,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-09"),
  },
  {
    slug: "united-states",
    name: "United States",
    aliases: ["USA", "US", "Washington", "آمریکا"],
    kind: "STATE",
    country: "United States",
    region: "North America",
    tier: 1,
    description:
      "Primary security guarantor across multiple theaters; sanctions architecture originates here. Policy oscillates with administration changes, producing the widest confidence spread of any actor in the graph.",
    sourceCount: 312,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-09"),
  },
  {
    slug: "russia",
    name: "Russia",
    aliases: ["Российская Федерация", "Russian Federation", "روسیه"],
    kind: "STATE",
    country: "Russia",
    region: "Eurasia",
    tier: 1,
    description:
      "Sanctioned great power deepening south- and east-facing partnerships. Defense-industrial supply relationships are its primary instrument of influence.",
    sourceCount: 240,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-07"),
  },
  {
    slug: "china",
    name: "China",
    aliases: ["中国", "PRC", "People's Republic of China", "چین"],
    kind: "STATE",
    country: "China",
    region: "East Asia",
    tier: 1,
    description:
      "Largest buyer in Gulf energy flows and principal investor in regional infrastructure corridors. Maintains deliberately ambiguous security commitments.",
    sourceCount: 265,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-08"),
  },
  {
    slug: "european-union",
    name: "European Union",
    aliases: ["EU", "Brussels", "اتحادیه اروپا"],
    kind: "ORGANIZATION",
    country: "Belgium",
    region: "Europe",
    tier: 1,
    description:
      "Coordinator of the multilateral diplomatic track and secondary sanctions regime. Split internally between engagement and pressure coalitions on nuclear policy.",
    sourceCount: 176,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-05"),
  },
  {
    slug: "iaea",
    name: "IAEA",
    aliases: [
      "International Atomic Energy Agency",
      "آژانس بین‌المللی انرژی اتمی",
    ],
    kind: "ORGANIZATION",
    country: "Austria",
    region: "Europe",
    tier: 2,
    description:
      "Verification authority for the nuclear file. Its inspection access determinations are the most-cited primary evidence in the entire graph.",
    sourceCount: 134,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-04"),
  },
  {
    slug: "saudi-arabia",
    name: "Saudi Arabia",
    aliases: ["KSA", "Riyadh", "عربستان سعودی"],
    kind: "STATE",
    country: "Saudi Arabia",
    region: "Middle East",
    tier: 1,
    description:
      "Energy-price setter and leader of the Arab-state normalization track. Balances security dependence on Washington against economic hedging with Beijing.",
    sourceCount: 189,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-06"),
  },
  {
    slug: "hezbollah",
    name: "Hezbollah",
    aliases: ["حزب‌الله", "Party of God", "Hizbollah"],
    kind: "MILITARY_ORG",
    country: "Lebanon",
    region: "Middle East",
    tier: 1,
    description:
      "The most heavily armed non-state actor in the Levant, operating as part of a declared deterrence network. Force posture changes function as a regional escalation indicator.",
    sourceCount: 167,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-08"),
  },
  {
    slug: "houthis",
    name: "Houthis",
    aliases: ["أنصار الله", "Ansar Allah", "الحوثيون"],
    kind: "NON_STATE",
    country: "Yemen",
    region: "Middle East",
    tier: 2,
    description:
      "Controls significant Red Sea littoral territory; maritime interdiction capability gives it outsized effect on global shipping economics relative to force size.",
    sourceCount: 143,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-08"),
  },
  {
    slug: "hamas",
    name: "Hamas",
    aliases: ["حماس", "Harakat al-Muqawama"],
    kind: "NON_STATE",
    country: "Palestine",
    region: "Middle East",
    tier: 2,
    description:
      "Governing actor in Gaza until 2023; capability degraded through 2024–25 campaigns. Residual command structure remains an uncertainty in postwar arrangements.",
    sourceCount: 155,
    status: "MONITORED",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-08-30"),
  },
  {
    slug: "nato",
    name: "NATO",
    aliases: [
      "North Atlantic Treaty Organization",
      "ناتو",
      "سازمان پیمان آتلانتیک شمالی",
    ],
    kind: "ORGANIZATION",
    country: "Belgium",
    region: "Europe",
    tier: 2,
    description:
      "Collective-defense alliance whose eastern-flank posture is the primary reference point for Russian escalation calculus.",
    sourceCount: 148,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-05"),
  },
  {
    slug: "ukraine",
    name: "Ukraine",
    aliases: ["Україна", "اوکراین"],
    kind: "STATE",
    country: "Ukraine",
    region: "Europe",
    tier: 1,
    description:
      "Seat of the largest interstate war since 1945. Arms-supply politics in Washington and Brussels are the dominant variables in its war trajectory.",
    sourceCount: 231,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-09"),
  },
  {
    slug: "turkey",
    name: "Turkey",
    aliases: ["Türkiye", "ترکیه", "Ankara"],
    kind: "STATE",
    country: "Turkey",
    region: "Middle East",
    tier: 2,
    description:
      "NATO member exercising independent mediation and arms-export policy. Simultaneously brokers grain and prisoner exchanges while supplying drones to Kyiv.",
    sourceCount: 132,
    status: "ACTIVE",
    firstSeen: T("2024-01-15"),
    lastSeen: T("2026-09-03"),
  },
];

export const SEED_RELATIONSHIPS: SeedRelationship[] = [
  {
    sourceSlug: "iran",
    targetSlug: "israel",
    kind: "CONFLICT",
    weight: 92,
    confidence: 91,
    status: "CONFIRMED",
    since: T("2024-04-13"),
    updatedAt: T("2026-09-08"),
    sourceCount: 47,
    summary:
      "Direct exchange of strikes since April 2024, moving the rivalry from proxy competition to open confrontation. Deterrence messaging from both capitals is now the primary escalation driver.",
    events: [
      {
        timestamp: T("2024-04-13"),
        type: "STRIKE",
        title: "Iran launches first-ever direct strike on Israel",
        summary:
          "Operation in response to the Damascus consulate strike; intercepted primarily by a multinational air-defense coalition.",
        confidence: 95,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Reuters",
            title: "Iran launches drones and missiles at Israel in unprecedented attack",
            url: "https://www.reuters.com/world/middle-east/",
            date: "2024-04-14",
            stance: "CORROBORATING",
          },
          {
            publication: "IAEA Press",
            title: "Statement on regional escalation",
            url: "https://www.iaea.org/newscenter/pressreleases",
            date: "2024-04-14",
            stance: "REPORTING",
          },
        ],
      },
      {
        timestamp: T("2025-06-13"),
        type: "STRIKE",
        title: "Twelve-day air war between Iran and Israel",
        summary:
          "Israeli campaign against Iranian nuclear and missile infrastructure followed by US strikes on enrichment sites; ceasefire brokered day twelve.",
        confidence: 92,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Associated Press",
            title: "Israel-Iran ceasefire takes hold after 12 days",
            url: "https://apnews.com/",
            date: "2025-06-24",
            stance: "CORROBORATING",
          },
          {
            publication: "Crisis Group",
            title: "After the Twelve-Day War: What Comes Next",
            url: "https://www.crisisgroup.org/",
            date: "2025-07-02",
            stance: "REPORTING",
          },
        ],
      },
      {
        timestamp: T("2026-08-12"),
        type: "POSTURE",
        title: "Iranian missile-force readiness raised",
        summary:
          "Satellite imagery analysts report reconstitution of launcher deployments at two eastern sites; official statements frame it as deterrent signaling.",
        confidence: 68,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "IISS",
            title: "Missile force reconstitution indicators",
            url: "https://www.iiss.org/",
            date: "2026-08-12",
            stance: "REPORTING",
          },
          {
            publication: "ISNA",
            title: "Armed forces conduct scheduled exercises",
            url: "https://www.isna.ir/",
            date: "2026-08-13",
            stance: "SKEPTICAL",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "iran",
    targetSlug: "united-states",
    kind: "NEGOTIATION",
    weight: 58,
    confidence: 74,
    status: "REPORTED",
    since: T("2025-04-01"),
    updatedAt: T("2026-09-01"),
    sourceCount: 33,
    summary:
      "Indirect negotiating track resumed after the twelve-day war, run through Omani mediation. Core dispute over enrichment scope remains unresolved; both sides keep military options on the table.",
    events: [
      {
        timestamp: T("2025-04-12"),
        type: "MEETING",
        title: "First post-war indirect talks in Muscat",
        summary:
          "Technical-level exchange via Omani intermediaries; agenda limited to ceasefire mechanics, not the nuclear file.",
        confidence: 81,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "Reuters",
            title: "US and Iran hold indirect talks in Oman",
            url: "https://www.reuters.com/",
            date: "2025-04-12",
            stance: "REPORTING",
          },
        ],
      },
      {
        timestamp: T("2026-07-22"),
        type: "STATEMENT",
        title: "Washington signals openness to interim enrichment freeze",
        summary:
          "Secretary-level comment suggests willingness to sequence sanctions relief against verified enrichment suspension; Tehran rejects sequencing.",
        confidence: 61,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "Washington Post",
            title: "White House weighs phased nuclear proposal",
            url: "https://www.washingtonpost.com/",
            date: "2026-07-22",
            stance: "REPORTING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "iran",
    targetSlug: "russia",
    kind: "COOPERATION",
    weight: 71,
    confidence: 83,
    status: "CONFIRMED",
    since: T("2022-07-01"),
    updatedAt: T("2026-08-28"),
    sourceCount: 41,
    summary:
      "Defense-industrial and sanctions-evasion alignment deepened by the Ukraine war: UAV technology transfer in one direction, air-defense systems and diplomatic cover in the other. A 20-year strategic partnership agreement was signed in 2025.",
    events: [
      {
        timestamp: T("2025-01-17"),
        type: "AGREEMENT",
        title: "Russia and Iran sign 20-year strategic partnership treaty",
        summary:
          "Comprehensive cooperation treaty covering defense consultation, counter-sanctions coordination, and energy trade; notably excludes a mutual-defense clause.",
        confidence: 94,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Reuters",
            title: "Putin, Pezeshkian sign 20-year treaty",
            url: "https://www.reuters.com/",
            date: "2025-01-17",
            stance: "CORROBORATING",
          },
          {
            publication: "Carnegie Endowment",
            title: "The Russia-Iran treaty: consultative, not defensive",
            url: "https://carnegieendowment.org/",
            date: "2025-01-20",
            stance: "REPORTING",
          },
        ],
      },
      {
        timestamp: T("2026-06-30"),
        type: "TRANSFER",
        title: "Reported delivery of Su-35 airframes",
        summary:
          "Open-source aviation trackers report deliveries to an Iranian base; neither government confirms. Confidence capped because imaging remains ambiguous.",
        confidence: 57,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "Janes",
            title: "Satellite imagery suggests Su-35 transfer",
            url: "https://www.janes.com/",
            date: "2026-06-30",
            stance: "REPORTING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "china",
    targetSlug: "iran",
    kind: "COOPERATION",
    weight: 66,
    confidence: 79,
    status: "CONFIRMED",
    since: T("2021-03-27"),
    updatedAt: T("2026-09-02"),
    sourceCount: 38,
    summary:
      "The 25-year cooperation agreement anchors discounted crude flows to Chinese teapot refineries. Beijing provides economic lifeline and diplomatic cover while avoiding security entanglement.",
    events: [
      {
        timestamp: T("2026-05-18"),
        type: "REPORT",
        title: "Crude exports to China hit post-war high",
        summary:
          "Tanker-tracking firms estimate flows above 1.4 mb/d despite snapback enforcement; ship-to-ship transfers concentrated off Malaysia.",
        confidence: 72,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Kpler",
            title: "Iran crude watch, May 2026",
            url: "https://www.kpler.com/",
            date: "2026-05-18",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "united-states",
    targetSlug: "iran",
    kind: "SANCTIONS",
    weight: 88,
    confidence: 96,
    status: "CONFIRMED",
    since: T("2018-05-08"),
    updatedAt: T("2026-09-05"),
    sourceCount: 52,
    summary:
      "Maximum-pressure architecture: primary oil sanctions, secondary enforcement against shipping networks, and UN snapback mechanism activated by European parties in 2025.",
    events: [
      {
        timestamp: T("2025-09-28"),
        type: "SANCTION",
        title: "UN snapback sanctions restored",
        summary:
          "E3 triggered the JCPOA snapback clause; all pre-2015 UN resolutions reinstated after Security Council resolution failed to pass.",
        confidence: 97,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "UN News",
            title: "UN sanctions reimposed on Iran under snapback mechanism",
            url: "https://news.un.org/",
            date: "2025-09-28",
            stance: "CORROBORATING",
          },
        ],
      },
      {
        timestamp: T("2026-08-04"),
        type: "SANCTION",
        title: "New designations target shadow-fleet insurers",
        summary:
          "Treasury designates 14 entities in UAE and Hong Kong providing hull insurance to dark-fleet tankers.",
        confidence: 93,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "US Treasury",
            title: "Treasury targets Iranian shadow fleet network",
            url: "https://home.treasury.gov/",
            date: "2026-08-04",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "iran",
    targetSlug: "hezbollah",
    kind: "PROXY_SUPPORT",
    weight: 84,
    confidence: 88,
    status: "CONFIRMED",
    since: T("1982-06-01"),
    updatedAt: T("2026-09-08"),
    sourceCount: 44,
    summary:
      "Core node of the forward-defense network: funding, weapons, and political direction flow from Tehran. The 2024–25 campaigns degraded the group's capacity but not the structural relationship.",
    events: [
      {
        timestamp: T("2026-09-08"),
        type: "STATEMENT",
        title: "New leadership reaffirms alignment with Tehran",
        summary:
          "Post-decapitation leadership interview describes the 'axis' relationship as doctrinal rather than transactional.",
        confidence: 76,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "Al Jazeera",
            title: "Hezbollah chief outlines post-war doctrine",
            url: "https://www.aljazeera.com/",
            date: "2026-09-08",
            stance: "REPORTING",
          },
        ],
      },
      {
        timestamp: T("2024-09-17"),
        type: "STRIKE",
        title: "Pager and walkie-talkie attacks degrade command layer",
        summary:
          "Supply-chain sabotage killed and wounded thousands of operatives; widely assessed as opening move of the 2024 campaign.",
        confidence: 90,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Associated Press",
            title: "Explosive device attacks hit Hezbollah communications",
            url: "https://apnews.com/",
            date: "2024-09-18",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "israel",
    targetSlug: "united-states",
    kind: "ALLIANCE",
    weight: 90,
    confidence: 95,
    status: "CONFIRMED",
    since: T("1948-05-14"),
    updatedAt: T("2026-09-06"),
    sourceCount: 58,
    summary:
      "Security assistance relationship exceeding $3.8b annually under the current MOU. Air-defense integration and munitions resupply were decisive in the 2024–25 escalation cycles.",
    events: [
      {
        timestamp: T("2026-02-11"),
        type: "AGREEMENT",
        title: "Supplemental air-defense package signed",
        summary:
          "Multi-year package covering interceptor co-production and Golden Dome integration work.",
        confidence: 92,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Reuters",
            title: "US, Israel sign air defense supplemental",
            url: "https://www.reuters.com/",
            date: "2026-02-11",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "iran",
    targetSlug: "houthis",
    kind: "PROXY_SUPPORT",
    weight: 69,
    confidence: 81,
    status: "CONFIRMED",
    since: T("2014-09-21"),
    updatedAt: T("2026-09-08"),
    sourceCount: 36,
    summary:
      "Weapons technology transfer (anti-ship missiles, UAVs) and targeting coordination; the Red Sea interdiction campaign is conducted nominally in solidarity with Gaza.",
    events: [
      {
        timestamp: T("2026-09-08"),
        type: "STRIKE",
        title: "Renewed anti-shipping attacks in Bab al-Mandab",
        summary:
          "Two commercial vessels struck by USV; shipping insurers re-rate the transit corridor to war-risk pricing.",
        confidence: 87,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "UKMTO",
            title: "Incident report 2026-114",
            url: "https://www.ukmto.org/",
            date: "2026-09-08",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "saudi-arabia",
    targetSlug: "iran",
    kind: "NEGOTIATION",
    weight: 47,
    confidence: 77,
    status: "REPORTED",
    since: T("2023-03-10"),
    updatedAt: T("2026-08-20"),
    sourceCount: 29,
    summary:
      "China-brokered normalization held through the 2025 war — neither side closed missions. bilateral security dialogue continues at working level, but defense trust remains minimal.",
    events: [
      {
        timestamp: T("2026-08-20"),
        type: "MEETING",
        title: "National security advisers meet in Jeddah",
        summary:
          "Third round of talks since the ceasefire; agenda includes Hajj logistics, maritime incidents, and Yemen de-escalation.",
        confidence: 70,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "Asharq Al-Awsat",
            title: "Jeddah round concludes without joint statement",
            url: "https://english.aawsat.com/",
            date: "2026-08-21",
            stance: "REPORTING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "european-union",
    targetSlug: "iran",
    kind: "TENSION",
    weight: 61,
    confidence: 84,
    status: "CONFIRMED",
    since: T("2018-05-08"),
    updatedAt: T("2026-09-04"),
    sourceCount: 31,
    summary:
      "E3 activated snapback in 2025 after more than a decade of preservation diplomacy. Relations now at lowest point since 2015; enrichment timeline disputes dominate.",
    events: [
      {
        timestamp: T("2026-09-04"),
        type: "REPORT",
        title: "IAEA reports no access to enrichment sites",
        summary:
          "Quarterly verification report finds monitoring continuity broken since June 2025; enriched uranium stockpile location unaccounted for.",
        confidence: 91,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "IAEA",
            title: "GOV/2026/34 — Verification and monitoring in Iran",
            url: "https://www.iaea.org/",
            date: "2026-09-04",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "russia",
    targetSlug: "ukraine",
    kind: "CONFLICT",
    weight: 95,
    confidence: 98,
    status: "CONFIRMED",
    since: T("2022-02-24"),
    updatedAt: T("2026-09-09"),
    sourceCount: 61,
    summary:
      "Interstate war in its fifth year. Front lines largely static through 2026; air campaign and infrastructure strikes continue at scale. Negotiation track dormant since the failed Geneva round.",
    events: [
      {
        timestamp: T("2026-09-09"),
        type: "STRIKE",
        title: "Overnight drone-and-missile wave across western Ukraine",
        summary:
          "Largest launch volume of the quarter reported by Ukrainian air force; energy grid nodes targeted ahead of winter.",
        confidence: 93,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Reuters",
            title: "Russia launches overnight barrage on Ukrainian grid",
            url: "https://www.reuters.com/",
            date: "2026-09-09",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "united-states",
    targetSlug: "ukraine",
    kind: "SUPPLY",
    weight: 74,
    confidence: 90,
    status: "CONFIRMED",
    since: T("2022-02-24"),
    updatedAt: T("2026-08-30"),
    sourceCount: 49,
    summary:
      "Security assistance continues under a minerals-framework revenue arrangement signed 2025, but munitions pipeline constrained by competing Indo-Pacific requirements and domestic politics.",
    events: [
      {
        timestamp: T("2026-08-30"),
        type: "TRANSFER",
        title: "$580m Ukraine Security Assistance Initiative package",
        summary:
          "Includes ground-based air defense interceptors and long-range strike munitions; drawn down under PDA authority.",
        confidence: 94,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Pentagon",
            title: "US announces security assistance for Ukraine",
            url: "https://www.defense.gov/",
            date: "2026-08-30",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "nato",
    targetSlug: "russia",
    kind: "TENSION",
    weight: 87,
    confidence: 93,
    status: "CONFIRMED",
    since: T("2014-03-18"),
    updatedAt: T("2026-09-05"),
    sourceCount: 43,
    summary:
      "Sustained confrontation without direct engagement: alliance eastern-flank reinforcement, airspace violation incidents, and hybrid operations including GPS jamming and infrastructure sabotage.",
    events: [
      {
        timestamp: T("2026-09-05"),
        type: "POSTURE",
        title: "NATO announces Baltic air-policing reinforcement",
        summary:
          "Additional squadrons and drone surveillance after threeairspace incursions in a week.",
        confidence: 89,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "NATO",
            title: "Secretary General statement on Baltic air policing",
            url: "https://www.nato.int/",
            date: "2026-09-05",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "china",
    targetSlug: "united-states",
    kind: "COMPETITION",
    weight: 79,
    confidence: 89,
    status: "CONFIRMED",
    since: T("2017-12-18"),
    updatedAt: T("2026-09-02"),
    sourceCount: 55,
    summary:
      "Systemic rivalry expressed through export controls, tariff cycles, and Taiwan-adjacent signaling. Defense and economic tracks de-risk selectively while decoupling rhetoric escalates.",
    events: [
      {
        timestamp: T("2026-07-15"),
        type: "POSTURE",
        title: "Export-control expansion on advanced lithography",
        summary:
          "New entity-list additions cover inspection equipment; Beijing responds with rare-earth export licensing queues.",
        confidence: 90,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Bloomberg",
            title: "US widens chip-tool curbs; China slows rare earth licenses",
            url: "https://www.bloomberg.com/",
            date: "2026-07-15",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "china",
    targetSlug: "saudi-arabia",
    kind: "COOPERATION",
    weight: 63,
    confidence: 80,
    status: "CONFIRMED",
    since: T("2016-01-19"),
    updatedAt: T("2026-07-10"),
    sourceCount: 27,
    summary:
      "Energy-buyer relationship extended into infrastructure and defense-adjacent technology; Beijing's mediation role (Iran–Saudi normalization) remains its signature regional intervention.",
    events: [
      {
        timestamp: T("2026-07-10"),
        type: "REPORT",
        title: "Crude pricing shifts toward yuan settlement for pilot cargoes",
        summary:
          "Shanghai Petroleum Exchange confirms limited yuan-settled cargoes; significance debated — dollar settlement still dominant.",
        confidence: 64,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "Financial Times",
            title: "Saudi crude sales test yuan settlement waters",
            url: "https://www.ft.com/",
            date: "2026-07-10",
            stance: "REPORTING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "turkey",
    targetSlug: "ukraine",
    kind: "COOPERATION",
    weight: 56,
    confidence: 82,
    status: "CONFIRMED",
    since: T("2022-02-24"),
    updatedAt: T("2026-08-25"),
    sourceCount: 24,
    summary:
      "Arms supply (Bayraktar), Black Sea grain-corridor brokerage, and prisoner-exchange mediation; Ankara keeps NATO obligations and Russia trade links in parallel.",
    events: [
      {
        timestamp: T("2026-08-25"),
        type: "AGREEMENT",
        title: "Black Sea grain corridor protocol renewed for 120 days",
        summary:
          "Istanbul-signed interim arrangement with both belligerents; volume remains half of 2022 peak.",
        confidence: 85,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Anadolu Agency",
            title: "Grain corridor deal extended",
            url: "https://www.aa.com.tr/",
            date: "2026-08-25",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "israel",
    targetSlug: "hezbollah",
    kind: "CONFLICT",
    weight: 90,
    confidence: 94,
    status: "CONFIRMED",
    since: T("2023-10-08"),
    updatedAt: T("2026-09-07"),
    sourceCount: 45,
    summary:
      "September 2024 escalation through November 2024 ceasefire; periodic strike-exchange violations continue. IDF northern posture remains at elevated readiness.",
    events: [
      {
        timestamp: T("2026-09-07"),
        type: "STRIKE",
        title: "IDF strike on Bekaa storage facility",
        summary:
          "Israel says site held precision-guided munitions; no casualties reported. Ceasefire mechanism referred to for first time in two months.",
        confidence: 82,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "Times of Israel",
            title: "IDF hits munitions depot in eastern Lebanon",
            url: "https://www.timesofisrael.com/",
            date: "2026-09-07",
            stance: "REPORTING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "united-states",
    targetSlug: "saudi-arabia",
    kind: "ALLIANCE",
    weight: 72,
    confidence: 88,
    status: "CONFIRMED",
    since: T("1944-02-14"),
    updatedAt: T("2026-06-15"),
    sourceCount: 34,
    summary:
      "Pact under renegotiation: defense-treaty text stalled in Senate; interim security annexes plus civilian-nuclear 123-advanced package moving ahead separately.",
    events: [
      {
        timestamp: T("2026-06-15"),
        type: "AGREEMENT",
        title: "Interim security annex signed covering air defense",
        summary:
          "Executive-agreement route bypasses treaty ratification; THAAD battery expansions and Patriot munitions included.",
        confidence: 88,
        claimType: "OBSERVED_FACT",
        sources: [
          {
            publication: "Reuters",
            title: "US-Saudi security annex signed",
            url: "https://www.reuters.com/",
            date: "2026-06-15",
            stance: "CORROBORATING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "china",
    targetSlug: "russia",
    kind: "COOPERATION",
    weight: 76,
    confidence: 87,
    status: "CONFIRMED",
    since: T("2022-02-04"),
    updatedAt: T("2026-09-01"),
    sourceCount: 47,
    summary:
      "'No-limits' partnership in practice: discounted energy imports, dual-use component flows, and diplomatic shielding — capped by Chinese caution on arming Moscow directly.",
    events: [
      {
        timestamp: T("2026-09-01"),
        type: "REPORT",
        title: "Power of Siberia 2 framework initialed",
        summary:
          "After three years of price deadlock, framework terms agreed; binding contract delayed pending commercial terms.",
        confidence: 74,
        claimType: "REPORTED_CLAIM",
        sources: [
          {
            publication: "Reuters",
            title: "Russia, China initial Power of Siberia 2 framework",
            url: "https://www.reuters.com/",
            date: "2026-09-01",
            stance: "REPORTING",
          },
        ],
      },
    ],
  },
  {
    sourceSlug: "iran",
    targetSlug: "hamas",
    kind: "PROXY_SUPPORT",
    weight: 62,
    confidence: 79,
    status: "REPORTED",
    since: T("2006-03-01"),
    updatedAt: T("2026-08-15"),
    sourceCount: 28,
    summary:
      "Historic funding and arms relationship degraded by the Gaza campaign. Post-war coordination assessed as diminished but extant through Gulf intermediaries; estimates diverge sharply.",
    events: [
      {
        timestamp: T("2026-08-15"),
        type: "REPORT",
        title: "Assessments diverge on post-war Iran–Hamas channel",
        summary:
          "Two intelligence-market firms reach opposite conclusions from similar intercept data — a canonical DISPUTED-record candidate.",
        confidence: 44,
        claimType: "ASSESSMENT",
        sources: [
          {
            publication: "Soufan Center",
            title: "Axis resilience after Gaza",
            url: "https://soufancenter.org/",
            date: "2026-08-15",
            stance: "REPORTING",
          },
          {
            publication: "Washington Institute",
            title: "Iran's regional network is thinner than it looks",
            url: "https://www.washingtoninstitute.org/",
            date: "2026-08-18",
            stance: "SKEPTICAL",
          },
        ],
      },
    ],
  },
];
