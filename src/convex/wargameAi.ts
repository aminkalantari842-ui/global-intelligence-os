// Wargame Studio backend: persistence for SIMULATION runs + AI analysis
// layer (red-team critique, branch narrative, post-run brief). The AI is the
// analysis surface only — it reads a serialized transcript and returns text.
// It never writes to relationships, never sets rungs, and every AI output is
// stored as part of the wargame row (SIMULATION class), never as evidence.

import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AI_CHAT_URL, AI_MODEL, aiApiKey } from "./aiConfig";

const API_URL = AI_CHAT_URL;
const MODEL = AI_MODEL;

async function callModel(apiKey: string, system: string, user: string, maxTokens = 900): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI API error ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  const content: unknown = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("AI returned no content");
  return content.trim();
}

// ─── §A Live pre-run briefing (real data, deterministic) ────────────────────

/**
 * Deterministic situation pack for the selected pair: recent events, edge
 * stats, and the latest think-tank headlines mentioning either actor.
 * No AI here — this is the evidence the studio calibrates on.
 */
export const liveBriefing = query({
  args: { aSlug: v.string(), bSlug: v.string() },
  handler: async (ctx, { aSlug, bSlug }) => {
    const now = Date.now();
    const DAY = 86_400_000;

    const relations = await ctx.db.query("relationships").collect();
    const between = relations.filter(
      (r) =>
        (r.sourceSlug === aSlug && r.targetSlug === bSlug) ||
        (r.sourceSlug === bSlug && r.targetSlug === aSlug),
    );

    // Recent events on those edges (90d), newest first.
    const events = [];
    for (const r of between) {
      const evs = await ctx.db
        .query("relationEvents")
        .withIndex("by_relation", (q) => q.eq("relationId", r._id))
        .collect();
      events.push(...evs.map((e) => ({ ...e, relationId: r._id })));
    }
    events.sort((a, b) => b.timestamp - a.timestamp);
    const recent = events.filter((e) => e.timestamp >= now - 90 * DAY).slice(0, 8);

    // Latest headlines mentioning either actor (30d), from actorMentions.
    const heads = [];
    for (const slug of [aSlug, bSlug]) {
      const mentions = await ctx.db
        .query("actorMentions")
        .withIndex("by_actor", (q) => q.eq("actorSlug", slug))
        .collect();
      const fresh = mentions.filter((m) => m.ts >= now - 30 * DAY);
      fresh.sort((m1, m2) => m2.ts - m1.ts);
      for (const m of fresh.slice(0, 4)) {
        const pub = await ctx.db.get(m.pubId);
        if (pub) heads.push({ title: pub.title, url: pub.url, ts: m.ts, tank: m.tankSlug });
      }
    }
    heads.sort((h1, h2) => h2.ts - h1.ts);

    return {
      now,
      edges: between.map((r) => ({
        _id: r._id,
        kind: r.kind,
        weight: r.weight,
        confidence: r.confidence,
        status: r.status,
        updatedAt: r.updatedAt,
      })),
      recentEvents: recent.map((e) => ({
        _id: e._id,
        relationId: e.relationId,
        timestamp: e.timestamp,
        type: e.type,
        title: e.title,
        confidence: e.confidence,
      })),
      headlines: heads.slice(0, 8).map((h) => ({
        title: h.title,
        url: h.url,
        tank: h.tank,
        ts: h.ts,
      })),
    };
  },
});

// ─── Wargame persistence ────────────────────────────────────────────────────

export const listWargames = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("wargames")
      .withIndex("by_ts")
      .order("desc")
      .take(Math.min(limit ?? 15, 40));
  },
});

export const saveWargame = mutation({
  args: {
    title: v.string(),
    aSlug: v.string(),
    bSlug: v.string(),
    mode: v.union(v.literal("PAIR"), v.literal("BLOC")),
    config: v.string(),
    transcript: v.string(),
    outcome: v.string(),
    basisGrade: v.string(),
    analysis: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { title, aSlug, bSlug, mode, config, transcript, outcome, basisGrade, analysis, model }) => {
    return await ctx.db.insert("wargames", {
      title: title.trim().slice(0, 140),
      aSlug,
      bSlug,
      mode,
      config: config.slice(0, 20_000),
      transcript: transcript.slice(0, 60_000),
      outcome,
      basisGrade,
      aiAnalysis: analysis?.slice(0, 40_000),
      model,
      ts: Date.now(),
    });
  },
});

export const deleteWargame = mutation({
  args: { id: v.id("wargames") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ─── §B AI analysis layer (analysis only — labeled, referenced) ─────────────

const AI_SYSTEM_BASE = [
  "You are a geopolitical red-team analyst embedded in a wargaming studio.",
  "You receive a SIMULATION transcript (escalation rungs per round between two sides) plus the real evidence summary it was calibrated on.",
  "ABSOLUTE RULES:",
  "- You are analyzing a simulation. Never present simulated rungs as observed facts.",
  "- Only reference evidence that appears in the provided REAL EVIDENCE section.",
  "- If evidence is insufficient for a judgment, say so explicitly.",
  "- Respond in concise Persian (Farsi).",
].join("\n");

/** §B7 Red-team critique of a completed run. */
export const aiCritique = action({
  args: {
    aName: v.string(),
    bName: v.string(),
    outcome: v.string(),
    transcriptJson: v.string(),
    evidenceJson: v.string(),
  },
  handler: async (_ctx, { aName, bName, outcome, transcriptJson, evidenceJson }): Promise<{ critique: string }> => {
    const apiKey = aiApiKey();
    const system = AI_SYSTEM_BASE;
    const user = [
      "REAL EVIDENCE (stored, observed):",
      evidenceJson.slice(0, 6000),
      "",
      `SIMULATION TRANSCRIPT (${aName} vs ${bName}, outcome=${outcome}):`,
      transcriptJson.slice(0, 6000),
      "",
      "TASK: Red-team this simulation. In Persian, produce:",
      "1. انتقاد از پیشفرض‌ها (which modeled assumptions look wrong vs the real evidence)",
      "2. بازیگران یا عوامل جا‌افتاده (missing actors/factors the transcript ignores)",
      "3. سناریوهای جایگزین (2–3 alternate courses the deterministic engine would miss)",
      "Keep it under 350 words. Use short bullet lines with Persian headers.",
    ].join("\n");
    const critique = await callModel(apiKey, system, user, 800);
    return { critique };
  },
});

/** §B6 Narrative for one branch/round — every claim tied to the transcript. */
export const aiNarrate = action({
  args: {
    aName: v.string(),
    bName: v.string(),
    transcriptJson: v.string(),
    evidenceJson: v.string(),
  },
  handler: async (_ctx, { aName, bName, transcriptJson, evidenceJson }): Promise<{ narrative: string }> => {
    const apiKey = aiApiKey();
    const user = [
      "REAL EVIDENCE (stored, observed):",
      evidenceJson.slice(0, 5000),
      "",
      "SIMULATION TRANSCRIPT:",
      transcriptJson.slice(0, 5000),
      "",
      "TASK: In Persian, write a 4–6 sentence analyst narrative of HOW this escalation path unfolds, round by round, explicitly noting where each turn is model-driven versus evidence-supported. Start every evidence-backed sentence with «بر پایه شواهد» and every purely simulated statement with «در شبیه‌سازی».",
    ].join("\n");
    const narrative = await callModel(apiKey, AI_SYSTEM_BASE, user, 700);
    return { narrative };
  },
});

/** §B10 Post-run structured brief (situation / branches / indicators). */
export const aiBrief = action({
  args: {
    aName: v.string(),
    bName: v.string(),
    outcome: v.string(),
    basisGrade: v.string(),
    configJson: v.string(),
    transcriptJson: v.string(),
    evidenceJson: v.string(),
  },
  handler: async (_ctx, { aName, bName, outcome, basisGrade, configJson, transcriptJson, evidenceJson }): Promise<{ brief: string }> => {
    const apiKey = aiApiKey();
    const user = [
      "REAL EVIDENCE (stored, observed):",
      evidenceJson.slice(0, 5000),
      "",
      `RUN CONFIG (params, seed, basis grade=${basisGrade}):`,
      configJson.slice(0, 2000),
      "",
      `SIMULATION TRANSCRIPT (${aName} vs ${bName}, outcome=${outcome}):`,
      transcriptJson.slice(0, 5000),
      "",
      "TASK: In Persian, write a structured intelligence brief of this run with exactly these Persian headers:",
      "«وضعیت پایه:» one paragraph on the real evidence basis and its grade,",
      "«مسیر شبیه‌سازی:» 3-5 bullets on the escalation path and outcome,",
      "«شاخص‌های پایش:» 4-6 concrete observable indicators to watch in the real world, each derived from the evidence or the branches,",
      "«محدودیت‌ها:» one short paragraph on what this simulation cannot claim.",
    ].join("\n");
    const brief = await callModel(apiKey, AI_SYSTEM_BASE, user, 900);
    return { brief };
  },
});

// ─── Attach AI analysis to a stored run ─────────────────────────────────────

export const attachAnalysis = mutation({
  args: { id: v.id("wargames"), analysis: v.string(), model: v.string() },
  handler: async (ctx, { id, analysis, model }) => {
    await ctx.db.patch(id, { aiAnalysis: analysis.slice(0, 40_000), model });
  },
});
