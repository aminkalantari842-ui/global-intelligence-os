// §9.1 Matrix view — actor × actor grid colored by dominant relation kind,
// with per-cell strength (max weight). A complement to the force graph for
// pairwise scanning: every cell is a direct projection of stored edges.

import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import { actorDisplayName, toFaDigits } from "./metrics";
import type { GraphActor, GraphRelation } from "./types";

// Relation kind → accent hue (theme-agnostic Tailwind palette).
const KIND_COLOR: Record<string, string> = {
  ALLIANCE: "bg-emerald-600",
  TREATY: "bg-emerald-500",
  COOPERATION: "bg-teal-600",
  INTEL_SHARING: "bg-cyan-600",
  SECURITY_CONSULT: "bg-sky-600",
  NEGOTIATION: "bg-sky-500",
  MEDIATION: "bg-indigo-500",
  NON_AGGRESSION: "bg-violet-500",
  INTERDEPENDENCE: "bg-blue-600",
  TRANSIT_ACCESS: "bg-blue-500",
  SUPPLY: "bg-amber-500",
  DEBT_AID: "bg-amber-600",
  DEPENDENCY: "bg-orange-500",
  DETERRENCE: "bg-slate-500",
  COMPETITION: "bg-yellow-600",
  PROXY_SUPPORT: "bg-orange-600",
  TENSION: "bg-rose-500",
  SANCTIONS: "bg-rose-600",
  CONFLICT: "bg-red-700",
};

interface MatrixViewProps {
  actors: GraphActor[];
  relations: GraphRelation[];
  onPickPair: (a: string, b: string) => void;
}

export default function MatrixView({ actors, relations, onPickPair }: MatrixViewProps) {
  const { t, lang } = useI18n();
  const [hover, setHover] = useState<{ a: string; b: string; kind: string; w: number } | null>(null);

  const bySlug = useMemo(() => new Map(actors.map((a) => [a.slug, a])), [actors]);
  const slugs = useMemo(() => actors.map((a) => a.slug), [actors]);

  // cell: unordered pair → strongest edge (max weight wins; ties → highest conf)
  const cell = useMemo(() => {
    const m = new Map<string, GraphRelation>();
    for (const r of relations) {
      if (!bySlug.has(r.sourceSlug) || !bySlug.has(r.targetSlug)) continue;
      const key = r.sourceSlug < r.targetSlug
        ? `${r.sourceSlug}|${r.targetSlug}`
        : `${r.targetSlug}|${r.sourceSlug}`;
      const cur = m.get(key);
      if (!cur || r.weight > cur.weight || (r.weight === cur.weight && r.confidence > cur.confidence)) {
        m.set(key, r);
      }
    }
    return m;
  }, [relations, bySlug]);

  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {t("matrix.title")}
        </p>
        {hover && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {bySlug.get(hover.a)?.name} × {bySlug.get(hover.b)?.name} ·{" "}
            {t(`rel.${hover.kind}`) ?? hover.kind} · {lang === "fa" ? toFaDigits(hover.w) : hover.w}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card/60">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-card px-2 py-1.5 text-start text-[9px] font-medium text-muted-foreground">
                {t("matrix.actor")}
              </th>
              {slugs.map((s) => (
                <th
                  key={s}
                  className="sticky top-0 z-10 h-16 w-7 bg-card px-0 align-bottom text-[9px] font-medium"
                >
                  <div className="flex h-full items-end justify-center pb-1">
                    <span className="origin-bottom-left -rotate-60 whitespace-nowrap text-muted-foreground">
                      {bySlug.get(s)?.name.slice(0, 22)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slugs.map((row) => (
              <tr key={row}>
                <th className="sticky left-0 z-10 max-w-40 truncate bg-card px-2 py-1 text-start text-[10px] font-medium">
                  {bySlug.get(row)?.name}
                </th>
                {slugs.map((col) => {
                  if (row === col)
                    return (
                      <td key={col} className="h-7 w-7 border border-border/40 bg-muted/40" />
                    );
                  const rel = cell.get(key(row, col));
                  return (
                    <td key={col} className="h-7 w-7 border border-border/40 p-0.5">
                      {rel && (
                        <button
                          onClick={() => onPickPair(rel.sourceSlug, rel.targetSlug)}
                          onMouseEnter={() =>
                            setHover({ a: rel.sourceSlug, b: rel.targetSlug, kind: rel.kind, w: rel.weight })
                          }
                          onMouseLeave={() => setHover(null)}
                          title={`${bySlug.get(rel.sourceSlug)?.name} ↔ ${bySlug.get(rel.targetSlug)?.name} · ${rel.kind} · ${rel.weight}`}
                          className={`block size-full rounded-[2px] transition-transform hover:scale-110 ${KIND_COLOR[rel.kind] ?? "bg-muted-foreground"} ${
                            rel.status === "DISPUTED" ? "opacity-90 [background-image:repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(0,0,0,0.35)_2px,rgba(0,0,0,0.35)_3px)]" : ""
                          }`}
                          style={{ opacity: 0.35 + (rel.weight / 100) * 0.65 }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pt-2 text-[10px] leading-4 text-muted-foreground">
        {t("matrix.hint")}
      </p>
    </div>
  );
}
