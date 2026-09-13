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
  ExternalLink,
  FileText,
  Globe2,
  LayoutList,
  Loader2,
  Newspaper,
  Pin,
  PinOff,
  Play,
  Rows2,
  Rows3,
  Table2,
  X,
} from "lucide-react";
import { toFaDigits } from "@/components/graph/metrics";
import { TopicSparkline, WorldStrip } from "./BoardVisuals";
import EnhancedReader, { type EnhancedReaderTab } from "./EnhancedReader";

/** Column taxonomy — mirrors TOPICS in convex/articles.ts. */
const TOPIC_COLUMNS: Array<{ id: string; labelKey: string; accent: string }> = [
  { id: "military", labelKey: "board.military", accent: "border-t-rose-500" },
  { id: "security", labelKey: "board.security", accent: "border-t-amber-500" },
  { id: "geopolitics", labelKey: "board.geopolitics", accent: "border-t-sky-500" },
  { id: "economy", labelKey: "board.economy", accent: "border-t-emerald-500" },
  { id: "energy", labelKey: "board.energy", accent: "border-t-orange-500" },
  { id: "tech", labelKey: "board.tech", accent: "border-t-violet-500" },
  { id: "governance", labelKey: "board.governance", accent: "border-t-teal-500" },
];
const ALL_IDS = TOPIC_COLUMNS.map((c) => c.id);
const PAGE = 30; // per-fetch page size (incremental "infinite" scroll)

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
}

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
  count,
  width,
  pinned,
  focused,
  viewMode,
  onFocus,
  onPin,
  onDragStart,
  onDropOn,
  onOpen,
  onSaveShortcut,
  onResize,
  listLabel,
  inList,
}: {
  topicId: string;
  labelKey: string;
  accent: string;
  count?: number;
  width: number;
  pinned: boolean;
  focused: boolean;
  viewMode: ViewMode;
  onFocus: () => void;
  onPin: () => void;
  onDragStart: () => void;
  onDropOn: () => void;
  onOpen: (item: BoardItem) => void;
  onSaveShortcut: (item: BoardItem) => void;
  onResize: (width: number) => void;
  listLabel: string;
  inList: Set<string>;
}) {
  const { t, lang } = useI18n();
  const [limit, setLimit] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const items = useQuery(api.articles.getTopicFeed, { topic: topicId, limit });
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
      className={`relative flex h-full min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border bg-card transition-shadow ${accent} border-t-2 ${
        dragOver ? "border-dashed border-sky-500" : "border-border"
      } ${focused ? "ring-1 ring-ring/60" : ""}`}
      style={{ width }}
    >
      {/* Header: title, sparkline, count, pin */}
      <header
        draggable
        onDragStart={onDragStart}
        onDoubleClick={onPin}
        className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-border/70 px-3 py-2 active:cursor-grabbing"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {pinned && <Pin className="size-3 shrink-0 text-sky-600" />}
          <h2 className="truncate text-xs font-bold tracking-tight">{t(labelKey)}</h2>
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
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        )}
        {items?.length === 0 && (
          <p className="p-3 text-[11px] leading-4 text-muted-foreground">{t("board.empty")}</p>
        )}
        {items?.map((item, idx) => {
          const saved = inList.has(item._id);
          const reading = item.hasArticle;
          return (
            <div
              key={item._id}
              className={`group relative border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/50 ${
                saved ? "bg-sky-500/5" : ""
              }`}
            >
              <button
                onClick={() => onOpen(item)}
                className={`block w-full text-start ${compact ? "px-2.5 py-1.5" : "px-3 py-2.5"}`}
              >
                <p
                  className={`font-medium leading-5 ${compact ? "line-clamp-1 text-[11px]" : "line-clamp-3 text-[11.5px]"}`}
                >
                  {item.title}
                </p>
                {!compact && !isList && (
                  <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-muted-foreground/80">
                    {item.summary}
                  </p>
                )}
                <p className={`mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground`}>
                  {reading && <FileText className="size-2.5 shrink-0 text-emerald-600" />}
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
              {/* Hover action: save to list */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveShortcut(item);
                }}
                title={listLabel}
                className={`absolute end-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-sky-600 group-hover:opacity-100 ${
                  saved ? "!opacity-100 text-sky-600" : ""
                }`}
              >
                <LayoutList className="size-3" />
              </button>
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

// ─── The board ──────────────────────────────────────────────────────────────

export default function TopicBoard() {
  const { t, lang } = useI18n();
  const counts = useQuery(api.articles.getTopicCounts, { hours: 48 });
  const openArticle = useAction(api.articles.openArticle);
  const layout = useQuery(api.reading.getLayout, {});
  const lists = useQuery(api.reading.listReadingLists);
  const resumeFeed = useQuery(api.reading.getResumeFeed, { limit: 4 });
  const saveLayout = useMutation(api.reading.saveLayout);
  const createList = useMutation(api.reading.createList);
  const toggleItem = useMutation(api.reading.toggleListItem);

  const [order, setOrder] = useState<string[]>(ALL_IDS);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("comfortable");
  const [hydrated, setHydrated] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tabs, setTabs] = useState<EnhancedReaderTab[]>([]);
  const [listPicker, setListPicker] = useState<{ item: BoardItem } | null>(null);
  const [listName, setListName] = useState("");
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const resizeTimer = useRef<number | null>(null);

  // Hydrate persisted layout once.
  useEffect(() => {
    if (!layout || hydrated) return;
    const known = layout.order.filter((id) => ALL_IDS.includes(id));
    const missing = ALL_IDS.filter((id) => !known.includes(id));
    setOrder([...known, ...missing]);
    setPinned(new Set(layout.pinned ?? []));
    setWidths((layout.widths ?? {}) as Record<string, number>);
    if (layout.viewMode) setViewMode(layout.viewMode);
    setHydrated(true);
  }, [layout, hydrated]);

  const persistLayout = useCallback(
    (next: { order?: string[]; pinned?: Set<string>; widths?: Record<string, number>; viewMode?: ViewMode }) => {
      void saveLayout({
        order: next.order ?? order,
        pinned: Array.from(next.pinned ?? pinned),
        widths: next.widths ?? widths,
        viewMode: next.viewMode ?? viewMode,
      }).catch(() => {});
    },
    [saveLayout, order, pinned, widths, viewMode],
  );

  const visibleIds = useMemo(() => {
    const p = order.filter((id) => pinned.has(id));
    const rest = order.filter((id) => !pinned.has(id));
    return [...p, ...rest];
  }, [order, pinned]);

  const colWidth = (id: string) => widths[id] ?? 260;

  // ── Keyboard navigation: j/k switch focused column, Enter/t/s/l act on it ──
  const focusItems = useQuery(api.articles.getTopicFeed, {
    topic: visibleIds[focusIdx] ?? "military",
    limit: 1,
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "j" || e.key === "ArrowRight") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(visibleIds.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" || e.key === "t") {
        const item = focusItems?.[0];
        if (item && visibleIds[focusIdx]) {
          e.preventDefault();
          onOpenItem(item as BoardItem, visibleIds[focusIdx]);
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
  }, [visibleIds, focusIdx, focusItems]);

  // ── Reader tabs (open + extraction pipeline) ──
  const onOpenItem = (item: BoardItem, _topic?: string) => {
    const key = item._id;
    setActiveKey(key);
    setTabs((prev) => {
      if (prev.some((tb) => tb.key === key)) return prev;
      const tab: EnhancedReaderTab = { key, pubId: item._id, title: item.title, loading: true };
      void openArticle({ pubId: item._id as never })
        .then((data) => {
          setTabs((cur) =>
            cur.map((tb) =>
              tb.key === key
                ? { ...tb, loading: false, data: data ? { ...data, textEn: undefined } : undefined }
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
                    error: msg.includes("AI_API_KEY") ? t("ai.noKey") : t("board.readerError"),
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
      if (activeKey === key) setActiveKey(next.length > 0 ? next[next.length - 1].key : null);
      return next;
    });
  };

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

  useEffect(() => {
    void lang;
  }, [lang]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" dir={boardDir}>
      {/* Toolbar row: view density, lists, resume */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
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
        <div className="flex items-center gap-2">
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

      <div className="flex min-h-0 flex-1 gap-2.5 overflow-hidden pb-1">
        {/* Columns — pinned first, drag to reorder */}
        {visibleIds.map((id, idx) => {
          const col = TOPIC_COLUMNS.find((c) => c.id === id);
          if (!col) return null;
          return (
            <TopicColumn
              key={id}
              topicId={id}
              labelKey={col.labelKey}
              accent={col.accent}
              count={counts?.[id]}
              width={colWidth(id)}
              pinned={pinned.has(id)}
              focused={focusIdx === idx}
              viewMode={viewMode}
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
          <div className="relative flex w-[42%] min-w-96 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
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
