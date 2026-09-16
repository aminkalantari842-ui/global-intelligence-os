// Persian topic board v2: vertical scrolling columns, one per geopolitical
// domain. Layout (order/pin/width) persists server-side; three density modes;
// virtualized incremental loading; keyboard navigation (j/k/Enter/t/s/l);
// reading lists + resume chip; header sparklines; world coverage strip.
// Every item is real stored data — the board renders only what exists.

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  CheckCircle2,
  Columns3,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  History,
  LayoutList,
  Loader2,
  Newspaper,
  Pin,
  PinOff,
  Play,
  Rows2,
  Rows3,
  Scale,
  Search,
  Table2,
  X,
} from "lucide-react";
import { toFaDigits } from "@/components/graph/metrics";
import { aiErrorKey } from "@/lib/aiError";
import { TopicSparkline, WorldStrip } from "./BoardVisuals";
import EnhancedReader, { type EnhancedReaderTab } from "./EnhancedReader";

/** Column taxonomy — mirrors TOPICS in convex/articles.ts. rgb triplets
 * drive the hover glow / accent bar via the .topic-col CSS layer. */
const TOPIC_COLUMNS: Array<{ id: string; labelKey: string; accent: string; rgb: string }> = [
  { id: "military", labelKey: "board.military", accent: "border-t-rose-500", rgb: "244 63 94" },
  { id: "security", labelKey: "board.security", accent: "border-t-amber-500", rgb: "245 158 11" },
  { id: "geopolitics", labelKey: "board.geopolitics", accent: "border-t-sky-500", rgb: "14 165 233" },
  { id: "economy", labelKey: "board.economy", accent: "border-t-emerald-500", rgb: "16 185 129" },
  { id: "energy", labelKey: "board.energy", accent: "border-t-orange-500", rgb: "249 115 22" },
  { id: "tech", labelKey: "board.tech", accent: "border-t-violet-500", rgb: "139 92 246" },
  { id: "governance", labelKey: "board.governance", accent: "border-t-teal-500", rgb: "20 184 166" },
];
const ALL_IDS = TOPIC_COLUMNS.map((c) => c.id);
const PAGE = 30; // per-fetch page size (incremental "infinite" scroll)
// Columns rendered at once by default. The remaining topics stay one scroll
// away (the column row scrolls horizontally instead of clipping them).
const DEFAULT_COLUMNS = 5;
const MIN_COLUMNS = 3;

type ViewMode = "comfortable" | "compact" | "list";

interface BoardItem {
  _id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: number;
  thinkTankSlug: string;
  topicFa: string;
  hasArticle: boolean;
  autoTags?: string[];
  lengthClass?: string | null;
  actorSlugs?: string[];
}

const LENGTH_BADGE: Record<string, string> = {
  BRIEF: "bg-slate-500/15 text-slate-600",
  ANALYSIS: "bg-sky-500/15 text-sky-600",
  MAJOR_REPORT: "bg-violet-500/15 text-violet-600",
};

// ─── Drag helpers (HTML5 dnd on headers) ────────────────────────────────────

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

// ─── One topic column ───────────────────────────────────────────────────────

function TopicColumn({
  topicId,
  labelKey,
  accent,
  rgb,
  count,
  width,
  pinned,
  focused,
  viewMode,
  triageFilter,
  sortMode,
  onFocus,
  onPin,
  onDragStart,
  onDropOn,
  onOpen,
  onSaveShortcut,
  onOpenActor,
  onResize,
  listLabel,
  inList,
}: {
  topicId: string;
  labelKey: string;
  accent: string;
  rgb: string;
  count?: number;
  width: number;
  pinned: boolean;
  focused: boolean;
  viewMode: ViewMode;
  triageFilter: "ALL" | "UNREAD" | "READING" | "READ";
  sortMode: "recent" | "priority";
  onFocus: () => void;
  onPin: () => void;
  onDragStart: () => void;
  onDropOn: () => void;
  onOpen: (item: BoardItem) => void;
  onSaveShortcut: (item: BoardItem) => void;
  onResize: (width: number) => void;
  onOpenActor: (slug: string) => void;
  listLabel: string;
  inList: Set<string>;
}) {
  const { t, lang } = useI18n();
  const [limit, setLimit] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const items = useQuery(api.articles.getTopicFeedV3, {
    topic: topicId,
    limit,
    triage: triageFilter === "ALL" ? undefined : triageFilter,
    sort: sortMode,
  });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Incremental fetch: when the sentinel scrolls near the bottom, extend limit.
  const maybeLoadMore = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
      if (!loadingMore && items && items.length >= limit) {
        setLoadingMore(true);
        setLimit((l) => l + PAGE);
        setTimeout(() => setLoadingMore(false), 500);
      }
    }
  }, [items, limit, loadingMore]);

  const compact = viewMode === "compact";
  const isList = viewMode === "list";

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropOn();
      }}
      onFocus={onFocus as never}
      tabIndex={-1}
      data-focused={focused}
      style={{ width, "--col-accent": rgb } as React.CSSProperties}
      className={`topic-col relative flex h-full min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border bg-card ${accent} border-t-2 ${
        dragOver ? "border-dashed border-sky-500" : "border-border/80"
      }`}
    >
      {/* Header: title, sparkline, count, pin */}
      <header
        draggable
        onDragStart={onDragStart}
        onDoubleClick={onPin}
        className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5 active:cursor-grabbing"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: `rgb(${rgb})`, boxShadow: `0 0 8px rgb(${rgb} / 0.55)` }} />
          {pinned && <Pin className="size-3 shrink-0 text-sky-600" />}
          <h2 className="truncate text-[11.5px] font-bold tracking-tight">{t(labelKey)}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <TopicSparkline topicId={topicId} accentClass={compact ? "fill-foreground/40" : "fill-foreground/55"} />
          <button
            onClick={onPin}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            title={pinned ? t("board.unpin") : t("board.pin")}
          >
            {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          </button>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
            {lang === "fa" && count !== undefined ? toFaDigits(count) : (count ?? "")}
          </span>
        </div>
      </header>

      {/* Items */}
      <div
        ref={scrollerRef}
        onScroll={maybeLoadMore}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {items === undefined && (
          <div className="space-y-2 p-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="tt-shimmer h-16 rounded-md" />
            ))}
          </div>
        )}
        {items?.length === 0 && (
          <p className="p-3 text-[11px] leading-4 text-muted-foreground">{t("board.empty")}</p>
        )}
        {items?.map((item, idx) => {
          const saved = inList.has(item._id);
          const reading = item.hasArticle;
          const isRead = item.triage === "READ";
          const isReading = item.triage === "READING";
          return (
            <div
              key={item._id}
              className={`topic-item group relative border-b border-border/40 last:border-b-0 ${
                saved ? "bg-sky-500/5" : ""
              }`}
            >
              <button
                onClick={() => onOpen(item)}
                className={`block w-full text-start ${compact ? "px-2.5 py-1.5" : "px-3 py-2.5"}`}
              >
                <p
                  className={`font-medium leading-5 ${compact ? "line-clamp-1 text-[11px]" : "line-clamp-3 text-[11.5px]"} ${
                    isRead ? "text-muted-foreground/60" : ""
                  }`}
                >
                  {isRead && <CheckCircle2 className="me-1 inline size-2.5 text-emerald-600/70" />}
                  {item.title}
                </p>
                {isReading && (
                  <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-muted">
                    <div className="h-full bg-sky-500" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                )}
                {sortMode === "priority" && (
                  <span
                    className={`absolute start-1 top-1/2 -translate-y-1/2 rounded-sm px-1 text-[7px] font-bold tabular-nums ${
                      item.priority >= 60
                        ? "bg-rose-500/15 text-rose-600"
                        : item.priority >= 35
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.priority}
                  </span>
                )}
                {!compact && !isList && (
                  <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-muted-foreground/80">
                    {item.summary}
                  </p>
                )}
                {/* C2 tags + C3 length class + E1 actor chips */}
                {!compact && ((item.autoTags?.length ?? 0) > 0 || item.lengthClass) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {item.lengthClass && (
                      <span className={`rounded-sm px-1 py-px text-[7.5px] font-bold uppercase ${LENGTH_BADGE[item.lengthClass] ?? ""}`}>
                        {item.lengthClass === "MAJOR_REPORT" ? t("board.lenMajor") : item.lengthClass === "ANALYSIS" ? t("board.lenAnalysis") : t("board.lenBrief")}
                      </span>
                    )}
                    {item.autoTags?.slice(0, 2).map((tag) => (
                      <span key={tag} className="rounded-full border border-border/70 px-1 py-px text-[8px] text-muted-foreground">{tag}</span>
                    ))}
                    {item.actorSlugs?.slice(0, 3).map((slug) => (
                      <button
                        key={slug}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenActor(slug);
                        }}
                        className="rounded-full bg-sky-500/10 px-1.5 py-px text-[8px] font-medium text-sky-600 transition-colors hover:bg-sky-500/25"
                        title={t("board.openInGraph")}
                      >
                        {slug} →
                      </button>
                    ))}
                  </div>
                )}
                <p className={`mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground`}>
                  {reading && <FileText className="size-2.5 shrink-0 text-emerald-600" />}
                  {sortMode === "priority" && <span className="w-2 shrink-0" />}
                  <span className="truncate">{item.thinkTankSlug}</span>
                  <span className="shrink-0 tabular-nums">
                    {new Date(item.publishedAt).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                  {idx === 0 && <span className="shrink-0 font-semibold text-sky-600">•</span>}
                </p>
              </button>
              {/* Hover action: save to list + add to compare */}
              <span className="absolute end-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent("board:compare-toggle", { detail: item._id }));
                  }}
                  title={t("board.compare")}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-violet-600"
                >
                  <Scale className="size-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSaveShortcut(item);
                  }}
                  title={listLabel}
                  className={`rounded p-1 text-muted-foreground hover:bg-muted hover:text-sky-600 ${
                    saved ? "!opacity-100 text-sky-600" : ""
                  }`}
                >
                  <LayoutList className="size-3" />
                </button>
              </span>
            </div>
          );
        })}
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Resize strip (inline-end edge, RTL-aware pointer tracking) */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = width;
          const el = e.currentTarget as HTMLDivElement;
          el.setPointerCapture(e.pointerId);
          el.style.cursor = "col-resize";
          const move = (ev: PointerEvent) => {
            // Board is RTL: dragging toward the reader (−x) widens the column.
            onResize(Math.max(180, Math.min(480, startW + (startX - ev.clientX))));
          };
          const up = () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", up);
            el.style.cursor = "";
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
        }}
        className="absolute inset-y-0 end-0 z-10 w-1.5 cursor-col-resize opacity-0 transition-opacity hover:opacity-100 hover:bg-sky-500/40"
        title={t("board.resize")}
      />
    </section>
  );
}

// ─── J1 Export menu (CSV/JSON of the current corpus window) ─────────────────

function ExportMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Reactive query: newest 30 days as CSV (regenerated server-side each call).
  const exportCsv = useQuery(api.enrichment.exportCorpus, { days: 30, format: "csv" });
  const exportJson = useQuery(api.enrichment.exportCorpus, { days: 30, format: "json" });
  const [busy, setBusy] = useState(false);

  const download = (mime: string, body: string, ext: string) => {
    const blob = new Blob(["\ufeff" + body], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `corpus-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doExport = async (format: "csv" | "json") => {
    setBusy(true);
    setOpen(false);
    try {
      const row = format === "csv" ? exportCsv : exportJson;
      if (!row) return;
      download(row.mime, row.body, format);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] transition-colors ${
          open ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-600" : "text-muted-foreground hover:text-foreground"
        }`}
        title={t("board.export")}
      >
        <Download className="size-3" /> {t("board.export")}
      </button>
      {open && (
        <div className="absolute end-0 top-8 z-50 w-40 rounded-lg border border-border bg-card p-1 shadow-xl">
          <button
            onClick={() => void doExport("csv")}
            disabled={busy || !exportCsv}
            className="block w-full rounded px-2 py-1.5 text-start text-[11px] hover:bg-muted disabled:opacity-50"
          >
            CSV · 30d · {exportCsv?.count ?? "…"} {t("board.exportRows")}
          </button>
          <button
            onClick={() => void doExport("json")}
            disabled={busy || !exportJson}
            className="block w-full rounded px-2 py-1.5 text-start text-[11px] hover:bg-muted disabled:opacity-50"
          >
            JSON · 30d
          </button>
        </div>
      )}
    </span>
  );
}

// ─── I4 Compare workbench (multi-article AI compare) ───────────────────────

export function CompareBar() {
  const { t, lang } = useI18n();
  const [sel, setSel] = useState<string[]>([]);
  const compare = useAction(api.aiAnalysis.compareArticles);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onToggle = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
    };
    window.addEventListener("board:compare-toggle", onToggle);
    return () => window.removeEventListener("board:compare-toggle", onToggle);
  }, []);

  if (sel.length === 0 && !result && !err) return null;
  return (
    <div
      className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-violet-500/40 bg-background/95 px-4 py-2 shadow-xl backdrop-blur"
      dir={lang === "fa" ? "rtl" : "ltr"}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <Scale className="size-3.5 text-violet-500" />
        <span>{sel.length} {t("board.compareSelected")}</span>
        <button
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              const r = await compare({ pubIds: sel as never });
              setResult(r.text);
            } catch (e) {
              setErr(e instanceof Error ? e.message.slice(0, 90) : "error");
            } finally {
              setBusy(false);
            }
          }}
          disabled={sel.length < 2 || busy}
          className="rounded-full bg-violet-600 px-3 py-1 text-[10.5px] font-medium text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : t("board.compareRun")}
        </button>
        <button onClick={() => { setSel([]); setResult(null); setErr(""); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="clear">
          <X className="size-3" />
        </button>
      </div>
      {(result || err) && (
        <div className="mt-2 max-h-64 w-[560px] max-w-[90vw] overflow-y-auto rounded-lg border border-violet-500/30 bg-card p-3 text-start">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-violet-600">ASSESSMENT · {t("board.compare")}</p>
          {err ? <p className="text-[11px] text-red-500">{err}</p> : <p className="whitespace-pre-wrap text-[11.5px] leading-6">{result}</p>}
        </div>
      )}
    </div>
  );
}

// ─── The board ──────────────────────────────────────────────────────────────

export default function TopicBoard() {
  const { t, lang } = useI18n();
  const counts = useQuery(api.articles.getTopicCounts, { hours: 48 });
  const openArticle = useAction(api.articles.openArticle);
  const layout = useQuery(api.reading.getLayout, {});
  const lists = useQuery(api.reading.listReadingLists);
  const resumeFeed = useQuery(api.reading.getResumeFeed, { limit: 4 });
  const ticker = useQuery(api.articles.getTicker, { limit: 14 });
  const triageCounts = useQuery(api.reading.getTriageCounts);
  const saveLayout = useMutation(api.reading.saveLayout);
  const createList = useMutation(api.reading.createList);
  const toggleItem = useMutation(api.reading.toggleListItem);

  const [order, setOrder] = useState<string[]>(ALL_IDS);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("comfortable");
  const [visibleCount, setVisibleCount] = useState(DEFAULT_COLUMNS);
  const [hydrated, setHydrated] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tabs, setTabs] = useState<EnhancedReaderTab[]>([]);
  const [listPicker, setListPicker] = useState<{ item: BoardItem } | null>(null);
  const [listName, setListName] = useState("");
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const resizeTimer = useRef<number | null>(null);
  const [triageFilter, setTriageFilter] = useState<"ALL" | "UNREAD" | "READING" | "READ">("ALL");
  const [sortMode, setSortMode] = useState<"recent" | "priority">("recent");
  const [searchQ, setSearchQ] = useState("");
  const searchTimer = useRef<number | null>(null);
  // Reactive full-text search — the query self-updates as the user types.
  const searchResults = useQuery(
    api.articles.searchFullText,
    searchQ.trim().length >= 3 ? { q: searchQ, limit: 10 } : "skip",
  );
  const searching = searchQ.trim().length >= 3 && searchResults === undefined;

  // Hydrate persisted layout once.
  useEffect(() => {
    if (!layout || hydrated) return;
    const known = layout.order.filter((id) => ALL_IDS.includes(id));
    const missing = ALL_IDS.filter((id) => !known.includes(id));
    setOrder([...known, ...missing]);
    setPinned(new Set(layout.pinned ?? []));
    setWidths((layout.widths ?? {}) as Record<string, number>);
    if (layout.viewMode) setViewMode(layout.viewMode);
    if (layout.columns) {
      setVisibleCount(Math.max(MIN_COLUMNS, Math.min(ALL_IDS.length, layout.columns)));
    }
    setHydrated(true);
  }, [layout, hydrated]);

  const persistLayout = useCallback(
    (next: {
      order?: string[];
      pinned?: Set<string>;
      widths?: Record<string, number>;
      viewMode?: ViewMode;
      columns?: number;
    }) => {
      void saveLayout({
        order: next.order ?? order,
        pinned: Array.from(next.pinned ?? pinned),
        widths: next.widths ?? widths,
        viewMode: next.viewMode ?? viewMode,
        columns: next.columns ?? visibleCount,
      }).catch(() => {});
    },
    [saveLayout, order, pinned, widths, viewMode, visibleCount],
  );

  const visibleIds = useMemo(() => {
    const p = order.filter((id) => pinned.has(id));
    const rest = order.filter((id) => !pinned.has(id));
    return [...p, ...rest];
  }, [order, pinned]);

  const colWidth = (id: string) => widths[id] ?? 260;

  // The columns actually on screen (keyboard nav must stay inside this window).
  const shownIds = useMemo(
    () => visibleIds.slice(0, Math.max(MIN_COLUMNS, visibleCount)),
    [visibleIds, visibleCount],
  );

  // ── Keyboard navigation: j/k switch focused column, Enter/t/s/l act on it ──
  const focusItems = useQuery(api.articles.getTopicFeed, {
    topic: shownIds[focusIdx] ?? "military",
    limit: 1,
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "j" || e.key === "ArrowRight") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(shownIds.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" || e.key === "t") {
        const item = focusItems?.[0];
        if (item && shownIds[focusIdx]) {
          e.preventDefault();
          onOpenItem(item as BoardItem, shownIds[focusIdx]);
        }
      } else if (e.key === "s") {
        const item = focusItems?.[0];
        if (item) {
          e.preventDefault();
          setListPicker({ item: item as BoardItem });
        }
      } else if (e.key === "l") {
        e.preventDefault();
        setViewMode((m) => (m === "comfortable" ? "compact" : m === "compact" ? "list" : "comfortable"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownIds, focusIdx, focusItems]);

  // ── Reader tabs (open + extraction pipeline) ──
  const reextract = useAction(api.articles.reextractArticle);

  /** Shared loader: openArticle (cache-aware ladder) or forced re-extraction. */
  const loadPub = useCallback(
    (pubId: string, key: string, fallbackTitle: string, opts?: { force?: boolean }) => {
      const run = opts?.force
        ? reextract({ pubId: pubId as never })
        : openArticle({ pubId: pubId as never });
      void run
        .then((data) => {
          setTabs((cur) =>
            cur.map((tb) =>
              tb.key === key
                ? {
                    ...tb,
                    loading: false,
                    error: undefined,
                    title: data?.titleFa || fallbackTitle,
                    // textEn passes through so the EN/FA split pane works.
                    data: data
                      ? {
                          titleFa: data.titleFa,
                          textFa: data.textFa,
                          textEn: data.textEn ?? undefined,
                          status: data.status,
                          url: data.url,
                        }
                      : undefined,
                  }
                : tb,
            ),
          );
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          const key2 = aiErrorKey(msg);
          setTabs((cur) =>
            cur.map((tb) =>
              tb.key === key
                ? {
                    ...tb,
                    loading: false,
                    error: key2 ? t(key2) : t("board.readerError"),
                  }
                : tb,
            ),
          );
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openArticle, reextract],
  );

  const onOpenItem = (item: BoardItem, _topic?: string) => {
    const key = item._id;
    setActiveKey(key);
    setTabs((prev) => {
      if (prev.some((tb) => tb.key === key)) return prev;
      const tab: EnhancedReaderTab = { key, pubId: item._id, title: item.title, loading: true };
      loadPub(item._id, key, item.title);
      return [...prev.slice(-5), tab];
    });
  };

  const closeTab = (key: string) => {
    setTabs((prev) => {
      const next = prev.filter((tb) => tb.key !== key);
      if (activeKey === key) setActiveKey(next.length > 0 ? next[next.length - 1].key : null);
      return next;
    });
  };

  // E1: actor chip → graph console focused on that actor.
  const onOpenActor = useCallback((slug: string) => {
    window.open(`/dashboard?focus=${encodeURIComponent(slug)}`, "_self");
  }, []);

  const activeTab = useMemo(() => tabs.find((tb) => tb.key === activeKey) ?? null, [tabs, activeKey]);

  // ── Lists ──
  const activeList = lists?.find((l) => l._id === activeListId) ?? null;
  const inListIds = useMemo(
    () => new Set((activeList?.pubIds ?? []).map(String)),
    [activeList],
  );

  const ensureDefaultList = async (): Promise<string | null> => {
    if (activeListId) return activeListId;
    const created = await createList({ name: lang === "fa" ? "خواندن بعدی" : "Read later" });
    setActiveListId(String(created));
    return String(created);
  };

  const saveToList = async (item: BoardItem) => {
    const listId = await ensureDefaultList();
    if (!listId) return;
    await toggleItem({ listId: listId as never, pubId: item._id as never });
  };

  // Keep the board in Persian typography regardless of UI language toggle.
  const boardDir = "rtl";

  // Similar-article links (from the reader) open through the same pipeline.
  useEffect(() => {
    const onOpenPub = (e: Event) => {
      const pubId = (e as CustomEvent<string>).detail;
      if (!pubId) return;
      const key = pubId;
      setActiveKey(key);
      setTabs((prev) => {
        if (prev.some((tb) => tb.key === key)) return prev;
        const tab: EnhancedReaderTab = { key, pubId, title: "…", loading: true };
        loadPub(pubId, key, "…");
        return [...prev.slice(-5), tab];
      });
    };
    window.addEventListener("board:open-pub", onOpenPub);
    return () => window.removeEventListener("board:open-pub", onOpenPub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openArticle]);

  // Re-extract from source (reader "failed?" banner): force the full ladder.
  useEffect(() => {
    const onReextract = (e: Event) => {
      const pubId = (e as CustomEvent<string>).detail;
      if (!pubId) return;
      const key = pubId;
      setActiveKey(key);
      setTabs((prev) => {
        const existing = prev.find((tb) => tb.key === key);
        if (existing) {
          loadPub(pubId, key, existing.title, { force: true });
          return prev.map((tb) => (tb.key === key ? { ...tb, loading: true, error: undefined } : tb));
        }
        const tab: EnhancedReaderTab = { key, pubId, title: "…", loading: true };
        loadPub(pubId, key, "…", { force: true });
        return [...prev.slice(-5), tab];
      });
    };
    window.addEventListener("board:reextract", onReextract);
    return () => window.removeEventListener("board:reextract", onReextract);
  }, [loadPub]);

  useEffect(() => {
    void lang;
  }, [lang]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5" dir={boardDir}>
      {/* Live ticker — just-published strip (paused on hover) */}
      {ticker && ticker.length > 0 && (
        <div className="tt-rise flex h-7 shrink-0 items-center overflow-hidden rounded-lg border border-border bg-card">
          <span className="flex h-full shrink-0 items-center gap-1 bg-rose-600 px-2 text-[9px] font-bold uppercase tracking-widest text-white">
            <History className="size-3 animate-pulse" /> {t("board.ticker.live")}
          </span>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className="flex w-max animate-ticker gap-6 whitespace-nowrap px-4">
              {[...ticker, ...ticker].map((r, i) => (
                <button
                  key={`${r._id}:${i}`}
                  onClick={() =>
                    onOpenItem({
                      _id: r._id,
                      title: r.title,
                      url: "",
                      summary: "",
                      publishedAt: r.publishedAt,
                      thinkTankSlug: r.thinkTankSlug,
                      topicFa: r.topicFa,
                      hasArticle: false,
                    })
                  }
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="rounded-sm bg-muted px-1 text-[8px] text-foreground/70">{r.topicFa}</span>
                  <span>{r.title}</span>
                  <span className="text-[8px] text-muted-foreground/60">· {r.thinkTankSlug}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Toolbar row: view density, lists, resume */}
      <div className="tt-glass tt-rise-1 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          {/* Density switcher */}
          <div className="flex rounded-md border border-border p-0.5">
            {([
              ["comfortable", Rows3],
              ["compact", Rows2],
              ["list", Table2],
            ] as const).map(([m, Icon]) => (
              <button
                key={m}
                onClick={() => {
                  setViewMode(m);
                  persistLayout({ viewMode: m });
                }}
                className={`rounded p-1 transition-colors ${
                  viewMode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
                title={t(`board.vm.${m}`)}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
          {/* Column count — how many topic columns are on screen at once */}
          <label
            className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5"
            title={t("board.columnsHint", {
              count: lang === "fa" ? toFaDigits(visibleCount) : visibleCount,
              total: lang === "fa" ? toFaDigits(ALL_IDS.length) : ALL_IDS.length,
            })}
          >
            <Columns3 className="size-3 text-muted-foreground" />
            <select
              value={visibleCount}
              onChange={(e) => {
                const n = Number(e.target.value);
                setVisibleCount(n);
                persistLayout({ columns: n });
              }}
              className="bg-transparent text-[10.5px] outline-none"
            >
              {ALL_IDS.map((_, i) => i + 1)
                .filter((n) => n >= MIN_COLUMNS)
                .map((n) => (
                  <option key={n} value={n}>
                    {lang === "fa" ? toFaDigits(n) : n}
                  </option>
                ))}
            </select>
            <span className="text-[9px] text-muted-foreground">{t("board.columns")}</span>
          </label>
          {/* Reading lists */}
          <select
            value={activeListId ?? ""}
            onChange={(e) => setActiveListId(e.target.value || null)}
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px] outline-none"
          >
            <option value="">{t("board.lists.pick")}</option>
            {lists?.map((l) => (
              <option key={l._id} value={l._id}>
                {l.name} ({l.count})
              </option>
            ))}
          </select>
          {activeListId && (
            <button
              onClick={() => setActiveListId(null)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              title={t("board.lists.close")}
            >
              <X className="size-3.5" />
            </button>
          )}
          <input
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder={t("board.lists.new")}
            className="h-7 w-32 rounded-md border border-border bg-card px-2 text-[11px] outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && listName.trim()) {
                void createList({ name: listName }).then((id) => {
                  setActiveListId(String(id));
                  setListName("");
                });
              }
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {/* Triage filter chips */}
          <div className="flex rounded-md border border-border p-0.5">
            {(["ALL", "UNREAD", "READING", "READ"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTriageFilter(f)}
                className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                  triageFilter === f
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`board.triage.${f.toLowerCase()}`)}
                {f !== "ALL" && triageCounts && (
                  <span className="ms-1 tabular-nums opacity-60">
                    {lang === "fa" ? toFaDigits(triageCounts[f]) : triageCounts[f]}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Sort toggle */}
          <button
            onClick={() => setSortMode((m) => (m === "recent" ? "priority" : "recent"))}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] transition-colors ${
              sortMode === "priority"
                ? "border-rose-500/60 bg-rose-500/10 text-rose-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={t("board.sort.priority")}
          >
            <ArrowDownWideNarrow className="size-3" />
            {sortMode === "priority" ? t("board.sort.priority") : t("board.sort.recent")}
          </button>
          {/* J1 corpus export: CSV / JSON of the current topic window */}
          <ExportMenu />
          {/* Full-text search */}
          <div className="relative">
            <Search className="absolute start-2 top-1.5 size-3 text-muted-foreground" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={t("board.searchFull")}
              className="h-7 w-44 rounded-md border border-border bg-card ps-7 pe-2 text-[11px] outline-none placeholder:text-muted-foreground"
            />
            {searching && <Loader2 className="absolute end-2 top-2 size-3 animate-spin text-muted-foreground" />}
            {/* Results dropdown */}
            {(searchResults?.length ?? 0) > 0 && (
              <div className="absolute end-0 top-9 z-50 w-96 rounded-lg border border-border bg-card p-1.5 shadow-xl">
                {(searchResults ?? []).map((h) => (
                  <button
                    key={h._id}
                    onClick={() => {
                      onOpenItem({
                        _id: h._id,
                        title: h.title,
                        url: "",
                        summary: "",
                        publishedAt: h.publishedAt,
                        thinkTankSlug: h.thinkTankSlug,
                        topicFa: h.topicFa,
                        hasArticle: h.where === "FULLTEXT",
                      });
                      setSearchQ("");
                    }}
                    className="block w-full rounded-md px-2 py-1.5 text-start transition-colors hover:bg-muted"
                  >
                    <p className="line-clamp-1 text-[11px] font-medium">{h.title}</p>
                    <p className="line-clamp-2 text-[9px] leading-4 text-muted-foreground" dir="rtl">
                      {h.snippet}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[8px] text-muted-foreground/70">
                      <span className="rounded-sm bg-muted px-1">{h.topicFa}</span>
                      {h.thinkTankSlug}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="hidden text-[9px] text-muted-foreground md:inline">{t("board.kbd.hint")}</span>
          {/* Resume chips */}
          {resumeFeed?.map((r) => (
            <button
              key={r.pubId}
              onClick={() =>
                onOpenItem({
                  _id: String(r.pubId),
                  title: r.title,
                  url: "",
                  summary: "",
                  publishedAt: r.lastReadAt,
                  thinkTankSlug: "",
                  topicFa: "",
                  hasArticle: true,
                })
              }
              className="flex max-w-40 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[9px] text-muted-foreground transition-colors hover:border-sky-500/60 hover:text-foreground"
              title={r.title}
            >
              <Play className="size-2.5 shrink-0 text-sky-500" />
              <span className="truncate">{r.title}</span>
              <span className="shrink-0 tabular-nums">{Math.round(r.progress * 100)}%</span>
            </button>
          ))}
        </div>
      </div>

      {/* World coverage strip */}
      <div className="shrink-0">
        <WorldStrip />
      </div>

      <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto overflow-y-hidden pb-1">
        {/* Columns — pinned first, drag to reorder; only `visibleCount`
            render at once, the rest scroll in horizontally. */}
        {shownIds.map((id, idx) => {
          const col = TOPIC_COLUMNS.find((c) => c.id === id);
          if (!col) return null;
          return (
            <TopicColumn
              key={id}
              topicId={id}
              labelKey={col.labelKey}
              accent={col.accent}
              rgb={col.rgb}
              count={counts?.[id]}
              width={colWidth(id)}
              pinned={pinned.has(id)}
              focused={focusIdx === idx}
              viewMode={viewMode}
              triageFilter={triageFilter}
              sortMode={sortMode}
              onFocus={() => setFocusIdx(idx)}
              onPin={() => {
                const next = new Set(pinned);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setPinned(next);
                persistLayout({ pinned: next });
              }}
              onDragStart={() => setDragId(id)}
              onDropOn={() => {
                if (!dragId || dragId === id) return;
                const from = order.indexOf(dragId);
                const to = order.indexOf(id);
                const next = reorder(order, from, to);
                setOrder(next);
                persistLayout({ order: next });
                setDragId(null);
              }}
              onOpen={(item) => onOpenItem(item)}
              onSaveShortcut={(item) => void saveToList(item)}
              onOpenActor={onOpenActor}
              onResize={(w) => {
                const next = { ...widths, [id]: w };
                setWidths(next);
                resizeTimer.current ??= 0;
                window.clearTimeout(resizeTimer.current);
                resizeTimer.current = window.setTimeout(() => persistLayout({ widths: next }), 600);
              }}
              listLabel={t("board.lists.save")}
              inList={inListIds}
            />
          );
        })}

        {/* Reader tabs — docked right side */}
        {tabs.length > 0 && (
          <div className="tt-rise relative flex w-[42%] min-w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/40 px-1.5">
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
              <EnhancedReader
                tab={activeTab}
                onClose={() => closeTab(activeTab.key)}
                onToggleSplit={() =>
                  setTabs((cur) =>
                    cur.map((tb) => (tb.key === activeTab.key ? { ...tb, split: !tb.split } : tb)),
                  )
                }
                onAddToList={() => {
                  const item: BoardItem = {
                    _id: activeTab.pubId,
                    title: activeTab.title,
                    url: activeTab.data?.url ?? "",
                    summary: "",
                    publishedAt: Date.now(),
                    thinkTankSlug: "",
                    topicFa: "",
                    hasArticle: true,
                  };
                  void saveToList(item);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* I4 compare workbench floating bar */}
      <CompareBar />

      {/* List picker modal */}
      {listPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
          onClick={() => setListPicker(null)}
        >
          <div
            className="w-80 rounded-lg border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 truncate text-xs font-semibold">{listPicker.item.title}</p>
            <p className="mb-2 text-[10px] text-muted-foreground">{t("board.lists.choose")}</p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {(lists ?? []).map((l) => (
                <button
                  key={l._id}
                  onClick={() => {
                    void toggleItem({ listId: l._id as never, pubId: listPicker.item._id as never });
                    setListPicker(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-muted ${
                    l.pubIds.map(String).includes(listPicker.item._id) ? "text-sky-600" : ""
                  }`}
                >
                  <span className="truncate">{l.name}</span>
                  <span className="text-[9px] tabular-nums text-muted-foreground">{l.count}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder={t("board.lists.new")}
                className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none"
              />
              <button
                onClick={() => {
                  if (!listName.trim()) return;
                  void createList({ name: listName }).then((id) => {
                    void toggleItem({ listId: id as never, pubId: listPicker.item._id as never });
                    setListName("");
                    setListPicker(null);
                  });
                }}
                className="rounded-md border border-border px-2 py-1 text-[10px] hover:bg-muted"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
