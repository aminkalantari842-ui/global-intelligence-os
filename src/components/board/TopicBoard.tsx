// Persian topic board: vertical scrolling columns, one per geopolitical
// domain (نظامی، امنیتی، ژئوپلیتیک، اقتصادی، انرژی، فناوری، حکمرانی).
// Every column is independently scrollable and professionally styled; items
// auto-translate on the server (cron) and open in in-app reader tabs.

import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  Loader2,
  Newspaper,
  X,
} from "lucide-react";
import { toFaDigits } from "@/components/graph/metrics";

/** Column taxonomy — mirrors TOPICS in convex/articles.ts. */
const TOPIC_COLUMNS: Array<{ id: string; labelKey: string; accent: string }> = [
  { id: "military", labelKey: "topic.military", accent: "border-t-rose-500" },
  { id: "security", labelKey: "topic.security", accent: "border-t-amber-500" },
  { id: "geopolitics", labelKey: "topic.geopolitics", accent: "border-t-sky-500" },
  { id: "economy", labelKey: "topic.economy", accent: "border-t-emerald-500" },
  { id: "energy", labelKey: "topic.energy", accent: "border-t-orange-500" },
  { id: "tech", labelKey: "topic.tech", accent: "border-t-violet-500" },
  { id: "governance", labelKey: "topic.governance", accent: "border-t-teal-500" },
];

// ─── Reader tab (full Persian article inside the app) ───────────────────────

interface ReaderTab {
  key: string;
  title: string;
  loading: boolean;
  error?: string;
  data?: { titleFa: string; textFa: string; status: string; url: string };
}

function ReaderPane({
  tab,
  onClose,
}: {
  tab: ReaderTab;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col border-s border-border bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <p className="min-w-0 truncate text-xs font-semibold" dir="rtl">
          {tab.loading ? "…" : tab.data?.titleFa || tab.title}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {tab.data && (
            <a
              href={tab.data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              title="original"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" dir="rtl">
        {tab.loading && (
          <div className="space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 w-full animate-pulse rounded bg-muted/70" />
            ))}
            <p className="pt-2 text-[11px] text-muted-foreground">
              <Loader2 className="me-1.5 inline size-3 animate-spin" />
              extraction + translation in progress (up to ~60s on first open)
            </p>
          </div>
        )}
        {tab.error && (
          <p className="text-xs text-muted-foreground">{tab.error}</p>
        )}
        {tab.data && (
          <article className="mx-auto max-w-2xl">
            <h1 className="text-lg font-bold leading-8">{tab.data.titleFa}</h1>
            <div className="mt-4 whitespace-pre-wrap text-[13px] leading-7 text-foreground/90">
              {tab.data.textFa}
            </div>
            <p className="mt-6 border-t border-border pt-3 text-[10px] leading-4 text-muted-foreground">
              machine-translated full text — the authoritative source is the
              original publication at {new URL(tab.data.url).hostname}
            </p>
          </article>
        )}
      </div>
    </div>
  );
}

// ─── One topic column ───────────────────────────────────────────────────────

function TopicColumn({
  topicId,
  labelKey,
  accent,
  count,
  onOpen,
}: {
  topicId: string;
  labelKey: string;
  accent: string;
  count?: number;
  onOpen: (item: BoardItem) => void;
}) {
  const { t, lang } = useI18n();
  const items = useQuery(api.articles.getTopicFeed, { topic: topicId, limit: 30 });
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  return (
    <section
      className={`flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card ${accent} border-t-2`}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
        <h2 className="text-xs font-bold tracking-tight">{t(labelKey)}</h2>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
          {lang === "fa" && count !== undefined ? toFaDigits(count) : (count ?? "")}
        </span>
      </header>
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {items === undefined && (
          <div className="space-y-2 p-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        )}
        {items?.length === 0 && (
          <p className="p-3 text-[11px] leading-4 text-muted-foreground">
            {t("board.empty")}
          </p>
        )}
        {items?.map((item) => (
          <button
            key={item._id}
            onClick={() => onOpen(item)}
            className="block w-full border-b border-border/50 px-3 py-2.5 text-start transition-colors last:border-b-0 hover:bg-muted/50"
          >
            <p className="line-clamp-3 text-[11.5px] font-medium leading-5">
              {item.title}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
              {item.hasArticle && (
                <FileText className="size-2.5 shrink-0 text-emerald-600" />
              )}
              <span className="truncate">{item.thinkTankSlug}</span>
              <span className="shrink-0 tabular-nums">
                {new Date(item.publishedAt).toLocaleDateString(
                  lang === "fa" ? "fa-IR" : "en-GB",
                  { day: "2-digit", month: "short" },
                )}
              </span>
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

interface BoardItem {
  _id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: number;
  thinkTankSlug: string;
  topicFa: string;
  hasArticle: boolean;
}

// ─── The board ──────────────────────────────────────────────────────────────

export default function TopicBoard() {
  const { t, lang } = useI18n();
  const counts = useQuery(api.articles.getTopicCounts, { hours: 48 });
  const openArticle = useAction(api.articles.openArticle);
  const [tabs, setTabs] = useState<ReaderTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const openItem = (item: BoardItem) => {
    const key = item._id;
    setActiveKey(key);
    setTabs((prev) => {
      if (prev.some((tb) => tb.key === key)) return prev;
      const tab: ReaderTab = { key, title: item.title, loading: true };
      // Fire the extraction+translation pipeline; cap open tabs at 6.
      void openArticle({ pubId: item._id as never })
        .then((data) => {
          setTabs((cur) =>
            cur.map((tb) =>
              tb.key === key
                ? { ...tb, loading: false, data: data ?? undefined }
                : tb,
            ),
          );
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          setTabs((cur) =>
            cur.map((tb) =>
              tb.key === key
                ? {
                    ...tb,
                    loading: false,
                    error: msg.includes("AI_API_KEY")
                      ? t("ai.noKey")
                      : t("board.readerError"),
                  }
                : tb,
            ),
          );
        });
      return [...prev.slice(-5), tab];
    });
  };

  const closeTab = (key: string) => {
    setTabs((prev) => {
      const next = prev.filter((tb) => tb.key !== key);
      if (activeKey === key) {
        setActiveKey(next.length > 0 ? next[next.length - 1].key : null);
      }
      return next;
    });
  };

  const activeTab = useMemo(
    () => tabs.find((tb) => tb.key === activeKey) ?? null,
    [tabs, activeKey],
  );

  // Keep the board in Persian typography regardless of UI language toggle.
  const boardDir = "rtl";

  useEffect(() => {
    void lang;
  }, [lang]);

  return (
    <div className="flex min-h-0 flex-1 gap-3" dir={boardDir}>
      {/* Columns — each independently scrollable */}
      <div className="flex min-w-0 flex-1 gap-2.5 overflow-hidden pb-1">
        {TOPIC_COLUMNS.map((col) => (
          <TopicColumn
            key={col.id}
            topicId={col.id}
            labelKey={col.labelKey}
            accent={col.accent}
            count={counts?.[col.id]}
            onOpen={openItem}
          />
        ))}
      </div>

      {/* Reader tabs — docked right side */}
      {tabs.length > 0 && (
        <div className="flex w-[38%] min-w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1.5">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setActiveKey(tb.key)}
                className={`flex max-w-44 shrink-0 items-center gap-1 rounded-t-md border-b-2 px-2 py-1.5 text-[10px] transition-colors ${
                  tb.key === activeKey
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tb.loading ? (
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                ) : (
                  <Newspaper className="size-3 shrink-0" />
                )}
                <span className="truncate">{tb.title}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tb.key);
                  }}
                  className="rounded p-0.5 hover:bg-muted"
                  role="button"
                  aria-label="close tab"
                >
                  <X className="size-2.5" />
                </span>
              </button>
            ))}
          </div>
          {activeTab && (
            <ReaderPane tab={activeTab} onClose={() => closeTab(activeTab.key)} />
          )}
        </div>
      )}
    </div>
  );
}
