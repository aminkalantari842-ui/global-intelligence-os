import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/context";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ActorGraph from "@/components/graph/ActorGraph";
import type { EdgeMarker } from "@/components/graph/ActorGraph";
import type { GraphActor, GraphRelation } from "@/components/graph/types";
import {
  computePosition,
  computeRisk,
  fmtAgo,
  fmtNum,
  topByPosition,
  topByRisk,
  type ActorScoreRow,
} from "@/components/graph/metrics";
import { dynamicsFromMarkers, computeCentrality, detectBlocks } from "@/components/graph/network";
import MatrixView from "@/components/graph/MatrixView";
import {
  AiAnalystBox,
  ChangeFeed,
  CommandPalette,
  ComparePanel,
  CoverageBlock,
  GroupPanel,
  WatchButton,
} from "@/components/graph/panels";
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Camera,
  CircleDot,
  Crosshair,
  Download,
  FileJson,
  Globe2,
  Grid3X3,
  GitCompareArrows,
  HelpCircle,
  Lasso,
  Layers,
  LogOut,
  Maximize2,
  Minus,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  ALLIANCE: "rel.ALLIANCE",
  COOPERATION: "rel.COOPERATION",
  NEGOTIATION: "rel.NEGOTIATION",
  SUPPLY: "rel.SUPPLY",
  PROXY_SUPPORT: "rel.PROXY_SUPPORT",
  COMPETITION: "rel.COMPETITION",
  TENSION: "rel.TENSION",
  SANCTIONS: "rel.SANCTIONS",
  CONFLICT: "rel.CONFLICT",
};

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "status.CONFIRMED",
  REPORTED: "status.REPORTED",
  DISPUTED: "status.DISPUTED",
};

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("fa-IR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const SHORTCUTS: Array<[string, string]> = [
  ["F", "graph.fitAll"],
  ["E", "graph.exportPng"],
  ["⌘K", "palette.open"],
  ["+/−", "graph.zoomInOut"],
  ["0", "graph.resetView"],
  ["Esc", "graph.clearSel"],
  ["?", "graph.showHelp"],
];

function ScoreRow({
  row,
  rank,
  onSelect,
}: {
  row: ActorScoreRow;
  rank: number;
  onSelect: (slug: string) => void;
}) {
  const { lang } = useI18n();
  return (
    <button
      onClick={() => onSelect(row.slug)}
      className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted"
    >
      <span className="w-4 shrink-0 tabular-nums text-[10px] text-muted-foreground">
        {fmtNum(rank, lang)}
      </span>
      <span className="min-w-0 flex-1 truncate text-start group-hover:underline">{row.name}</span>
      <span className="inline-block h-1 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-foreground/70"
          style={{ width: `${Math.min(100, Math.max(4, row.value))}%` }}
        />
      </span>
      <span className="w-7 shrink-0 text-end tabular-nums text-[11px] font-medium">
        {fmtNum(row.value, lang)}
      </span>
    </button>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-md border border-border bg-card p-4 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">{t("graph.shortcuts")}</p>
          <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
        <ul className="mt-3 space-y-1.5">
          {SHORTCUTS.map(([key, labelKey]) => (
            <li key={key} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">{t(labelKey)}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-border pt-2">
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            <li>{t("conf.solidEdge")} — {t("conf.solidEdgeDesc")}</li>
            <li>{t("conf.dashedEdge")} — {t("conf.dashedEdgeDesc")}</li>
            <li>{t("conf.fineDashed")} — {t("conf.fineDashedDesc")}</li>
            <li>{t("conf.outerRing")} — {t("conf.outerRingDesc")}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-full max-w-28 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums leading-none">{value}</span>
    </div>
  );
}

function EventSourceRow({
  source,
}: {
  source: { publication: string; title: string; url: string; date: string; stance: string };
}) {
  const stanceColor =
    source.stance === "CORROBORATING"
      ? "border-foreground/60 text-foreground"
      : source.stance === "SKEPTICAL"
        ? "border-border text-muted-foreground"
        : "border-border text-muted-foreground/80";
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium leading-5 group-hover:underline">
          {source.title}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {source.publication} · {source.date}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${stanceColor}`}
      >
        {source.stance === "CORROBORATING"
          ? "Corrob"
          : source.stance === "SKEPTICAL"
            ? "Skept"
            : "Report"}
      </span>
    </a>
  );
}

function EdgePanel({
  relation,
  actorsBySlug,
  onClose,
}: {
  relation: GraphRelation;
  actorsBySlug: Map<string, GraphActor>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const events = useQuery(api.graph.getRelationEvents, {
    relationId: relation._id as Id<"relationships">,
  });

  const source = actorsBySlug.get(relation.sourceSlug);
  const target = actorsBySlug.get(relation.targetSlug);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t(KIND_LABEL[relation.kind] ?? relation.kind)} · {t(STATUS_LABEL[relation.status] ?? relation.status)}
          </p>
          <h3 className="mt-1 text-sm font-semibold leading-5">
            {source?.name ?? relation.sourceSlug}
            <span className="mx-1.5 text-muted-foreground">↔</span>
            {target?.name ?? relation.targetSlug}
          </h3>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClose}>
          <ArrowLeft className="size-4" />
        </Button>
      </div>

      <div className="px-4 pt-3">
        <p className="text-xs leading-5 text-muted-foreground">{relation.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pt-4 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("edge.confidence")}</p>
          <div className="mt-1">
            <ConfidenceBar value={relation.confidence} />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("edge.intensity")}</p>
          <div className="mt-1">
            <ConfidenceBar value={relation.weight} />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("edge.sources")}</p>
          <p className="mt-0.5 font-medium tabular-nums">{relation.sourceCount} {t("edge.independent")}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("edge.since")}</p>
          <p className="mt-0.5 font-medium">{fmtDate(relation.since)}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <AnalystNotes targetType="EDGE" targetId={relation._id} />

      <Separator className="my-4" />

      <div className="flex items-center justify-between px-4 pb-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("edge.evidenceTrail")}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {events === undefined ? "…" : `${events.length} ${t("edge.events")}`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {events === undefined && (
          <div className="space-y-2 px-2">
            <div className="h-12 animate-pulse rounded-md bg-muted/60" />
            <div className="h-12 animate-pulse rounded-md bg-muted/60" />
          </div>
        )}
        {events?.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">
            {t("dash.empty")}
          </p>
        )}
        <ol className="relative space-y-3 px-2">
          {events?.map((e) => (
            <li key={e._id} className="relative rounded-md border border-border/70 bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {new Date(e.timestamp).toLocaleDateString("fa-IR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}{""}
                  · {e.type.toLowerCase()}
                </p>
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                  {t(`claim.${e.claimType}`) ?? e.claimType.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1.5 text-xs font-medium leading-5">{e.title}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{e.summary}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{t("edge.confidence")}</span>
                <ConfidenceBar value={e.confidence} />
              </div>
              <div className="mt-2 border-t border-border/60 pt-1">
                {e.sources.map((s, i) => (
                  <EventSourceRow key={i} source={s} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * §9.2 Analyst notes on the selected actor or edge. Every note is
 * provenance-stamped (author + timestamp) and stored server-side; notes
 * never alter scores or statuses — they sit beside the evidence.
 */
function AnalystNotes({
  targetType,
  targetId,
}: {
  targetType: "ACTOR" | "EDGE" | "EVENT";
  targetId: string;
}) {
  const { t, lang } = useI18n();
  const notes = useQuery(api.workspace.listNotes, { targetType, targetId });
  const addNote = useMutation(api.workspace.addNote);
  const deleteNote = useMutation(api.workspace.deleteNote);
  const [draft, setDraft] = useState("");

  return (
    <div className="px-4 pt-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("notes.title")}
      </p>
      <div className="mt-1.5 space-y-1">
        {notes === undefined && <div className="h-6 animate-pulse rounded bg-muted/50" />}
        {notes?.length === 0 && (
          <p className="text-[10px] leading-4 text-muted-foreground">{t("notes.empty")}</p>
        )}
        {notes?.map((n) => (
          <div key={n._id} className="rounded-md border border-border/60 px-2 py-1.5">
            <p className="text-[11px] leading-4">{n.body}</p>
            <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground">
              <span>
                {n.authorName} · {fmtAgo(n.ts, lang)}
              </span>
              <button
                className="hover:text-foreground"
                onClick={() => void deleteNote({ id: n._id })}
                aria-label={t("btn.delete")}
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              void addNote({ targetType, targetId, body: draft });
              setDraft("");
            }
          }}
          placeholder={t("notes.placeholder")}
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-[11px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[10px]"
          disabled={!draft.trim()}
          onClick={() => {
            void addNote({ targetType, targetId, body: draft });
            setDraft("");
          }}
        >
          <NotebookPen className="size-3" />
        </Button>
      </div>
    </div>
  );
}

/** Per-actor change history (from the append-only change log). */
function PerActorChanges({ slug }: { slug: string }) {
  const { t, lang } = useI18n();
  const changes = useQuery(api.graph.getActorChanges, { slug, limit: 6 });
  return (
    <div className="px-4 pb-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("graph.actorHistory")}
      </p>
      <div className="mt-2 space-y-1">
        {changes === undefined && (
          <div className="h-8 animate-pulse rounded-md bg-muted/50" />
        )}
        {changes?.length === 0 && (
          <p className="text-[11px] text-muted-foreground">{t("change.empty")}</p>
        )}
        {changes?.map((c) => (
          <div
            key={c._id}
            className="flex items-start gap-2 rounded-md border border-border/50 px-2 py-1.5"
          >
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-foreground/60" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] leading-4">{c.detail}</span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {fmtAgo(c.ts, lang)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActorPanel({
  actor,
  relations,
  actorsBySlug,
  onOpenEdge,
  onClear,
  onFlyTo,
  now,
  watching,
  onToggleWatch,
  onCompare,
  newChanges,
}: {
  actor: GraphActor;
  relations: GraphRelation[];
  actorsBySlug: Map<string, GraphActor>;
  onOpenEdge: (r: GraphRelation) => void;
  onClear: () => void;
  onFlyTo: () => void;
  now: number;
  watching: boolean;
  onToggleWatch: (slug: string) => void;
  onCompare: () => void;
  newChanges: number;
}) {
  const { t, lang } = useI18n();
  const connected = relations.filter(
    (r) => r.sourceSlug === actor.slug || r.targetSlug === actor.slug,
  );
  const meanConfidence = connected.length
    ? Math.round(
        connected.reduce((s, r) => s + r.confidence, 0) / connected.length,
      )
    : 0;
  const risk = computeRisk(actor, relations, now);
  const position = computePosition(actor, relations);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t(`kind.${actor.kind}`) ?? actor.kind.replace("_", " ")} · {t("edge.since")} {actor.tier}
          </p>
          <h3 className="mt-1 text-sm font-semibold leading-5">{actor.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{actor.country} · {actor.region}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <WatchButton slug={actor.slug} watching={watching} onToggle={onToggleWatch} />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onCompare}
            title={t("graph.compare")}
          >
            <GitCompareArrows className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onFlyTo}
            title={t("graph.flyTo")}
          >
            <Crosshair className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClear}>
            <ArrowLeft className="size-4" />
          </Button>
        </div>
      </div>

      {newChanges > 0 && (
        <p className="mx-4 mt-3 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {t("graph.newChanges", { count: fmtNum(newChanges, lang) })}
        </p>
      )}

      <div className="px-4 pt-3">
        <p className="text-xs leading-5 text-muted-foreground">{actor.description}</p>
      </div>

      <div className="flex flex-wrap gap-1 px-4 pt-3">
        {actor.aliases.slice(0, 6).map((a) => (
          <span
            key={a}
            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            {a}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 px-4 pt-4">
        <Stat label={t("stat.edges")} value={fmtNum(connected.length, lang)} />
        <Stat label={t("edge.confidence")} value={`${fmtNum(meanConfidence, lang)}%`} />
        <Stat label={t("edge.sources")} value={actor.sourceCount >= 1000 ? `${(actor.sourceCount / 1000).toFixed(1)}k` : fmtNum(actor.sourceCount, lang)} />
      </div>

      <div className="space-y-2.5 px-4 pt-4">
        <div>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{t("graph.riskScore")}</span>
            <span className="tabular-nums">{fmtNum(risk.risk, lang)}/{fmtNum(100, lang)}</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${risk.risk}%` }} />
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
            {(
              [
                ["graph.risk.tension", risk.tension],
                ["graph.risk.contested", risk.contested],
                ["graph.risk.recency", risk.recency],
              ] as Array<[string, number]>
            ).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-1">
                <span className="truncate">{t(k)}</span>
                <span className="tabular-nums">{fmtNum(v, lang)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{t("graph.positionScore")}</span>
            <span className="tabular-nums">{fmtNum(position, lang)}</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/70"
              style={{ width: `${Math.min(100, position)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2.5 px-4 pt-4">
        <CoverageBlock actorSlug={actor.slug} />
        <AiAnalystBox actor={actor} relations={relations} actorsBySlug={actorsBySlug} />
      </div>

      <Separator className="my-4" />

      <AnalystNotes targetType="ACTOR" targetId={actor.slug} />

      <Separator className="my-4" />

      <PerActorChanges slug={actor.slug} />

      <p className="px-4 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t("nav.graph")} ({connected.length})
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {connected.map((r) => {
          const otherSlug = r.sourceSlug === actor.slug ? r.targetSlug : r.sourceSlug;
          const other = actorsBySlug.get(otherSlug);
          return (
            <button
              key={r._id}
              onClick={() => onOpenEdge(r)}
              className="mb-2 w-full rounded-md border border-border/70 bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/30 hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{other?.name ?? otherSlug}</span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {t(KIND_LABEL[r.kind] ?? r.kind) ?? r.kind}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <ConfidenceBar value={r.confidence} />
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {t(STATUS_LABEL[r.status] ?? r.status) ?? r.status}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/80">
                  Δ{fmtAgo(r.updatedAt, lang)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Trigger a client-side file download (deterministic export payload). */
function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const graph = useQuery(api.graph.getGraph);
  const stats = useQuery(api.graph.getStats);
  const markerData = useQuery(api.graph.getEventMarkers);
  const seed = useMutation(api.graph.seedIfEmpty);

  // ── Phase 2 data ──
  const watchlist = useQuery(api.graph.getWatchlist);
  const toggleWatch = useMutation(api.graph.toggleWatch);
  const lastSeen = useQuery(api.graph.getViewState, { key: "lastSeen" });
  const setViewState = useMutation(api.graph.setViewState);
  const changesSince = useQuery(api.graph.getChangesSince, {
    since: lastSeen ?? 0,
  });

  // Idempotent first-boot seeding, kept out of the render pass.
  const needsSeed = graph !== undefined && graph.actors.length === 0;
  useEffect(() => {
    if (needsSeed) void seed();
  }, [needsSeed, seed]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphRelation | null>(null);
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [focusMode, setFocusMode] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  // ── Phase 2 state ──
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"jump" | "compare">("jump");
  const [compareSlug, setCompareSlug] = useState<string | null>(null);
  const [markerWindowDays, setMarkerWindowDays] = useState(14);
  const [hullBy, setHullBy] = useState<"region" | "country" | "kind" | null>(null);
  // ── Phase 3 state ──
  const [layout, setLayout] = useState<"force" | "geo">("force");
  const [bundling, setBundling] = useState(false);
  const [lassoEnabled, setLassoEnabled] = useState(false);
  const [lassoSlugs, setLassoSlugs] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [playbackTs, setPlaybackTs] = useState<number | null>(null);
  const [playSpeed, setPlaySpeed] = useState(1);
  // ── §3.3/§4.4/§9 state ──
  const [egoDepth, setEgoDepth] = useState<0 | 1 | 2 | 3 | null>(null);
  const [highlightNew, setHighlightNew] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewDraft, setViewDraft] = useState("");
  const saveView = useMutation(api.workspace.saveView);
  const deleteView = useMutation(api.workspace.deleteView);
  const evaluateAlerts = useMutation(api.alerts.evaluate);
  const ackAlert = useMutation(api.alerts.acknowledge);
  const alerts = useQuery(api.alerts.listAlerts, { limit: 40 });
  const savedViews = useQuery(api.workspace.listViews, {});

  const graphRef = useRef<HTMLDivElement & {
    __zoomBy?: (f: number) => void;
    __reset?: () => void;
    __fitAll?: () => void;
    __flyTo?: (slug: string) => void;
    __exportPng?: () => void;
  } | null>(null);

  const markersMap = useMemo(() => {
    const m: Record<string, EdgeMarker> = {};
    (markerData?.markers ?? []).forEach((mk) => {
      m[mk.relationId] = {
        latestTs: mk.latestTs,
        count14d: mk.count14d,
        total: mk.total,
        series: mk.series,
      };
    });
    return m;
  }, [markerData]);

  const now = useMemo(() => Date.now(), []);

  // §3.2 trajectory per edge — computed deterministically from marker series.
  const dynamicsMap = useMemo(() => dynamicsFromMarkers(markersMap, now), [markersMap, now]);

  // §3.3 network metrics — Brandes centrality + polarity blocks, recomputed
  // only when the graph changes (O(V·E), fine at this scale).
  const centrality = useMemo(
    () => computeCentrality(graph?.actors ?? [], graph?.relations ?? []),
    [graph?.actors, graph?.relations],
  );
  const blocks = useMemo(
    () => detectBlocks(graph?.actors ?? [], graph?.relations ?? []),
    [graph?.actors, graph?.relations],
  );

  // Export helpers — deterministic serialization of the current filtered view.
  const exportJson = () => {
    const data = {
      generatedAt: new Date().toISOString(),
      actors: graph?.actors ?? [],
      relations: filteredRelations,
    };
    downloadFile(`world-monitor-graph-${Date.now()}.json`, JSON.stringify(data, null, 2), "application/json");
  };
  const exportCsv = () => {
    const rows = [
      ["source", "target", "kind", "weight", "confidence", "status", "since", "updatedAt", "sources"],
      ...filteredRelations.map((r) => [
        r.sourceSlug,
        r.targetSlug,
        r.kind,
        String(r.weight),
        String(r.confidence),
        r.status,
        new Date(r.since).toISOString(),
        new Date(r.updatedAt).toISOString(),
        String(r.sourceCount),
      ]),
    ];
    const csv = rows.map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    downloadFile(`world-monitor-edges-${Date.now()}.csv`, csv, "text/csv");
  };
  const exportGraphml = () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const nodes = (graph?.actors ?? [])
      .map(
        (a) =>
          `    <node id="${esc(a.slug)}"><data key="label">${esc(a.name)}</data><data key="kind">${a.kind}</data><data key="country">${esc(a.country)}</data><data key="region">${esc(a.region)}</data><data key="tier">${a.tier}</data></node>`,
      )
      .join("\n");
    const edges = filteredRelations
      .map(
        (r, i) =>
          `    <edge id="e${i}" source="${esc(r.sourceSlug)}" target="${esc(r.targetSlug)}"><data key="kind">${r.kind}</data><data key="weight">${r.weight}</data><data key="confidence">${r.confidence}</data><data key="status">${r.status}</data></edge>`,
      )
      .join("\n");
    const gml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="kind" for="node" attr.name="kind" attr.type="string"/>
  <key id="country" for="node" attr.name="country" attr.type="string"/>
  <key id="region" for="node" attr.name="region" attr.type="string"/>
  <key id="tier" for="node" attr.name="tier" attr.type="int"/>
  <key id="ekind" for="edge" attr.name="kind" attr.type="string"/>
  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>
  <key id="confidence" for="edge" attr.name="confidence" attr.type="double"/>
  <key id="status" for="edge" attr.name="status" attr.type="string"/>
  <graph id="G" edgedefault="undirected">
${nodes}
${edges}
  </graph>
</graphml>`;
    downloadFile(`world-monitor-${Date.now()}.graphml`, gml, "application/xml");
  };
  const applyView = (v: { filters: string; timeSlice?: number }) => {
    try {
      const f = JSON.parse(v.filters) as {
        kinds?: string[];
        search?: string;
        focus?: boolean;
        hull?: "region" | "country" | "kind" | null;
      };
      setKindFilter(new Set(f.kinds ?? []));
      setSearch(f.search ?? "");
      setFocusMode(f.focus ?? true);
      setHullBy(f.hull ?? null);
      if (v.timeSlice) {
        setPlaybackTs(v.timeSlice);
      } else {
        setPlaybackTs(null);
      }
      setViewsOpen(false);
    } catch {
      /* corrupt view — ignore */
    }
  };
  const topRisk = useMemo(
    () => topByRisk(graph?.actors ?? [], graph?.relations ?? [], lang, now),
    [graph?.actors, graph?.relations, lang, now],
  );
  const topPosition = useMemo(
    () => topByPosition(graph?.actors ?? [], graph?.relations ?? [], lang),
    [graph?.actors, graph?.relations, lang],
  );

  const actorsBySlug = useMemo(
    () => new Map((graph?.actors ?? []).map((a) => [a.slug, a])),
    [graph?.actors],
  );

  const selectedActor = selectedSlug ? actorsBySlug.get(selectedSlug) : undefined;
  const comparingTo = compareSlug ? actorsBySlug.get(compareSlug) : undefined;

  // ── Phase 3: temporal playback range + animation loop ──
  const sinceRange = useMemo(() => {
    const times = (graph?.relations ?? []).map((r) => r.since).filter((t) => t > 0);
    if (times.length === 0) return null;
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [graph?.relations]);

  useEffect(() => {
    if (!playing || !sinceRange) return;
    let raf = 0;
    let last = performance.now();
    let lastPush = 0;
    let ts = playbackTs ?? sinceRange.min;
    const span = sinceRange.max - sinceRange.min;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      ts += dt * playSpeed * (span / 60_000); // full sweep ≈ 60s at 1×
      if (ts >= sinceRange.max) {
        setPlaybackTs(sinceRange.max);
        setPlaying(false);
        return;
      }
      // Push at ~12fps — the graph rebuilds on edge-set changes only.
      if (t - lastPush > 80) {
        lastPush = t;
        setPlaybackTs(ts);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sinceRange, playSpeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Day-quantized playback value for the canvas: rebuilds only fire when the
  // visible edge set can actually change, not on every animation frame.
  const graphPlaybackTs = useMemo(
    () =>
      playbackTs === null
        ? null
        : Math.round(playbackTs / 86_400_000) * 86_400_000,
    [playbackTs],
  );

  // ── Phase 2 derived data ──
  const watchingSet = useMemo(
    () => new Set((watchlist ?? []).map((w) => w.actorSlug)),
    [watchlist],
  );

  // Coverage buckets feed the canvas heat halos — fetched only for watched
  // and selected actors to keep the reactive subscription bounded.
  const coverageQueryEnabled = watchingSet.size > 0 || !!selectedSlug;
  const coverageRows = useQuery(
    api.graph.getWatchlistCoverage,
    coverageQueryEnabled
      ? {
          slugs: [
            ...watchingSet,
            ...(selectedSlug ? [selectedSlug] : []),
          ],
        }
      : "skip",
  );
  const coverageMap = useMemo(() => {
    const m: Record<string, number[]> = {};
    (coverageRows ?? []).forEach((row) => {
      m[row.actorSlug] = row.buckets;
    });
    return m;
  }, [coverageRows]);

  const handleToggleWatch = (slug: string) => {
    void toggleWatch({ actorSlug: slug });
  };

  // Mark changes as seen after 30s on the dashboard so "new changes" badges
  // reflect genuine unseen activity, not permanent history.
  const unseenCount = changesSince?.count ?? 0;
  useEffect(() => {
    if (lastSeen === undefined || unseenCount === 0) return;
    const id = setTimeout(() => {
      void setViewState({ key: "lastSeen", value: Date.now() });
    }, 30_000);
    return () => clearTimeout(id);
  }, [lastSeen, unseenCount, setViewState]);

  const filteredRelations = useMemo(() => {
    const rels = graph?.relations ?? [];
    if (!search.trim()) return rels;
    const q = search.trim().toLowerCase();
    return rels.filter((r) => {
      const s = actorsBySlug.get(r.sourceSlug);
      const tgt = actorsBySlug.get(r.targetSlug);
      return (
        s?.name.toLowerCase().includes(q) ||
        tgt?.name.toLowerCase().includes(q) ||
        s?.aliases.some((a) => a.toLowerCase().includes(q)) ||
        tgt?.aliases.some((a) => a.toLowerCase().includes(q)) ||
        (t(KIND_LABEL[r.kind] ?? r.kind) ?? r.kind).toLowerCase().includes(q)
      );
    });
  }, [graph?.relations, search, actorsBySlug, t]);

  const highlightSlug = useMemo(() => {
    if (selectedSlug) return selectedSlug;
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    const match = (graph?.actors ?? []).find(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.aliases.some((al) => al.toLowerCase().includes(q)),
    );
    return match?.slug ?? null;
  }, [search, graph?.actors, selectedSlug]);

  const allKinds = useMemo(() => {
    const set = new Set<string>();
    (graph?.relations ?? []).forEach((r) => set.add(r.kind));
    return Array.from(set).sort();
  }, [graph?.relations]);

  const toggleKind = (k: string) => {
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // Keyboard shortcuts: F fit · E export · +/− zoom · 0 reset · Esc clear · ? help
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "f":
        case "F":
          graphRef.current?.__fitAll?.();
          break;
        case "e":
        case "E":
          graphRef.current?.__exportPng?.();
          break;
        case "+":
        case "=":
          graphRef.current?.__zoomBy?.(1.2);
          break;
        case "-":
          graphRef.current?.__zoomBy?.(0.83);
          break;
        case "0":
          graphRef.current?.__reset?.();
          break;
        case "Escape":
          setHelpOpen(false);
          setPaletteOpen(false);
          setLassoSlugs(new Set());
          setSelectedSlug(null);
          setSelectedEdge(null);
          break;
        case "?":
          setHelpOpen((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ⌘K / Ctrl-K opens the command palette (separate effect to read key mods).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground" dir={lang === "fa" ? "rtl" : "ltr"}>
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">
              GI
            </span>
            {t("app.name")}
          </button>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            / {t("nav.graph")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/thinktanks">
            <Button variant="ghost" size="sm" className="hidden text-xs sm:inline-flex">
              {t("nav.thinktanks")}
            </Button>
          </Link>
          <Link to="/analyst">
            <Button variant="ghost" size="sm" className="hidden text-xs sm:inline-flex">
              {t("nav.analyst")}
            </Button>
          </Link>
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("dash.search")}
              className="h-9 w-64 rounded-md border border-border bg-card pl-8 pr-3 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="hidden gap-1.5 text-xs md:inline-flex"
            onClick={() => {
              setPaletteMode("jump");
              setPaletteOpen(true);
            }}
            title={`${t("palette.open")} (⌘K)`}
          >
            <ScanSearch className="size-3.5" />
            <kbd className="font-mono text-[10px] text-muted-foreground">⌘K</kbd>
          </Button>
          <span className="hidden text-xs text-muted-foreground md:inline">
            {user?.email}
          </span>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-1.5">
            <LogOut className="size-3.5" /> {t("btn.signout")}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left rail — filters */}
        <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-border px-4 py-4 lg:flex">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("dash.relationTypes")}
          </p>
          <div className="mt-2 flex flex-col gap-0.5">
            {allKinds.map((k) => {
              const active = kindFilter.size === 0 || kindFilter.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors ${
                    kindFilter.has(k)
                      ? "bg-foreground text-background"
                      : active
                        ? "hover:bg-muted"
                        : "text-muted-foreground/60 hover:bg-muted"
                  }`}
                >
                  <span>{t(KIND_LABEL[k] ?? k) ?? k}</span>
                  <span
                    className={`size-1.5 rounded-full ${
                      kindFilter.has(k) || kindFilter.size === 0
                        ? "bg-current opacity-70"
                        : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <Separator className="my-4" />

          {/* Time-scrub window for evidence markers */}
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("graph.timeWindow")}
          </p>
          <input
            type="range"
            min={1}
            max={90}
            value={markerWindowDays}
            onChange={(e) => setMarkerWindowDays(Number(e.target.value))}
            className="mt-2 w-full accent-foreground"
            aria-label={t("graph.timeWindow")}
          />
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{fmtNum(1, lang)}d</span>
            <span className="tabular-nums">
              ≤ {fmtNum(markerWindowDays, lang)} {t("graph.days")}
            </span>
            <span>{fmtNum(90, lang)}d</span>
          </div>

          {/* Cluster hull selector */}
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("graph.hulls")}
            </p>
            <div className="mt-1.5 flex gap-1">
              {([null, "region", "country", "kind"] as const).map((h) => (
                <button
                  key={String(h)}
                  onClick={() => setHullBy(h)}
                  className={`flex-1 rounded-md border px-1 py-1 text-[10px] transition-colors ${
                    hullBy === h
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {h === null
                    ? t("graph.hullsOff")
                    : t(`graph.hull.${h}`)}
                </button>
              ))}
            </div>
          </div>

          <Separator className="my-4" />

          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("graph.topRisk")}
          </p>
          <div className="mt-1.5 space-y-0.5">
            {topRisk.length === 0 && (
              <p className="px-1.5 text-[11px] text-muted-foreground">…</p>
            )}
            {topRisk.map((row, i) => (
              <ScoreRow
                key={row.slug}
                row={row}
                rank={i + 1}
                onSelect={(slug) => {
                  setSelectedSlug(slug);
                  setSelectedEdge(null);
                  graphRef.current?.__flyTo?.(slug);
                }}
              />
            ))}
          </div>

          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("graph.topPosition")}
          </p>
          <div className="mt-1.5 space-y-0.5">
            {topPosition.length === 0 && (
              <p className="px-1.5 text-[11px] text-muted-foreground">…</p>
            )}
            {topPosition.map((row, i) => (
              <ScoreRow
                key={row.slug}
                row={row}
                rank={i + 1}
                onSelect={(slug) => {
                  setSelectedSlug(slug);
                  setSelectedEdge(null);
                  graphRef.current?.__flyTo?.(slug);
                }}
              />
            ))}
          </div>

          <Separator className="my-4" />

          {/* Watchlist */}
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("graph.watchlist")}
          </p>
          <div className="mt-1.5 space-y-0.5">
            {watchlist === undefined && (
              <p className="px-1.5 text-[11px] text-muted-foreground">…</p>
            )}
            {watchlist?.length === 0 && (
              <p className="px-1.5 text-[11px] leading-4 text-muted-foreground">
                {t("graph.watchlistEmpty")}
              </p>
            )}
            {watchlist?.map((w) => {
              const a = actorsBySlug.get(w.actorSlug);
              const fresh = changesSince?.byActor?.[w.actorSlug] ?? 0;
              return (
                <div key={w._id} className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setSelectedSlug(w.actorSlug);
                      setSelectedEdge(null);
                      graphRef.current?.__flyTo?.(w.actorSlug);
                    }}
                    className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate text-start group-hover:underline">
                      {a?.name ?? w.actorSlug}
                    </span>
                    {fresh > 0 && (
                      <span className="shrink-0 rounded-full bg-foreground px-1.5 text-[9px] font-semibold tabular-nums text-background">
                        {fmtNum(fresh, lang)}
                      </span>
                    )}
                  </button>
                  <WatchButton
                    slug={w.actorSlug}
                    watching
                    onToggle={handleToggleWatch}
                  />
                </div>
              );
            })}
          </div>

          <Separator className="my-4" />

          <ChangeFeed
            compact
            onSelectActor={(slug) => {
              if (slug) {
                setSelectedSlug(slug);
                setSelectedEdge(null);
                graphRef.current?.__flyTo?.(slug);
              }
            }}
          />

          <Separator className="my-4" />

          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("dash.registryStatus")}
          </p>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-foreground" /> {t("dash.registryLive")}
            </div>
            <p className="text-[11px] leading-4">
              {stats
                ? `${fmtNum(stats.actorCount, lang)} ${t("stat.actors")} · ${fmtNum(stats.edgeCount, lang)} ${t("stat.edges")}`
                : t("dash.loading")}
            </p>
          </div>

          <div className="mt-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={() => {
                setKindFilter(new Set());
                setSearch("");
                graphRef.current?.__reset?.();
              }}
            >
              <RotateCcw className="size-3.5" /> {t("btn.reset")}
            </Button>
          </div>
        </aside>

        {/* Center — graph */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-4 overflow-x-auto">
              {stats && (
                <>
                  <Stat label={t("stat.actors")} value={fmtNum(stats.actorCount, lang)} />
                  <Stat label={t("stat.edges")} value={fmtNum(stats.edgeCount, lang)} />
                  <Stat label={t("stat.evidence")} value={fmtNum(stats.evidenceCount, lang)} />
                  <Stat label={t("stat.corroborated")} value={`${fmtNum(stats.corroboratedShare, lang)}%`} />
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => graphRef.current?.__zoomBy?.(1.2)}
                aria-label={t("dash.zoomIn")}
              >
                <Plus className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => graphRef.current?.__zoomBy?.(0.83)}
                aria-label={t("dash.zoomOut")}
              >
                <Minus className="size-4" />
              </Button>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => graphRef.current?.__fitAll?.()}
                aria-label={t("graph.fitAll")}
                title={`${t("graph.fitAll")} (F)`}
              >
                <Maximize2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => graphRef.current?.__exportPng?.()}
                aria-label={t("graph.exportPng")}
                title={`${t("graph.exportPng")} (E)`}
              >
                <Camera className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setHelpOpen((v) => !v)}
                aria-label={t("graph.shortcuts")}
                title={`${t("graph.shortcuts")} (?)`}
              >
                <HelpCircle className="size-4" />
              </Button>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Button
                variant={focusMode ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setFocusMode((f) => !f)}
              >
                <Layers className="size-3.5" />
                {t("dash.focus")}
              </Button>
              <Button
                variant={lassoEnabled ? "default" : "outline"}
                size="icon"
                className="size-8"
                onClick={() => {
                  setLassoEnabled((v) => !v);
                  if (lassoEnabled) setLassoSlugs(new Set());
                }}
                aria-label={t("graph.lasso")}
                title={t("graph.lasso")}
              >
                <Lasso className="size-4" />
              </Button>
              <Button
                variant={layout === "geo" ? "default" : "outline"}
                size="icon"
                className="size-8"
                onClick={() => setLayout((l) => (l === "geo" ? "force" : "geo"))}
                aria-label={t("graph.layoutGeo")}
                title={layout === "geo" ? t("graph.layoutForce") : t("graph.layoutGeo")}
              >
                <Globe2 className="size-4" />
              </Button>
              <Button
                variant={bundling ? "default" : "outline"}
                size="icon"
                className="size-8"
                onClick={() => setBundling((b) => !b)}
                aria-label={t("graph.bundling")}
                title={t("graph.bundling")}
              >
                <Share2 className="size-4" />
              </Button>
              {/* §9.1 matrix view */}
              <Button
                variant={matrixOpen ? "default" : "outline"}
                size="icon"
                className="size-8"
                onClick={() => setMatrixOpen((v) => !v)}
                aria-label={t("matrix.title")}
                title={t("matrix.title")}
              >
                <Grid3X3 className="size-4" />
              </Button>
              {/* §9.1 ego network depth */}
              <div className="flex items-center overflow-hidden rounded-md border border-border" role="group" aria-label={t("ego.title")}>
                {([null, 1, 2, 3] as Array<null | 1 | 2 | 3>).map((d) => (
                  <button
                    key={String(d)}
                    onClick={() => setEgoDepth(d)}
                    disabled={d !== null && !selectedSlug}
                    title={d === null ? t("ego.off") : `${t("ego.title")} ${fmtNum(d, lang)}`}
                    className={`px-2 py-1.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      egoDepth === d
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {d === null ? t("ego.off") : `×${fmtNum(d, lang)}`}
                  </button>
                ))}
              </div>
              {/* §9.1 new-in-7d pulse */}
              <Button
                variant={highlightNew ? "default" : "outline"}
                size="icon"
                className="size-8"
                onClick={() => setHighlightNew((v) => !v)}
                aria-label={t("graph.new7d")}
                title={t("graph.new7d")}
              >
                <Sparkles className="size-4" />
              </Button>
              {/* §9.3 exports */}
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={exportJson}
                aria-label={t("export.json")}
                title={t("export.json")}
              >
                <FileJson className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={exportCsv}
                aria-label={t("export.csv")}
                title={t("export.csv")}
              >
                <Download className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={exportGraphml}
                aria-label={t("export.graphml")}
                title={t("export.graphml")}
              >
                <CircleDot className="size-4" />
              </Button>
              {/* §9.2 saved views */}
              <Button
                variant={viewsOpen ? "default" : "outline"}
                size="icon"
                className="size-8"
                onClick={() => setViewsOpen((v) => !v)}
                aria-label={t("views.title")}
                title={t("views.title")}
              >
                <Bookmark className="size-4" />
              </Button>
              {/* §4.4 alerts bell with unread count */}
              <Button
                variant={alertsOpen ? "default" : "outline"}
                size="icon"
                className="relative size-8"
                onClick={() => setAlertsOpen((v) => !v)}
                aria-label={t("alerts.title")}
                title={t("alerts.title")}
              >
                <Bell className="size-4" />
                {(alerts?.filter((a) => !a.acknowledged).length ?? 0) > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-600 text-[8px] font-bold text-white tabular-nums">
                    {fmtNum(alerts!.filter((a) => !a.acknowledged).length, lang)}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Temporal playback bar */}
          {sinceRange && (
            <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                onClick={() => {
                  if (playing) {
                    setPlaying(false);
                  } else {
                    if (playbackTs === null || playbackTs >= sinceRange.max) {
                      setPlaybackTs(sinceRange.min);
                    }
                    setPlaying(true);
                  }
                }}
                aria-label={t("graph.play")}
              >
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </Button>
              <input
                type="range"
                min={sinceRange.min}
                max={sinceRange.max}
                step={(sinceRange.max - sinceRange.min) / 400 || 1}
                value={playbackTs ?? sinceRange.max}
                onChange={(e) => {
                  setPlaying(false);
                  setPlaybackTs(Number(e.target.value));
                }}
                className="min-w-0 flex-1 accent-foreground"
                aria-label={t("graph.timeline")}
              />
              <span className="w-24 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {playbackTs === null
                  ? t("graph.timelineAll")
                  : fmtDate(playbackTs)}
              </span>
              <div className="flex shrink-0 gap-0.5">
                {[1, 4, 16].map((s) => (
                  <button
                    key={s}
                    onClick={() => setPlaySpeed(s)}
                    className={`rounded border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${
                      playSpeed === s
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {fmtNum(s, lang)}×
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={graphRef} className="relative min-h-0 flex-1 p-3">
            {graph === undefined ? (
              <div className="flex h-full items-center justify-center rounded-md border border-border/60 bg-muted/30">
                <div className="text-center">
                  <div className="mx-auto size-6 animate-spin rounded-full border border-border border-t-foreground/60" />
                  <p className="mt-3 text-xs text-muted-foreground">{t("dash.loading")}</p>
                </div>
              </div>
            ) : graph.actors.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-md border border-border/60 bg-muted/30">
                <div className="text-center">
                  <p className="text-sm font-medium">{t("dash.empty")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("dash.seeding")}
                  </p>
                </div>
              </div>
            ) : (
              <ActorGraph
                actors={graph.actors}
                relations={filteredRelations}
                selectedSlug={highlightSlug}
                onSelect={(slug) => {
                  setSelectedSlug(slug);
                  setSelectedEdge(null);
                }}
                onEdgeSelect={(r) => {
                  setSelectedEdge(r);
                  setSelectedSlug(null);
                }}
                focusMode={focusMode}
                kindFilter={kindFilter}
                markers={markersMap}
                markerWindowDays={markerWindowDays}
                coverage={coverageMap}
                hullBy={hullBy}
                playbackTs={graphPlaybackTs}
                layout={layout}
                bundling={bundling}
                lassoEnabled={lassoEnabled}
                onLassoSelect={(slugs) => setLassoSlugs(slugs)}
                egoDepth={egoDepth}
                highlightNew={highlightNew}
                dynamics={dynamicsMap}
              />
            )}
            {/* §9.1 matrix view modal */}
            {matrixOpen && graph && (
              <div className="absolute inset-6 z-30 flex flex-col rounded-lg border border-border bg-background/95 p-4 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between pb-2">
                  <h3 className="text-sm font-semibold">{t("matrix.title")}</h3>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setMatrixOpen(false)}>
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1">
                  <MatrixView
                    actors={graph.actors}
                    relations={graph.relations}
                    onPickPair={(a, b) => {
                      const rel = graph.relations.find(
                        (r) =>
                          (r.sourceSlug === a && r.targetSlug === b) ||
                          (r.sourceSlug === b && r.targetSlug === a),
                      );
                      if (rel) {
                        setSelectedEdge(rel);
                        setSelectedSlug(null);
                        setMatrixOpen(false);
                      }
                    }}
                  />
                </div>
                {/* §3.3 structural readout */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  <span>
                    {t("metrics.topBrokers")}:{" "}
                    {centrality.length > 0
                      ? centrality
                          .slice()
                          .sort((a, b) => b.betweenness - a.betweenness)
                          .slice(0, 3)
                          .map((c) => actorsBySlug.get(c.slug)?.name ?? c.slug)
                          .join(" · ")
                      : "…"}
                  </span>
                  {blocks.map((b) => (
                    <span key={b.label}>
                      {b.label}: {fmtNum(b.members.length, lang)} · {t("metrics.cohesionIn")} {fmtNum(b.cohesion, lang)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* §4.4 alerts panel */}
            {alertsOpen && (
              <div className="absolute end-3 top-3 z-30 flex max-h-[80%] w-96 flex-col overflow-hidden rounded-lg border border-border bg-background/95 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <h3 className="text-xs font-semibold">{t("alerts.title")}</h3>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => void evaluateAlerts({})}
                    >
                      {t("alerts.evaluate")}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-6" onClick={() => setAlertsOpen(false)}>
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {alerts === undefined && (
                    <div className="h-16 animate-pulse rounded-md bg-muted/60" />
                  )}
                  {alerts?.length === 0 && (
                    <p className="p-3 text-[11px] text-muted-foreground">{t("alerts.empty")}</p>
                  )}
                  {alerts?.map((al) => {
                    const rel = al.relationId
                      ? graph?.relations.find((r) => r._id === al.relationId)
                      : undefined;
                    return (
                      <div
                        key={al._id}
                        className={`mb-1.5 rounded-md border p-2.5 ${
                          al.acknowledged ? "border-border/50 opacity-55" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white ${
                              al.severity === "HIGH"
                                ? "bg-red-600"
                                : al.severity === "MEDIUM"
                                  ? "bg-amber-600"
                                  : "bg-slate-500"
                            }`}
                          >
                            {al.severity}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                            {al.rule} · {fmtAgo(al.ts, lang)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs font-medium leading-4">{al.title}</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{al.detail}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          {rel && (
                            <button
                              className="text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground"
                              onClick={() => {
                                setSelectedEdge(rel);
                                setSelectedSlug(null);
                                setAlertsOpen(false);
                              }}
                            >
                              {t("alerts.openEvidence")}
                            </button>
                          )}
                          {!al.acknowledged && (
                            <button
                              className="ms-auto text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={() => void ackAlert({ id: al._id })}
                            >
                              {t("alerts.ack")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* §9.2 saved views popover */}
            {viewsOpen && (
              <div className="absolute start-3 top-3 z-30 w-80 overflow-hidden rounded-lg border border-border bg-background/95 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <h3 className="text-xs font-semibold">{t("views.title")}</h3>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => setViewsOpen(false)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="max-h-72 overflow-y-auto p-2">
                  {savedViews === undefined && (
                    <div className="h-10 animate-pulse rounded-md bg-muted/60" />
                  )}
                  {savedViews?.length === 0 && (
                    <p className="p-2 text-[11px] text-muted-foreground">{t("views.empty")}</p>
                  )}
                  {savedViews?.map((v) => (
                    <div key={v._id} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted">
                      <button
                        className="min-w-0 flex-1 truncate text-start text-xs"
                        onClick={() => applyView(v)}
                        title={v.name}
                      >
                        {v.name}
                      </button>
                      <button
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => void deleteView({ id: v._id })}
                        aria-label={t("btn.delete")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 border-t border-border p-2">
                  <input
                    value={viewDraft}
                    onChange={(e) => setViewDraft(e.target.value)}
                    placeholder={t("views.namePlaceholder")}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-2.5 text-[11px]"
                    disabled={!viewDraft.trim()}
                    onClick={() => {
                      void saveView({
                        name: viewDraft.trim(),
                        filters: JSON.stringify({
                          kinds: [...kindFilter],
                          search,
                          focus: focusMode,
                          hull: hullBy,
                        }),
                        timeSlice: playbackTs ?? undefined,
                      });
                      setViewDraft("");
                    }}
                  >
                    {t("views.save")}
                  </Button>
                </div>
              </div>
            )}
            {/* Lasso group analysis panel */}
            <GroupPanel
              slugs={lassoSlugs}
              actorsBySlug={actorsBySlug}
              relations={graph?.relations ?? []}
              onClear={() => setLassoSlugs(new Set())}
              onFocusOne={(slug) => {
                setSelectedSlug(slug);
                setSelectedEdge(null);
                graphRef.current?.__flyTo?.(slug);
              }}
              onWatchAll={() => {
                lassoSlugs.forEach((slug) => {
                  if (!watchingSet.has(slug)) void toggleWatch({ actorSlug: slug });
                });
              }}
              onClose={() => setLassoSlugs(new Set())}
            />
            {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
            <CommandPalette
              open={paletteOpen}
              onClose={() => setPaletteOpen(false)}
              actors={(graph?.actors ?? []).filter(
                (a) => paletteMode === "jump" || a.slug !== selectedSlug,
              )}
              onPick={(slug) => {
                if (paletteMode === "compare") {
                  setCompareSlug(slug);
                } else {
                  setSelectedSlug(slug);
                  setSelectedEdge(null);
                  graphRef.current?.__flyTo?.(slug);
                }
              }}
            />
          </div>

          {/* Bottom ticker — latest observed updates */}
          <footer className="hidden h-9 shrink-0 items-center gap-6 overflow-hidden border-t border-border px-4 text-[11px] text-muted-foreground md:flex">
            <span className="uppercase tracking-[0.14em]">{t("dash.latestEvidence")}</span>
            {(graph?.relations ?? [])
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 3)
              .map((r) => (
                <button
                  key={r._id}
                  onClick={() => {
                    setSelectedEdge(r);
                    setSelectedSlug(null);
                  }}
                  className="truncate transition-colors hover:text-foreground"
                >
                  {actorsBySlug.get(r.sourceSlug)?.name} ↔ {actorsBySlug.get(r.targetSlug)?.name}
                  <span className="ml-1.5 opacity-60">
                    {fmtDate(r.updatedAt)}
                  </span>
                </button>
              ))}
          </footer>
        </main>

        {/* Right rail — detail */}
        <aside className="hidden w-80 shrink-0 border-l border-border xl:block">
          {selectedEdge ? (
            <EdgePanel
              relation={selectedEdge}
              actorsBySlug={actorsBySlug}
              onClose={() => setSelectedEdge(null)}
            />
          ) : comparingTo && selectedActor ? (
            <ComparePanel
              a={selectedActor}
              b={comparingTo}
              relations={graph?.relations ?? []}
              onClose={() => setCompareSlug(null)}
              now={now}
            />
          ) : selectedActor ? (
            <ActorPanel
              actor={selectedActor}
              relations={graph?.relations ?? []}
              actorsBySlug={actorsBySlug}
              onOpenEdge={(r) => {
                setSelectedEdge(r);
                setSelectedSlug(null);
              }}
              onClear={() => {
                setSelectedSlug(null);
                setCompareSlug(null);
              }}
              onFlyTo={() => {
                if (selectedSlug) graphRef.current?.__flyTo?.(selectedSlug);
              }}
              now={now}
              watching={watchingSet.has(selectedActor.slug)}
              onToggleWatch={handleToggleWatch}
              onCompare={() => {
                setPaletteMode("compare");
                setPaletteOpen(true);
              }}
              newChanges={changesSince?.byActor?.[selectedActor.slug] ?? 0}
            />
          ) : (
            <div className="flex h-full flex-col px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("dash.inspector")}
              </p>
              <div className="mt-3 rounded-md border border-dashed border-border px-4 py-6 text-center">
                <p className="text-xs font-medium">{t("dash.nothingSelected")}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {t("dash.clickHint")}
                </p>
              </div>

              <Separator className="my-4" />

              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("edge.confidence")}
              </p>
              <ul className="mt-2 space-y-2 text-[11px] leading-4 text-muted-foreground">
                <li className="flex justify-between gap-2">
                  <span>{t("conf.solidEdge")}</span>
                  <span className="text-foreground">{t("conf.solidEdgeDesc")}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>{t("conf.dashedEdge")}</span>
                  <span className="text-foreground">{t("conf.dashedEdgeDesc")}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>{t("conf.fineDashed")}</span>
                  <span className="text-foreground">{t("conf.fineDashedDesc")}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>{t("conf.outerRing")}</span>
                  <span className="text-foreground">{t("conf.outerRingDesc")}</span>
                </li>
              </ul>

              <Separator className="my-4" />

              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("edge.evidenceTrail")}
              </p>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {stats
                  ? `${fmtNum(stats.activeEdges, lang)} ${t("stat.edges")} · ${fmtNum(stats.actorCount, lang)} ${t("stat.actors")} · ${fmtNum(stats.sourcesSum, lang)} ${t("edge.sources")}`
                  : "…"}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
