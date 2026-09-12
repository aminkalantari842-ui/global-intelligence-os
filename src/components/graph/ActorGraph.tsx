import * as d3 from "d3-force";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import { computeRisk, edgeRecency, actorDisplayName, fmtAgo } from "./metrics";
import type { GraphActor, GraphRelation } from "./types";

export interface ActorNode extends d3.SimulationNodeDatum {
  id: string;
  actor: GraphActor;
  radius: number;
  x?: number;
  y?: number;
}

export interface RelationLink extends d3.SimulationLinkDatum<ActorNode> {
  relation: GraphRelation;
  /** Perpendicular fan offset for parallel edges between the same pair. */
  curvature: number;
}

export interface RelationEventSource {
  publication: string;
  title: string;
  url: string;
  date: string;
  stance: string;
}

export interface RelationEvent {
  _id: string;
  relationId: string;
  timestamp: number;
  type: string;
  title: string;
  summary: string;
  confidence: number;
  claimType: string;
  sources: RelationEventSource[];
}

export interface EdgeMarker {
  latestTs: number;
  count14d: number;
  total: number;
}

interface ActorGraphProps {
  actors: GraphActor[];
  relations: GraphRelation[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
  onEdgeSelect: (relation: GraphRelation | null) => void;
  /** When true, dim nodes/edges not connected to the selected actor. */
  focusMode?: boolean;
  kindFilter?: Set<string>;
  /** relationId → latest activity, from getEventMarkers (deterministic). */
  markers?: Record<string, EdgeMarker>;
}

const KIND_RADIUS: Record<string, number> = {
  STATE: 21,
  ORGANIZATION: 16,
  STATE_INSTITUTION: 14,
  MILITARY_ORG: 14,
  NON_STATE: 12,
  COMPANY: 11,
  THINK_TANK: 11,
};

/** Kinds whose edges carry source→target direction (arrowhead). */
const DIRECTED_KINDS = new Set(["SUPPLY", "PROXY_SUPPORT", "SANCTIONS"]);

// ─── Theme-aware palette ────────────────────────────────────────────────────
// Resolved from the app's CSS custom properties so the canvas follows the
// light/dark theme without a second color source of truth.
interface Palette {
  bg: string;
  ink: string;
  edge: string;
  faded: string;
  card: string;
  grid: string;
  text: string;
}

function resolvePalette(): Palette {
  if (typeof document === "undefined") {
    return { bg: "#ffffff", ink: "#18181b", edge: "#a1a1aa", faded: "#e4e4e7", card: "#fafafa", grid: "#f4f4f5", text: "#52525b" };
  }
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: get("--background", "#ffffff"),
    ink: get("--foreground", "#18181b"),
    edge: get("--muted-foreground", "#a1a1aa"),
    faded: get("--border", "#e4e4e7"),
    card: get("--card", "#fafafa"),
    grid: get("--border", "#f4f4f5"),
    text: get("--muted-foreground", "#52525b"),
  };
}

// Confidence → edge opacity (0–100 scale)
function edgeOpacity(confidence: number) {
  return 0.2 + (Math.min(100, Math.max(0, confidence)) / 100) * 0.75;
}

// Confidence → dash pattern (numeric segments, canvas API). Confirmed edges
// are solid; weaker edges become progressively dashed so status is readable
// without color.
function edgeDash(status: string, confidence: number): number[] {
  if (status === "CONFIRMED") return [];
  if (status === "DISPUTED") return [2, 5];
  return confidence < 60 ? [6, 6] : [2, 4];
}

// Quadratic bezier helpers — curved parallel edges between the same pair.
interface Pt {
  x: number;
  y: number;
}

function controlPoint(s: Pt, t: Pt, curvature: number): Pt {
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mx + (-dy / len) * curvature * len, y: my + (dx / len) * curvature * len };
}

function qPoint(s: Pt, c: Pt, t: Pt, f: number): Pt {
  const u = 1 - f;
  return {
    x: u * u * s.x + 2 * u * f * c.x + f * f * t.x,
    y: u * u * s.y + 2 * u * f * c.y + f * f * t.y,
  };
}

function qTangent(s: Pt, c: Pt, t: Pt, f: number): Pt {
  const u = 1 - f;
  return { x: 2 * u * (c.x - s.x) + 2 * f * (t.x - c.x), y: 2 * u * (c.y - s.y) + 2 * f * (t.y - c.y) };
}

// ─── Minimap geometry ───────────────────────────────────────────────────────
const MM = { w: 148, h: 100, margin: 14 };

interface TooltipState {
  x: number;
  y: number;
  node?: ActorNode;
  link?: RelationLink;
}

export default function ActorGraph({
  actors,
  relations,
  selectedSlug,
  onSelect,
  onEdgeSelect,
  focusMode = true,
  kindFilter,
  markers,
}: ActorGraphProps) {
  const { t, lang } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulationRef = useRef<d3.Simulation<ActorNode, RelationLink> | null>(null);
  const nodesRef = useRef<ActorNode[]>([]);
  const linksRef = useRef<RelationLink[]>([]);
  const frameRef = useRef<number>(0);
  const transformRef = useRef({ k: 1, x: 0, y: 0 });
  const sizeRef = useRef({ w: 800, h: 520 });
  const dragRef = useRef<{ node: ActorNode | null; moved: boolean }>({
    node: null,
    moved: false,
  });
  const hoverRef = useRef<string | null>(null);
  const paletteRef = useRef<Palette>(resolvePalette());
  const flyAnimRef = useRef<number>(0);
  const minimapDragRef = useRef(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const [, forceRender] = useState(0);
  void forceRender;

  const filteredRelations = useMemo(
    () =>
      relations.filter((r) => !kindFilter || kindFilter.size === 0 || kindFilter.has(r.kind)),
    [relations, kindFilter],
  );

  // ── Build simulation when data changes ──────────────────────────────────
  const rebuild = useCallback(
    () => {
      const prev = new Map(nodesRef.current.map((n) => [n.id, n]));

      const nextNodes: ActorNode[] = actors
        .map((a) => {
          const prevNode = prev.get(a.slug);
          return {
            id: a.slug,
            actor: a,
            radius: KIND_RADIUS[a.kind] ?? 12,
            x: prevNode?.x ?? (Math.random() - 0.5) * 300,
            y: prevNode?.y ?? (Math.random() - 0.5) * 300,
            vx: prevNode?.vx ?? 0,
            vy: prevNode?.vy ?? 0,
          };
        });

      const byId = new Map(nextNodes.map((n) => [n.id, n]));

      // Parallel-edge fan: same (source,target) unordered pair gets offset
      // curvatures so multiple relations never overlap.
      const pairCount = new Map<string, number>();
      const pairSeen = new Map<string, number>();
      const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
      for (const r of filteredRelations) {
        const key = pairKey(r.sourceSlug, r.targetSlug);
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }

      const nextLinks: RelationLink[] = filteredRelations
        .filter((r) => byId.has(r.sourceSlug) && byId.has(r.targetSlug))
        .map((r) => {
          const key = pairKey(r.sourceSlug, r.targetSlug);
          const n = pairCount.get(key) ?? 1;
          const i = pairSeen.get(key) ?? 0;
          pairSeen.set(key, i + 1);
          const curvature = n === 1 ? 0 : (i - (n - 1) / 2) * 0.16;
          return {
            source: byId.get(r.sourceSlug)!,
            target: byId.get(r.targetSlug)!,
            relation: r,
            curvature,
          };
        });

      nodesRef.current = nextNodes;
      linksRef.current = nextLinks;

      const sim = d3
        .forceSimulation<ActorNode, RelationLink>(nextNodes)
        .force(
          "link",
          d3
            .forceLink<ActorNode, RelationLink>(nextLinks)
            .id((d) => d.id)
            .distance((d) => 260 - d.relation.weight * 1.2)
            .strength((d) => 0.15 + (d.relation.weight / 100) * 0.55),
        )
        .force("charge", d3.forceManyBody().strength(-900))
        .force("center", d3.forceCenter(0, 0))
        .force("collide", d3.forceCollide<ActorNode>((d) => d.radius + 34).strength(0.9))
        .alphaMin(0.001)
        .on("tick", () => {
          if (!frameRef.current) {
            frameRef.current = requestAnimationFrame(() => {
              frameRef.current = 0;
              draw();
            });
          }
        });
      simulationRef.current = sim;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actors, filteredRelations],
  );

  // ── Rendering ───────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const P = paletteRef.current;
    const now = Date.now();
    const { w, h } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Theme background — also makes PNG export self-contained.
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    const { k, x, y } = transformRef.current;
    ctx.save();
    ctx.translate(w / 2 + x, h / 2 + y);
    ctx.scale(k, k);

    // Subtle reference grid — a fixed, restrained anchor for the layout.
    ctx.strokeStyle = P.grid;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1 / k;
    const step = 120;
    const left = (-w / 2 - x) / k;
    const right = (w / 2 - x) / k;
    const top = (-h / 2 - y) / k;
    const bottom = (h / 2 - y) / k;
    ctx.beginPath();
    for (let px = Math.ceil(left / step) * step; px <= right; px += step) {
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
    }
    for (let py = Math.ceil(top / step) * step; py <= bottom; py += step) {
      ctx.moveTo(left, py);
      ctx.lineTo(right, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const selected = selectedSlug;
    const hovered = hoverRef.current;
    const activeId = hovered ?? selected;

    // Level of Detail tiers — density of cues scales with zoom.
    const lod = k < 0.55 ? 0 : k < 0.9 ? 1 : k < 1.35 ? 2 : 3;

    // ── Edges ──
    for (const link of links) {
      const s = link.source as ActorNode;
      const tt = link.target as ActorNode;
      if (s.x === undefined || s.y === undefined || tt.x === undefined || tt.y === undefined) continue;

      const rel = link.relation;
      const isConnected = activeId !== null && (s.id === activeId || tt.id === activeId);

      let alpha = edgeOpacity(rel.confidence);
      let color = P.edge;
      let width = 1 + (rel.weight / 100) * 2.4;

      if (focusMode && activeId) {
        if (isConnected) {
          alpha = Math.min(1, alpha + 0.25);
          width += 0.8;
        } else {
          alpha = 0.06;
          color = P.faded;
        }
      }

      const s0: Pt = { x: s.x!, y: s.y! };
      const t0: Pt = { x: tt.x!, y: tt.y! };
      const c = controlPoint(s0, t0, link.curvature);

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = rel.status === "DISPUTED" ? P.text : color;
      ctx.lineWidth = width;
      ctx.setLineDash(edgeDash(rel.status, rel.confidence));
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(c.x, c.y, tt.x, tt.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Weight ticks — quiet, precise cue for engagement intensity (LoD 2+).
      if (lod >= 2 && rel.weight >= 10 && alpha > 0.1) {
        const ticks = Math.max(1, Math.round(rel.weight / 25));
        for (let i = 1; i <= ticks; i++) {
          const f = i / (ticks + 1);
          const p = qPoint(s0, c, t0, f);
          const tg = qTangent(s0, c, t0, f);
          const tl = Math.hypot(tg.x, tg.y) || 1;
          const px = (-tg.y / tl) * 3.2;
          const py = (tg.x / tl) * 3.2;
          ctx.globalAlpha = alpha * 0.9;
          ctx.lineWidth = 1.1 / k + 0.4;
          ctx.beginPath();
          ctx.moveTo(p.x - px, p.y - py);
          ctx.lineTo(p.x + px, p.y + py);
          ctx.stroke();
        }
      }

      // Direction arrowhead for directed relation kinds (LoD 1+).
      if (lod >= 1 && DIRECTED_KINDS.has(rel.kind) && alpha > 0.1) {
        const f = 0.62;
        const p = qPoint(s0, c, t0, f);
        const tg = qTangent(s0, c, t0, f);
        const tl = Math.hypot(tg.x, tg.y) || 1;
        const ux = tg.x / tl;
        const uy = tg.y / tl;
        const size = 6 / k + 1.5;
        ctx.globalAlpha = Math.min(1, alpha + 0.15);
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.moveTo(p.x + ux * size, p.y + uy * size);
        ctx.lineTo(p.x - uy * size * 0.55, p.y + ux * size * 0.55);
        ctx.lineTo(p.x + uy * size * 0.55, p.y - ux * size * 0.55);
        ctx.closePath();
        ctx.fill();
      }

      // Event markers — recent observed activity on this edge. Fresh (≤7d)
      // markers are solid, older ones half-toned; count label at high LoD.
      const marker = markers?.[rel._id];
      if (lod >= 1 && marker && marker.total > 0 && alpha > 0.1) {
        const fresh = edgeRecency(marker.latestTs, now) === "fresh";
        const p = qPoint(s0, c, t0, 0.5);
        const tg = qTangent(s0, c, t0, 0.5);
        const tl = Math.hypot(tg.x, tg.y) || 1;
        const off = 7 / k + 1;
        const mx = p.x + (-tg.y / tl) * off;
        const my = p.y + (tg.x / tl) * off;
        ctx.globalAlpha = focusMode && activeId && !isConnected ? alpha : fresh ? 0.95 : 0.5;
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(mx, my, (fresh ? 2.6 : 2) / k + 0.6, 0, Math.PI * 2);
        ctx.fill();
        if (lod >= 3 && marker.count14d > 1) {
          ctx.fillStyle = P.text;
          ctx.font = `${9 / k + 0.5}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(marker.count14d), mx, my - off - 2 / k);
        }
      }
    }

    // ── Nodes ──
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const node of nodes) {
      if (node.x === undefined || node.y === undefined) continue;
      const isActive = activeId === node.id;
      const connected =
        activeId !== null &&
        linksRef.current.some((l) => {
          const s = l.source as ActorNode;
          const t2 = l.target as ActorNode;
          return (
            (s.id === activeId && t2.id === node.id) ||
            (t2.id === activeId && s.id === node.id)
          );
        });
      const dimmed = focusMode && activeId !== null && !isActive && !connected;

      const r = node.radius * (isActive ? 1.12 : 1);
      ctx.globalAlpha = dimmed ? 0.28 : 1;

      // halo for active node
      if (isActive) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = P.ink;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = dimmed ? 0.28 : 1;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? P.ink : P.card;
      ctx.fill();
      ctx.lineWidth = isActive ? 1.5 : 1.25;
      ctx.strokeStyle = isActive ? P.ink : dimmed ? P.faded : P.edge;
      ctx.stroke();

      // confidence ring: arc length proportional to mean edge confidence
      if (!dimmed && lod >= 1) {
        const rels = linksRef.current.filter((l) => {
          const s = l.source as ActorNode;
          const t2 = l.target as ActorNode;
          return s.id === node.id || t2.id === node.id;
        });
        const meanConf = rels.length
          ? rels.reduce((sum, l) => sum + l.relation.confidence, 0) / rels.length
          : 0;
        const start = -Math.PI / 2;
        const end = start + (meanConf / 100) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, start, end);
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // risk pips — 3 dots, filled count = risk level (LoD 2+, not dimmed)
      if (!dimmed && lod >= 2) {
        const rels = linksRef.current
          .filter((l) => {
            const s = l.source as ActorNode;
            const t2 = l.target as ActorNode;
            return s.id === node.id || t2.id === node.id;
          })
          .map((l) => l.relation);
        const risk = computeRisk(node.actor, rels, now).risk;
        const filled = Math.max(0, Math.min(3, Math.round(risk / 34)));
        const px0 = node.x + r + 7;
        const py = node.y - 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(px0 + i * 5.5, py, 1.7, 0, Math.PI * 2);
          ctx.fillStyle = i < filled ? P.ink : P.faded;
          ctx.globalAlpha = dimmed ? 0.28 : i < filled ? 0.85 : 1;
          ctx.fill();
        }
        ctx.globalAlpha = dimmed ? 0.28 : 1;
      }

      // labels (LoD 1+): primary localized name, secondary other-language
      if (lod >= 1) {
        ctx.globalAlpha = dimmed ? 0.25 : 1;
        ctx.fillStyle = isActive ? P.ink : P.text;
        ctx.font = `${isActive ? 600 : 500} 12px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(actorDisplayName(node.actor, lang), node.x, node.y + r + 13);

        if (lod >= 3) {
          const other = lang === "fa" ? "en" : "fa";
          ctx.fillStyle = P.edge;
          ctx.globalAlpha = dimmed ? 0.2 : 0.65;
          ctx.font = "9.5px ui-sans-serif, system-ui, sans-serif";
          ctx.fillText(actorDisplayName(node.actor, other), node.x, node.y + r + 26);
        }
      }

      // activity sparks — recency of the actor's edges as a mini bar row
      if (!dimmed && lod >= 2) {
        const ups = linksRef.current
          .filter((l) => {
            const s = l.source as ActorNode;
            const t2 = l.target as ActorNode;
            return s.id === node.id || t2.id === node.id;
          })
          .map((l) => l.relation.updatedAt)
          .sort((a, b) => a - b)
          .slice(-10);
        if (ups.length > 1) {
          const barW = 2;
          const gap = 1.5;
          const total = ups.length * (barW + gap) - gap;
          const bx = node.x - total / 2;
          const by = node.y + r + (lod >= 3 ? 36 : 24);
          for (let i = 0; i < ups.length; i++) {
            const age = now - ups[i];
            const fresh =
              age <= 7 * 86_400_000 ? 4 : age <= 30 * 86_400_000 ? 2.5 : 1;
            ctx.globalAlpha = dimmed ? 0.2 : 0.75;
            ctx.fillStyle = P.ink;
            ctx.fillRect(bx + i * (barW + gap), by - fresh, barW, fresh);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    ctx.globalAlpha = 1;

    // ── Minimap (screen space, bottom-right) ──
    if (showMinimap && nodes.length > 0) {
      const mmX = w - MM.w - MM.margin;
      const mmY = h - MM.h - MM.margin;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      }
      const pad = 80;
      minX -= pad; maxX += pad; minY -= pad; maxY += pad;
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      const sc = Math.min(MM.w / bw, MM.h / bh);
      const ox = mmX + (MM.w - bw * sc) / 2;
      const oy = mmY + (MM.h - bh * sc) / 2;
      const toMM = (wx: number, wy: number): Pt => ({
        x: ox + (wx - minX) * sc,
        y: oy + (wy - minY) * sc,
      });

      ctx.fillStyle = P.card;
      ctx.strokeStyle = P.faded;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.roundRect(mmX, mmY, MM.w, MM.h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;

      // links
      ctx.strokeStyle = P.edge;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const l of links) {
        const s = l.source as ActorNode;
        const t2 = l.target as ActorNode;
        if (s.x === undefined || s.y === undefined || t2.x === undefined || t2.y === undefined) continue;
        const a = toMM(s.x, s.y);
        const b = toMM(t2.x, t2.y);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // nodes
      for (const n of nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        const p = toMM(n.x, n.y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, activeId === n.id ? 2.6 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = activeId === n.id ? P.ink : P.edge;
        ctx.globalAlpha = activeId === n.id ? 1 : 0.8;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // viewport rect
      const vw = w / k;
      const vh = h / k;
      const wx0 = -x / k - vw / 2;
      const wy0 = -y / k - vh / 2;
      const v0 = toMM(wx0, wy0);
      ctx.strokeStyle = P.ink;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.strokeRect(v0.x, v0.y, vw * sc, vh * sc);
      ctx.globalAlpha = 1;
    }
  }, [selectedSlug, focusMode, lang, markers, showMinimap]);

  // Redraw on selection/hover changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Build/rebuild simulation on data change
  useEffect(() => {
    rebuild();
    return () => {
      simulationRef.current?.stop();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [rebuild]);

  // ── Theme awareness: re-resolve palette when the root class changes ──────
  useEffect(() => {
    const apply = () => {
      paletteRef.current = resolvePalette();
      draw();
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [draw]);

  // ── Resize observer ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // ── Hit-testing helpers ─────────────────────────────────────────────────
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const { k, x, y } = transformRef.current;
    const { w, h } = sizeRef.current;
    return { x: (px - w / 2 - x) / k, y: (py - h / 2 - y) / k };
  }, []);

  const nodeAt = useCallback((wx: number, wy: number): ActorNode | null => {
    for (const n of nodesRef.current) {
      if (n.x === undefined || n.y === undefined) continue;
      if (Math.hypot(n.x - wx, n.y - wy) <= n.radius + 6) return n;
    }
    return null;
  }, []);

  // Curved-edge hit test: sample the same quadratic geometry used to draw.
  const edgeAt = useCallback((wx: number, wy: number): RelationLink | null => {
    let best: RelationLink | null = null;
    let bestDist = 9; // px tolerance
    for (const l of linksRef.current) {
      const s = l.source as ActorNode;
      const t = l.target as ActorNode;
      if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;
      const s0: Pt = { x: s.x, y: s.y };
      const t0: Pt = { x: t.x, y: t.y };
      const c = controlPoint(s0, t0, l.curvature);
      const steps = 14;
      for (let i = 1; i < steps; i++) {
        const p = qPoint(s0, c, t0, i / steps);
        const d = Math.hypot(wx - p.x, wy - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = l;
        }
      }
    }
    return best;
  }, []);

  // ── Animated fly-to (eased camera move) ──────────────────────────────────
  const animateTo = useCallback((target: { k: number; x: number; y: number }, dur = 550) => {
    if (flyAnimRef.current) cancelAnimationFrame(flyAnimRef.current);
    const from = { ...transformRef.current };
    const start = performance.now();
    const step = (tNow: number) => {
      const p = Math.min(1, (tNow - start) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      transformRef.current = {
        k: from.k + (target.k - from.k) * e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      };
      draw();
      if (p < 1) flyAnimRef.current = requestAnimationFrame(step);
      else flyAnimRef.current = 0;
    };
    flyAnimRef.current = requestAnimationFrame(step);
  }, [draw]);

  const fitAll = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) {
      transformRef.current = { k: 1, x: 0, y: 0 };
      draw();
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x === undefined || n.y === undefined) continue;
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    const { w, h } = sizeRef.current;
    const pad = 90;
    const k = Math.min(1.6, Math.max(0.4, Math.min(w / (maxX - minX + pad), h / (maxY - minY + pad))));
    animateTo({ k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k });
  }, [animateTo]);

  const flyTo = useCallback((slug: string) => {
    const n = nodesRef.current.find((nd) => nd.id === slug);
    if (!n || n.x === undefined || n.y === undefined) return;
    const k = Math.max(transformRef.current.k, 1.4);
    animateTo({ k, x: -n.x * k, y: -n.y * k });
  }, [animateTo]);

  // ── Interaction: drag nodes / pan / wheel zoom / click select / minimap ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let panning = false;
    let panStart = { x: 0, y: 0, ox: 0, oy: 0 };

    const inMinimap = (e: PointerEvent | MouseEvent) => {
      if (!showMinimap) return false;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { w, h } = sizeRef.current;
      return (
        px >= w - MM.w - MM.margin &&
        px <= w - MM.margin &&
        py >= h - MM.h - MM.margin &&
        py <= h - MM.margin
      );
    };

    const minimapJump = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { w, h } = sizeRef.current;
      const mmX = w - MM.w - MM.margin;
      const mmY = h - MM.h - MM.margin;

      // Recompute the same world→minimap mapping used in draw.
      const nodes = nodesRef.current;
      if (nodes.length === 0) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      }
      const pad = 80;
      minX -= pad; maxX += pad; minY -= pad; maxY += pad;
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      const sc = Math.min(MM.w / bw, MM.h / bh);
      const ox = mmX + (MM.w - bw * sc) / 2;
      const oy = mmY + (MM.h - bh * sc) / 2;

      const wx = (px - ox) / sc + minX;
      const wy = (py - oy) / sc + minY;
      const k = transformRef.current.k;
      if (flyAnimRef.current) cancelAnimationFrame(flyAnimRef.current);
      transformRef.current = { k, x: -wx * k, y: -wy * k };
      draw();
    };

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      if (inMinimap(e)) {
        minimapDragRef.current = true;
        minimapJump(e);
        return;
      }
      const wp = toWorld(e.clientX, e.clientY);
      const node = nodeAt(wp.x, wp.y);
      dragRef.current = { node, moved: false };
      if (node) {
        const sim = simulationRef.current;
        if (sim) {
          sim.alphaTarget(0.25).restart();
          const df = sim.find(wp.x, wp.y);
          if (df && "fx" in df) (df as ActorNode).fx = wp.x;
          if (df && "fy" in df) (df as ActorNode).fy = wp.y;
        }
      } else {
        panning = true;
        panStart = {
          x: e.clientX,
          y: e.clientY,
          ox: transformRef.current.x,
          oy: transformRef.current.y,
        };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (minimapDragRef.current) {
        minimapJump(e);
        return;
      }
      if (dragRef.current.node) {
        const wp = toWorld(e.clientX, e.clientY);
        const node = dragRef.current.node;
        node.fx = wp.x;
        node.fy = wp.y;
        dragRef.current.moved = true;
        return;
      }
      if (panning) {
        transformRef.current.x = panStart.ox + (e.clientX - panStart.x);
        transformRef.current.y = panStart.oy + (e.clientY - panStart.y);
        draw();
        return;
      }
      // hover feedback + tooltip
      const wp = toWorld(e.clientX, e.clientY);
      const n = nodeAt(wp.x, wp.y);
      const edge = n ? null : edgeAt(wp.x, wp.y);
      const newHover = n?.id ?? (edge ? `edge:${edge.relation._id}` : null);
      if (newHover !== hoverRef.current) {
        hoverRef.current = newHover;
        const rect = canvas.getBoundingClientRect();
        setTooltip(
          n
            ? { x: e.clientX - rect.left, y: e.clientY - rect.top, node: n }
            : edge
              ? { x: e.clientX - rect.left, y: e.clientY - rect.top, link: edge }
              : null,
        );
        draw();
      }
      canvas.style.cursor = n ? "grab" : edge ? "pointer" : inMinimap(e) ? "crosshair" : "default";
    };

    const onPointerUp = (e: PointerEvent) => {
      if (minimapDragRef.current) {
        minimapDragRef.current = false;
        return;
      }
      const wasDrag = dragRef.current.moved;
      const draggedNode = dragRef.current.node;
      if (draggedNode) {
        draggedNode.fx = undefined;
        draggedNode.fy = undefined;
        simulationRef.current?.alphaTarget(0);
      }
      dragRef.current = { node: null, moved: false };
      panning = false;

      const wp = toWorld(e.clientX, e.clientY);
      const node = nodeAt(wp.x, wp.y);
      if (node && !wasDrag) {
        onSelect(node.id === selectedSlug ? null : node.id);
        onEdgeSelect(null);
      } else if (!node && !wasDrag && !panning) {
        const edge = edgeAt(wp.x, wp.y);
        if (edge) {
          onEdgeSelect(edge.relation);
        } else {
          onSelect(null);
          onEdgeSelect(null);
        }
      }
      draw();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { k, x, y } = transformRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - sizeRef.current.w / 2;
      const my = e.clientY - rect.top - sizeRef.current.h / 2;
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      const k2 = Math.min(3.2, Math.max(0.4, k * factor));
      // zoom toward cursor
      transformRef.current = {
        k: k2,
        x: mx - ((mx - x) * k2) / k,
        y: my - ((my - y) * k2) / k,
      };
      draw();
    };

    const onLeave = () => {
      if (hoverRef.current) {
        hoverRef.current = null;
        setTooltip(null);
        draw();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [toWorld, nodeAt, edgeAt, draw, onSelect, onEdgeSelect, selectedSlug, showMinimap]);

  // Double-click a node to pin/unpin; double-click background to fit all
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onDoubleClick = (e: MouseEvent) => {
      const wp = toWorld(e.clientX, e.clientY);
      const node = nodeAt(wp.x, wp.y);
      if (!node) {
        fitAll();
        return;
      }
      if (node.fx !== undefined) {
        node.fx = undefined;
        node.fy = undefined;
      } else {
        node.fx = node.x;
        node.fy = node.y;
      }
      simulationRef.current?.alpha(0.3).restart();
    };
    canvas.addEventListener("dblclick", onDoubleClick);
    return () => canvas.removeEventListener("dblclick", onDoubleClick);
  }, [toWorld, nodeAt, fitAll]);

  // ── Public controls exposed through the container ref ────────────────────
  useEffect(() => {
    const el = containerRef.current as (HTMLDivElement & {
      __zoomBy?: (f: number) => void;
      __reset?: () => void;
      __fitAll?: () => void;
      __flyTo?: (slug: string) => void;
      __exportPng?: () => void;
    }) | null;
    if (!el) return;
    el.__zoomBy = (f: number) => {
      const { k, x, y } = transformRef.current;
      const k2 = Math.min(3.2, Math.max(0.4, k * f));
      transformRef.current = { k: k2, x: x * (k2 / k), y: y * (k2 / k) };
      draw();
    };
    el.__reset = () => {
      fitAll();
      simulationRef.current?.alpha(0.4).restart();
    };
    el.__fitAll = fitAll;
    el.__flyTo = flyTo;
    el.__exportPng = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { w, h } = sizeRef.current;
      const dpr = canvas.width / Math.max(1, w);
      const clone = document.createElement("canvas");
      clone.width = canvas.width;
      clone.height = canvas.height;
      const cctx = clone.getContext("2d");
      if (!cctx) return;
      cctx.drawImage(canvas, 0, 0);
      // footer credit in screen space
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cctx.fillStyle = paletteRef.current.text;
      cctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      cctx.textAlign = "right";
      cctx.textBaseline = "alphabetic";
      cctx.fillText(
        `GLOBAL INTELLIGENCE OS · ${new Date().toISOString().slice(0, 10)}`,
        w - 12,
        h - 8,
      );
      clone.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `global-intel-graph-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
  }, [draw, fitAll, flyTo]);

  const ttNode = tooltip?.node;
  const ttLink = tooltip?.link;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-md border border-border/60 bg-background"
    >
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />

      {/* Hover tooltip */}
      {tooltip && (ttNode || ttLink) && (
        <div
          className="pointer-events-none absolute z-20 max-w-64 rounded-md border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur"
          style={{
            left: Math.min(tooltip.x + 14, (sizeRef.current.w || 0) - 270),
            top: tooltip.y + 14,
          }}
          dir={lang === "fa" ? "rtl" : "ltr"}
        >
          {ttNode && (
            <>
              <p className="font-semibold leading-5">{actorDisplayName(ttNode.actor, lang)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t(`kind.${ttNode.actor.kind}`) ?? ttNode.actor.kind} · {ttNode.actor.country}
              </p>
              <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {t("stat.edges")}: {linksRef.current.filter((l) => {
                  const s = l.source as ActorNode;
                  const t2 = l.target as ActorNode;
                  return s.id === ttNode.id || t2.id === ttNode.id;
                }).length}
              </p>
            </>
          )}
          {ttLink && (
            <>
              <p className="font-semibold leading-5">
                {actorDisplayName((ttLink.source as ActorNode).actor, lang)}
                <span className="mx-1 text-muted-foreground">↔</span>
                {actorDisplayName((ttLink.target as ActorNode).actor, lang)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t(`rel.${ttLink.relation.kind}`) ?? ttLink.relation.kind} ·{" "}
                {t(`status.${ttLink.relation.status}`) ?? ttLink.relation.status}
              </p>
              <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">
                {ttLink.relation.summary}
              </p>
              <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                {t("edge.confidence")} {ttLink.relation.confidence}% ·{" "}
                {fmtAgo(markers?.[ttLink.relation._id]?.latestTs ?? ttLink.relation.updatedAt, lang)}
              </p>
            </>
          )}
        </div>
      )}

      {/* Minimap toggle */}
      <button
        onClick={() => setShowMinimap((s) => !s)}
        className="absolute right-3 top-3 z-10 rounded-md border border-border/70 bg-card/90 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        aria-label="minimap"
      >
        {showMinimap ? "◫" : "▢"}
      </button>

      <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
        {t("graph.help")}
      </div>
    </div>
  );
}
