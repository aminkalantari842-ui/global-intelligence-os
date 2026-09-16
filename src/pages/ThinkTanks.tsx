import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { aiErrorKey } from "@/lib/aiError";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TopicBoard from "@/components/board/TopicBoard";
import { WorldStrip } from "@/components/board/BoardVisuals";
import { Signals } from "@/components/board/Signals";
import { SourcesManager } from "@/components/board/SourcesManager";
import { AuthorsPanel } from "@/components/board/AuthorsPanel";
import {
  ExternalLink,
  RefreshCw,
  BookOpen,
  Search,
  Globe,
  Calendar,
  Building2,
  Loader2,
  Clock,
  TrendingUp,
  Filter,
  Languages,
  Layers,
  Radar,
  Star,
  Signal,
  Activity,
  Newspaper,
  Database,
  Users,
} from "lucide-react";

const REGION_MAP: Record<string, string> = {
  "North America": "tt.northAmerica",
  Europe: "tt.europe",
  "Middle East": "tt.middleEast",
  Asia: "tt.asia",
  Africa: "tt.africa",
  Oceania: "tt.oceania",
  "Latin America": "tt.latinAmerica",
};

const REGION_COLORS: Record<string, string> = {
  "North America": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Europe: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "Middle East": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Asia: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  Africa: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  Oceania: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  "Latin America": "bg-lime-500/10 text-lime-600 dark:text-lime-400",
};

const TIER_COLORS: Record<string, string> = {
  S: "bg-foreground text-background",
  "A+": "bg-foreground/80 text-background",
  A: "border border-border text-foreground",
  "B+": "border border-border text-muted-foreground",
};

const TIER_ORDER: Record<string, number> = { S: 0, "A+": 1, A: 2, "B+": 3 };

const CLUSTERS = [
  "security",
  "foreign-policy",
  "iran-mideast",
  "china-asia",
  "economy",
  "energy",
  "africa-global-south",
  "tech",
  "governance",
] as const;

function fmtDate(ts: number, fa: boolean) {
  return new Date(ts).toLocaleDateString(fa ? "fa-IR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtRelative(ts: number, fa = false) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return fa ? "الان" : "now";
  const n = fa ? mins.toLocaleString("fa-IR") : String(mins);
  if (mins < 60) return fa ? `${n} دقیقه` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const nh = fa ? hrs.toLocaleString("fa-IR") : String(hrs);
  if (hrs < 24) return fa ? `${nh} ساعت` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const nd = fa ? days.toLocaleString("fa-IR") : String(days);
  return fa ? `${nd} روز` : `${days}d`;
}

/** Solid bg-* color for a region (dot / accent rail), derived from the chip map. */
function regionSolid(region: string | undefined): string {
  if (!region) return "bg-border";
  const cls = REGION_COLORS[region]?.split(" ")[1]; // e.g. "text-blue-600"
  return cls ? cls.replace("text-", "bg-") : "bg-border";
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

/** Section header: kicker + title + optional right slot. */
function SectionHead({
  kicker,
  title,
  icon: Icon,
  right,
}: {
  kicker?: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="flex size-7 items-center justify-center rounded-lg border border-border/80 bg-muted/50">
            <Icon className="size-3.5 text-muted-foreground" />
          </span>
        )}
        <div>
          {kicker && <p className="tt-kicker">{kicker}</p>}
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        </div>
      </div>
      {right}
    </div>
  );
}

/**
 * Per-publication FA translation. Calls the server action on first open —
 * results are permanently cached server-side (SHA-256 keyed), so repeat
 * views and other users cost zero model calls.
 */
function TranslationBlock({
  title,
  summary,
  batchKey,
  batchSeq,
  batchSize,
  onBatchDone,
}: {
  title: string;
  summary: string;
  /** Bumped when the user clicks "translate visible" — triggers auto-run. */
  batchKey: number;
  /** Position in the visible list — staggers concurrent model calls. */
  batchSeq: number;
  batchSize: number;
  onBatchDone: () => void;
}) {
  const { t } = useI18n();
  const translate = useAction(api.translations.translatePublication);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "done"; titleFa: string; summaryFa: string; cached: boolean }
  >({ status: "idle" });

  const run = async () => {
    setState({ status: "loading" });
    try {
      const res = await translate({ title, summary: summary || undefined });
      setState({ status: "done", ...res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = aiErrorKey(msg);
      setState({
        status: "error",
        message: key ? t(key) : t("tt.translateError"),
      });
    } finally {
      if (batchSize > 0) onBatchDone();
    }
  };

  // Batch orchestration: staggered start (seq × 350ms) keeps concurrent
  // model calls bounded; the bump of batchKey is the global start signal.
  const startedRef = useRef(0);
  useEffect(() => {
    if (batchKey === 0) return;
    if (startedRef.current === batchKey) return;
    startedRef.current = batchKey;
    const id = setTimeout(() => void run(), batchSeq * 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchKey]);

  if (state.status === "idle") {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void run();
        }}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      >
        <Languages className="size-3" />
        {t("tt.translate")}
      </button>
    );
  }

  if (state.status === "loading") {
    return (
      <span className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {t("tt.translating")}
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span className="mt-2 inline-flex items-center gap-2 text-[10px] text-muted-foreground">
        {state.message}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void run();
          }}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {t("tt.translateRetry")}
        </button>
      </span>
    );
  }

  return (
    <div
      className="mt-2 rounded-lg border-s-2 border-s-foreground/40 bg-muted/40 px-3 py-2"
      dir="rtl"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <p className="text-xs font-medium leading-5">{state.titleFa}</p>
      {state.summaryFa && (
        <p className="mt-1 line-clamp-4 text-[11px] leading-5 text-muted-foreground">
          {state.summaryFa}
        </p>
      )}
      <p className="mt-1 text-[9px] text-muted-foreground/70">
        {t("tt.translateDisclaimer")}
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ThinkTanks() {
  const { t, lang } = useI18n();
  const [selectedTank, setSelectedTank] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string | undefined>();
  const [tierFilter, setTierFilter] = useState<string | undefined>();
  const [clusterFilter, setClusterFilter] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // Batch FA translation of the visible list, with live progress.
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchKey, setBatchKey] = useState(0); // bump → TranslationBlocks auto-open
  // "board" = Persian topic columns · "list" = classic publication list
  const [view, setView] = useState<"board" | "list">("board");
  // A1/A2 source catalog modal + B/E/H signals strip
  const [showSources, setShowSources] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  // A4/B4 analyst & program pages + personal watchlist column
  const [showAuthors, setShowAuthors] = useState(false);
  const [authorSlug, setAuthorSlug] = useState<string | undefined>();

  // Reader bylines dispatch "authors:open" — deep-link into the analyst page.
  useEffect(() => {
    const onOpenAuthor = (e: Event) => {
      const slug = (e as CustomEvent<{ slug?: string }>).detail?.slug;
      if (!slug) return;
      setAuthorSlug(slug);
      setShowAuthors(true);
    };
    window.addEventListener("authors:open", onOpenAuthor);
    return () => window.removeEventListener("authors:open", onOpenAuthor);
  }, []);

  const syncRegistry = useMutation(api.thinkTankSeed.syncRegistry);

  // E2 deep link: /thinktanks?author=<slug> arrives from graph-console mentions.
  // The URL stays the source of truth, so the link is shareable; closing the
  // panel records the dismissed slug instead of mutating the query string.
  const [searchParams] = useSearchParams();
  const authorParam = searchParams.get("author") ?? undefined;
  const [closedAuthor, setClosedAuthor] = useState<string | undefined>(undefined);
  const authorsOpen = showAuthors || (!!authorParam && authorParam !== closedAuthor);
  const activeAuthor = authorParam && authorParam !== closedAuthor ? authorParam : authorSlug;

  // Ensure the full 114-tank registry is present (idempotent; runs once).
  useEffect(() => {
    setSyncing(true);
    syncRegistry()
      .then((r) => {
        if (r.inserted > 0) {
          setStatusMsg(`${t("tt.registriesSynced")} · +${r.inserted}`);
        }
      })
      .catch(() => {})
      .finally(() => setSyncing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tanks = useQuery(api.thinkTanks.listEnabled);
  const stats = useQuery(api.thinkTanks.getStats);
  const tankStats = useQuery(api.thinkTanks.getTankStats);
  const topTopics = useQuery(api.thinkTanks.getTopTopics, { limit: 10 });
  const pubs = useQuery(api.thinkTanks.listPublications, {
    tankSlug: selectedTank,
    limit: 50,
    search: search || undefined,
  });
  const refreshFeeds = useAction(api.rssIngest.refreshFeeds);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setStatusMsg(null);
    try {
      const result = await refreshFeeds({});
      setStatusMsg(
        `${result.refreshed}/${result.total} ${t("tt.feedActive")} · +${result.inserted}`,
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setRefreshing(false);
    }
  }, [refreshFeeds, t]);

  const regions = useMemo(() => {
    if (!tanks) return [];
    const set = new Set(tanks.map((tank) => tank.region));
    return Array.from(set).sort();
  }, [tanks]);

  const displayTanks = useMemo(() => {
    if (!tanks) return [];
    let list = tanks;
    if (regionFilter) list = list.filter((tank) => tank.region === regionFilter);
    if (tierFilter) list = list.filter((tank) => tank.tier === tierFilter);
    if (clusterFilter)
      list = list.filter((tank) => (tank.clusters ?? []).includes(clusterFilter));
    // Sort by tier (S first), then name
    return [...list].sort((a, b) => {
      const ta = TIER_ORDER[a.tier ?? "B+"] ?? 4;
      const tb = TIER_ORDER[b.tier ?? "B+"] ?? 4;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    });
  }, [tanks, regionFilter, tierFilter, clusterFilter]);

  const fa = lang === "fa";
  const num = (v: number | string) => (fa && typeof v === "number" ? v.toLocaleString("fa-IR") : String(v));

  const statCards: Array<{ key: string; label: string; value: string; icon: React.ComponentType<{ className?: string }>; pulse?: boolean }> = stats
    ? [
        { key: "tanks", label: t("tt.institutions"), value: num(stats.tankCount), icon: Building2 },
        { key: "total", label: t("tt.totalPubs"), value: num(stats.totalPubs.toLocaleString()), icon: Database },
        { key: "day", label: t("tt.lastDay"), value: num(stats.pubsLastDay), icon: Activity, pulse: (stats.pubsLastDay ?? 0) > 0 },
        { key: "week", label: t("tt.lastWeek"), value: num(stats.pubsLastWeek.toLocaleString()), icon: TrendingUp },
        { key: "topics", label: t("tt.topTopics"), value: num(stats.topicCount), icon: Layers },
        {
          key: "refresh",
          label: t("tt.autoRefresh"),
          value: stats.lastRefresh > 0 ? `${fmtRelative(stats.lastRefresh, fa)} ${t("tt.ago")}` : t("tt.never"),
          icon: Clock,
        },
      ]
    : [];

  return (
    <div
      className="tt-atmosphere min-h-screen bg-background text-foreground"
      dir={lang === "fa" ? "rtl" : "ltr"}
    >
      {/* ── Command-desk masthead ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-[10px] font-bold text-background">
                GI
              </span>
              <span className="text-sm font-semibold tracking-tight">
                {t("app.name")}
              </span>
            </Link>
            <span className="text-xs text-muted-foreground/70">/</span>
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Newspaper className="size-3.5 text-muted-foreground" />
              {t("tt.title")}
            </span>
            {/* Live lamp */}
            <span className="ms-2 hidden items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[9px] text-muted-foreground sm:flex">
              <span className="tt-lamp size-1.5 rounded-full bg-emerald-500" />
              {t("tt.feedActive")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSources(true)}
              className="flex items-center gap-1 rounded-lg border border-border/80 bg-card/60 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-all hover:border-foreground/30 hover:text-foreground"
            >
              <Building2 className="size-3.5" /> {t("tt.sources")}
            </button>
            <button
              onClick={() => {
                setAuthorSlug(undefined);
                setClosedAuthor(authorParam);
                setShowAuthors(true);
              }}
              className="flex items-center gap-1 rounded-lg border border-border/80 bg-card/60 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-all hover:border-foreground/30 hover:text-foreground"
            >
              <Users className="size-3.5" /> {t("authors.title")}
            </button>
            <button
              onClick={() => setShowSignals((v) => !v)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] transition-all ${
                showSignals
                  ? "border-sky-500/60 bg-sky-500/10 text-sky-600"
                  : "border-border/80 bg-card/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              <Radar className={`size-3.5 ${showSignals ? "animate-pulse" : ""}`} /> {t("tt.signals")}
            </button>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-xs">
                {t("nav.graph")}
              </Button>
            </Link>
            <Link to="/analyst">
              <Button variant="ghost" size="sm" className="text-xs">
                {t("nav.analyst")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex h-[calc(100vh-3.5rem)] w-full max-w-[1680px] flex-col px-4 py-4 sm:px-6">
        {/* ── Hero: title + stat rail ──────────────────────────────────────── */}
        <section className="tt-rise shrink-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="tt-kicker">{t("tt.clusterFilter")} · OSINT</p>
              <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight">
                {t("tt.title")}
              </h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-6 text-muted-foreground">
                {t("tt.desc")}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <div className="flex items-center gap-2">
                {lang === "fa" && pubs && pubs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      setBatchDone(0);
                      setBatchTotal(pubs.length);
                      setBatchKey((k) => k + 1);
                    }}
                    disabled={refreshing || syncing || batchDone < batchTotal}
                  >
                    <Languages className="size-3.5" />
                    {t("tt.translateVisible")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleRefresh}
                  disabled={refreshing || syncing}
                >
                  {refreshing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  {t("tt.refreshAll")}
                </Button>
              </div>
              {batchTotal > 0 && (
                <div className="flex w-48 items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${(batchDone / batchTotal) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {num(batchDone)}/{num(batchTotal)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stat rail */}
          {statCards.length > 0 && (
            <div className="tt-glass mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl sm:grid-cols-3 xl:grid-cols-6">
              {statCards.map((s) => (
                <div key={s.key} className="tt-stat group bg-card/55 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <s.icon className={`size-3 text-muted-foreground/70 ${s.pulse ? "text-emerald-500" : ""}`} />
                    <p className="truncate text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                      {s.label}
                    </p>
                  </div>
                  <p className="tt-stat-num mt-1 text-xl font-bold tabular-nums tracking-tight transition-colors">
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Status message */}
        {(statusMsg || syncing) && (
          <div className="tt-rise tt-rise-1 mt-2.5 flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
            {syncing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Clock className="size-3" />
            )}
            {syncing ? t("tt.syncRegistry") : statusMsg}
          </div>
        )}

        {/* ── View switcher + signals rail ─────────────────────────────────── */}
        <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
          <div className="flex rounded-xl border border-border/80 bg-card/60 p-1">
            {(["board", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                  view === v
                    ? "bg-foreground text-background shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "board" ? t("tt.viewBoard") : t("tt.viewList")}
              </button>
            ))}
          </div>
          <p className="hidden text-[10px] text-muted-foreground md:block">{t("board.hint")}</p>
        </div>

        {/* B/E/H signals strip (collapsible) */}
        {showSignals && (
          <div className="tt-rise mt-3 shrink-0">
            <Signals />
          </div>
        )}

        {view === "board" ? (
          <div className="tt-rise tt-rise-2 mt-3 flex min-h-0 flex-1 flex-col">
            <TopicBoard />
          </div>
        ) : (
          <>
            {/* ── List view ─────────────────────────────────────────────────── */}
            <div className="tt-rise tt-rise-2 mt-4 min-h-0 flex-1 overflow-y-auto pb-6">
              <WorldStrip />

              {/* Search */}
              <div className="relative mt-4">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("tt.search")}
                  className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
                />
              </div>

              <div className="mt-4 grid gap-5 lg:grid-cols-[280px_1fr]">
                {/* Sidebar */}
                <aside className="flex flex-col gap-4">
                  <div className="tt-glass rounded-xl p-3.5">
                    <SectionHead kicker="01" title={t("tt.tier")} icon={Star} />
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      <button
                        onClick={() => setTierFilter(undefined)}
                        className={`rounded-md px-2 py-1 text-[10px] transition-colors ${
                          !tierFilter
                            ? "bg-foreground text-background"
                            : "border border-border hover:bg-muted"
                        }`}
                      >
                        {t("tt.allTiers")}
                      </button>
                      {["S", "A+", "A", "B+"].map((tier) => (
                        <button
                          key={tier}
                          onClick={() =>
                            setTierFilter(tierFilter === tier ? undefined : tier)
                          }
                          className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                            tierFilter === tier
                              ? TIER_COLORS.S
                              : TIER_COLORS[tier] ?? "border border-border"
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="tt-glass rounded-xl p-3.5">
                    <SectionHead kicker="02" title={t("tt.clusterFilter")} icon={Layers} />
                    <div className="mt-2.5 flex flex-col gap-0.5">
                      <button
                        onClick={() => setClusterFilter(undefined)}
                        className={`rounded-md px-3 py-1.5 text-right text-xs transition-colors ${
                          !clusterFilter
                            ? "bg-foreground text-background"
                            : "hover:bg-muted"
                        }`}
                      >
                        {t("tt.allRegions")}
                      </button>
                      {CLUSTERS.map((cluster) => (
                        <button
                          key={cluster}
                          onClick={() =>
                            setClusterFilter(
                              clusterFilter === cluster ? undefined : cluster,
                            )
                          }
                          className={`rounded-md px-3 py-1.5 text-right text-xs transition-colors ${
                            clusterFilter === cluster
                              ? "bg-foreground text-background"
                              : "hover:bg-muted"
                          }`}
                        >
                          {t(`tt.cluster.${cluster}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="tt-glass rounded-xl p-3.5">
                    <SectionHead kicker="03" title={t("tt.regions")} icon={Filter} />
                    <div className="mt-2.5 flex flex-col gap-0.5">
                      <button
                        onClick={() => setRegionFilter(undefined)}
                        className={`rounded-md px-3 py-1.5 text-right text-xs transition-colors ${
                          !regionFilter
                            ? "bg-foreground text-background"
                            : "hover:bg-muted"
                        }`}
                      >
                        {t("tt.allRegions")}
                      </button>
                      {regions.map((region) => (
                        <button
                          key={region}
                          onClick={() =>
                            setRegionFilter(
                              regionFilter === region ? undefined : region,
                            )
                          }
                          className={`flex items-center justify-between rounded-md px-3 py-1.5 text-right text-xs transition-colors ${
                            regionFilter === region
                              ? "bg-foreground text-background"
                              : "hover:bg-muted"
                          }`}
                        >
                          <span>{t(REGION_MAP[region] ?? region)}</span>                            <span
                              className={`size-1.5 rounded-full ${
                                regionFilter === region
                                  ? "bg-current opacity-70"
                                  : regionSolid(region)
                              }`}
                            />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="tt-glass rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <SectionHead kicker="04" title={t("tt.institutions")} icon={Building2} />
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {num(displayTanks.length)}
                      </span>
                    </div>
                    <div className="mt-2.5 flex max-h-[38vh] flex-col gap-0.5 overflow-y-auto pe-1">
                      <button
                        onClick={() => setSelectedTank(undefined)}
                        className={`rounded-md px-3 py-1.5 text-right text-xs transition-colors ${
                          !selectedTank
                            ? "bg-foreground text-background"
                            : "hover:bg-muted"
                        }`}
                      >
                        {t("tt.allTanks")}
                      </button>
                      {displayTanks.map((tank) => {
                        const ts = tankStats?.[tank.slug];
                        return (
                          <button
                            key={tank._id}
                            onClick={() =>
                              setSelectedTank(
                                selectedTank === tank.slug ? undefined : tank.slug,
                              )
                            }
                            className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-right text-xs transition-colors ${
                              selectedTank === tank.slug
                                ? "bg-foreground text-background"
                                : "hover:bg-muted"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              {tank.tier && (
                                <span
                                  className={`shrink-0 rounded px-1 py-px text-[8px] font-bold leading-3 ${
                                    selectedTank === tank.slug
                                      ? "bg-background/20"
                                      : TIER_COLORS[tank.tier] ?? ""
                                  }`}
                                >
                                  {tank.tier}
                                </span>
                              )}
                              <span className="truncate">{tank.name}</span>
                            </span>
                            {ts && ts.count > 0 && (
                              <span className="shrink-0 text-[10px] tabular-nums opacity-60">
                                {num(ts.count)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {topTopics && topTopics.length > 0 && (
                    <div className="tt-glass rounded-xl p-3.5">
                      <SectionHead kicker="05" title={t("tt.topTopics")} icon={TrendingUp} />
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {topTopics.map((item) => (
                          <button
                            key={item.topic}
                            onClick={() => setSearch(item.topic)}
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] transition-colors hover:border-foreground/40 hover:bg-muted"
                          >
                            {item.topic} <span className="opacity-50">({num(item.count)})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </aside>

                {/* Feed */}
                <div className="flex flex-col gap-3">
                  {/* Active filters */}
                  {(selectedTank || search || tierFilter || clusterFilter || regionFilter) && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Signal className="size-3" />
                        {pubs ? num(pubs.length) : "…"} {t("tt.pubs")}
                      </span>
                      {selectedTank && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          {tankStats?.[selectedTank]?.name ?? selectedTank}
                          <button
                            onClick={() => setSelectedTank(undefined)}
                            className="ms-0.5 hover:text-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      )}
                      {tierFilter && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          {tierFilter}
                          <button
                            onClick={() => setTierFilter(undefined)}
                            className="ms-0.5 hover:text-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      )}
                      {clusterFilter && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          {t(`tt.cluster.${clusterFilter}`)}
                          <button
                            onClick={() => setClusterFilter(undefined)}
                            className="ms-0.5 hover:text-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      )}
                      {regionFilter && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          {t(REGION_MAP[regionFilter] ?? regionFilter)}
                          <button
                            onClick={() => setRegionFilter(undefined)}
                            className="ms-0.5 hover:text-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      )}
                      {search && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          "{search}"
                          <button
                            onClick={() => setSearch("")}
                            className="ms-0.5 hover:text-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Loading */}
                  {!pubs && (
                    <div className="space-y-2.5">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="tt-shimmer h-24 rounded-xl" />
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {pubs && pubs.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-4 py-14 text-center">
                      <BookOpen className="mx-auto size-9 text-muted-foreground/30" />
                      <p className="mt-3 text-sm text-muted-foreground">
                        {search ? t("tt.noResults") : t("tt.noPubs")}
                      </p>
                      {!search && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 gap-1.5 text-xs"
                          onClick={handleRefresh}
                          disabled={refreshing}
                        >
                          <RefreshCw className="size-3.5" />
                          {t("tt.refreshAll")}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Publications */}
                  {pubs?.map((pub, batchSeq) => {
                    const tankInfo = tankStats?.[pub.thinkTankSlug];
                    return (
                      <a
                        key={pub._id}
                        href={pub.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tt-rise group relative block overflow-hidden rounded-xl border border-border/70 bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg hover:shadow-foreground/5"
                      >
                        {/* Accent rail */}
                        <span
                          className={`absolute inset-y-0 start-0 w-[3px] transition-all ${
                            regionSolid(tankInfo?.region)
                          }`}
                        />
                        <div className="flex items-start justify-between gap-3 ps-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold leading-5 tracking-tight transition-colors group-hover:underline group-hover:underline-offset-4">
                              {pub.title}
                            </h3>
                            {pub.summary && (
                              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {pub.summary}
                              </p>
                            )}
                            {lang === "fa" && (
                              <TranslationBlock
                                title={pub.title}
                                summary={pub.summary}
                                batchKey={batchKey}
                                batchSeq={batchSeq}
                                batchSize={batchTotal}
                                onBatchDone={() => setBatchDone((d) => d + 1)}
                              />
                            )}
                          </div>
                          <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:-translate-x-0.5 group-hover:text-foreground" />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 ps-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              REGION_COLORS[tankInfo?.region ?? ""] ??
                              "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Globe className="size-2.5" />
                            {tankInfo?.name ?? pub.thinkTankSlug}
                            {tankInfo?.tier && (
                              <span className="rounded bg-foreground/10 px-1 text-[8px] font-bold">
                                {tankInfo.tier}
                              </span>
                            )}
                          </span>

                          {tankInfo?.website && (
                            <span className="hidden items-center gap-1 text-[10px] text-muted-foreground/70 sm:flex">
                              <ExternalLink className="size-2.5" />
                              {new URL(tankInfo.website).hostname.replace("www.", "")}
                            </span>
                          )}

                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar className="size-2.5" />
                            {fmtDate(pub.publishedAt, lang === "fa")}
                          </span>

                          {pub.topics.length > 0 && (
                            <span className="flex flex-wrap gap-1">
                              {pub.topics.slice(0, 3).map((topic) => (
                                <span
                                  key={topic}
                                  className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  {topic}
                                </span>
                              ))}
                              {pub.topics.length > 3 && (
                                <span className="text-[9px] text-muted-foreground/60">
                                  +{num(pub.topics.length - 3)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* A1/A2 source catalog + health manager */}
      {showSources && <SourcesManager onClose={() => setShowSources(false)} />}

      {/* A4/B4 analyst pages + watchlist — opens publications on the board */}
      {authorsOpen && (
        <AuthorsPanel
          key={activeAuthor ?? "all"}
          initialSlug={activeAuthor}
          onClose={() => {
            setShowAuthors(false);
            setClosedAuthor(authorParam);
            setAuthorSlug(undefined);
          }}
          onOpenPub={(pubId) => {
            setShowAuthors(false);
            setView("board");
            // The board mounts its listener on the next paint — dispatch after.
            window.setTimeout(
              () =>
                window.dispatchEvent(
                  new CustomEvent("board:open-pub", { detail: pubId }),
                ),
              80,
            );
          }}
        />
      )}
    </div>
  );
}
