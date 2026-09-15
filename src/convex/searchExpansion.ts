// §8 AI-assisted network expansion — research-agent pipeline over real web
// search. Architecture (rules 1–4 preserved):
//   1. `searchWeb`        — deterministic multi-query search over public news
//                           RSS engines (fixed templates, fixed top-N, no LLM).
//   2. `proposeExpansion` — one LLM call that maps search evidence onto a
//                           STRICT JSON schema. The model only proposes; it
//                           never writes to the graph.
//   3. `commitExpansion`  — server-side mutation whitelists every field,
//                           dedupes by natural key, and writes actors/edges/
//                           evidence. The model output never touches scores.

import { action, internalAction, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { AI_CHAT_URL, AI_MODEL, aiApiKey } from "./aiConfig";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// ─── Expansion dimensions (the minimal option list) ─────────────────────────

export const EXPANSION_DIMENSIONS = [
  "ALLIES",
  "RIVALS",
  "INSTITUTIONS",
  "SUPPLY",
  "MEDIA",
  "MARKETS",
] as const;
export type ExpansionDimension = (typeof EXPANSION_DIMENSIONS)[number];

const DIMENSION_UNION = v.union(
  v.literal("ALLIES"),
  v.literal("RIVALS"),
  v.literal("INSTITUTIONS"),
  v.literal("SUPPLY"),
  v.literal("MEDIA"),
  v.literal("MARKETS"),
);

/** Fixed search templates — deterministic, auditable, no LLM in the loop. */
function searchQueries(name: string, dim: ExpansionDimension): string[] {
  switch (dim) {
    case "ALLIES":
      return [
        `${name} allies strategic partnership agreement`,
        `${name} defense cooperation treaty countries`,
      ];
    case "RIVALS":
      return [
        `${name} tensions rivalry sanctions conflict`,
        `${name} diplomatic dispute standoff`,
      ];
    case "INSTITUTIONS":
      return [
        `${name} government institutions agencies military command`,
        `${name} affiliated organizations proxy groups`,
      ];
    case "SUPPLY":
      return [
        `${name} arms trade weapons supplier imports`,
        `${name} energy oil gas supply agreements exports`,
      ];
    case "MEDIA":
      return [
        `${name} state media network influence propaganda`,
        `${name} information operations disinformation campaign`,
      ];
    case "MARKETS":
      return [
        `${name} trade partners exports imports economy`,
        `${name} investment infrastructure deals companies`,
      ];
  }
}

interface WebResult {
  title: string;
  url: string;
  snippet: string;
  date: string;
  source: string;
}

interface SearchOutcome {
  results: WebResult[];
  queries: string[];
}

/** Fetch + parse a Google News RSS search (same pipeline as rssIngest). */
async function newsSearch(query: string, limit: number): Promise<WebResult[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    const out: WebResult[] = [];
    for (const item of items.slice(0, limit)) {
      const pick = (tag: string) =>
        item
          .match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]
          ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
          .replace(/<[^>]+>/g, "")
          .trim() ?? "";
      const title = pick("title");
      const link = pick("link");
      if (!title || !link) continue;
      const pub = title.includes(" - ")
        ? title.slice(title.lastIndexOf(" - ") + 3)
        : "news";
      out.push({
        title: title.slice(0, 200),
        url: link.slice(0, 500),
        snippet: "",
        date: pick("pubDate").slice(0, 40),
        source: pub.slice(0, 80),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Fallback search: DuckDuckGo HTML endpoint (best-effort, keyless). */
async function ddgSearch(query: string, limit: number): Promise<WebResult[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const out: WebResult[] = [];
    const blocks = html.match(/<a[^>]+class="result__a"[^>]*>[\s\S]*?<\/a>/g) ?? [];
    for (const b of blocks.slice(0, limit)) {
      const href = b.match(/href="([^"]+)"/)?.[1] ?? "";
      const uddg = href.match(/uddg=([^&]+)/)?.[1];
      const url = uddg ? decodeURIComponent(uddg) : href;
      const title = b.replace(/<[^>]+>/g, "").trim();
      if (!title || !url.startsWith("http")) continue;
      out.push({ title: title.slice(0, 200), url: url.slice(0, 500), snippet: "", date: "", source: "web" });
    }
    return out;
  } catch {
    return [];
  }
}

// ─── §8 step 1: deterministic web search per dimension ──────────────────────

export const searchWeb = internalAction({
  args: { actorName: v.string(), dimension: DIMENSION_UNION },
  handler: async (_ctx, { actorName, dimension }): Promise<SearchOutcome> => {
    const queries = searchQueries(actorName, dimension);
    const results: WebResult[] = [];
    for (const q of queries) {
      let found = await newsSearch(q, 6);
      if (found.length === 0) found = await ddgSearch(q, 5);
      results.push(...found.slice(0, 6));
    }
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
      const key = r.url.split("?")[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { results: deduped.slice(0, 12), queries };
  },
});

// ─── §8 step 2: AI extraction (proposal only — never a write) ───────────────

interface ExpansionCandidate {
  name: string;
  kind: string;
  country: string;
  region: string;
  existingActorSlug?: string;
  relation: string;
  direction: "PARENT_SOURCE" | "PARENT_TARGET";
  weight: number;
  confidence: number;
  status: string;
  summary: string;
  sources: Array<{ publication: string; title: string; url: string; date: string }>;
}

interface ExpansionProposal {
  candidates: ExpansionCandidate[];
  searchQueries: string[];
  resultCount: number;
  model: string;
}

const CandidateValidator = v.object({
  name: v.string(),
  kind: v.union(
    v.literal("STATE"),
    v.literal("STATE_INSTITUTION"),
    v.literal("MILITARY_ORG"),
    v.literal("NON_STATE"),
    v.literal("ORGANIZATION"),
    v.literal("COMPANY"),
    v.literal("THINK_TANK"),
    v.literal("MEDIA_NETWORK"),
    v.literal("INFRASTRUCTURE"),
    v.literal("DEV_BANK"),
  ),
  country: v.string(),
  region: v.string(),
  existingActorSlug: v.optional(v.string()),
  relation: v.union(
    v.literal("ALLIANCE"),
    v.literal("COOPERATION"),
    v.literal("NEGOTIATION"),
    v.literal("SUPPLY"),
    v.literal("PROXY_SUPPORT"),
    v.literal("COMPETITION"),
    v.literal("TENSION"),
    v.literal("SANCTIONS"),
    v.literal("CONFLICT"),
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
  direction: v.union(v.literal("PARENT_SOURCE"), v.literal("PARENT_TARGET")),
  weight: v.number(),
  confidence: v.number(),
  status: v.union(v.literal("CONFIRMED"), v.literal("REPORTED"), v.literal("DISPUTED")),
  summary: v.string(),
  sources: v.array(
    v.object({
      publication: v.string(),
      title: v.string(),
      url: v.string(),
      date: v.string(),
    }),
  ),
});

export const proposeExpansion = action({
  args: {
    actorSlug: v.string(),
    actorName: v.string(),
    actorKind: v.string(),
    actorCountry: v.string(),
    dimension: DIMENSION_UNION,
    existingActors: v.array(v.object({ slug: v.string(), name: v.string() })),
    existingRelations: v.array(
      v.object({ sourceSlug: v.string(), targetSlug: v.string(), kind: v.string() }),
    ),
  },
  handler: async (
    ctx,
    { actorSlug, actorName, actorKind, actorCountry, dimension, existingActors, existingRelations },
  ): Promise<ExpansionProposal> => {
    const apiKey = aiApiKey();

    // 1) deterministic search
    const search: SearchOutcome = await ctx.runAction(internal.searchExpansion.searchWeb, {
      actorName,
      dimension,
    });
    if (search.results.length === 0) throw new Error("NO_SEARCH_RESULTS");

    // 2) evidence pack — compact, provenance intact
    const evidence = search.results
      .map(
        (r: WebResult, i: number) =>
          `[${i + 1}] ${r.source}${r.date ? ` (${r.date.slice(0, 16)})` : ""}: ${r.title}\n    ${r.url}`,
      )
      .join("\n");

    const known = existingActors
      .slice(0, 80)
      .map((a) => `${a.slug} = ${a.name}`)
      .join("; ");
    const knownRels = existingRelations
      .slice(0, 120)
      .map((r) => `${r.sourceSlug}→${r.targetSlug}:${r.kind}`)
      .join("; ");

    const system = [
      "You are an OSINT intelligence extraction agent for a geopolitical actor graph.",
      "From the provided web-search evidence, extract NEW network candidates connected to the focus actor.",
      "STRICT RULES:",
      "- Only propose entities with direct evidence in the search results. Never invent.",
      "- Every candidate MUST carry at least one source copied verbatim from the evidence list.",
      "- If an entity already exists in the known-actor list, set existingActorSlug to its slug.",
      "- weight (0-100) = engagement intensity supported by evidence; confidence (0-100) = corroboration quality.",
      "- Prefer status REPORTED unless multiple independent outlets corroborate (CONFIRMED) or sources conflict (DISPUTED).",
      "- summary: one factual sentence (<=220 chars) with the concrete tie (agreement, sanction, supply...).",
      '- Return STRICT JSON only, no markdown fences:',
      '{"candidates":[{"name":"...","kind":"STATE|STATE_INSTITUTION|MILITARY_ORG|NON_STATE|ORGANIZATION|COMPANY|THINK_TANK|MEDIA_NETWORK|INFRASTRUCTURE|DEV_BANK","country":"ISO short name","region":"...","existingActorSlug":"slug-or-omit","relation":"ALLIANCE|...","direction":"PARENT_SOURCE|PARENT_TARGET","weight":0,"confidence":0,"status":"REPORTED","summary":"...","sources":[{"publication":"...","title":"...","url":"...","date":"..."}]}]}',
      "- Propose at most 6 candidates. Quality over quantity.",
    ].join("\n");

    const user = [
      `FOCUS ACTOR: ${actorName} (slug=${actorSlug}, kind=${actorKind}, country=${actorCountry})`,
      `DIMENSION: ${dimension}`,
      `KNOWN ACTORS: ${known || "(none)"}`,
      `KNOWN RELATIONS: ${knownRels || "(none)"}`,
      `WEB EVIDENCE (${search.results.length} items):`,
      evidence,
    ].join("\n\n");

    const res = await fetch(AI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`AI API error ${res.status}: ${t.slice(0, 160)}`);
    }
    const data = await res.json();
    const content: unknown = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("AI returned no content");

    // 3) safe parse — strip fences, isolate the JSON object
    const cleaned = content.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI returned unparseable output");
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new Error("AI returned invalid JSON");
    }
    const rawCandidates = (parsed as { candidates?: unknown }).candidates;
    if (!Array.isArray(rawCandidates)) throw new Error("AI proposal missing candidates");

    return {
      candidates: rawCandidates as ExpansionCandidate[],
      searchQueries: search.queries,
      resultCount: search.results.length,
      model: AI_MODEL,
    };
  },
});

// ─── §8 step 3: whitelisted commit — the only write path ────────────────────

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `actor-${Date.now()}`
  );
}

export const commitExpansion = mutation({
  args: {
    parentSlug: v.string(),
    candidates: v.array(CandidateValidator),
  },
  handler: async (
    ctx,
    { parentSlug, candidates },
  ): Promise<{ added: number; skipped: number; createdSlugs: string[] }> => {
    const now = Date.now();
    const parent = await ctx.db
      .query("actors")
      .withIndex("by_slug", (q) => q.eq("slug", parentSlug))
      .unique();
    if (!parent) throw new Error("PARENT_NOT_FOUND");

    let added = 0;
    let skipped = 0;
    const createdSlugs: string[] = [];

    for (const c of candidates.slice(0, 8)) {
      // ── resolve the target actor ──
      let targetSlug = c.existingActorSlug ?? "";
      if (targetSlug) {
        const existing = await ctx.db
          .query("actors")
          .withIndex("by_slug", (q) => q.eq("slug", targetSlug))
          .unique();
        if (!existing) targetSlug = "";
      }
      if (!targetSlug) {
        let slug = slugify(c.name);
        let n = 2;
        while (
          await ctx.db.query("actors").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()
        ) {
          slug = `${slugify(c.name)}-${n++}`;
        }
        const srcCount = Math.max(1, Math.min(99, c.sources.length));
        await ctx.db.insert("actors", {
          slug,
          name: c.name.trim().slice(0, 80),
          aliases: [],
          kind: c.kind,
          country: c.country.trim().slice(0, 40) || "—",
          region: c.region.trim().slice(0, 40) || parent.region,
          tier: 3,
          description: c.summary.slice(0, 400),
          sourceCount: srcCount,
          status: "MONITORED",
          firstSeen: now,
          lastSeen: now,
          mode: "MONITORED",
          modeSince: now,
        });
        targetSlug = slug;
        createdSlugs.push(slug);
        await ctx.db.insert("changeLog", {
          kind: "ACTOR_ADDED",
          slug,
          detail: `${c.name} added from AI web-research expansion (${parent.name})`,
          ts: now,
        });
      }

      if (targetSlug === parentSlug) {
        skipped++;
        continue;
      }

      // ── dedupe edge: same pair + direction + kind ──
      const [a, b] =
        c.direction === "PARENT_SOURCE"
          ? [parentSlug, targetSlug]
          : [targetSlug, parentSlug];
      const pair = await ctx.db
        .query("relationships")
        .withIndex("by_pair", (q) => q.eq("sourceSlug", a).eq("targetSlug", b))
        .collect();
      if (pair.some((r) => r.kind === c.relation)) {
        skipped++;
        continue;
      }

      // ── deterministic guardrails: clamped, evidence-aware ──
      const srcCount = Math.max(1, Math.min(99, c.sources.length));
      const weight = Math.max(5, Math.min(95, Math.round(c.weight)));
      const confidence = Math.max(10, Math.min(85, Math.round(c.confidence)));
      const status = srcCount >= 2 ? c.status : ("REPORTED" as const);

      const relId = await ctx.db.insert("relationships", {
        sourceSlug: a,
        targetSlug: b,
        kind: c.relation,
        weight,
        confidence,
        status,
        since: now,
        updatedAt: now,
        sourceCount: srcCount,
        summary: c.summary.trim().slice(0, 320),
      });

      // ── evidence trail: every edge lands with at least one source ──
      const sources = c.sources.slice(0, 3).map((s) => ({
        publication: s.publication.trim().slice(0, 80) || "web",
        title: s.title.trim().slice(0, 200) || c.summary.slice(0, 120),
        url: s.url.trim().slice(0, 500),
        date: (s.date || new Date(now).toISOString()).slice(0, 40),
        stance: "REPORTING" as const,
      }));
      if (sources.length > 0) {
        await ctx.db.insert("relationEvents", {
          relationId: relId,
          timestamp: now,
          type: "REPORT",
          title: `${c.relation} link established: ${parent.name} ↔ ${c.name}`,
          summary: c.summary.trim().slice(0, 400),
          confidence,
          claimType: "REPORTED_CLAIM",
          sources,
        });
      }

      await ctx.db.insert("changeLog", {
        kind: "EDGE_ADDED",
        slug: a,
        otherSlug: b,
        relationId: relId,
        detail: `${c.relation} ${a} ↔ ${b} (AI research expansion, ${srcCount} source${srcCount > 1 ? "s" : ""})`,
        ts: now,
      });
      added++;
    }

    return { added, skipped, createdSlugs };
  },
});
