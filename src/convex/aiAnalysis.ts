// D-layer: AI analysis over the think-tank corpus. Every artifact is stored
// in aiArtifacts with (pubIds, model, ts) — ASSESSMENT-class output that is
// never merged into observed data (rules 4 & 5). The model reads only stored
// rows and every prompt demands verbatim anchoring, so each statement traces
// back to article → tank → fetch time. Retrieval/persistence live in
// aiCorpus.ts to keep this module action-only.

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { AI_CHAT_URL, AI_MODEL, aiApiKey } from "./aiConfig";

const MODEL = AI_MODEL;

async function runAI(system: string, user: string, maxTokens = 1200): Promise<string> {
  const apiKey = aiApiKey();
  const res = await fetch(AI_CHAT_URL, {
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

const BASE_RULES =
  "You are a geopolitical intelligence analyst working over a stored think-tank corpus. " +
  "STRICT RULES: (1) Use ONLY the provided article texts — no outside knowledge. " +
  "(2) Anchor every claim to its article with [A1], [A2]… citation markers. " +
  "(3) Distinguish what the article argues from what you assess. " +
  "(4) Output is an ASSESSMENT artifact — analytical, labeled, never presented as observed fact. " +
  "Answer in Persian (Farsi) unless asked otherwise.";

const ref = api.aiCorpus;
type PubT = { _id: string; title: string; tank: string; text: string };
// Id<"publications">[] — kept as a loose alias because the FunctionReference
// generic on the public api cannot be used in type position (TS2344).
type PubId = any;

// ─── D1 Per-article brief (5-bullet digest) ────────────────────────────────

export const articleBrief = action({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) => {
    const pub = (await ctx.runQuery(ref.pubFetch, { pubId })) as PubT | null;
    if (!pub) throw new Error("PUB_NOT_FOUND");
    const text = await runAI(
      "Produce exactly 5 concise Persian bullet points summarizing the article's substantive content.",
      `Article from ${pub.tank}: "${pub.title}"\n\n${pub.text.slice(0, 12000)}`,
      700,
    );
    await ctx.runMutation(ref.saveArtifact, { pubIds: [pubId] as PubId, kind: "BRIEF", text, model: MODEL });
    return { text, model: MODEL };
  },
});

// ─── D2 Thesis extraction (argues / recommends / assumes) ──────────────────

export const thesisExtraction = action({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) => {
    const pub = (await ctx.runQuery(ref.pubFetch, { pubId })) as PubT | null;
    if (!pub) throw new Error("PUB_NOT_FOUND");
    const text = await runAI(
      "Extract the article's thesis triad: what it ARGUES, what it RECOMMENDS, what it ASSUMES. " +
        "Format: three short Persian sections with headers «استدلال می‌کند», «توصیه می‌کند», «فرض می‌کند», each with 1–3 bullets.",
      `Article from ${pub.tank}: "${pub.title}"\n\n${pub.text.slice(0, 12000)}`,
      800,
    );
    await ctx.runMutation(ref.saveArtifact, { pubIds: [pubId] as PubId, kind: "THESIS", text, model: MODEL });
    return { text, model: MODEL };
  },
});

// ─── D7 Red-team critique ──────────────────────────────────────────────────

export const redTeam = action({
  args: { pubId: v.id("publications") },
  handler: async (ctx, { pubId }) => {
    const pub = (await ctx.runQuery(ref.pubFetch, { pubId })) as PubT | null;
    if (!pub) throw new Error("PUB_NOT_FOUND");
    const text = await runAI(
      "Red-team this article: assess evidence quality, cherry-picking risk, missing scenarios and " +
        "unstated assumptions. Three Persian sections: «کیفیت شواهد», «خطر گزینش شواهد», «سناریوهای غایب». Be specific and cite [A1].",
      `Article from ${pub.tank}: "${pub.title}"\n\n${pub.text.slice(0, 12000)}`,
      900,
    );
    await ctx.runMutation(ref.saveArtifact, { pubIds: [pubId] as PubId, kind: "RED_TEAM", text, model: MODEL });
    return { text, model: MODEL };
  },
});

// ─── D8 Summarization levels (TL;DR / executive / outline) ─────────────────

export const summarizeAt = action({
  args: {
    pubId: v.id("publications"),
    level: v.union(v.literal("TLDR"), v.literal("EXEC"), v.literal("OUTLINE")),
  },
  handler: async (ctx, { pubId, level }) => {
    const pub = (await ctx.runQuery(ref.pubFetch, { pubId })) as PubT | null;
    if (!pub) throw new Error("PUB_NOT_FOUND");
    const ask =
      level === "TLDR"
        ? "One-sentence Persian TL;DR (max 40 words)."
        : level === "EXEC"
          ? "Persian executive summary: 3 short paragraphs (situation, analysis, implications)."
          : "Persian detailed outline: hierarchical bullet structure of the whole argument (max 12 bullets).";
    const text = await runAI(ask, `Article from ${pub.tank}: "${pub.title}"\n\n${pub.text.slice(0, 12000)}`, 900);
    await ctx.runMutation(ref.saveArtifact, { pubIds: [pubId] as PubId, kind: "SUMMARY", text, model: MODEL, level });
    return { text, model: MODEL };
  },
});

// ─── D3 Compare & contrast (2+ articles) ───────────────────────────────────

export const compareArticles = action({
  args: { pubIds: v.array(v.id("publications")) },
  handler: async (ctx, { pubIds }) => {
    if (pubIds.length < 2) throw new Error("NEED_TWO_ARTICLES");
    const pubs = (await ctx.runQuery(ref.pubFetchMany, { pubIds })) as PubT[];
    if (pubs.length < 2) throw new Error("PUBS_NOT_FOUND");
    const labeled = pubs
      .map((p, i) => `[A${i + 1}] ${p.tank}: "${p.title}"\n${p.text.slice(0, 7000)}`)
      .join("\n\n---\n\n");
    const text = await runAI(
      "Compare the articles: agreements, disagreements, and methodological differences. " +
        "Three Persian sections: «هم‌سویی‌ها», «ناسازگاری‌ها», «تفاوت روش‌شناسی». Cite [A1]…[An] throughout.",
      labeled,
      1200,
    );
    await ctx.runMutation(ref.saveArtifact, {
      pubIds: pubs.map((p) => p._id) as PubId,
      kind: "COMPARE",
      text,
      model: MODEL,
    });
    return { text, model: MODEL };
  },
});

// ─── D4 Disagreement radar (topic-level corpus scan) ───────────────────────

export const disagreementRadar = action({
  args: { topic: v.string() },
  handler: async (ctx, { topic }) => {
    const pubs = (await ctx.runQuery(ref.topicPubs, { topic })) as PubT[];
    if (pubs.length < 2) throw new Error("NEED_MORE_CORPUS");
    const labeled = pubs
      .map((p, i) => `[A${i + 1}] ${p.tank}: "${p.title}"\n${p.text.slice(0, 4500)}`)
      .join("\n\n---\n\n");
    const text = await runAI(
      "Map clusters of conflicting positions on this topic across the corpus. " +
        "Persian output: for each cluster — the position, representative short quote (verbatim), and which articles hold it. Max 3 clusters.",
      `Topic: ${topic}\n\n${labeled}`,
      1200,
    );
    await ctx.runMutation(ref.saveArtifact, {
      pubIds: pubs.map((p) => p._id) as PubId,
      kind: "RADAR",
      text,
      model: MODEL,
      query: topic,
    });
    return { text, model: MODEL };
  },
});

// ─── D5 Weekly trend narrative ─────────────────────────────────────────────

export const trendNarrative = action({
  args: {},
  handler: async (ctx) => {
    // Use the retrieval corpus (full translated text, falling back to the RSS
    // summary) so the weekly brief works as soon as a handful of publications
    // exist — before every article's full text has been extracted.
    const pubs = (await ctx.runQuery(ref.retrievalCorpus, { limit: 12 })) as Array<
      PubT & { text: string; ts: number }
    >;
    const usable = pubs.filter((p) => (p.text ?? "").trim().length > 0);
    if (usable.length < 3) throw new Error("NEED_MORE_CORPUS");
    const labeled = usable
      .map((p, i) => `[A${i + 1}] ${p.tank}: "${p.title}"\n${p.text.slice(0, 2500)}`)
      .join("\n\n---\n\n");
    const text = await runAI(
      "Write a weekly Persian brief: what is the think-tank world converging on, and where does it split? " +
        "Two sections: «هم‌گرایی‌ها» و «واگرایی‌ها», every claim cited [A1]…[An]. Max 300 words.",
      labeled,
      1000,
    );
    await ctx.runMutation(ref.saveArtifact, {
      pubIds: usable.slice(0, 3).map((p) => p._id) as PubId,
      kind: "TREND",
      text,
      model: MODEL,
    });
    return { text, model: MODEL };
  },
});

// ─── D6 RAG-style Q&A over stored translations ─────────────────────────────

export const corpusQA = action({
  args: { question: v.string() },
  handler: async (ctx, { question }) => {
    const q = question.trim().slice(0, 400);
    if (!q) throw new Error("EMPTY_QUESTION");
    const corpus = (await ctx.runQuery(ref.retrievalCorpus, { limit: 250 })) as Array<
      PubT & { ts: number }
    >;
    if (corpus.length === 0) throw new Error("EMPTY_CORPUS");
    // Deterministic retrieval: token frequency scoring over stored text.
    const tokens = q
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const scored = corpus
      .map((p) => {
        const hay = `${p.title} ${p.text}`.toLowerCase();
        let s = 0;
        for (const w of tokens) {
          const c = hay.split(w).length - 1;
          if (c > 0) s += 1 + Math.min(3, c);
        }
        return { p, s };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 6);
    const hits = scored.filter((x) => x.s > 0);
    const labeled = hits
      .map((x, i) => `[A${i + 1}] ${x.p.tank}: "${x.p.title}"\n${x.p.text.slice(0, 4000)}`)
      .join("\n\n---\n\n");
    const text = await runAI(
      "Answer the question using only the provided corpus excerpts. Persian answer, " +
        "cite which article supports each statement [A1]…[An], and say explicitly when the corpus is insufficient.",
      `Question: ${q}\n\n${labeled || "(no lexical matches — corpus may not cover this)"}`,
      900,
    );
    if (hits.length > 0) {
      await ctx.runMutation(ref.saveArtifact, {
        pubIds: [hits[0].p._id] as PubId,
        kind: "CORPUS_QA",
        text: `س: ${q}\n\n${text}`,
        model: MODEL,
        query: q,
      });
    }
    return { text, model: MODEL, cited: hits.length };
  },
});

// ─── H4 Daily digest (auto-generated morning brief) ────────────────────────

export const dailyDigest = action({
  args: {},
  handler: async (ctx) => {
    const pubs = (await ctx.runQuery(ref.digestCorpus, {})) as Array<{
      _id: string;
      title: string;
      tank: string;
      summary: string;
      topicFa?: string;
      ts: number;
    }>;
    if (pubs.length === 0) throw new Error("NOTHING_OVERNIGHT");
    const labeled = pubs
      .map((p, i) => `[A${i + 1}] (${p.topicFa ?? "—"} | ${p.tank}) ${p.title}\n${p.summary.slice(0, 600)}`)
      .join("\n\n");
    const text = await runAI(
      "Write the Persian morning digest: the most consequential overnight think-tank publications. " +
        "Structure: one-line «تصویر کلی», then 4–7 bullets ranked by consequence, each cited [A1]…[An] with topic tag. Max 350 words.",
      labeled,
      900,
    );
    await ctx.runMutation(ref.saveArtifact, {
      pubIds: pubs.slice(0, 3).map((p) => p._id) as PubId,
      kind: "DIGEST",
      text,
      model: MODEL,
      query: new Date().toISOString().slice(0, 10),
    });
    return { text, model: MODEL, count: pubs.length };
  },
});
