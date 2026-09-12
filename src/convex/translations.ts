// Operational FA translation layer for ingested content.
//
// Design (usage-optimized + auditable):
//  - One cache row per publication, keyed by SHA-256(title + "\n" + summary).
//    Translations are immutable content artifacts: same input → same key,
//    so the LLM is never called twice for the same text (rule 9, idempotent).
//  - The LLM is a translation utility only — it never produces intelligence,
//    scores, or claims (rules 3 & 4). Translated rows keep a link to the
//    original publication and note the model used (rule 5, provenance).
//  - A bounded backfill cron warms the cache for the newest items; the UI
//    also translates on demand for anything the cron has not reached yet.

import {
  internalAction,
  internalMutation,
  internalQuery,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const API_URL = "https://api.tokenrouter.com/v1/chat/completions";
const MODEL = "z-ai/glm-5.3-free";
const SEPARATOR = "\n@@FA@@\n";

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function callModel(text: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY_NOT_CONFIGURED");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a professional Persian (Farsi) translator for geopolitical " +
            "and think-tank analysis. Translate the user's text into fluent, " +
            "formal Persian. Keep proper nouns, institution names and program " +
            "names accurate; use the conventional Persian rendering where one " +
            "exists. Output ONLY the translation, no commentary. Preserve the " +
            "two-part structure: first line = translation of the title, then " +
            "the exact separator line @@FA@@, then the translation of the body.",
        },
        { role: "user", content: text.slice(0, 4000) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI returned no content");
  return content;
}

function splitTranslation(out: string): { titleFa: string; summaryFa: string } {
  const idx = out.indexOf("@@FA@@");
  if (idx === -1) {
    return { titleFa: out.trim(), summaryFa: "" };
  }
  return {
    titleFa: out.slice(0, idx).trim(),
    summaryFa: out.slice(idx + 6).trim(),
  };
}

async function getCacheRow(ctx: any, key: string) {
  return await ctx.db
    .query("translations")
    .withIndex("by_hash", (q: any) => q.eq("hash", key))
    .unique();
}

interface TranslationRow {
  hash: string;
  titleFa: string;
  summaryFa: string;
  model: string;
  createdAt: number;
}

interface TranslationResult {
  titleFa: string;
  summaryFa: string;
  cached: boolean;
}

interface PendingTranslation {
  pubId: any;
  title: string;
  summary: string;
  key: string;
}

/** Cache lookup for N composite keys (page batch). */
export const getTranslations = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }): Promise<Array<TranslationRow>> => {
    const rows: TranslationRow[] = [];
    for (const key of keys.slice(0, 60)) {
      const row = await getCacheRow(ctx, key);
      if (row) rows.push(row);
    }
    return rows;
  },
});

/**
 * On-demand translation for a single publication (title + body in one call).
 * Cached forever: repeat requests cost zero model calls.
 */
export const translatePublication = action({
  args: {
    title: v.string(),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { title, summary }): Promise<TranslationResult> => {
    const body = summary ?? "";
    if (!title.trim() && !body.trim()) {
      return { titleFa: "", summaryFa: "", cached: true };
    }
    const key = await sha256Hex(`${title}\n${body}`);
    const cached = (await ctx.runQuery(internal.translations.getTranslations, {
      keys: [key],
    })) as TranslationRow[];
    if (cached.length > 0) {
      const row = cached[0];
      return { titleFa: row.titleFa, summaryFa: row.summaryFa, cached: true };
    }
    const out = splitTranslation(await callModel(`${title}\n${SEPARATOR}\n${body}`));
    await ctx.runMutation(internal.translations.storeTranslation, {
      key,
      titleFa: out.titleFa,
      summaryFa: out.summaryFa,
      model: MODEL,
    });
    return { ...out, cached: false };
  },
});

export const storeTranslation = internalMutation({
  args: {
    key: v.string(),
    titleFa: v.string(),
    summaryFa: v.string(),
    model: v.string(),
  },
  handler: async (ctx, { key, titleFa, summaryFa, model }) => {
    const existing = await getCacheRow(ctx, key);
    if (existing) return;
    await ctx.db.insert("translations", {
      hash: key,
      titleFa,
      summaryFa,
      model,
      createdAt: Date.now(),
    });
  },
});

/** Find newest publications not yet in the translation cache. */
export const untranslated = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }): Promise<Array<PendingTranslation>> => {
    const pubs = await ctx.db
      .query("publications")
      .withIndex("by_published")
      .order("desc")
      .take(limit * 3);
    const out: PendingTranslation[] = [];
    for (const pub of pubs) {
      const key = await sha256Hex(`${pub.title}\n${pub.summary ?? ""}`);
      const row = await getCacheRow(ctx, key);
      if (!row) out.push({ pubId: pub._id, title: pub.title, summary: pub.summary, key });
      if (out.length >= limit) break;
    }
    return out;
  },
});

/** Bounded backfill executed by cron — warms the cache for the newest items. */
export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<{ pending: number; translated: number }> => {
    const pending = (await ctx.runQuery(internal.translations.untranslated, {
      limit: 20,
    })) as PendingTranslation[];
    let done = 0;
    for (const item of pending) {
      try {
        const out = splitTranslation(
          await callModel(`${item.title}\n${SEPARATOR}\n${item.summary ?? ""}`),
        );
        await ctx.runMutation(internal.translations.storeTranslation, {
          key: item.key,
          titleFa: out.titleFa,
          summaryFa: out.summaryFa,
          model: MODEL,
        });
        done++;
      } catch {
        break; // stop the batch on first failure (rate limit / key missing)
      }
    }
    return { pending: pending.length, translated: done };
  },
});
