import * as d3 from "d3-force";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface ActorGraphProps {
  actors: GraphActor[];
  relations: GraphRelation[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
  onEdgeSelect: (relation: GraphRelation | null) => void;
  /** When true, dim nodes/edges not connected to the selected actor. */
  focusMode?: boolean;
  kindFilter?: Set<string>;
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

// Monochrome palette (minimalist theme)
const INK = "#18181b";
const EDGE_BASE = "#d4d4d8";
const EDGE_FADED = "#ececee";
const NODE_FILL = "#fafafa";
const NODE_STROKE_DIM = "#a1a1aa";
const GRID = "#f4f4f5";

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

export default function ActorGraph({
  actors,
  relations,
  selectedSlug,
  onSelect,
  onEdgeSelect,
  focusMode = true,
  kindFilter,
}: ActorGraphProps) {
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
            // preserve previous positions across data refreshes
            x: prevNode?.x ?? (Math.random() - 0.5) * 300,
            y: prevNode?.y ?? (Math.random() - 0.5) * 300,
            vx: prevNode?.vx ?? 0,
            vy: prevNode?.vy ?? 0,
          };
        });

      const byId = new Map(nextNodes.map((n) => [n.id, n]));
      const nextLinks: RelationLink[] = filteredRelations
        .filter((r) => byId.has(r.sourceSlug) && byId.has(r.targetSlug))
        .map((r) => ({
          source: byId.get(r.sourceSlug)!,
          target: byId.get(r.targetSlug)!,
          relation: r,
        }));

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
    [actors, filteredRelations],
  );

  // ── Rendering ───────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { w, h } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { k, x, y } = transformRef.current;
    ctx.save();
    ctx.translate(w / 2 + x, h / 2 + y);
    ctx.scale(k, k);

    // Subtle reference grid — a fixed, restrained anchor for the layout.
    ctx.strokeStyle = GRID;
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

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const selected = selectedSlug;
    const hovered = hoverRef.current;
    const activeId = hovered ?? selected;

    // ── Edges ──
    for (const link of links) {
      const s = link.source as ActorNode;
      const t = link.target as ActorNode;
      if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;

      const rel = link.relation;
      const isConnected =
        activeId !== null && (s.id === activeId || t.id === activeId);

      let alpha = edgeOpacity(rel.confidence);
      let color = EDGE_BASE;
      let width = 1 + (rel.weight / 100) * 2.4;

      if (focusMode && activeId) {
        if (isConnected) {
          alpha = Math.min(1, alpha + 0.25);
          width += 0.8;
        } else {
          alpha = 0.06;
          color = EDGE_FADED;
        }
      }

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = rel.status === "DISPUTED" ? "#71717a" : color;
      ctx.lineWidth = width;
      ctx.setLineDash(edgeDash(rel.status, rel.confidence));
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Weight ticks — a quiet, precise cue for engagement intensity.
      if (rel.weight >= 10 && alpha > 0.1) {
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const ticks = Math.max(1, Math.round(rel.weight / 25));
        for (let i = 1; i <= ticks; i++) {
          const f = i / (ticks + 1);
          const mx = s.x + dx * f;
          const my = s.y + dy * f;
          ctx.globalAlpha = alpha * 0.9;
          ctx.lineWidth = 1.1 / k + 0.4;
          // small perpendicular tick
          const px = -uy * 3.2;
          const py = ux * 3.2;
          ctx.beginPath();
          ctx.moveTo(mx - px, my - py);
          ctx.lineTo(mx + px, my + py);
          ctx.stroke();
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
          const t = l.target as ActorNode;
          return (
            (s.id === activeId && t.id === node.id) ||
            (t.id === activeId && s.id === node.id)
          );
        });
      const dimmed = focusMode && activeId !== null && !isActive && !connected;

      const r = node.radius * (isActive ? 1.12 : 1);
      ctx.globalAlpha = dimmed ? 0.28 : 1;

      // halo for active node
      if (isActive) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 8, 0, Math.PI * 2);
        ctx.strokeStyle = INK;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? INK : NODE_FILL;
      ctx.fill();
      ctx.lineWidth = isActive ? 1.5 : 1.25;
      ctx.strokeStyle = isActive ? INK : dimmed ? "#e4e4e7" : NODE_STROKE_DIM;
      ctx.stroke();

      // confidence ring: arc length proportional to mean edge confidence
      if (!dimmed) {
        const rels = linksRef.current.filter((l) => {
          const s = l.source as ActorNode;
          const t = l.target as ActorNode;
          return s.id === node.id || t.id === node.id;
        });
        const meanConf = rels.length
          ? rels.reduce((sum, l) => sum + l.relation.confidence, 0) / rels.length
          : 0;
        const start = -Math.PI / 2;
        const end = start + (meanConf / 100) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, start, end);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // label
      ctx.globalAlpha = dimmed ? 0.25 : 1;
      ctx.fillStyle = isActive ? INK : "#3f3f46";
      ctx.font = `${isActive ? 600 : 500} 12px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(node.actor.name, node.x, node.y + r + 13);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }, [selectedSlug, focusMode]);

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

  const edgeAt = useCallback((wx: number, wy: number): RelationLink | null => {
    let best: RelationLink | null = null;
    let bestDist = 9; // px tolerance
    for (const l of linksRef.current) {
      const s = l.source as ActorNode;
      const t = l.target as ActorNode;
      if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const f = ((wx - s.x) * dx + (wy - s.y) * dy) / len2;
      if (f < 0.08 || f > 0.92) continue; // avoid node hit zones
      const cx = s.x + dx * f;
      const cy = s.y + dy * f;
      const d = Math.hypot(wx - cx, wy - cy);
      if (d < bestDist) {
        bestDist = d;
        best = l;
      }
    }
    return best;
  }, []);

  // ── Interaction: drag nodes / pan / wheel zoom / click select ──────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let panning = false;
    let panStart = { x: 0, y: 0, ox: 0, oy: 0 };

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
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
      // hover feedback
      const wp = toWorld(e.clientX, e.clientY);
      const n = nodeAt(wp.x, wp.y);
      const edge = n ? null : edgeAt(wp.x, wp.y);
      const newHover = n?.id ?? null;
      if (newHover !== hoverRef.current) {
        hoverRef.current = newHover;
        draw();
      }
      canvas.style.cursor = n ? "grab" : edge ? "pointer" : "default";
    };

    const onPointerUp = (e: PointerEvent) => {
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

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [toWorld, nodeAt, edgeAt, draw, onSelect, onEdgeSelect, selectedSlug]);

  // Double-click a node to pin/unpin
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onDoubleClick = (e: MouseEvent) => {
      const wp = toWorld(e.clientX, e.clientY);
      const node = nodeAt(wp.x, wp.y);
      if (!node) return;
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
  }, [toWorld, nodeAt]);

  // Public controls handled via exposeRef through parent (zoom buttons)
  useEffect(() => {
    const el = containerRef.current as (HTMLDivElement & {
      __zoomBy?: (f: number) => void;
      __reset?: () => void;
    }) | null;
    if (!el) return;
    el.__zoomBy = (f: number) => {
      const { k, x, y } = transformRef.current;
      const k2 = Math.min(3.2, Math.max(0.4, k * f));
      transformRef.current = { k: k2, x: x * (k2 / k), y: y * (k2 / k) };
      draw();
    };
    el.__reset = () => {
      transformRef.current = { k: 1, x: 0, y: 0 };
      simulationRef.current?.alpha(0.4).restart();
      draw();
    };
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-md border border-border/60 bg-white"
    >
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />
      <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
        drag nodes · scroll to zoom · drag background to pan · double-click to pin
      </div>
    </div>
  );
}
