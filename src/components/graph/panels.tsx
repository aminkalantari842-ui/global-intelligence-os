// Phase 2 shared panels: coverage, in-panel AI, comparison, command palette,
// change feed. All numeric displays come from deterministic Convex queries;
// the AI box is the only LLM surface and is explicitly labeled as synthesis.

import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  actorDisplayName,
  computePosition,
  computeRisk,
  fmtAgo,
  fmtNum,
} from "./metrics";
import { buildIndex } from "./semantic";
import { aiErrorKey } from "@/lib/aiError";
import type { GraphActor, GraphRelation } from "./types";
import {
  ArrowUpRight,
  BellOff,
  Bell,
  CornerDownLeft,
  Newspaper,
  Search,
  Sparkles,
  X,
} from "lucide-react";

// ─── Sparkline (coverage buckets → mini bars) ───────────────────────────────

export function Sparkline({
  buckets,
  height = 26,
}: {
  buckets: number[];
  height?: number;
}) {
  const max = Math.max(1, ...buckets);
  const w = buckets.length * 3;
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="h-[26px] w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      {buckets.map((v, i) => {
        const h = v === 0 ? 1 : Math.max(2, (v / max) * height);
        return (
          <rect
            key={i}
            x={i * 3 + 0.5}
            y={height - h}
            width={2}
            height={h}
            className="fill-foreground"
            opacity={v === 0 ? 0.15 : 0.25 + (v / max) * 0.75}
          />
        );
      })}
    </svg>
  );
}

// ─── Coverage block (per-actor mention analytics) ───────────────────────────

export function CoverageBlock({ actorSlug }: { actorSlug: string }) {
  const { t, lang } = useI18n();
  const coverage = useQuery(api.graph.getActorCoverage, {
    actorSlug,
    days: 30,
  });
  const mentions = useQuery(api.graph.getActorMentionsRecent, {
    actorSlug,
    limit: 5,
  });
  // E2 reverse index: which analysts write about this actor (→ their pages).
  const analysts = useQuery(api.graph.getActorAnalysts, { actorSlug, limit: 5 });

  return (
    <div className="rounded-md border border-border/70 bg-card px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("graph.coverage")}
        </p>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {t("graph.coverage30d")}
        </span>
      </div>
      {coverage === undefined ? (
        <div className="mt-2 h-[26px] animate-pulse rounded bg-muted/50" />
      ) : (
        <>
          <div className="mt-2">
            <Sparkline buckets={coverage.buckets} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="tabular-nums">
              {fmtNum(coverage.total, lang)} {t("tt.pubs")}
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {coverage.tanks.slice(0, 3).map((tk) => (
                <span
                  key={tk.slug}
                  className="rounded-full border border-border px-1.5 py-0.5"
                >
                  {tk.slug}
                </span>
              ))}
            </span>
          </div>
        </>
      )}

      {mentions !== undefined && mentions.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
          {mentions.map((m) => (
            <div key={m._id} className="rounded px-1 py-0.5 hover:bg-muted/60">
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-1.5"
              >
                <Newspaper className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[11px] leading-4 group-hover:underline">
                  {m.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {fmtAgo(m.ts, lang)}
                </span>
              </a>
              {/* Attribution: the analyst who wrote it — links to their page. */}
              {m.author && (
                <p className="ms-4 flex flex-wrap items-center gap-1 text-[9.5px] text-muted-foreground">
                  {m.authorSlug ? (
                    <Link
                      to={`/thinktanks?author=${encodeURIComponent(m.authorSlug)}`}
                      className="font-medium text-foreground/75 underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {m.author}
                    </Link>
                  ) : (
                    <span>{m.author}</span>
                  )}
                  <span className="opacity-50">·</span>
                  <span>{m.tankName}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* E2: who covers this actor most — per-analyst reverse index */}
      {analysts !== undefined && analysts.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("graph.mentionsByAnalyst")}
          </p>
          {analysts.map((a) => {
            const body = (
              <>
                <span className="min-w-0 flex-1 truncate">
                  {a.author}
                  {/* Unbylined pieces are filed under the tank — don't repeat it. */}
                  {a.authorSlug && (
                    <span className="ms-1 text-[9.5px] text-muted-foreground">{a.tankName}</span>
                  )}
                </span>
                <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-sky-500/70"
                    style={{ width: `${Math.min(100, a.count * 12)}%` }}
                  />
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {a.count}
                </span>
              </>
            );
            const cls =
              "flex items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-muted/60";
            return a.authorSlug ? (
              <Link
                key={a.authorSlug}
                to={`/thinktanks?author=${encodeURIComponent(a.authorSlug)}`}
                title={a.sample}
                className={`${cls} hover:underline hover:underline-offset-4`}
              >
                {body}
              </Link>
            ) : (
              <div key={`${a.tankSlug}-${a.author}`} title={a.sample} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── In-panel AI analyst (labeled synthesis, evidence-backed context) ───────

function buildActorContext(
  actor: GraphActor,
  relations: GraphRelation[],
  actorsBySlug: Map<string, GraphActor>,
): string {
  const mine = relations.filter(
    (r) => r.sourceSlug === actor.slug || r.targetSlug === actor.slug,
  );
  const lines = mine.map((r) => {
    const other =
      r.sourceSlug === actor.slug ? r.targetSlug : r.sourceSlug;
    return `- ${actor.name} → ${actorsBySlug.get(other)?.name ?? other}: ${r.kind}, status=${r.status}, confidence=${r.confidence}%, weight=${r.weight}, sources=${r.sourceCount}. Evidence: ${r.summary}`;
  });
  return [
    `Actor: ${actor.name} (${actor.kind}, ${actor.country}, monitoring tier ${actor.tier}).`,
    `Registered relations (${mine.length}):`,
    ...lines,
  ].join("\n");
}

export function AiAnalystBox({
  actor,
  relations,
  actorsBySlug,
}: {
  actor: GraphActor;
  relations: GraphRelation[];
  actorsBySlug: Map<string, GraphActor>;
}) {
  const { t } = useI18n();
  const chat = useAction(api.aiProxy.chat);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await chat({
        messages: [{ role: "user", content: text }],
        graphContext: buildActorContext(actor, relations, actorsBySlug),
      });
      setAnswer(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = aiErrorKey(msg);
      setError(key ? t(key) : t("ai.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border/70 bg-card px-3 py-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("ai.askAbout", { name: actorDisplayName(actor, "en") })}
        </p>
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("ai.placeholder")}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus:border-foreground/40"
        />
        <Button type="submit" size="sm" className="h-8 px-2.5" disabled={busy}>
          <CornerDownLeft className="size-3.5" />
        </Button>
      </form>
      {busy && (
        <div className="mt-2 space-y-1.5">
          <div className="h-2.5 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted/60" />
          <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted/60" />
        </div>
      )}
      {error && (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{error}</p>
      )}
      {answer && !busy && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="whitespace-pre-wrap text-[11px] leading-4 text-foreground/90">
            {answer}
          </p>
          <p className="mt-2 flex items-start gap-1 text-[10px] leading-3.5 text-muted-foreground">
            <Sparkles className="mt-0.5 size-3 shrink-0" />
            {t("ai.disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Actor comparison ───────────────────────────────────────────────────────

function compareStats(actor: GraphActor, relations: GraphRelation[]) {
  const mine = relations.filter(
    (r) => r.sourceSlug === actor.slug || r.targetSlug === actor.slug,
  );
  const meanConf = mine.length
    ? Math.round(mine.reduce((s, r) => s + r.confidence, 0) / mine.length)
    : 0;
  return {
    degree: mine.length,
    meanConf,
    disputed: mine.filter((r) => r.status === "DISPUTED").length,
    position: computePosition(actor, relations),
  };
}

export function ComparePanel({
  a,
  b,
  relations,
  onClose,
  now,
}: {
  a: GraphActor;
  b: GraphActor;
  relations: GraphRelation[];
  onClose: () => void;
  now: number;
}) {
  const { t, lang } = useI18n();
  const sa = compareStats(a, relations);
  const sb = compareStats(b, relations);
  const ra = computeRisk(a, relations, now);
  const rb = computeRisk(b, relations, now);

  const neighborsOf = (slug: string) =>
    new Set(
      relations
        .filter((r) => r.sourceSlug === slug || r.targetSlug === slug)
        .map((r) => (r.sourceSlug === slug ? r.targetSlug : r.sourceSlug)),
    );
  const na = neighborsOf(a.slug);
  const nb = neighborsOf(b.slug);
  const shared = [...na].filter((s) => nb.has(s));

  const rows: Array<[string, string | number, string | number]> = [
    [t("stat.edges"), sa.degree, sb.degree],
    [t("edge.confidence"), `${sa.meanConf}%`, `${sb.meanConf}%`],
    [t("status.DISPUTED"), sa.disputed, sb.disputed],
    [t("graph.riskScore"), ra.risk, rb.risk],
    [t("graph.positionScore"), sa.position, sb.position],
    [t("graph.commonNeighbors"), shared.length, shared.length],
  ];

  return (
    <div className="flex h-full flex-col px-4 py-4">
      <div className="flex items-start justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("graph.compare")}
        </p>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <div className="text-end">
          <p className="truncate text-xs font-semibold">{actorDisplayName(a, lang)}</p>
          <p className="text-[10px] text-muted-foreground">{a.country}</p>
        </div>
        <span className="pt-0.5 text-[10px] text-muted-foreground">vs</span>
        <div>
          <p className="truncate text-xs font-semibold">{actorDisplayName(b, lang)}</p>
          <p className="text-[10px] text-muted-foreground">{b.country}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map(([label, va, vb]) => (
          <div
            key={label}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
          >
            <span className="text-end text-xs tabular-nums font-medium">{va}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <span className="text-xs tabular-nums font-medium">{vb}</span>
          </div>
        ))}
      </div>
      {shared.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("graph.commonNeighbors")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {shared.map((s) => (
              <span
                key={s}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {actorsName(s)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  function actorsName(slug: string) {
    const map = new Map([[a.slug, a], [b.slug, b]]);
    return actorDisplayName(
      (map.get(slug) ?? { name: slug }) as GraphActor,
      lang,
    );
  }
}

// ─── Command palette (⌘K actor jump) ────────────────────────────────────────

export function CommandPalette({
  open,
  onClose,
  actors,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  actors: GraphActor[];
  onPick: (slug: string) => void;
}) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // TF-IDF vector index over actor metadata — deterministic ranking, no LLM.
  const index = useMemo(() => buildIndex(actors), [actors]);

  const results = useMemo(() => {
    const bySlug = new Map(actors.map((a) => [a.slug, a]));
    const query = q.trim();
    if (!query) {
      return actors.slice(0, 8).map((a) => ({ actor: a, label: actorDisplayName(a, lang) }));
    }
    return index
      .search(query, 8)
      .map((r) => bySlug.get(r.slug))
      .filter((a): a is GraphActor => !!a)
      .map((a) => ({ actor: a, label: actorDisplayName(a, lang) }));
  }, [actors, q, lang, index]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center bg-background/60 pt-24 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-96 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && results[idx]) {
                onPick(results[idx].actor.slug);
                onClose();
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder={t("palette.placeholder")}
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t("tt.noResults")}
            </li>
          )}
          {results.map((r, i) => (
            <li key={r.actor.slug}>
              <button
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-start text-xs ${
                  i === idx ? "bg-muted" : "hover:bg-muted/60"
                }`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  onPick(r.actor.slug);
                  onClose();
                }}
              >
                <span className="font-medium">{r.label}</span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {r.actor.country}
                  <ArrowUpRight className="size-3" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Change feed (recent graph mutations) ───────────────────────────────────

const CHANGE_KIND_KEY: Record<string, string> = {
  EDGE_ADDED: "change.edgeAdded",
  EDGE_UPDATED: "change.edgeUpdated",
  EDGE_REMOVED: "change.edgeRemoved",
  ACTOR_ADDED: "change.actorAdded",
};

export function ChangeFeed({
  onSelectActor,
  compact = false,
}: {
  onSelectActor: (slug: string | null) => void;
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const changes = useQuery(api.graph.getRecentChanges, { limit: compact ? 8 : 20 });

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("graph.changeFeed")}
        </p>
        {changes && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {fmtNum(changes.length, lang)}
          </span>
        )}
      </div>
      <div className={`mt-2 ${compact ? "space-y-1" : "space-y-1.5"}`}>
        {changes === undefined &&
          [0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted/50" />
          ))}
        {changes?.length === 0 && (
          <p className="text-[11px] text-muted-foreground">{t("change.empty")}</p>
        )}
        {changes?.map((c) => (
          <button
            key={c._id}
            onClick={() => onSelectActor(c.slug !== "*" ? c.slug : null)}
            className="flex w-full items-start gap-2 rounded-md border border-border/50 px-2 py-1.5 text-start transition-colors hover:bg-muted/60"
          >
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-foreground/60" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] leading-4">{c.detail}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                <span className="rounded-sm bg-muted px-1 py-px">
                  {t(CHANGE_KIND_KEY[c.kind] ?? c.kind)}
                </span>
                {fmtAgo(c.ts, lang)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Group panel (lasso / multi-select analysis) ────────────────────────────

export interface GroupStats {
  count: number;
  internalEdges: number;
  externalEdges: number;
  meanConfidence: number;
  meanWeight: number;
  riskMean: number;
  contestedEdges: number;
}

export function computeGroupStats(
  slugs: Set<string>,
  relations: GraphRelation[],
  now: number,
): GroupStats {
  let internalEdges = 0;
  let externalEdges = 0;
  let confSum = 0;
  let weightSum = 0;
  let contestedEdges = 0;
  for (const r of relations) {
    const sIn = slugs.has(r.sourceSlug);
    const tIn = slugs.has(r.targetSlug);
    if (sIn && tIn) {
      internalEdges++;
      confSum += r.confidence;
      weightSum += r.weight;
      if (r.status === "DISPUTED") contestedEdges++;
    } else if (sIn || tIn) {
      externalEdges++;
    }
  }
  const riskMean =
    slugs.size === 0
      ? 0
      : Math.round(
          [...slugs].reduce(
            (s, slug) => s + computeRisk({ slug } as GraphActor, relations, now).risk,
            0,
          ) / slugs.size,
        );
  return {
    count: slugs.size,
    internalEdges,
    externalEdges,
    meanConfidence: internalEdges ? Math.round(confSum / internalEdges) : 0,
    meanWeight: internalEdges ? Math.round(weightSum / internalEdges) : 0,
    riskMean,
    contestedEdges,
  };
}

export function GroupPanel({
  slugs,
  actorsBySlug,
  relations,
  onClear,
  onFocusOne,
  onWatchAll,
  onClose,
}: {
  slugs: Set<string>;
  actorsBySlug: Map<string, GraphActor>;
  relations: GraphRelation[];
  onClear: () => void;
  onFocusOne: (slug: string) => void;
  onWatchAll: () => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const stats = useMemo(
    () => computeGroupStats(slugs, relations, Date.now()),
    [slugs, relations],
  );

  if (slugs.size === 0) return null;

  const rows: Array<[string, number]> = [
    [t("group.internal"), stats.internalEdges],
    [t("group.external"), stats.externalEdges],
    [t("edge.confidence"), stats.meanConfidence],
    [t("group.meanIntensity"), stats.meanWeight],
    [t("graph.riskScore"), stats.riskMean],
    [t("status.DISPUTED"), stats.contestedEdges],
  ];

  return (
    <div className="absolute bottom-3 start-3 z-20 w-72 rounded-md border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("group.title", { count: fmtNum(slugs.size, lang) })}
        </p>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={onWatchAll}
          >
            <Bell className="me-1 size-3" />
            {t("group.watchAll")}
          </Button>
          <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {[...slugs].map((s) => {
          const a = actorsBySlug.get(s);
          return (
            <button
              key={s}
              onClick={() => onFocusOne(s)}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] transition-colors hover:bg-muted"
            >
              {a ? actorDisplayName(a, lang) : s}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/60 pt-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-muted-foreground">{label}</span>
            <span className="text-[11px] font-medium tabular-nums">
              {fmtNum(value, lang)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] leading-3 text-muted-foreground">
        {t("group.hint")}
      </p>
      <button
        onClick={onClear}
        className="mt-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
      >
        {t("group.clear")}
      </button>
    </div>
  );
}

export function WatchButton({
  slug,
  watching,
  onToggle,
}: {
  slug: string;
  watching: boolean;
  onToggle: (slug: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Button
      variant={watching ? "default" : "ghost"}
      size="icon"
      className="size-7"
      onClick={() => onToggle(slug)}
      title={watching ? t("graph.unwatch") : t("graph.watch")}
      aria-label={watching ? t("graph.unwatch") : t("graph.watch")}
      data-slug={slug}
    >
      {watching ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
    </Button>
  );
}

export type WatchRow = { _id: string; actorSlug: string } & {
  createdAt?: number;
};
