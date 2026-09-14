// H. Content alerts & signals — rule-based monitoring over new publications.
// Deterministic first: keyword matching and actor mentions are pure string
// ops; tank-posture shift uses a fixed sentiment lexicon. No LLM here (the
// optional narrative labeling happens in aiAnalysis, stored as ASSESSMENT).

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DAY = 86_400_000;
const BUCKET_MS = 12 * 3_600_000;
const WS = "shared-workspace";

// Fixed posture lexicon (deterministic tone score for tank-shift detection).
const POSITIVE = [
  "breakthrough", "cooperation", "agreement", "progress", "partnership",
  "de-escalation", "ceasefire", "stability", "reform", "opening",
  "توافق", "همکاری", "پیشرفت", "ثبات", "آتش‌بس",
];
const NEGATIVE = [
  "threat", "escalation", "crisis", "conflict", "sanctions", "strike",
  "collapse", "risk", "warning", "tension", "attack",
  "تهدید", "تنش", "بحران", "حمله", "تحریم", "خطر",
];

export function postureScore(text: string): number {
  const hay = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE) if (hay.includes(w)) score++;
  for (const w of NEGATIVE) if (hay.includes(w)) score--;
  return Math.max(-5, Math.min(5, score));
}

// ─── Rule CRUD ──────────────────────────────────────────────────────────────

export const getRules = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db.query("contentAlertRules").withIndex("by_user", (q) => q.eq("userId", WS)).collect(),
});

export const addRule = mutation({
  args: {
    kind: v.union(v.literal("KEYWORD"), v.literal("ACTOR"), v.literal("TANK_SHIFT")),
    value: v.string(),
  },
  handler: async (ctx, { kind, value }) => {
    const clean = value.trim().slice(0, 160);
    if (!clean) throw new Error("EMPTY_VALUE");
    return await ctx.db.insert("contentAlertRules", {
      userId: WS,
      kind,
      value: clean,
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

export const toggleRule = mutation({
  args: { id: v.id("contentAlertRules"), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    await ctx.db.patch(id, { enabled });
  },
});

export const deleteRule = mutation({
  args: { id: v.id("contentAlertRules") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ─── Fired alerts feed ──────────────────────────────────────────────────────

export const listContentAlerts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    await ctx.db
      .query("contentAlerts")
      .withIndex("by_ts", (q) => q.gte("ts", 0))
      .order("desc")
      .take(limit ?? 30),
});

// ─── Evaluation ─────────────────────────────────────────────────────────────

/**
 * Evaluate all enabled rules against the newest publications (last 2 days).
 * Dedupe: one fired alert per (rule, pub) pair — checked via existing rows.
 */
export const evaluateContentRules = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ created: number }> => {
    const rules = (await ctx.db.query("contentAlertRules").collect()).filter((r) => r.enabled);
    if (rules.length === 0) return { created: 0 };

    const cutoff = Date.now() - 2 * DAY;
    const pubs = (await ctx.db.query("publications").collect())
      .filter((p) => p.publishedAt >= cutoff)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 300);
    if (pubs.length === 0) return { created: 0 };

    // Actor mentions for ACTOR rules (deterministic reverse index).
    const mentionsByPub = new Map<string, Set<string>>();
    for (const m of await ctx.db.query("actorMentions").collect()) {
      (mentionsByPub.get(m.pubId) ?? mentionsByPub.set(m.pubId, new Set()).get(m.pubId)!).add(m.actorSlug);
    }

    // Tank-shift baseline: mean posture per (tank, topic) over older pubs.
    const allPubs = await ctx.db.query("publications").collect();
    const postureHistory: Record<string, number[]> = {};
    for (const p of allPubs) {
      if (p.publishedAt >= cutoff) continue; // baseline = older corpus only
      const key = `${p.thinkTankSlug}:${p.topicFa ?? "—"}`;
      (postureHistory[key] ??= []).push(postureScore(`${p.title} ${p.summary}`));
    }
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

    // Existing fired pairs for dedupe (12h bucket guard).
    const recent = await ctx.db
      .query("contentAlerts")
      .withIndex("by_ts", (q) => q.gte("ts", 0))
      .order("desc")
      .take(300);
    const fired = new Set(recent.map((a) => `${String(a.ruleId)}:${String(a.pubId)}`));

    let created = 0;
    for (const rule of rules) {
      for (const p of pubs) {
        if (created >= 25) return { created }; // bounded per run
        const key = `${String(rule._id)}:${String(p._id)}`;
        if (fired.has(key)) continue;

        let hit = false;
        let detail = "";
        if (rule.kind === "KEYWORD") {
          const needle = rule.value.toLowerCase();
          hit = p.title.toLowerCase().includes(needle) || p.summary.toLowerCase().includes(needle);
          if (hit) detail = `matched "${rule.value}"`;
        } else if (rule.kind === "ACTOR") {
          hit = mentionsByPub.get(p._id)?.has(rule.value) ?? false;
          if (hit) detail = `newly mentions ${rule.value}`;
        } else {
          // TANK_SHIFT: current posture deviates ≥2 from the tank-topic baseline.
          const key2 = `${p.thinkTankSlug}:${p.topicFa ?? "—"}`;
          const hist = postureHistory[key2];
          if (hist && hist.length >= 5) {
            const now = postureScore(`${p.title} ${p.summary}`);
            const delta = now - mean(hist);
            if (Math.abs(delta) >= 2) {
              hit = true;
              detail = `posture shift ${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10} on ${p.topicFa ?? "topic"}`;
            }
          }
        }
        if (!hit) continue;

        await ctx.db.insert("contentAlerts", {
          ruleId: rule._id,
          pubId: p._id,
          title: p.title.slice(0, 220),
          detail,
          ts: Date.now(),
        });
        fired.add(key);
        created++;
      }
    }
    return { created };
  },
});
