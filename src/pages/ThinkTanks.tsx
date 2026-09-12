import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Star,
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

const TIER_MAP: Record<string, string> = {
  S: "tt.tierS",
  "A+": "tt.tierAPlus",
  A: "tt.tierA",
  "B+": "tt.tierBPlus",
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

function fmtRelative(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/**
 * Per-publication FA translation. Calls the server action on first open —
 * results are permanently cached server-side (SHA-256 keyed), so repeat
 * views and other users cost zero model calls.
 */
function TranslationBlock({
  title,
  summary,
}: {
  title: string;
  summary: string;
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
      setState({
        status: "error",
        message: msg.includes("AI_API_KEY") ? t("ai.noKey") : t("tt.translateError"),
      });
    }
  };

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
      className="mt-2 rounded-md border-s-2 border-s-foreground/40 bg-muted/40 px-3 py-2"
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

  const syncRegistry = useMutation(api.thinkTankSeed.syncRegistry);

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
      const result = await refreshFeeds();
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

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      dir={lang === "fa" ? "rtl" : "ltr"}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">
                GI
              </span>
              <span className="text-sm font-semibold tracking-tight">
                {t("app.name")}
              </span>
            </Link>
            <span className="text-xs text-muted-foreground">
              / {t("tt.title")}
            </span>
          </div>
          <div className="flex items-center gap-2">
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

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("tt.title")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("tt.desc")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
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

        {/* Status message */}
        {(statusMsg || syncing) && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
            {syncing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Clock className="size-3" />
            )}
            {syncing ? t("tt.syncRegistry") : statusMsg}
          </div>
        )}

        {/* Stats strip */}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("tt.institutions")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {stats.tankCount}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("tt.totalPubs")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {stats.totalPubs.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("tt.lastDay")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {stats.pubsLastDay}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("tt.lastWeek")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {stats.pubsLastWeek.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("tt.topTopics")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {stats.topicCount}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("tt.autoRefresh")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.lastRefresh > 0
                  ? `${fmtRelative(stats.lastRefresh)} ${t("tt.ago")}`
                  : t("tt.never")}
              </p>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("tt.search")}
            className="h-10 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </div>

        {/* Main layout */}
        <div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="flex flex-col gap-4">
            {/* Tier filter */}
            <div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <Star className="size-3" />
                {t("tt.tier")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
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

            <Separator />

            {/* Cluster filter */}
            <div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <Layers className="size-3" />
                {t("tt.clusterFilter")}
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
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

            <Separator />

            {/* Region filter */}
            <div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <Filter className="size-3" />
                {t("tt.regions")}
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
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
                    <span>{t(REGION_MAP[region] ?? region)}</span>
                    <span
                      className={`size-1.5 rounded-full ${
                        regionFilter === region
                          ? "bg-current opacity-70"
                          : (REGION_COLORS[region] ?? "bg-muted-foreground").split(" ")[0]
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Tank list */}
            <div>
              <p className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-3" />
                  {t("tt.institutions")}
                </span>
                <span className="tabular-nums">{displayTanks.length}</span>
              </p>
              <div className="mt-2 flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto">
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
                          {ts.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Top topics */}
            {topTopics && topTopics.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <TrendingUp className="size-3" />
                  {t("tt.topTopics")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {topTopics.map((item) => (
                    <button
                      key={item.topic}
                      onClick={() => setSearch(item.topic)}
                      className="rounded-full border border-border px-2 py-0.5 text-[10px] transition-colors hover:bg-muted"
                    >
                      {item.topic}{" "}
                      <span className="opacity-50">({item.count})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Publications feed */}
          <div className="flex flex-col gap-3">
            {/* Active filters */}
            {(selectedTank || search || tierFilter || clusterFilter || regionFilter) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {pubs ? pubs.length : "…"} {t("tt.pubs")}
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
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" />
                {t("tt.loading")}
              </div>
            )}

            {/* Empty state */}
            {pubs && pubs.length === 0 && (
              <div className="rounded-md border border-dashed border-border px-4 py-12 text-center">
                <BookOpen className="mx-auto size-8 text-muted-foreground/30" />
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

            {/* Publications list */}
            {pubs?.map((pub) => {
              const tankInfo = tankStats?.[pub.thinkTankSlug];
              return (
                <a
                  key={pub._id}
                  href={pub.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg border border-border/70 bg-card p-4 transition-all hover:border-foreground/30 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium leading-5 group-hover:underline">
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
                        />
                      )}
                    </div>
                    <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/* Tank badge with tier */}
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

                    {/* Website link */}
                    {tankInfo?.website && (
                      <span className="hidden items-center gap-1 text-[10px] text-muted-foreground/70 sm:flex">
                        <ExternalLink className="size-2.5" />
                        {new URL(tankInfo.website).hostname.replace("www.", "")}
                      </span>
                    )}

                    {/* Date */}
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="size-2.5" />
                      {fmtDate(pub.publishedAt, lang === "fa")}
                    </span>

                    {/* Topics */}
                    {pub.topics.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {pub.topics.slice(0, 3).map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                          >
                            {topic}
                          </span>
                        ))}
                        {pub.topics.length > 3 && (
                          <span className="text-[9px] text-muted-foreground/60">
                            +{pub.topics.length - 3}
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
      </main>
    </div>
  );
}
