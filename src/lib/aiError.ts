// Classify an AI-action failure into a translation key.
//
// Previously every AI surface reported `ai.noKey` ("API key not configured")
// for *any* failure, which masked the real causes (empty corpus, provider
// out of credit, a model removed from the catalog). This maps the actual
// server errors to precise, actionable messages; callers fall back to their
// generic error copy when the message is unrecognized.

export type AiErrorKey =
  | "ai.noKey"
  | "ai.needCorpus"
  | "ai.quota"
  | "ai.modelUnavailable"
  | null;

export function aiErrorKey(message: string): AiErrorKey {
  const m = (message ?? "").toLowerCase();
  if (m.includes("ai_api_key")) return "ai.noKey";
  if (m.includes("need_more_corpus") || m.includes("nothing_overnight")) {
    return "ai.needCorpus";
  }
  if (
    m.includes("insufficient_user_quota") ||
    m.includes("credit limit") ||
    m.includes("quota")
  ) {
    return "ai.quota";
  }
  if (m.includes("model_not_found") || m.includes("no available channel")) {
    return "ai.modelUnavailable";
  }
  return null;
}
