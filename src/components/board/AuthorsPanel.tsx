// A4/B4 — Analyst & program pages + author watchlist.
// Every analyst is a first-class entity built deterministically from stored
// bylines (convex/enrichment.buildAuthors). The panel renders only stored
// rows: no model calls, no invented bios — the "bio" line is a pure function
// of the author's own corpus window.

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  BarChart3,
  Building2,
  Calendar,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Network,
  Search,
  Star,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toFaDigits } from "@/components/graph/metrics";

const LENGTH_BADGE: Record<string, string> = {
  BRIEF: "bg-slate-500/15 text-slate-600",
  ANALYSIS: "bg-sky-500/15 text-sky-600",
  MAJOR_REPORT: "bg-violet-500/15 text-violet-600",
};

const LENGTH_KEY: Record<string, string> = {
  BRIEF: "board.lenBrief",
  ANALYSIS: "board.lenAnalysis",
  MAJOR_REPORT: "board.lenMajor",
};

// Module-scope formatters (kept out of render so the component stays pure).
function fmtDayOf(ts: number, fa: boolean) {
  return new Date(ts).toLocaleDateString(fa ? "fa-IR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtRelOf(ts: number, fa: boolean) {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 60) return fa ? `${toFaDigits(mins)} دقیقه` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return fa ? `${toFaDigits(hrs)} ساعت` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return fa ? `${toFaDigits(days)} روز` : `${days}d`;
}

export function AuthorsPanel({
  onClose,
  onOpenPub,
  initialSlug,
}: {
  onClose: () => void;
  /** Parent hook: switch the page to the board so the reader can mount. */
  onOpenPub?: (pubId: string) => void;
  /** Deep link: open straight on this analyst (from a reader byline). */
  initialSlug?: string;
}) {
  const openPub = (pubId: string) => {
    if (onOpenPub) {
      onOpenPub(pubId);
      return;
    }
    window.dispatchEvent(new CustomEvent("board:open-pub", { detail: pubId }));
    onClose();
  };

  const { t, lang } = useI18n();
  const fa = lang === "fa";
  const num = (v: number) => (fa ? v.toLocaleString("fa-IR") : String(v));

  const [tab, setTab] = useState<"all" | "watch">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(initialSlug ?? null);

  const authors = useQuery(api.enrichment.listAuthors, {
    limit: 80,
    search: search.trim() || undefined,
  });
  const detail = useQuery(
    api.enrichment.getAuthorFeed,
    selected ? { authorSlug: selected, limit: 30 } : "skip",
  );
  const feed = useQuery(api.enrichment.getWatchlistFeed, { limit: 25 });
  // E1: which registered actors this analyst covers (mention-derived).
  const actors = useQuery(
    api.enrichment.getAuthorActors,
    selected ? { authorSlug: selected, limit: 12 } : "skip",
  );
  const toggleWatch = useMutation(api.enrichment.toggleAuthorWatch);
  const buildIndex = useMutation(api.enrichment.buildAuthorIndex);

  // First-open bootstrap: if the index is still empty (no hourly cron yet),
  // run the bounded deterministic build once. Idempotent and write-once.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    if (!authors || authors.length > 0) return;
    bootstrapped.current = true;
    void buildIndex({}).catch(() => {});
  }, [authors, buildIndex]);

  const fmtDay = (ts: number) => fmtDayOf(ts, fa);
  const fmtRel = (ts: number) => fmtRelOf(ts, fa);

  const spanDays = useMemo(() => {
    const s = detail?.stats;
    if (!s || !s.firstPubAt || !s.lastPubAt) return 0;
    return Math.max(0, Math.round((s.lastPubAt - s.firstPubAt) / 86_400_000));
  }, [detail]);

  const watchCount = feed?.authors.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      dir={fa ? "rtl" : "ltr"}
    >
      <div
        className="tt-glass flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg border border-border/80 bg-muted/50">
              <Users className="size-3.5 text-muted-foreground" />
            </span>
            <div>
              <p className="tt-kicker">{t("authors.kicker")}</p>
              <h2 className="text-sm font-semibold tracking-tight">{t("authors.title")}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-border/80 bg-card/60 p-1">
              {(["all", "watch"] as const).map((x) => (
                <button
                  key={x}
                  onClick={() => setTab(x)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-semibold transition-all ${
                    tab === x ? "bg-foreground text-background shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {x === "all" ? <UserRound className="size-3" /> : <Star className="size-3" />}
                  {t(x === "all" ? "authors.tab.all" : "authors.tab.watch")}
                  {x === "watch" && watchCount > 0 && (
                    <span className="tabular-nums opacity-70">{num(watchCount)}</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {tab === "all" ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[330px_1fr]">
            {/* Analyst index */}
            <div className="flex min-h-0 flex-col border-b border-border/70 md:border-b-0 md:border-e">
              <div className="relative shrink-0 px-3 py-2.5">
                <Search className="absolute start-5 top-4 size-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("authors.search")}
                  className="h-8 w-full rounded-lg border border-border bg-card ps-8 pe-2 text-[11.5px] outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {authors === undefined && (
                  <div className="space-y-1.5 p-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="tt-shimmer h-11 rounded-lg" />
                    ))}
                  </div>
                )}
                {authors?.length === 0 && (
                  <p className="px-2 py-6 text-[11px] leading-5 text-muted-foreground">
                    {search ? t("authors.noResults") : t("authors.empty")}
                  </p>
                )}
                {authors?.map((a) => (
                  <div
                    key={a.slug}
                    className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                      selected === a.slug ? "bg-muted/70" : "hover:bg-muted/50"
                    }`}
                  >
                    <button onClick={() => setSelected(a.slug)} className="min-w-0 flex-1 text-start">
                      <p className="truncate text-[12px] font-medium leading-5">{a.name}</p>
                      <p className="flex items-center gap-1.5 truncate text-[9.5px] text-muted-foreground">
                        <Building2 className="size-2.5 shrink-0" />
                        {a.tankName}
                        <span className="tabular-nums opacity-70">· {num(a.pubCount)}</span>
                      </p>
                    </button>
                    <button
                      onClick={() => void toggleWatch({ authorSlug: a.slug })}
                      title={a.watching ? t("authors.unwatch") : t("authors.watch")}
                      className={`shrink-0 rounded-md p-1 transition-colors ${
                        a.watching
                          ? "text-amber-500 hover:bg-amber-500/10"
                          : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-amber-500"
                      }`}
                    >
                      <Star className={`size-3.5 ${a.watching ? "fill-amber-500" : ""}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Author page */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {!selected && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <UserRound className="size-8 text-muted-foreground/30" />
                  <p className="text-[11.5px] text-muted-foreground">{t("authors.select")}</p>
                </div>
              )}
              {selected && detail === undefined && (
                <div className="flex items-center gap-2 py-6 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> …
                </div>
              )}
              {selected && detail === null && (
                <p className="py-6 text-[11px] text-muted-foreground">{t("authors.empty")}</p>
              )}
              {detail && (
                <div className="tt-rise space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold tracking-tight">{detail.author.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Building2 className="size-3" />
                        {detail.author.tankName}
                        <span className="opacity-60">·</span>
                        {t("authors.stat.last")}{" "}
                        {detail.stats.lastPubAt ? fmtDay(detail.stats.lastPubAt) : "—"}
                      </p>
                      <p className="mt-2 max-w-2xl text-[11.5px] leading-6 text-muted-foreground">
                        {t("authors.bio", {
                          name: detail.author.name,
                          tank: detail.author.tankName,
                          count: num(detail.stats.count),
                          first: detail.stats.firstPubAt ? fmtDay(detail.stats.firstPubAt) : "—",
                          last: detail.stats.lastPubAt ? fmtDay(detail.stats.lastPubAt) : "—",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => void toggleWatch({ authorSlug: detail.author.slug })}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                        detail.watching
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-600"
                          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                      }`}
                    >
                      <Star className={`size-3.5 ${detail.watching ? "fill-amber-500" : ""}`} />
                      {detail.watching ? t("authors.unwatch") : t("authors.watch")}
                    </button>
                  </div>

                  {/* Deterministic stat tiles */}
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 sm:grid-cols-4">
                    {[
                      { label: t("authors.stat.pubs"), value: num(detail.stats.count), icon: FileText },
                      { label: t("authors.stat.span"), value: num(spanDays), icon: Calendar },
                      { label: t("authors.stat.reports"), value: num(detail.stats.classes.MAJOR_REPORT), icon: BarChart3 },
                      { label: t("authors.stat.analysis"), value: num(detail.stats.classes.ANALYSIS), icon: Layers },
                    ].map((s) => (
                      <div key={s.label} className="bg-card/55 px-3 py-2">
                        <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                          <s.icon className="size-2.5" /> {s.label}
                        </p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* E1: actor coverage — jumps into the graph console focused */}
                  {actors && actors.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="tt-kicker">{t("authors.actors")}</p>
                        <span className="text-[9px] text-muted-foreground">{t("authors.actorsHint")}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {actors.map((a) => (
                          <Link
                            key={a.slug}
                            to={`/dashboard?focus=${encodeURIComponent(a.slug)}`}
                            title={`${t("authors.openInGraph")} · ${a.kind}`}
                            className="group flex items-center gap-1 rounded-full border border-sky-500/35 bg-sky-500/5 px-2 py-0.5 text-[10px] font-medium text-sky-700 transition-colors hover:border-sky-500/70 hover:bg-sky-500/15 dark:text-sky-400"
                          >
                            <Network className="size-2.5 shrink-0" />
                            {lang === "en" ? a.nameEn ?? a.name : a.name}
                            <span className="tabular-nums opacity-60">{num(a.count)}</span>
                            <span className="opacity-0 transition-opacity group-hover:opacity-70">↗</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.stats.programs.length > 0 && (
                    <div>
                      <p className="tt-kicker">{t("authors.programs")}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {detail.stats.programs.map((p) => (
                          <span
                            key={p.name}
                            className="rounded-full border border-border/80 bg-card/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {p.name} <span className="tabular-nums opacity-60">{num(p.count)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="tt-kicker">{t("authors.feed")}</p>
                    <div className="mt-1.5 space-y-1.5">
                      {detail.pubs.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">{t("authors.empty")}</p>
                      )}
                      {detail.pubs.map((p) => (
                        <div
                          key={p._id}
                          className="group flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card/50 px-3 py-2 transition-colors hover:border-foreground/25"
                        >
                          <button
                            onClick={() => openPub(p._id)}
                            className="min-w-0 flex-1 text-start"
                          >
                            <p className="text-[12px] font-medium leading-5 group-hover:underline group-hover:underline-offset-4">
                              {p.title}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[9.5px] text-muted-foreground">
                              <span className="tabular-nums">{fmtDay(p.publishedAt)}</span>
                              {p.program && <span className="rounded-sm bg-muted px-1">{p.program}</span>}
                              {p.lengthClass && (
                                <span className={`rounded-sm px-1 font-bold uppercase ${LENGTH_BADGE[p.lengthClass] ?? ""}`}>
                                  {t(LENGTH_KEY[p.lengthClass])}
                                </span>
                              )}
                              {p.autoTags?.slice(0, 3).map((tag) => (
                                <span key={tag} className="rounded-full border border-border/70 px-1">
                                  {tag}
                                </span>
                              ))}
                            </p>
                          </button>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="hidden text-[9px] tabular-nums text-muted-foreground/70 sm:inline">
                              {fmtRel(p.publishedAt)}
                            </span>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                              title={t("authors.openSource")}
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Personal column: new pieces from followed analysts ── */
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {feed === undefined && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> …
              </div>
            )}
            {feed && feed.authors.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Star className="size-8 text-muted-foreground/30" />
                <p className="text-[11.5px] text-muted-foreground">{t("authors.watchEmpty")}</p>
                <button
                  onClick={() => setTab("all")}
                  className="rounded-full border border-border px-3 py-1 text-[11px] transition-colors hover:border-foreground/30 hover:bg-muted"
                >
                  {t("authors.browse")}
                </button>
              </div>
            )}
            {feed && feed.authors.length > 0 && (
              <div className="tt-rise space-y-3">
                <div>
                  <p className="tt-kicker">{t("authors.following")}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {feed.authors.map((a) => (
                      <span
                        key={a.slug}
                        className="flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-2 py-0.5 text-[10.5px]"
                      >
                        <button
                          onClick={() => {
                            setSelected(a.slug);
                            setTab("all");
                          }}
                          className="transition-colors hover:text-foreground"
                        >
                          {a.name}
                        </button>
                        <span className="text-[9px] text-muted-foreground">{a.tankName}</span>
                        <button
                          onClick={() => void toggleWatch({ authorSlug: a.slug })}
                          className="text-amber-500 transition-colors hover:text-amber-600"
                          title={t("authors.unwatch")}
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="tt-kicker">{t("authors.watchFeed")}</p>
                  <div className="mt-1.5 space-y-1.5">
                    {feed.items.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">{t("authors.watchEmpty")}</p>
                    )}
                    {feed.items.map((it) => (
                      <button
                        key={it._id}
                        onClick={() => openPub(it._id)}
                        className="group block w-full rounded-lg border border-border/70 bg-card/50 px-3 py-2 text-start transition-colors hover:border-foreground/25"
                      >
                        <p className="text-[12px] font-medium leading-5 group-hover:underline group-hover:underline-offset-4">
                          {it.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[9.5px] text-muted-foreground">
                          <span className="font-medium text-foreground/80">{it.authorName}</span>
                          <span>{feed.authors.find((x) => x.slug === it.authorSlug)?.tankName ?? it.thinkTankSlug}</span>
                          {it.topicFa && <span className="rounded-sm bg-muted px-1">{it.topicFa}</span>}
                          {it.lengthClass && (
                            <span className={`rounded-sm px-1 font-bold uppercase ${LENGTH_BADGE[it.lengthClass] ?? ""}`}>
                              {t(LENGTH_KEY[it.lengthClass])}
                            </span>
                          )}
                          <span className="tabular-nums">{fmtDay(it.publishedAt)}</span>
                          <span className="tabular-nums opacity-70">· {fmtRel(it.publishedAt)}</span>
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
