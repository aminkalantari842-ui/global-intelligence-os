// Deterministic graph metrics — pure functions over stored data only.
// No LLM involvement: scores are transparent formulas over evidence counts,
// confidence and recency (architectural rules 4 & 7). Shared between the
// canvas renderer and the Dashboard panels.

import type { GraphActor, GraphRelation } from "./types";

// ─── Persian numerals ────────────────────────────────────────────────────────
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert latin digits in a string to Persian digits. */
export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** Locale-aware number formatting: Persian digits when lang is "fa". */
export function fmtNum(n: number, lang: string): string {
  const s = n.toLocaleString("en-US");
  return lang === "fa" ? toFaDigits(s) : s;
}

/** Compact count: 1,240 → "1.2k". */
export function fmtCompact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Locale-aware relative time: "۳ ساعت" / "5d". */
export function fmtAgo(ts: number, lang: string): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return lang === "fa" ? "الان" : "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return lang === "fa" ? `${toFaDigits(mins)} دقیقه` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "fa" ? `${toFaDigits(hours)} ساعت` : `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return lang === "fa" ? `${toFaDigits(days)} روز` : `${days}d`;
  const months = Math.floor(days / 30);
  return lang === "fa" ? `${toFaDigits(months)} ماه` : `${months}mo`;
}

// ─── Bilingual display names ────────────────────────────────────────────────
// The canonical registry stores latin names; this overlay maps the core
// dataset to Persian display names so the canvas is truly bilingual.

const FA_NAMES: Record<string, string> = {
  iran: "ایران",
  israel: "اسرائیل",
  "united-states": "ایالات متحده",
  russia: "روسیه",
  china: "چین",
  "european-union": "اتحادیه اروپا",
  iaea: "آژانس بین‌المللی انرژی اتمی",
  "saudi-arabia": "عربستان سعودی",
  hezbollah: "حزب‌الله",
  houthis: "انصارالله (حوثی‌ها)",
  hamas: "حماس",
  nato: "ناتو",
  ukraine: "اوکراین",
  turkey: "ترکیه",
};

export function actorDisplayName(actor: GraphActor, lang: string): string {
  if (lang === "fa") return FA_NAMES[actor.slug] ?? actor.name;
  return actor.name;
}

// ─── Risk score (deterministic, explainable) ────────────────────────────────
// 0–100 per actor, three transparent components:
//   tension — share of adversarial edges weighted by their weight
//   contested — share of edges that are DISPUTED / low-confidence
//   recency — activity freshness of the actor's most recent edge update
export interface RiskBreakdown {
  tension: number; // 0–100
  contested: number; // 0–100
  recency: number; // 0–100
  risk: number; // 0–100 composite
}

const ADVERSARIAL = new Set(["TENSION", "CONFLICT", "SANCTIONS", "COMPETITION", "PROXY_SUPPORT"]);
const HALF_LIFE_DAYS = 45;

function recencyScore(ts: number, now: number): number {
  const ageDays = Math.max(0, (now - ts) / 86_400_000);
  return Math.round(100 * Math.pow(0.5, ageDays / HALF_LIFE_DAYS));
}

export function computeRisk(
  actor: GraphActor,
  relations: GraphRelation[],
  now: number,
): RiskBreakdown {
  const mine = relations.filter(
    (r) => r.sourceSlug === actor.slug || r.targetSlug === actor.slug,
  );
  if (mine.length === 0) return { tension: 0, contested: 0, recency: 0, risk: 0 };

  const weightSum = mine.reduce((s, r) => s + Math.max(1, r.weight), 0);
  const tension = Math.round(
    (mine.reduce((s, r) => s + (ADVERSARIAL.has(r.kind) ? Math.max(1, r.weight) : 0), 0) /
      weightSum) *
      100,
  );
  const contested = Math.round(
    (mine.filter((r) => r.status === "DISPUTED" || r.confidence < 45).length / mine.length) * 100,
  );
  const mostRecent = Math.max(...mine.map((r) => r.updatedAt));
  const recency = recencyScore(mostRecent, now);

  const risk = Math.round(0.5 * tension + 0.25 * contested + 0.25 * recency);
  return { tension, contested, recency, risk };
}

// ─── Position score ─────────────────────────────────────────────────────────
// Brokerage proxy: normalized degree × mean edge weight. Deterministic.
export function computePosition(actor: GraphActor, relations: GraphRelation[]): number {
  const mine = relations.filter(
    (r) => r.sourceSlug === actor.slug || r.targetSlug === actor.slug,
  );
  if (mine.length === 0) return 0;
  const degree = mine.length;
  const actorSet = new Set(relations.flatMap((r) => [r.sourceSlug, r.targetSlug]));
  const maxDegree = Math.max(degree, actorSet.size, 1);
  const meanWeight = mine.reduce((s, r) => s + r.weight, 0) / mine.length;
  return Math.round((degree / maxDegree) * meanWeight);
}

// ─── Edge recency grading (for Δ markers) ───────────────────────────────────
export type Recency = "fresh" | "recent" | "stale";

export function edgeRecency(updatedAt: number, now: number): Recency {
  const age = now - updatedAt;
  if (age <= 7 * 86_400_000) return "fresh";
  if (age <= 30 * 86_400_000) return "recent";
  return "stale";
}

// ─── Leaderboards ───────────────────────────────────────────────────────────
export interface ActorScoreRow {
  slug: string;
  name: string; // already localized by caller
  value: number;
  sub: string;
}

export function topByRisk(
  actors: GraphActor[],
  relations: GraphRelation[],
  lang: string,
  now: number,
  limit = 5,
): ActorScoreRow[] {
  return actors
    .map((a) => {
      const rb = computeRisk(a, relations, now);
      return {
        slug: a.slug,
        name: actorDisplayName(a, lang),
        value: rb.risk,
        sub: lang === "fa" ? "امتیاز ریسک" : "risk",
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function topByPosition(
  actors: GraphActor[],
  relations: GraphRelation[],
  lang: string,
  limit = 5,
): ActorScoreRow[] {
  const rows = actors.map((a) => ({
    slug: a.slug,
    name: actorDisplayName(a, lang),
    value: computePosition(a, relations),
    sub: lang === "fa" ? "موقعیت شبکه‌ای" : "position",
  }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((r) => ({ ...r, value: Math.round((r.value / max) * 100) }));
}
