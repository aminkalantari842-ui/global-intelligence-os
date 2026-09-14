// Enhanced in-app article reader used by the topic board's docked tabs.
// Adds to the original ReaderPane: EN/FA split view, reading-progress bar
// with save/resume, text-selection highlights with private analyst notes,
// and highlight list. All persistence goes through convex/reading.ts.

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  Highlighter,
  Languages,
  Loader2,
  MessageSquarePlus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { toFaDigits } from "@/components/graph/metrics";
import { EvidenceFlow } from "./EvidenceFlow";

export interface ReaderTabData {
  titleFa: string;
  textFa: string;
  textEn?: string;
  status: string;
  url: string;
}

export interface EnhancedReaderTab {
  key: string;
  pubId: string; // Id<"publications">
  title: string;
  loading: boolean;
  error?: string;
  data?: ReaderTabData;
  split?: boolean;
}

// ─── One highlight card ─────────────────────────────────────────────────────

function HighlightCard({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const h = useQuery(api.reading.getHighlights, { pubId: id as never });
  const updateNote = useMutation(api.reading.updateHighlightNote);
  const removeHl = useMutation(api.reading.deleteHighlight);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!h || h.length === 0) return null;
  return (
    <div className="mt-5 space-y-2 border-t border-border pt-4">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <StickyNote className="size-3" /> {t("board.hl.title")} ({h.length})
      </p>
      {h.map((hl) => (
        <div key={hl._id} className="rounded-md border border-amber-600/30 bg-amber-500/5 p-2.5">
          <p className="border-s-2 border-amber-500/60 ps-2 text-[11px] leading-5 text-foreground/85" dir="rtl">
            “{hl.quote}”
          </p>
          {hl.note && <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground" dir="rtl">{hl.note}</p>}
          {drafting === hl._id ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("board.hl.notePlaceholder")}
                className="h-6 flex-1 rounded border border-border bg-background px-2 text-[11px] outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void updateNote({ id: hl._id as never, note: draft });
                    setDrafting(null);
                    setDraft("");
                  }
                  if (e.key === "Escape") setDrafting(null);
                }}
              />
              <button
                onClick={() => {
                  void updateNote({ id: hl._id as never, note: draft });
                  setDrafting(null);
                  setDraft("");
                }}
                className="rounded p-1 text-emerald-600 hover:bg-muted"
              >
                <Check className="size-3" />
              </button>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-1">
              <button
                onClick={() => {
                  setDrafting(hl._id);
                  setDraft(hl.note ?? "");
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MessageSquarePlus className="size-2.5" /> {t("board.hl.note")}
              </button>
              <button
                onClick={() => void removeHl({ id: hl._id as never })}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-rose-600"
              >
                <Trash2 className="size-2.5" /> {t("board.hl.delete")}
              </button>
              {lang === "fa" && <span />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── The reader pane ────────────────────────────────────────────────────────

export default function EnhancedReader({
  tab,
  onClose,
  onToggleSplit,
  onAddToList,
}: {
  tab: EnhancedReaderTab;
  onClose: () => void;
  onToggleSplit: () => void;
  onAddToList: () => void;
}) {
  const { t, lang } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [savedPct, setSavedPct] = useState<number | null>(null);
  const saveProgress = useMutation(api.reading.setReadingProgress);
  const highlights = useQuery(api.reading.getHighlights, { pubId: tab.pubId as never });
  const addHighlight = useMutation(api.reading.addHighlight);
  const [flash, setFlash] = useState<string | null>(null);
  const restoringRef = useRef(false);
  // "More like this" — deterministic TF-IDF over stored publications.
  const similar = useQuery(
    api.articles.getSimilar,
    tab.data ? { pubId: tab.pubId as never, limit: 4 } : "skip",
  );

  // Restore resume point once content is present (only first paint).
  useEffect(() => {
    if (!tab.data || restoringRef.current) return;
    restoringRef.current = true;
    const key = `resume:${tab.pubId}`;
    const saved = Number(localStorage.getItem(key) ?? "0");
    if (saved > 0.03 && scrollRef.current) {
      scrollRef.current.scrollTop = saved * scrollRef.current.scrollHeight;
    }
  }, [tab.data, tab.pubId]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? Math.min(1, el.scrollTop / max) : 1;
    setProgress(p);
    localStorage.setItem(`resume:${tab.pubId}`, String(p));
  }, [tab.pubId]);

  // Debounced server sync (progress is per-device too via localStorage).
  useEffect(() => {
    if (!tab.data) return;
    const id = setTimeout(() => {
      void saveProgress({ pubId: tab.pubId as never, progress })
        .then(() => {
          setSavedPct(Math.round(progress * 100));
          setTimeout(() => setSavedPct(null), 1200);
        })
        .catch(() => {});
    }, 900);
    return () => clearTimeout(id);
  }, [progress, tab.data, tab.pubId, saveProgress]);

  // Text-selection → highlight
  const captureSelection = async () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (text.length < 8 || text.length > 600) return;
    const dir = /[\u0600-\u06FF]/.test(text) ? "FA" : "EN";
    try {
      await addHighlight({ pubId: tab.pubId as never, quote: text, lang: dir });
      sel?.removeAllRanges();
      setFlash(t("board.hl.saved"));
      setTimeout(() => setFlash(null), 1500);
    } catch {
      /* noop */
    }
  };

  // Export highlights + notes as a Markdown briefing document.
  const exportAnnotations = () => {
    const h = highlights ?? [];
    if (h.length === 0) return;
    const lines = [
      `# ${tab.data?.titleFa ?? tab.title}`,
      ``,
      `${t("board.reader.provenance")} ${tab.data ? new URL(tab.data.url).hostname : ""}`,
      ``,
      ...h.flatMap((hl, i) => [
        `## ${i + 1}. ${t("board.hl.title")}`,
        `> ${hl.quote.replace(/\n/g, " ")}`,
        hl.note ? `- ${t("board.hl.note")}: ${hl.note}` : "",
        ``,
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `annotations-${tab.pubId.slice(-8)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const showSplit = tab.split && tab.data?.textEn;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Progress bar */}
      <div className="h-0.5 w-full shrink-0 bg-muted">
        <div
          className="h-full bg-sky-500 transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {tab.data && (
            <button
              onClick={onToggleSplit}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                showSplit ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={t("board.reader.split")}
            >
              <Languages className="size-3" /> {t("board.reader.split")}
            </button>
          )}
          {tab.data && (
            <button
              onClick={onAddToList}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("board.reader.addToList")}
            >
              <Highlighter className="size-3" /> {t("board.reader.addToList")}
            </button>
          )}
          {savedPct !== null && (
            <span className="text-[9px] tabular-nums text-emerald-600">✓ {savedPct}%</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {highlights && highlights.length > 0 && (
            <>
              <span className="flex items-center gap-0.5 text-[9px] text-amber-600">
                <Highlighter className="size-2.5" /> {lang === "fa" ? toFaDigits(highlights.length) : highlights.length}
              </span>
              <button
                onClick={exportAnnotations}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={t("board.exportMd")}
              >
                <Download className="size-3" /> {t("board.exportMd")}
              </button>
            </>
          )}
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="close">
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Article → graph evidence flow (AI proposes, analyst commits) */}
      {tab.data && (
        <EvidenceFlow
          pubId={tab.pubId}
          title={tab.data.titleFa || tab.title}
          text={tab.data.textFa || tab.data.textEn || ""}
        />
      )}

      {/* Body — split or single */}
      <div className="flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onMouseUp={() => void captureSelection()}
          onTouchEnd={() => void captureSelection()}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
          dir="rtl"
        >
          {tab.loading && (
            <div className="space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-3 w-full animate-pulse rounded bg-muted/70" />
              ))}
              <p className="pt-2 text-[11px] text-muted-foreground">
                <Loader2 className="me-1.5 inline size-3 animate-spin" />
                {t("board.reader.extracting")}
              </p>
            </div>
          )}
          {tab.error && <p className="text-xs text-muted-foreground">{tab.error}</p>}
          {tab.data && (
            <article className="mx-auto max-w-2xl">
              <h1 className="text-lg font-bold leading-8">{tab.data.titleFa}</h1>
              <div className="mt-4 whitespace-pre-wrap text-[13px] leading-7 text-foreground/90 selection:bg-amber-300/30">
                {tab.data.textFa}
              </div>
              <HighlightCard id={tab.pubId} />
              {/* More like this — deterministic TF-IDF over stored corpus */}
              {similar && similar.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("board.similar")}
                  </p>
                  <div className="space-y-1.5">
                    {similar.map((s) => (
                      <a
                        key={s._id}
                        href={s._id}
                        onClick={(e) => {
                          e.preventDefault();
                          window.dispatchEvent(new CustomEvent("board:open-pub", { detail: s._id }));
                        }}
                        className="block rounded-md border border-border/60 px-2.5 py-1.5 transition-colors hover:bg-muted/60"
                      >
                        <p className="line-clamp-1 text-[11px] font-medium">{s.title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                          <span>{s.thinkTankSlug}</span>
                          <span className="rounded-sm bg-muted px-1 tabular-nums">{s.score}%</span>
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-6 border-t border-border pt-3 text-[10px] leading-4 text-muted-foreground">
                {t("board.reader.provenance")} {new URL(tab.data.url).hostname}
              </p>
            </article>
          )}
        </div>

        {showSplit && (
          <div className="hidden min-h-0 flex-1 overflow-y-auto border-s border-border px-6 py-5 lg:block" dir="ltr">
            <article className="mx-auto max-w-2xl">
              <div className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                original
              </div>
              <div className="whitespace-pre-wrap text-[12.5px] leading-6 text-foreground/75 selection:bg-amber-300/30">
                {tab.data?.textEn}
              </div>
            </article>
          </div>
        )}
      </div>

      {flash && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-[10px] text-background shadow-lg">
          {flash}
        </div>
      )}
    </div>
  );
}
