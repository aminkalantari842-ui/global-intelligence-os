// Signals strip — B. monitoring, E. graph correlation, H. content alerts.
// Everything here is a deterministic Convex query; the only AI surface is the
// trend-narrative / daily-digest launcher, whose output is stored as an
// ASSESSMENT artifact (SIMULATION-class, never merged into evidence).

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

type Tab = "velocity" | "anomalies" | "movers" | "dups" | "heat" | "calibration" | "alerts" | "copilot";

function Sparkbars({ data, height = 22 }: { data: number[]; height?: number }) {
  const max = Math.max(1, ...data);
  return (
    <span className="inline-flex items-end gap-px" style={{ height }}>
      {data.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-sky-500/70"
          style={{ height: `${Math.max(2, (v / max) * height)}px` }}
        />
      ))}
    </span>
  );
}

export function Signals() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>("velocity");
  const velocity = useQuery(api.enrichment.getVelocity, { days: 30 });
  const anomalies = useQuery(api.enrichment.getAnomalies, {});
  const movers = useQuery(api.enrichment.getFirstMovers, { limit: 8 });
  const dups = useQuery(api.enrichment.listDupCandidates, { limit: 12 });
  const heat = useQuery(api.enrichment.getCoverageHeat, { limit: 10 });
  const calib = useQuery(api.enrichment.getCalibration, {});
  const alertFeed = useQuery(api.contentAlerts.listContentAlerts, { limit: 12 });

  // AI trend narrative + launcher — the output is an ASSESSMENT artifact.
  const trendRun = useAction(api.aiAnalysis.trendNarrative);
  const [trendBusy, setTrendBusy] = useState(false);
  const [trendText, setTrendText] = useState<string | null>(null);

  const runTrend = async () => {
    setTrendBusy(true);
    try {
      const r = await trendRun({});
      setTrendText(r.text);
    } catch {
      setTrendText(t("ai.noKey"));
    } finally {
      setTrendBusy(false);
    }
  };

  const fa = (n: number) => (lang === "fa" ? n.toLocaleString("fa-IR") : String(n));

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "velocity", label: t("sig.velocity") },
    { id: "anomalies", label: t("sig.anomalies") },
    { id: "movers", label: t("sig.movers") },
    { id: "dups", label: t("sig.dups") },
    { id: "heat", label: t("sig.heat") },
    { id: "calibration", label: t("sig.calibration") },
    { id: "alerts", label: t("sig.alerts") },
    { id: "copilot", label: t("sig.copilot") },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`rounded px-2 py-0.5 text-[10.5px] transition-colors ${
              tab === x.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {x.label}
          </button>
        ))}
        <button
          onClick={() => void runTrend()}
          disabled={trendBusy}
          className="ms-auto flex items-center gap-1 rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-medium text-violet-600 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
        >
          {trendBusy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          {t("sig.trend")}
        </button>
      </div>

      {/* Body */}
      <div className="max-h-64 overflow-y-auto px-3 py-2" dir={lang === "fa" ? "rtl" : "ltr"}>
        {trendText && (
          <div className="mb-3 rounded-md border border-violet-500/30 bg-violet-500/5 p-2.5">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-violet-600">
              ASSESSMENT · {t("sig.trend")}
            </p>
            <p className="whitespace-pre-wrap text-[11px] leading-5">{trendText}</p>
          </div>
        )}

        {tab === "velocity" && (
          <div className="space-y-1">
            {velocity === undefined && <Loading />}
            {velocity && Object.keys(velocity.perTank).length === 0 && <Empty />}
            {velocity &&
              Object.entries(velocity.perTank as Record<string, number[]>)
                .sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))
                .slice(0, 12)
                .map(([tank, arr]) => (
                  <div key={tank} className="flex items-center gap-2 text-[11px]">
                    <span className="w-40 truncate text-muted-foreground">{tank}</span>
                    <Sparkbars data={arr} />
                    <span className="tabular-nums text-muted-foreground">{fa(arr.reduce((a, b) => a + b, 0))}</span>
                  </div>
                ))}
          </div>
        )}

        {tab === "anomalies" && (
          <div className="space-y-1">
            {anomalies === undefined && <Loading />}
            {anomalies && anomalies.length === 0 && <Empty />}
            {anomalies?.map((a) => (
              <div key={a.slug} className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">z={a.z}</span>
                <span className="font-medium">{a.slug}</span>
                <span className="text-muted-foreground">· {fa(a.count)} {t("sig.thisWeek")}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "movers" && (
          <div className="space-y-2">
            {movers === undefined && <Loading />}
            {movers && movers.length === 0 && <Empty />}
            {movers?.map((m) => (
              <div key={m.hash} className="rounded-md border border-border/60 px-2 py-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium">
                  <span className="rounded bg-emerald-500/15 px-1 text-[9px] font-bold text-emerald-600">1st</span>
                  {m.firstTank}
                  <span className="truncate text-muted-foreground">“{m.firstTitle.slice(0, 60)}…”</span>
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {m.followers.map((f) => `${f.tank} +${f.lagH}h`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}

        {tab === "dups" && <DupList dups={dups} />}

        {tab === "heat" && (
          <div className="space-y-1">
            {heat === undefined && <Loading />}
            {heat && heat.rows.length === 0 && <Empty />}
            {heat?.rows.map((r) => {
              const maxTank = Math.max(1, ...Object.values(r.perTank));
              return (
                <div key={r.actorSlug} className="flex items-center gap-1.5 text-[10.5px]">
                  <span className="w-32 truncate font-medium">{r.actorSlug}</span>
                  <span className="flex flex-1 gap-0.5">
                    {Object.entries(heat.tankTotals)
                      .slice(0, 12)
                      .map(([tank]) => {
                        const v = r.perTank[tank] ?? 0;
                        return (
                          <span
                            key={tank}
                            title={`${tank}: ${v}`}
                            className="h-3 flex-1 rounded-sm"
                            style={{ background: v === 0 ? "transparent" : `rgba(14,165,233,${0.15 + 0.85 * (v / maxTank)})` }}
                          />
                        );
                      })}
                  </span>
                  <span className="w-8 text-end tabular-nums text-muted-foreground">{fa(r.total)}</span>
                </div>
              );
            })}
          </div>
        )}

        {tab === "calibration" && (
          <div className="space-y-1">
            {calib === undefined && <Loading />}
            {calib && calib.length === 0 && <Empty />}
            {calib?.map((c) => (
              <div key={c.slug} className="flex items-center gap-2 text-[11px]">
                <span className="w-36 truncate font-medium">{c.slug}</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${c.leadingRate >= 50 ? "bg-emerald-500" : c.leadingRate >= 25 ? "bg-amber-500" : "bg-rose-500"}`}
                    style={{ width: `${c.leadingRate}%` }}
                  />
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {fa(c.leadingRate)}% · {fa(c.aligned)}/{fa(c.pubs)}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "alerts" && (
          <div className="space-y-1">
            {alertFeed === undefined && <Loading />}
            {alertFeed && alertFeed.length === 0 && <Empty />}
            {alertFeed?.map((a) => (
              <div key={a._id} className="rounded-md border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-[11px]">
                <p className="line-clamp-1 font-medium">{a.title}</p>
                <p className="text-[10px] text-muted-foreground">{a.detail}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "copilot" && <Copilot />}
      </div>
    </div>
  );
}

// ─── D4/D6/H4 corpus copilot: RAG Q&A, digest, topic radar ─────────────────

function Copilot() {
  const { t, lang } = useI18n();
  const ask = useAction(api.aiAnalysis.corpusQA);
  const digest = useAction(api.aiAnalysis.dailyDigest);
  const radar = useAction(api.aiAnalysis.disagreementRadar);
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState<"qa" | "digest" | "radar" | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  const run = async (kind: "qa" | "digest" | "radar") => {
    setBusy(kind);
    setErr("");
    setText("");
    try {
      const r =
        kind === "qa"
          ? await ask({ question: q })
          : kind === "digest"
            ? await digest({})
            : await radar({ topic: topic.trim() });
      setText(r.text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      setErr(msg.includes("AI_API_KEY") ? t("ai.noKey") : msg.slice(0, 110));
    } finally {
      setBusy(null);
    }
  };

  const btn = "flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium text-white disabled:opacity-40";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5" dir={lang === "fa" ? "rtl" : "ltr"}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && q.trim().length > 3 && void run("qa")}
          placeholder={t("sig.qaPlaceholder")}
          className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none placeholder:text-muted-foreground"
        />
        <button onClick={() => void run("qa")} disabled={busy !== null || q.trim().length < 4} className={`${btn} bg-sky-600 hover:bg-sky-500`}>
          {busy === "qa" ? <Loader2 className="size-3 animate-spin" /> : null} {t("sig.ask")}
        </button>
      </div>
      <div className="flex items-center gap-1.5" dir={lang === "fa" ? "rtl" : "ltr"}>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t("sig.radarPlaceholder")}
          className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none placeholder:text-muted-foreground"
        />
        <button onClick={() => void run("radar")} disabled={busy !== null || topic.trim().length < 2} className={`${btn} bg-rose-600 hover:bg-rose-500`}>
          {busy === "radar" ? <Loader2 className="size-3 animate-spin" /> : null} {t("sig.radar")}
        </button>
        <button onClick={() => void run("digest")} disabled={busy !== null} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
          {busy === "digest" ? <Loader2 className="size-3 animate-spin" /> : null} {t("sig.digest")}
        </button>
      </div>
      {err && <p className="text-[10.5px] text-red-500">{err}</p>}
      {text && (
        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-2.5">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-violet-600">ASSESSMENT · {t("sig.copilot")}</p>
          <p className="whitespace-pre-wrap text-[11.5px] leading-6">{text}</p>
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <p className="flex items-center gap-2 py-3 text-[11px] text-muted-foreground">
      <Loader2 className="size-3 animate-spin" /> …
    </p>
  );
}

function Empty() {
  const { t } = useI18n();
  return <p className="py-3 text-[11px] text-muted-foreground">{t("sig.empty")}</p>;
}

function DupList({
  dups,
}: {
  dups: Awaited<ReturnType<typeof useQuery>> extends never ? never : any;
}) {
  const { t } = useI18n();
  const resolve = useMutation(api.enrichment.resolveDup);
  if (dups === undefined) return <Loading />;
  if (dups.length === 0) return <Empty />;
  return (
    <div className="space-y-2">
      {dups.map((d: any) => (
        <div key={d._id} className="rounded-md border border-border/60 px-2 py-1.5 text-[11px]">
          <p className="flex items-center gap-1.5">
            <span className="rounded bg-orange-500/15 px-1 text-[9px] font-bold text-orange-600">{Math.round(d.score * 100)}%</span>
            <span className="truncate">{d.a.tank}: {d.a.title.slice(0, 50)}…</span>
          </p>
          <p className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">{d.b.tank}: {d.b.title.slice(0, 50)}…</span>
            {d.status === "OPEN" ? (
              <span className="flex shrink-0 items-center gap-1">
                <button onClick={() => void resolve({ id: d._id, status: "MERGED" })} className="rounded border border-border px-1.5 text-[9px] hover:bg-muted">{t("sig.merge")}</button>
                <button onClick={() => void resolve({ id: d._id, status: "REJECTED" })} className="rounded border border-border px-1.5 text-[9px] hover:bg-muted"><X className="size-2.5" /></button>
              </span>
            ) : (
              <span className="shrink-0 text-[9px] uppercase text-muted-foreground">{d.status}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
