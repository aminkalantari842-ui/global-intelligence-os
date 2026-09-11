import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/context";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ActorGraph from "@/components/graph/ActorGraph";
import type { GraphActor, GraphRelation } from "@/components/graph/types";
import {
  ArrowLeft,
  ExternalLink,
  Layers,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Search,
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

function ActorPanel({
  actor,
  relations,
  actorsBySlug,
  onOpenEdge,
  onClear,
}: {
  actor: GraphActor;
  relations: GraphRelation[];
  actorsBySlug: Map<string, GraphActor>;
  onOpenEdge: (r: GraphRelation) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const connected = relations.filter(
    (r) => r.sourceSlug === actor.slug || r.targetSlug === actor.slug,
  );
  const meanConfidence = connected.length
    ? Math.round(
        connected.reduce((s, r) => s + r.confidence, 0) / connected.length,
      )
    : 0;

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
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClear}>
          <ArrowLeft className="size-4" />
        </Button>
      </div>

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
        <Stat label={t("stat.edges")} value={String(connected.length)} />
        <Stat label={t("edge.confidence")} value={`${meanConfidence}%`} />
        <Stat label={t("edge.sources")} value={actor.sourceCount >= 1000 ? `${(actor.sourceCount / 1000).toFixed(1)}k` : String(actor.sourceCount)} />
      </div>

      <Separator className="my-4" />

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
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const graph = useQuery(api.graph.getGraph);
  const stats = useQuery(api.graph.getStats);
  const seed = useMutation(api.graph.seedIfEmpty);

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

  const graphRef = useRef<HTMLDivElement & {
    __zoomBy?: (f: number) => void;
    __reset?: () => void;
  } | null>(null);

  const actorsBySlug = useMemo(
    () => new Map((graph?.actors ?? []).map((a) => [a.slug, a])),
    [graph?.actors],
  );

  const selectedActor = selectedSlug ? actorsBySlug.get(selectedSlug) : undefined;

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
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("dash.search")}
              className="h-9 w-64 rounded-md border border-border bg-card pl-8 pr-3 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
            />
          </div>
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
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border px-4 py-4 lg:flex">
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

          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("dash.registryStatus")}
          </p>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-foreground" /> {t("dash.registryLive")}
            </div>
            <p className="text-[11px] leading-4">
              {stats
                ? `${stats.actorCount} ${t("stat.actors")} · ${stats.edgeCount} ${t("stat.edges")}`
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
                  <Stat label={t("stat.actors")} value={String(stats.actorCount)} />
                  <Stat label={t("stat.edges")} value={String(stats.edgeCount)} />
                  <Stat label={t("stat.evidence")} value={String(stats.evidenceCount)} />
                  <Stat label={t("stat.corroborated")} value={`${stats.corroboratedShare}%`} />
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
                variant={focusMode ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setFocusMode((f) => !f)}
              >
                <Layers className="size-3.5" />
                {t("dash.focus")}
              </Button>
            </div>
          </div>

          <div ref={graphRef} className="min-h-0 flex-1 p-3">
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
              />
            )}
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
          ) : selectedActor ? (
            <ActorPanel
              actor={selectedActor}
              relations={graph?.relations ?? []}
              actorsBySlug={actorsBySlug}
              onOpenEdge={(r) => {
                setSelectedEdge(r);
                setSelectedSlug(null);
              }}
              onClear={() => setSelectedSlug(null)}
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
                  ? `${stats.activeEdges} ${t("stat.edges")} · ${stats.actorCount} ${t("stat.actors")} · ${stats.sourcesSum.toLocaleString()} ${t("edge.sources")}`
                  : "…"}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
