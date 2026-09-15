// Per-article AI chat — Q&A grounded strictly in the article's own extracted
// full text (FA or EN). The backend action re-anchors the model to the stored
// article body on every turn, so answers cannot drift to outside knowledge.
// Transcript is session-local state; the article grounding is server-side.

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useEffect, useRef, useState } from "react";
import { Bot, Eraser, Loader2, Send, ShieldCheck, User } from "lucide-react";
import { aiErrorKey } from "@/lib/aiError";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function ArticleChat({ pubId }: { pubId: string }) {
  const { t, lang } = useI18n();
  const chat = useAction(api.aiAnalysis.articleChat);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const next = [...turns, { role: "user" as const, content: q }];
    setTurns(next);
    setDraft("");
    setErr("");
    setBusy(true);
    try {
      const r = await chat({
        pubId: pubId as never,
        history: next.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      });
      setTurns([...next, { role: "assistant", content: r.text }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      const key = aiErrorKey(msg);
      if (msg.includes("ARTICLE_NOT_EXTRACTED")) {
        setErr(t("ai.chatNotExtracted"));
      } else {
        setErr(key ? t(key) : t("ai.error"));
      }
      setTurns(next); // keep the question visible so the user can retry
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const suggestions = [t("ai.chatSug1"), t("ai.chatSug2"), t("ai.chatSug3")];

  return (
    <div className="flex h-full min-h-0 flex-col" dir={lang === "fa" ? "rtl" : "ltr"}>
      {/* Grounding notice */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
        <ShieldCheck className="size-3 text-emerald-500" />
        <p className="text-[10px] leading-4 text-muted-foreground">{t("ai.chatGrounded")}</p>
        {turns.length > 0 && (
          <button
            onClick={() => {
              setTurns([]);
              setErr("");
            }}
            className="ms-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Eraser className="size-2.5" /> {t("ai.chatClear")}
          </button>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {turns.length === 0 && !busy && (
          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
                <Bot className="size-3.5 text-violet-500" />
              </span>
              <p className="rounded-lg rounded-ss-sm border border-border bg-muted/40 px-2.5 py-2 text-[11.5px] leading-5">
                {t("ai.chatWelcome")}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 ps-8">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => void ask(s)}
                  className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-600"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((m, i) => (
          <div key={i} className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                m.role === "user" ? "bg-sky-500/15" : "bg-violet-500/15"
              }`}
            >
              {m.role === "user" ? <User className="size-3 text-sky-600" /> : <Bot className="size-3.5 text-violet-500" />}
            </span>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-2.5 py-2 text-[11.5px] leading-6 ${
                m.role === "user"
                  ? "rounded-se-sm bg-sky-500/10 text-foreground"
                  : "rounded-ss-sm border border-border bg-muted/40 text-foreground/90"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
              <Loader2 className="size-3.5 animate-spin text-violet-500" />
            </span>
            <div className="flex items-center gap-1.5 rounded-lg rounded-ss-sm border border-border bg-muted/40 px-2.5 py-2">
              <span className="size-1.5 animate-pulse rounded-full bg-violet-500" />
              <span className="size-1.5 animate-pulse rounded-full bg-violet-500 [animation-delay:150ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-violet-500 [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {err && <p className="ps-8 text-[10.5px] text-red-500">{err}</p>}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
        className="flex shrink-0 items-center gap-1.5 border-t border-border p-2"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("ai.chatPlaceholder")}
          disabled={busy}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[11.5px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-violet-500/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
          aria-label="send"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </button>
      </form>
    </div>
  );
}
