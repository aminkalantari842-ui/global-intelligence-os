import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Loader2, AlertCircle } from "lucide-react";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export default function Analyst() {
  const { t, lang } = useI18n();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chat = useAction(api.aiProxy.chat);
  const graph = useQuery(api.graph.getGraph);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError(null);
    const userMsg: ChatMsg = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const context = graph
        ? `${graph.actors.length} actors, ${graph.relations.length} relationships. Top actors: ${graph.actors.slice(0, 10).map((a) => a.name).join(", ")}.`
        : undefined;
      const reply = await chat({
        messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        graphContext: context,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("AI_API_KEY_NOT_CONFIGURED")) {
        setError(t("ai.noKey"));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground" dir={lang === "fa" ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/70 bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">GI</span>
            <span className="text-sm font-semibold tracking-tight">{t("app.name")}</span>
          </Link>
          <span className="text-xs text-muted-foreground">/ {t("ai.title")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dashboard"><Button variant="ghost" size="sm" className="text-xs">{t("nav.graph")}</Button></Link>
          <Link to="/thinktanks"><Button variant="ghost" size="sm" className="text-xs">{t("nav.thinktanks")}</Button></Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Bot className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="mt-4 text-lg font-medium">{t("ai.title")}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("ai.desc")}</p>
            <p className="mt-4 text-sm text-muted-foreground/70">{t("ai.welcome")}</p>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                {msg.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </div>
              <div className={`max-w-[80%] rounded-lg border border-border/70 bg-card px-3.5 py-2.5 text-sm leading-6 ${
                msg.role === "user" ? "bg-foreground text-background" : ""
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="size-3.5" />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t("ai.analyzing")}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={t("ai.placeholder")}
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()} size="sm" className="h-9 px-4">
            <Send className="size-3.5" />
          </Button>
        </div>
      </main>
    </div>
  );
}
