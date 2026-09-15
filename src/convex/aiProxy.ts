import { action } from "./_generated/server";
import { v } from "convex/values";
import { AI_CHAT_URL, AI_MODEL, aiApiKey } from "./aiConfig";

export const chat = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
        content: v.string(),
      }),
    ),
    graphContext: v.optional(v.string()),
  },
  handler: async (_ctx, { messages, graphContext }) => {
    const apiKey = aiApiKey();

    const systemMessage = {
      role: "system" as const,
      content:
        "You are a geopolitical intelligence analyst. Answer questions based on evidence. " +
        "Clearly distinguish observed facts from reported claims and interpretations. " +
        "Do not present speculation as established fact. " +
        "When citing actors or events, reference their evidence confidence where available. " +
        "Respond in the same language as the user's question.\n\n" +
        (graphContext ? `Graph context:\n${graphContext}\n\n` : ""),
    };

    const fullMessages = [systemMessage, ...messages];

    const res = await fetch(AI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: AI_MODEL, messages: fullMessages }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("AI returned no content");
    return content;
  },
});
