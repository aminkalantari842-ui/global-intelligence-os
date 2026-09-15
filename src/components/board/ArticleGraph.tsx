// Per-article AI knowledge graph — the model extracts entities and relations
// from the article's stored full text; this component lays the graph out on a
// force-directed SVG canvas with zoom/pan, node highlighting and hover links.
// The result is cached server-side as an ARTICLE_GRAPH artifact, so reopening
// an article costs zero model calls.

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Network, RefreshCw } from "lucide-react";
import { aiErrorKey } from "@/lib/aiError";

interface KgNode {
  id: string;
  label: string;
  type: string;
}
interface KgLink {
  source: string;
  target: string;
  label: string;
  weight: number;
}
interface KgPayload {
  nodes: KgNode[];
  links: KgLink[];
  cached: boolean;
  model: string;
}

// Node-type → color (tailwind-safe hexes for SVG fills/strokes).
const TYPE_COLORS: Record<string, string> = {
  PERSON: "#f59e0b",
  ORG: "#38bdf8",
  STATE: "#34d399",
  MILITANT: "#fb7185",
  PLACE: "#a78bfa",
  EVENT: "#fbbf24",
  THEME: "#818cf8",
};
function typeColor(type: string): string {
  return TYPE_COLORS[type?.toUpperCase?.() ?? ""] ?? "#94a3b8";
}

// Deterministic seeded layout (golden-angle spiral → relax by link attraction).
// No Math.random: same graph data always renders identically.
function layout(nodes: KgNode[], links: KgLink[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const n = Math.max(nodes.length, 1);
  nodes.forEach((nd, i) => {
    const a = i * 2.39996; // golden angle
    const r = 70 + 130 * Math.sqrt((i + 0.5) / n);
    pos.set(nd.id, { x: 320 + r * Math.cos(a), y: 240 + r * Math.sin(a) });
  });
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  for (let it = 0; it < 60; it++) {
    // Repulsion (light, bounded) + attraction along links.
    for (const a of nodes) {
      for (const b of nodes) {
        if (a.id >= b.id) continue;
        const pa = pos.get(a.id)!;
        const pb = pos.get(b.id)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = 0.5;
          dy = 0.5;
          d2 = 0.5;
        }
        const rep = Math.min(600, 26000 / d2);
        const d = Math.sqrt(d2);
        pa.x += (dx / d) * rep * 0.02;
        pa.y += (dy / d) * rep * 0.02;
        pb.x -= (dx / d) * rep * 0.02;
        pb.y -= (dy / d) * rep * 0.02;
      }
    }
    for (const l of links) {
      const pa = pos.get(l.source);
      const pb = pos.get(l.target);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const rest = 150 / Math.max(1, l.weight * 0.6); // stronger link → closer
      const k = ((d - rest) / d) * 0.04;
      pa.x += dx * k;
      pa.y += dy * k;
      pb.x -= dx * k;
      pb.y -= dy * k;
    }
    // Soft centering.
    for (const p of pos.values()) {
      p.x += (320 - p.x) * 0.012;
      p.y += (240 - p.y) * 0.012;
      p.x = Math.max(40, Math.min(600, p.x));
      p.y = Math.max(30, Math.min(450, p.y));
    }
  }
  // Keep referenced ids only (model may emit dangling links).
  for (const l of links) {
    if (!byId.has(l.source)) l.weight = 0;
    if (!byId.has(l.target)) l.weight = 0;
  }
  return pos;
}

export function ArticleGraph({ pubId }: { pubId: string }) {
  const { t, lang } = useI18n();
  const run = useAction(api.aiAnalysis.articleKnowledgeGraph);
  const [data, setData] = useState<KgPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const generate = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const r = (await run({ pubId: pubId as never })) as unknown as KgPayload;
      setData(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      const key = aiErrorKey(msg);
      if (msg.includes("ARTICLE_NOT_EXTRACTED")) setErr(t("ai.chatNotExtracted"));
      else if (msg.includes("KG_PARSE_FAILED")) setErr(t("ai.graphParseFailed"));
      else setErr(key ? t(key) : t("ai.error"));
    } finally {
      setBusy(false);
    }
  }, [run, pubId, t]);

  // Auto-build on first open.
  useEffect(() => {
    if (!data && !busy && !err) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodes = data?.nodes ?? [];
  const links = useMemo(
    () => (data?.links ?? []).filter((l) => l.weight > 0 && nodes.some((n) => n.id === l.source) && nodes.some((n) => n.id === l.target)),
    [data, nodes],
  );
  const pos = useMemo(() => layout(nodes, links), [nodes, links]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const l of links) {
      d.set(l.source, (d.get(l.source) ?? 0) + 1);
      d.set(l.target, (d.get(l.target) ?? 0) + 1);
    }
    return d;
  }, [links]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [links]);

  const dimmed = (id: string) => hover !== null && hover !== id && !neighbors.get(hover)?.has(id);

  return (
    <div className="flex h-full min-h-0 flex-col" dir={lang === "fa" ? "rtl" : "ltr"}>
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-violet-600">
          <Network className="size-3" /> {t("ai.graphTitle")}
        </span>
        <span className="text-[9.5px] text-muted-foreground">{t("ai.graphHint")}</span>
        <div className="ms-auto flex items-center gap-1">
          {data && (
            <>
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
                {t("ai.graphNodes")} {lang === "fa" ? data.nodes.length.toLocaleString("fa-IR") : data.nodes.length} ·{" "}
                {t("ai.graphLinks")} {lang === "fa" ? links.length.toLocaleString("fa-IR") : links.length}
              </span>
              <button
                onClick={() => {
                  setZoom((z) => Math.min(2.5, z + 0.2));
                }}
                className="rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="zoom in"
              >
                +
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
                className="rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="zoom out"
              >
                −
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="rounded px-1.5 text-[9.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t("ai.graphReset")}
              </button>
            </>
          )}
          <button
            onClick={() => void generate()}
            disabled={busy}
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            title={t("ai.graphRebuild")}
          >
            <RefreshCw className={`size-2.5 ${busy ? "animate-spin" : ""}`} /> {t("ai.graphRebuild")}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-b from-transparent to-muted/30"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom((z) => Math.max(0.5, Math.min(2.5, z - e.deltaY * 0.001)));
        }}
        onMouseDown={(e) => {
          dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
        }}
        onMouseUp={() => (dragRef.current = null)}
        onMouseLeave={() => {
          dragRef.current = null;
          setHover(null);
        }}
      >
        {busy && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="size-5 animate-spin text-violet-500" />
            <p className="text-[11px] text-muted-foreground">{t("ai.graphBuilding")}</p>
          </div>
        )}
        {err && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[11.5px] text-red-500">{err}</p>
            <button
              onClick={() => {
                setErr("");
                void generate();
              }}
              className="rounded-md border border-border px-2.5 py-1 text-[10.5px] hover:bg-muted"
            >
              {t("ai.chatRetry")}
            </button>
          </div>
        )}
        {data && (
          <svg
            viewBox="0 0 640 480"
            className="h-full w-full cursor-grab active:cursor-grabbing"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" }}
          >
            {/* Links */}
            {links.map((l, i) => {
              const a = pos.get(l.source);
              const b = pos.get(l.target);
              if (!a || !b) return null;
              const active = hover === l.source || hover === l.target;
              return (
                <g key={i} opacity={active ? 1 : hover ? 0.25 : 0.8}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={active ? "rgb(139 92 246)" : "rgb(148 163 184)"}
                    strokeWidth={Math.max(1, l.weight * 0.5)}
                    strokeDasharray={l.weight <= 1 ? "3 3" : undefined}
                  />
                  {(active || hover === null) && (
                    <text
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 3}
                      textAnchor="middle"
                      className="fill-current text-muted-foreground"
                      fontSize={7.5}
                      style={{ pointerEvents: "none" }}
                    >
                      {l.label}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Nodes */}
            {nodes.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const deg = degree.get(n.id) ?? 0;
              const r = 9 + Math.min(10, deg * 1.8);
              const c = typeColor(n.type);
              return (
                <g
                  key={n.id}
                  opacity={dimmed(n.id) ? 0.25 : 1}
                  onMouseEnter={() => setHover(n.id)}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={p.x} cy={p.y} r={r + 3.5} fill={c} opacity={hover === n.id ? 0.22 : 0.12} />
                  <circle cx={p.x} cy={p.y} r={r} fill={`${c}33`} stroke={c} strokeWidth={1.6} />
                  <text
                    x={p.x}
                    y={p.y + r + 9}
                    textAnchor="middle"
                    fontSize={8.5}
                    className="fill-current text-foreground"
                    style={{ pointerEvents: "none" }}
                  >
                    {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                  </text>
                  <text
                    x={p.x}
                    y={p.y - r - 5}
                    textAnchor="middle"
                    fontSize={6.5}
                    className="fill-current text-muted-foreground"
                    style={{ pointerEvents: "none", letterSpacing: "0.08em" }}
                  >
                    {n.type}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Legend */}
      {data && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5">
          {Object.entries(TYPE_COLORS)
            .filter(([k]) => nodes.some((n) => (n.type ?? "").toUpperCase() === k))
            .map(([k, c]) => (
              <span key={k} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: c }} /> {k}
              </span>
            ))}
          {data.cached && <span className="ms-auto text-[9px] text-emerald-600">{t("ai.graphCached")}</span>}
        </div>
      )}
    </div>
  );
}
