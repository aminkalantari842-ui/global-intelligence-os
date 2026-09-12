// Phase 3: deterministic semantic search over actor metadata. Pure client-side
// TF-IDF over names/aliases/country/region — no LLM, fully reproducible
// (rules 3, 4 & 7). Powers the command palette's ranked matching.

import type { GraphActor } from "./types";

// ─── Tokenization ───────────────────────────────────────────────────────────
const STOP = new Set([
  "the", "of", "and", "for", "in", "on", "de", "da", "al", "san",
  "international", "organization", "organization", "states",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

interface IndexedActor {
  slug: string;
  tf: Map<string, number>;
  norm: number;
}

/** Build the in-memory TF-IDF index once per actor-set change. */
export function buildIndex(actors: GraphActor[]): {
  search: (query: string, limit?: number) => Array<{ slug: string; score: number }>;
} {
  const docs: IndexedActor[] = [];
  const df = new Map<string, number>();

  for (const a of actors) {
    const tokens = tokenize(
      [a.name, a.aliases.join(" "), a.country, a.region, a.kind, a.description]
        .join(" "),
    );
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    docs.push({ slug: a.slug, tf, norm: 0 });
  }

  // IDF + unit-normalized TF-IDF vectors.
  const idf = (t: string) =>
    Math.log((docs.length + 1) / ((df.get(t) ?? 0) + 0.5));
  for (const d of docs) {
    let sumSq = 0;
    const weights = new Map<string, number>();
    for (const [t, count] of d.tf) {
      const w = (1 + Math.log(count)) * idf(t);
      weights.set(t, w);
      sumSq += w * w;
    }
    d.norm = Math.sqrt(sumSq) || 1;
    (d as IndexedActor & { weights: Map<string, number> }).weights = weights;
  }

  // Exact-prefix weighting helper: names that literally start with the query
  // (or contain it as a word) always outrank incidental token matches.
  const surface = new Map<string, string>();
  for (const a of actors) surface.set(a.slug, `${a.name} ${a.aliases.join(" ")}`.toLowerCase());

  return {
    search(query: string, limit = 8) {
      const qTokens = tokenize(query);
      if (qTokens.length === 0) {
        return actors.slice(0, limit).map((a) => ({ slug: a.slug, score: 0 }));
      }
      const qTf = new Map<string, number>();
      for (const t of qTokens) qTf.set(t, (qTf.get(t) ?? 0) + 1);
      let qNorm = 0;
      const qWeights = new Map<string, number>();
      for (const [t, count] of qTf) {
        const w = (1 + Math.log(count)) * idf(t);
        qWeights.set(t, w);
        qNorm += w * w;
      }
      qNorm = Math.sqrt(qNorm) || 1;

      const qLower = query.trim().toLowerCase();
      const results: Array<{ slug: string; score: number }> = [];
      for (const d of docs) {
        let dot = 0;
        for (const [t, qw] of qWeights) {
          const wMap = (d as IndexedActor & { weights: Map<string, number> }).weights;
          const dw = wMap.get(t);
          if (dw) dot += qw * dw;
        }
        let score = dot / (qNorm * d.norm);

        const s = surface.get(d.slug) ?? "";
        if (s.startsWith(qLower)) score += 0.65;
        else if (s.includes(` ${qLower}`)) score += 0.4;

        results.push({ slug: d.slug, score });
      }
      return results
        .filter((r) => r.score > 0.02)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}
