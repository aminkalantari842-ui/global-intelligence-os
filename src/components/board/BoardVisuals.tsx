// Visual helpers for the think-tank board: header sparklines and the
// dark world-map coverage strip. Pure deterministic SVG — every bar maps
// to a real count from `getTopicTrends` / `getCoverageByCountry`.

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useMemo } from "react";

// ─── Header sparkline (14-day daily volume) ─────────────────────────────────

export function TopicSparkline({
  topicId,
  days = 14,
  accentClass = "fill-foreground/50",
}: {
  topicId: string;
  days?: number;
  accentClass?: string;
}) {
  const series = useQuery(api.reading.getTopicTrends, { topics: [topicId], days });
  const data = series?.[topicId];
  if (!data) return <div className="h-4 w-16 animate-pulse rounded bg-muted/50" />;
  const max = Math.max(1, ...data);
  return (
    <svg viewBox={`0 0 ${data.length * 4} 14`} className="h-4 w-16" preserveAspectRatio="none" aria-hidden>
      {data.map((v, i) => {
        const h = v === 0 ? 1 : Math.max(2, (v / max) * 13);
        return (
          <rect
            key={i}
            x={i * 4}
            y={14 - h}
            width={3}
            height={h}
            rx={0.5}
            className={accentClass}
          />
        );
      })}
    </svg>
  );
}

// ─── Dark world strip ───────────────────────────────────────────────────────
// A glanceable equirectangular band: each monitored country is a glowing dot
// at its capital position; brightness ∝ publication coverage last 7 days.

const COUNTRY_POS: Record<string, { x: number; y: number }> = {
  // Normalized x (0..1 = -180..180 lon), y (0..1 = 85..-60 lat)
  "United States": { x: 0.25, y: 0.38 },
  "United Kingdom": { x: 0.46, y: 0.22 },
  France: { x: 0.485, y: 0.28 },
  Germany: { x: 0.51, y: 0.24 },
  Switzerland: { x: 0.497, y: 0.29 },
  Russia: { x: 0.62, y: 0.15 },
  China: { x: 0.75, y: 0.35 },
  Japan: { x: 0.87, y: 0.33 },
  "South Korea": { x: 0.83, y: 0.33 },
  India: { x: 0.69, y: 0.45 },
  Pakistan: { x: 0.66, y: 0.43 },
  Iran: { x: 0.585, y: 0.38 },
  Iraq: { x: 0.565, y: 0.40 },
  Israel: { x: 0.555, y: 0.40 },
  "Saudi Arabia": { x: 0.575, y: 0.47 },
  "United Arab Emirates": { x: 0.61, y: 0.45 },
  Turkey: { x: 0.545, y: 0.31 },
  Egypt: { x: 0.535, y: 0.43 },
  Ukraine: { x: 0.55, y: 0.23 },
  Poland: { x: 0.52, y: 0.21 },
  Australia: { x: 0.85, y: 0.78 },
  Canada: { x: 0.24, y: 0.2 },
  Brazil: { x: 0.33, y: 0.68 },
  Singapore: { x: 0.775, y: 0.57 },
  Belgium: { x: 0.475, y: 0.235 },
  Sweden: { x: 0.51, y: 0.17 },
  Qatar: { x: 0.595, y: 0.45 },
  Nigeria: { x: 0.48, y: 0.55 },
  "South Africa": { x: 0.52, y: 0.78 },
  Indonesia: { x: 0.79, y: 0.62 },
  Mexico: { x: 0.21, y: 0.44 },
  Other: { x: 0.5, y: 0.5 },
};

export function WorldStrip() {
  const { lang } = useI18n();
  const coverage = useQuery(api.reading.getCoverageByCountry, { hours: 168 });
  const dots = useMemo(() => {
    if (!coverage) return [];
    const max = Math.max(1, ...Object.values(coverage));
    return Object.entries(coverage)
      .filter(([c]) => COUNTRY_POS[c])
      .map(([country, count]) => ({
        country,
        count,
        ...COUNTRY_POS[country],
        r: 2 + (count / max) * 5,
        alpha: 0.25 + (count / max) * 0.75,
      }));
  }, [coverage]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-[#0b1220]" dir="ltr">
      <svg viewBox="0 0 100 34" className="h-16 w-full" preserveAspectRatio="xMidYMid slice">
        {/* Graticule */}
        {[6, 12, 18, 24, 30].map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={100} y2={y} stroke="#1e293b" strokeWidth={0.15} />
        ))}
        {[15, 30, 45, 60, 75, 90].map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={34} stroke="#1e293b" strokeWidth={0.15} />
        ))}
        {/* Equator + tropics slightly brighter */}
        <line x1={0} y1={17} x2={100} y2={17} stroke="#334155" strokeWidth={0.2} />
        {/* Coverage dots */}
        {dots.map((d) => (
          <g key={d.country}>
            <circle cx={d.x * 100} cy={d.y * 34} r={d.r * 1.6} fill="#38bdf8" opacity={d.alpha * 0.15} />
            <circle cx={d.x * 100} cy={d.y * 34} r={d.r} fill="#7dd3fc" opacity={d.alpha * 0.9} />
          </g>
        ))}
      </svg>
      <div className="pointer-events-none absolute bottom-1 end-2 flex items-center gap-1.5 text-[8px] text-sky-200/70">
        <span className="inline-block size-1.5 rounded-full bg-sky-300" />
        {lang === "fa" ? "پوشش انتشار ۷ روز گذشته" : "7-day publication coverage"}
      </div>
    </div>
  );
}
