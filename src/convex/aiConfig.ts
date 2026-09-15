// Central AI provider configuration — the single place every AI action reads
// its endpoint, model and credential from. The provider is OpenAI-compatible,
// so switching vendors requires environment variables only, never code:
//
//   AI_API_KEY   (required) bearer token for the provider
//   AI_BASE_URL  (optional) OpenAI-compatible base URL
//                 e.g. https://api.fireworks.ai/inference/v1
//                      https://generativelanguage.googleapis.com/v1beta/openai
//   AI_MODEL     (optional) model id understood by that provider
//
// Defaults target the VyceAI OpenAI-compatible endpoint. If a configured
// model disappears from a provider's catalog, set AI_MODEL to any listed model
// instead of editing the AI modules.

const DEFAULT_BASE_URL = "https://vyceai.com/v1";
const DEFAULT_MODEL = "deepseek-v4.1";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export const AI_BASE_URL = trimTrailingSlashes(
  process.env.AI_BASE_URL ?? DEFAULT_BASE_URL,
);
export const AI_CHAT_URL = `${AI_BASE_URL}/chat/completions`;
export const AI_MODEL = process.env.AI_MODEL ?? DEFAULT_MODEL;

// Throws a stable, greppable error the UI can recognize when the credential
// is genuinely absent (as opposed to a provider/model/quota failure).
export function aiApiKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("AI_API_KEY_NOT_CONFIGURED");
  return key;
}
