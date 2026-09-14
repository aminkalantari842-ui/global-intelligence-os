// Article → Graph evidence flow.
//
// One publication's claim becomes a candidate relationEvent for an existing
// relationship edge. Three surfaces:
//   getActorRoster   — deterministic actor list for the resolution dropdowns.
//   proposeClaimCandidates — action: sends title + summary + article text to
//                      the model with the actor roster, gets back claim
//                      candidates (source/target/actor names + relation kind +
//                      event type + summary + supporting quote). The model only
//                      proposes — never writes, never scores.
//   commitClaim      — mutation: the sole write path. Whitelist + clamp +
//                      duplicate guard, always claimType REPORTED (single
//                      source: the publication), always a changeLog row.
// Rules honored: AI proposes / evidence commits; single-source events cap at
// REPORTED; all scores come from deterministic guards, never the model.

import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const API_URL = "https://api.tokenrouter.com/v1/chat/completions";
const MODEL = "z-ai/glm-5.3-free";

const EVENT_TYPES = [
  "STATEMENT",
  "MEETING",
  "SANCTION",
  "STRIKE",
  "TRANSFER",
  "REPORT",
  "AGREEMENT",
  "POSTURE",
  "ELECTION",
  "REFERENDUM",
  "TREATY_SIGNED",
  "MILITARY_EXERCISE",
  "MISSILE_TEST",
  "BLOCKADE",
  "SEIZURE",
  "DIPLOMATIC_SUMMIT",
  "AMBASSADOR_RECALL",
  "RELATIONS_SEVERED",
  "WITHDRAWAL",
  "RECOGNITION",
  "CYBER_ATTACK",
  "DOMESTIC_UPHEAVAL",
] as const;

const RELATION_KINDS = [
  "ALLIANCE",
  "COOPERATION",
  "NEGOTIATION",
  "SUPPLY",
  "PROXY_SUPPORT",
  "COMPETITION",
  "TENSION",
  "SANCTIONS",
  "CONFLICT",
  "INTERDEPENDENCE",
  "MEDIATION",
  "DETERRENCE",
  "NON_AGGRESSION",
  "TREATY",
  "SECURITY_CONSULT",
  "INTEL_SHARING",
  "TRANSIT_ACCESS",
  "DEBT_AID",
  "DEPENDENCY",
] as const;

// ─── 1. Actor roster for resolution dropdowns ───────────────────────────────

export const getActorRoster = query({
  args: {},
  handler: async (ctx) => {
    const actors = await ctx.db.query("actors").collect();
    return actors
      .map((a) => ({ slug: a.slug, name: a.name, kind: a.kind, country: a.country }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ─── 2. AI proposal action (read-only, proposes candidates) ─────────────────

export const proposeClaimCandidates = action({
  args: {
    title: v.string(),
    summary: v.string(),
    articleText: v.string(),
    actors: v.array(
      v.object({ slug: v.string(), name: v.string(), kind: v.string(), country: v.string() }),
    ),
  },
  handler: async (_ctx, { title, summary, articleText, actors }) => {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) throw new Error("AI_API_KEY_NOT_CONFIGURED");

    const roster = actors
      .slice(0, 120)
      .map((a) => `- ${a.slug} | ${a.name} | ${a.kind} | ${a.country}`)
      .join("\n");

    const system = [
      "You extract explicit, textually grounded claims about bilateral relations",
      "between named actors from a think-tank publication, for an evidence-first",
      "geopolitical relationship graph. STRICT RULES:",
      "1. Propose ONLY claims stated in the provided text — no outside knowledge, no inference beyond the text.",
      "2. Each claim names exactly two actors that appear in the actor roster (return their slug). If one side of the claim is not in the roster, return it with actorResolved:false and the raw name string.",
      "3. kind must be one of: " + RELATION_KINDS.join(", ") + ".",
      "4. eventType must be one of: " + EVENT_TYPES.join(", ") + ".",
      "5. summary: one factual sentence (max 220 chars) that could serve as the event title, language of the article.",
      "6. quote: the single most supporting sentence copied verbatim from the text (max 300 chars).",
      '7. Return JSON only: {"candidates":[{sourceSlug,targetSlug,sourceName,targetName,actorResolved,kind,eventType,summary,quote,stance}]} — stance is CORROBORATING|REPORTING|SKEPTICAL (how the publication treats the claim), max 6 candidates, [] if none.',
    ].join(" ");

    const user = [
      `PUBLICATION TITLE: ${title}`,
      `SUMMARY: ${summary.slice(0, 800)}`,
      `ARTICLE TEXT (truncated): ${articleText.slice(0, 9000)}`,
      `ACTOR ROSTER:`,
      roster,
    ].join("\n");

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 1800,
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

    // Parse with a brace-window fallback (models sometimes wrap JSON in prose).
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const s = content.indexOf("{");
      const e = content.lastIndexOf("}");
      if (s >= 0 && e > s) {
        try {
          parsed = JSON.parse(content.slice(s, e + 1));
        } catch {
          /* fall through */
        }
      }
    }
    const obj = parsed as { candidates?: unknown } | null;
    if (!obj || !Array.isArray(obj.candidates)) return [];

    type Candidate = {
      sourceSlug?: unknown;
      targetSlug?: unknown;
      sourceName?: unknown;
      targetName?: unknown;
      actorResolved?: unknown;
      kind?: unknown;
      eventType?: unknown;
      summary?: unknown;
      quote?: unknown;
      stance?: unknown;
    };
    const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
    const VALID_STANCE = new Set(["CORROBORATING", "REPORTING", "SKEPTICAL"]);
    const out = (obj.candidates as Candidate[])
      .map((c) => ({
        sourceSlug: str(c.sourceSlug),
        targetSlug: str(c.targetSlug),
        sourceName: str(c.sourceName),
        targetName: str(c.targetName),
        actorResolved: c.actorResolved === true,
        kind: str(c.kind),
        eventType: str(c.eventType),
        summary: str(c.summary),
        quote: str(c.quote),
        stance: VALID_STANCE.has(str(c.stance)) ? str(c.stance) : "REPORTING",
      }))
      .filter((c) => c.summary.length > 0 && (c.sourceName || c.sourceSlug))
      .slice(0, 6);
    return out;
  },
});

// ─── 3. Commit — the only write path, fully deterministic ───────────────────

export const commitClaim = mutation({
  args: {
    pubId: v.id("publications"),
    relationId: v.id("relationships"),
    eventType: v.string(),
    title: v.string(),
    summary: v.string(),
    quote: v.string(),
    stance: v.string(),
    actorALabel: v.string(),
    actorBLabel: v.string(),
  },
  handler: async (
    ctx,
    { pubId, relationId, eventType, title, summary, quote, stance, actorALabel, actorBLabel },
  ) => {
    const rel = await ctx.db.get(relationId);
    if (!rel) throw new Error("RELATION_NOT_FOUND");
    const pub = await ctx.db.get(pubId);
    if (!pub) throw new Error("PUB_NOT_FOUND");

    // Validate against the schema unions server-side.
    if (!(EVENT_TYPES as readonly string[]).includes(eventType)) {
      throw new Error("INVALID_EVENT_TYPE");
    }
    if (!["CORROBORATING", "REPORTING", "SKEPTICAL"].includes(stance)) {
      throw new Error("INVALID_STANCE");
    }

    // ── Duplicate guard: same pub + same edge → reject ──
    const existing = await ctx.db
      .query("relationEvents")
      .withIndex("by_relation", (q) => q.eq("relationId", relationId))
      .collect();
    const dup = existing.find((e) =>
      e.sources.some((s) => s.url === pub.url) && e.summary.slice(0, 80) === summary.slice(0, 80),
    );
    if (dup) throw new Error("DUPLICATE_CLAIM");

    const now = Date.now();
    const sourceDate = new Date(pub.publishedAt).toISOString().slice(0, 10);

    const eventId = await ctx.db.insert("relationEvents", {
      relationId,
      timestamp: pub.publishedAt,
      type: eventType as (typeof EVENT_TYPES)[number],
      title: title.trim().slice(0, 220),
      summary: summary.trim().slice(0, 600),
      confidence: 55, // single source, think-tank tier handled by edge aggregation
      claimType: "REPORTED_CLAIM", // single source — cannot be CONFIRMED (rule 3)
      sources: [
        {
          publication: pub.thinkTankSlug,
          title: pub.title.slice(0, 300),
          url: pub.url,
          date: sourceDate,
          stance: stance as "CORROBORATING" | "REPORTING" | "SKEPTICAL",
        },
      ],
    });

    // Touch the edge's freshness (content untouched — deterministic).
    await ctx.db.patch(relationId, { updatedAt: now });

    // Audit trail.
    await ctx.db.insert("changeLog", {
      kind: "EDGE_UPDATED",
      slug: rel.sourceSlug,
      otherSlug: rel.targetSlug,
      relationId,
      detail: `EVIDENCE_ADDED from ${pub.thinkTankSlug}: ${summary.slice(0, 120)}`,
      ts: now,
    });

    return { eventId, actorALabel, actorBLabel };
  },
});
