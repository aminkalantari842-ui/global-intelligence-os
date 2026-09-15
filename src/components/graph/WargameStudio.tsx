// Wargame Studio — full-screen SIMULATION environment over the real graph.
//   Setup    : pair/bloc selection, live evidence briefing, calibrated rungs,
//              parameter panel (pressure/rounds/seed/human side).
//   Play     : interactive rounds (human command vs deterministic engine),
//              timeline, outcome, Monte-Carlo fan, save with provenance.
//   Analysis : AI red-team critique + narrative + brief, stored on the run.
// Every visible output is labeled SIMULATION; AI text is analysis, never data.

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { EdgeMarker } from "./ActorGraph";
import { useI18n } from "@/i18n/context";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { actorDisplayName, fmtAgo, fmtNum, toFaDigits } from "./metrics";
import { aiErrorKey } from "@/lib/aiError";
import { detectBlocks } from "./network";
import type { GraphActor, GraphRelation } from "./types";
import {
  HUMAN_MOVES,
  assessBasis,
  buildBloc,
  calibratedStartRungs,
  duelOutcome,
  initSide,
  monteCarlo,
  runAutoWargame,
  runBlocWargame,
  stepDuel,
  type DuelRound,
  type HumanMoveKey,
  type McResult,
  type SideState,
  type WargameOutcome,
} from "./wargameStudio";

const OUTCOME_KEY: Record<WargameOutcome, string> = {
  STALEMATE: "sim.out.stalemate",
  A_DOMINANT: "sim.out.a",
  B_DOMINANT: "sim.out.b",
  MUTUAL_ESCALATION: "sim.out.esc",
  MUTUAL_DEFUSE: "sim.out.def",
};

const BASIS_STYLE: Record<string, string> = {
  HIGH: "border-emerald-600/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  MEDIUM: "border-amber-600/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  LOW: "border-red-600/50 bg-red-500/10 text-red-700 dark:text-red-400",
};

const RUNG_COLOR = (r: number) =>
  r >= 6 ? "bg-red-600" : r >= 4 ? "bg-amber-600" : r >= 2 ? "bg-sky-600" : "bg-emerald-600";

interface RunState {
  rounds: DuelRound[];
  a: SideState;
  b: SideState;
  outcome: WargameOutcome | null;
}

export default function WargameStudio({
  actors,
  relations,
  markers,
  actorsBySlug,
  onClose,
  initialPair,
}: {
  actors: GraphActor[];
  relations: GraphRelation[];
  markers: Record<string, EdgeMarker>;
  actorsBySlug: Map<string, GraphActor>;
  onClose: () => void;
  initialPair?: { a: string; b: string } | null;
}) {
  const { t, lang } = useI18n();
  const [sideAKind, setSideAKind] = useState<string>(initialPair?.a ?? "");
  const [sideBKind, setSideBKind] = useState<string>(initialPair?.b ?? "");
  const pairSlugs: [string, string] | null =
    sideAKind && sideBKind && sideAKind !== sideBKind ? [sideAKind, sideBKind] : null;
  const briefing = useQuery(
    api.wargameAi.liveBriefing,
    pairSlugs ? { aSlug: pairSlugs[0], bSlug: pairSlugs[1] } : "skip",
  );
  const saveWargame = useMutation(api.wargameAi.saveWargame);
  const savedRuns = useQuery(api.wargameAi.listWargames, { limit: 10 });
  const aiCritique = useAction(api.wargameAi.aiCritique);
  const aiNarrate = useAction(api.wargameAi.aiNarrate);
  const aiBrief = useAction(api.wargameAi.aiBrief);
  const attachAnalysis = useMutation(api.wargameAi.attachAnalysis);

  const [mode, setMode] = useState<"PAIR" | "BLOC">("PAIR");
  const [pressure, setPressure] = useState(0.6);
  const [rounds, setRounds] = useState(8);
  const [humanSide, setHumanSide] = useState<"A" | "B" | null>(null);
  const [seed, setSeed] = useState(42);
  const [startOverride, setStartOverride] = useState<{ a: number; b: number } | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [mc, setMc] = useState<McResult | null>(null);
  const [ai, setAi] = useState<{ critique?: string; narrative?: string; brief?: string; busy: string | null }>({ busy: null });
  const [savedId, setSavedId] = useState<string | null>(null);

  // ── Pair resolution + evidence calibration ──
  const actorA = sideAKind ? actorsBySlug.get(sideAKind) : undefined;
  const actorB = sideBKind ? actorsBySlug.get(sideBKind) : undefined;

  const pairEdges = useMemo(
    () =>
      pairSlugs
        ? relations.filter(
            (r) =>
              (r.sourceSlug === pairSlugs[0] && r.targetSlug === pairSlugs[1]) ||
              (r.sourceSlug === pairSlugs[1] && r.targetSlug === pairSlugs[0]),
          )
        : [],
    [relations, pairSlugs],
  );

  const pairEvents = useMemo(() => {
    if (!pairSlugs) return [];
    const out: Array<{ ts: number; type: string }> = [];
    for (const r of pairEdges) {
      for (const m of markers[r._id]?.series ?? []) {
        if (m && typeof m.ts === "number") out.push({ ts: m.ts, type: m.type });
      }
    }
    return out.sort((x, y) => x.ts - y.ts);
  }, [pairEdges, markers]);

  const now = useMemo(() => Date.now(), []);
  const basis = useMemo(
    () => assessBasis(pairEvents, pairEdges, now),
    [pairEvents, pairEdges, now],
  );
  const calibrated = useMemo(
    () => calibratedStartRungs(pairEvents, pairEdges, now),
    [pairEvents, pairEdges, now],
  );
  const startRungs = startOverride ?? calibrated;

  // ── Derived sides (pair or bloc) ──
  const sides = useMemo(() => {
    if (!actorA || !actorB) return null;
    if (mode === "BLOC") {
      return {
        a: buildBloc(actorA, relations, actorsBySlug, startRungs.a),
        b: buildBloc(actorB, relations, actorsBySlug, startRungs.b),
      };
    }
    return {
      a: initSide(actorA, relations, startRungs.a),
      b: initSide(actorB, relations, startRungs.b),
    };
  }, [actorA, actorB, mode, relations, actorsBySlug, startRungs]);

  const meanConfidence = pairEdges.length
    ? Math.round(pairEdges.reduce((s, r) => s + r.confidence, 0) / pairEdges.length)
    : 40;

  // ── Auto run + Monte-Carlo ──
  const launchAuto = () => {
    if (!sides) return;
    const res =
      mode === "BLOC"
        ? runBlocWargame(sides.a as never, sides.b as never, { pressure, maxRounds: rounds, seed })
        : runAutoWargame(sides.a as SideState, sides.b as SideState, { pressure, maxRounds: rounds, seed });
    setRun({
      rounds: res.rounds,
      a: { ...(sides.a as SideState), rung: res.rounds[res.rounds.length - 1].aRung },
      b: { ...(sides.b as SideState), rung: res.rounds[res.rounds.length - 1].bRung },
      outcome: res.outcome,
    });
    setMc(monteCarlo(sides.a as SideState, sides.b as SideState, { pressure, maxRounds: rounds, seed }, meanConfidence, 40, seed * 1000 + 7));
    setSavedId(null);
    setAi({ busy: null });
  };

  // ── Interactive play state ──
  const [liveRounds, setLiveRounds] = useState<DuelRound[]>([]);
  const [liveA, setLiveA] = useState<SideState | null>(null);
  const [liveB, setLiveB] = useState<SideState | null>(null);
  const startLive = () => {
    if (!sides) return;
    setLiveA(sides.a as SideState);
    setLiveB(sides.b as SideState);
    setLiveRounds([]);
    setMc(null);
    setSavedId(null);
    setAi({ busy: null });
  };
  const playCommand = (mv: HumanMoveKey) => {
    if (!liveA || !liveB) return;
    const step = stepDuel(liveA, liveB, { pressure, maxRounds: rounds, seed: seed + liveRounds.length + 1 }, humanSide === "A" ? mv : undefined, humanSide === "B" ? mv : undefined);
    const all = [...liveRounds, { ...step.round, round: liveRounds.length + 1 }];
    setLiveRounds(all);
    setLiveA(step.a);
    setLiveB(step.b);
    if (all.length >= rounds) {
      setMc(monteCarlo(step.a, step.b, { pressure, maxRounds: rounds, seed }, meanConfidence, 40, seed * 1000 + 7));
    }
  };
  const engineStep = () => {
    if (!liveA || !liveB) return;
    playCommand("HOLD"); // both sides engine-driven when no human override below
  };
  const liveDone = liveRounds.length >= rounds;
  const liveOutcome = liveA && liveB && liveDone ? duelOutcome(liveA.rung, liveB.rung) : null;

  // Effective display run: interactive if started, else auto result
  const displayRounds = liveA ? liveRounds : run?.rounds ?? [];
  const displayOutcome = liveA ? liveOutcome : run?.outcome ?? null;
  const displayA = liveA ?? run?.a ?? null;
  const displayB = liveB ?? run?.b ?? null;

  // ── Evidence pack for the AI layer (real data only) ──
  const evidencePack = useMemo(() => {
    if (!briefing) return "[]";
    return JSON.stringify({
      edges: briefing.edges,
      recentEvents: briefing.recentEvents.map((e) => ({ type: e.type, title: e.title, ts: e.timestamp, confidence: e.confidence })),
      headlines: briefing.headlines.map((h) => ({ tank: h.tank, title: h.title })),
      basis,
    });
  }, [briefing, basis]);

  const transcriptPack = useMemo(
    () =>
      JSON.stringify({
        sides: displayA && displayB ? { a: displayA.name, b: displayB.name } : null,
        rounds: displayRounds.map((r) => ({ round: r.round, aRung: r.aRung, bRung: r.bRung, aMove: r.aMove, bMove: r.bMove })),
        outcome: displayOutcome,
        params: { mode, pressure, rounds, humanSide, seed, startRungs, basisGrade: basis.grade },
      }),
    [displayA, displayB, displayRounds, displayOutcome, mode, pressure, rounds, humanSide, seed, startRungs, basis.grade],
  );

  const runAi = async (kind: "critique" | "narrate" | "brief") => {
    if (!displayA || !displayB || !displayOutcome) return;
    setAi((p) => ({ ...p, busy: kind }));
    try {
      if (kind === "critique") {
        const r = await aiCritique({ aName: displayA.name, bName: displayB.name, outcome: displayOutcome, transcriptJson: transcriptPack, evidenceJson: evidencePack });
        setAi((p) => ({ ...p, critique: r.critique, busy: null }));
      } else if (kind === "narrate") {
        const r = await aiNarrate({ aName: displayA.name, bName: displayB.name, transcriptJson: transcriptPack, evidenceJson: evidencePack });
        setAi((p) => ({ ...p, narrative: r.narrative, busy: null }));
      } else {
        const r = await aiBrief({ aName: displayA.name, bName: displayB.name, outcome: displayOutcome, basisGrade: basis.grade, configJson: transcriptPack, transcriptJson: transcriptPack, evidenceJson: evidencePack });
        setAi((p) => ({ ...p, brief: r.brief, busy: null }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = aiErrorKey(msg);
      const notice = key ? t(key) : msg.slice(0, 140);
      setAi((p) => ({ ...p, busy: null, critique: notice, brief: notice }));
    }
  };

  const persistRun = async () => {
    if (!displayA || !displayB || !displayOutcome) return;
    // Any AI analysis already produced this session is stored with the run
    // (provenance §G31: the saved file is self-contained) — never re-scored.
    const hasAnalysis = !!(ai.critique || ai.narrative || ai.brief);
    const id = await saveWargame({
      title: `${displayA.name} ↔ ${displayB.name} · ${mode} · ×${rounds}`,
      aSlug: displayA.slug,
      bSlug: displayB.slug,
      mode,
      config: JSON.stringify({ mode, pressure, rounds, humanSide, seed, startRungs, basisGrade: basis.grade }),
      transcript: transcriptPack,
      outcome: displayOutcome,
      basisGrade: basis.grade,
      ...(hasAnalysis
        ? {
            analysis: JSON.stringify({ critique: ai.critique ?? null, narrative: ai.narrative ?? null, brief: ai.brief ?? null }),
            model: "deepseek-v4.1",
          }
        : {}),
    });
    setSavedId(String(id));
  };

  // ── Bloc info for display ──
  const blocksInfo = useMemo(
    () => (mode === "BLOC" && actorA && actorB ? { a: buildBloc(actorA, relations, actorsBySlug, startRungs.a), b: buildBloc(actorB, relations, actorsBySlug, startRungs.b) } : null),
    [mode, actorA, actorB, relations, actorsBySlug, startRungs],
  );

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background/97 backdrop-blur" dir={lang === "fa" ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="rounded border border-dashed border-amber-600/60 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-amber-600">
            {t("sim.badge")}
          </span>
          <h2 className="text-sm font-semibold">{t("wg.title")}</h2>
          {basis && (
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${BASIS_STYLE[basis.grade]}`}>
              {t("wg.basis")} {basis.grade}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {savedId && <span className="text-[10px] text-emerald-600">✓ {t("wg.saved")}</span>}
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            ✕
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Left: setup + parameters ── */}
        <aside className="w-72 shrink-0 overflow-y-auto border-e border-border p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("wg.setup")}</p>
          <div className="mt-2 space-y-2">
            {(["A", "B"] as const).map((side) => (
              <div key={side}>
                <p className="mb-1 text-[10px] text-muted-foreground">{side === "A" ? t("wg.sideA") : t("wg.sideB")}</p>
                <select
                  value={side === "A" ? sideAKind : sideBKind}
                  onChange={(e) => {
                    if (side === "A") setSideAKind(e.target.value);
                    else setSideBKind(e.target.value);
                    setRun(null);
                    setMc(null);
                    setAi({ busy: null });
                  }}
                  className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-foreground/40"
                >
                  <option value="">—</option>
                  {actors
                    .slice()
                    .sort((x, y) => x.tier - y.tier || x.name.localeCompare(y.name))
                    .map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {actorDisplayName(a, lang)}
                      </option>
                    ))}
                </select>
              </div>
            ))}
            <div className="flex gap-1">
              {(["PAIR", "BLOC"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md border px-2 py-1 text-[10px] transition-colors ${
                    mode === m ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t(`wg.mode.${m}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("wg.params")}</p>
          <div className="mt-2 space-y-2.5 text-[11px]">
            <div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("wg.pressure")}</span>
                <span className="tabular-nums">{fmtNum(Math.round(pressure * 100), lang)}%</span>
              </div>
              <input type="range" min={0} max={100} value={Math.round(pressure * 100)} onChange={(e) => setPressure(Number(e.target.value) / 100)} className="mt-1 w-full accent-foreground" />
            </div>
            <div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("wg.rounds")}</span>
                <span className="tabular-nums">{fmtNum(rounds, lang)}</span>
              </div>
              <input type="range" min={4} max={14} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="mt-1 w-full accent-foreground" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("wg.humanSide")}</span>
              <div className="flex overflow-hidden rounded-md border border-border">
                {([null, "A", "B"] as const).map((s) => (
                  <button
                    key={String(s)}
                    onClick={() => setHumanSide(s)}
                    className={`px-2 py-0.5 text-[10px] ${humanSide === s ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {s === null ? t("ego.off") : s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("wg.seed")}</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Math.max(1, Number(e.target.value) || 1))}
                className="h-7 w-20 rounded border border-border bg-card px-1.5 text-end text-[11px] tabular-nums outline-none focus:border-foreground/40"
              />
            </div>
            {/* Calibrated start (evidence-based, overridable) */}
            <div className="rounded-md border border-border/60 p-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("wg.calibrated")}</span>
                {startOverride && (
                  <button className="text-[10px] underline decoration-dotted hover:text-foreground" onClick={() => setStartOverride(null)}>
                    {t("btn.reset")}
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2">
                {(["a", "b"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-1">
                    <span className={`size-2 rounded-full ${RUNG_COLOR(startRungs[k])}`} />
                    <select
                      value={startRungs[k]}
                      onChange={(e) => setStartOverride({ ...startRungs, [k]: Number(e.target.value) })}
                      className="h-6 rounded border border-border bg-card px-1 text-[10px] tabular-nums outline-none"
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Launch */}
          <div className="mt-3 space-y-1.5">
            <Button size="sm" className="w-full text-[11px]" disabled={!sides} onClick={launchAuto}>
              ▶ {t("wg.run")}
            </Button>
            <Button variant="outline" size="sm" className="w-full text-[11px]" disabled={!sides} onClick={startLive}>
              {t("wg.play")}
            </Button>
          </div>

          {/* Live evidence briefing */}
          {briefing && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("wg.briefing")}</p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                {t("wg.briefingMeta", {
                  events: fmtNum(briefing.recentEvents.length, lang),
                  heads: fmtNum(briefing.headlines.length, lang),
                })}
              </p>
              <ul className="mt-1.5 space-y-1">
                {briefing.recentEvents.slice(0, 4).map((e) => (
                  <li key={e._id} className="truncate text-[10px] text-muted-foreground">
                    <span className={`me-1 inline-block size-1.5 rounded-full ${RUNG_COLOR(4)}`} />
                    {e.title}
                  </li>
                ))}
                {briefing.headlines.slice(0, 3).map((h, i) => (
                  <li key={i} className="truncate text-[10px] text-muted-foreground">
                    <span className="me-1 opacity-60">📰</span>
                    {h.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {basis.reasons.length > 0 && (
            <p className="mt-3 rounded-md border border-border/60 p-2 text-[9.5px] leading-3.5 text-muted-foreground">
              {t("wg.basisNote")}: {basis.reasons.join(", ")}
            </p>
          )}
        </aside>

        {/* ── Center: board ── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
          {!sides && (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-sm text-center">
                <p className="text-sm font-medium">{t("wg.pickTwo")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("wg.pickHint")}</p>
              </div>
            </div>
          )}

          {sides && (
            <>
              {/* Side headers + rungs */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="text-end">
                  <p className="truncate text-sm font-semibold">{sides.a.name}</p>
                  {blocksInfo && <p className="text-[10px] text-muted-foreground">{blocksInfo.a.members.length} {t("wg.members")}</p>}
                </div>
                <span className="text-[10px] uppercase text-muted-foreground">vs</span>
                <div>
                  <p className="truncate text-sm font-semibold">{sides.b.name}</p>
                  {blocksInfo && <p className="text-[10px] text-muted-foreground">{blocksInfo.b.members.length} {t("wg.members")}</p>}
                </div>
              </div>

              {/* Escalation chart */}
              <div className="mt-4 rounded-md border border-amber-600/30 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {liveA ? t("wg.liveRounds", { n: fmtNum(liveRounds.length, lang), total: fmtNum(rounds, lang) }) : t("wg.board")}
                  </p>
                  {displayOutcome && (
                    <span className="rounded bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background">
                      {t(OUTCOME_KEY[displayOutcome])}
                    </span>
                  )}
                </div>
                {displayRounds.length > 0 ? (
                  <div className="mt-2 flex items-end gap-1.5" role="img" aria-label={t("wg.board")}>
                    {displayRounds.map((r) => (
                      <div key={r.round} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 72 }}>
                          <div className={`w-3 rounded-t-sm ${RUNG_COLOR(r.aRung)}`} style={{ height: 6 + r.aRung * 9 }} title={`${sides.a.name}: ${r.aRung}`} />
                          <div className={`w-3 rounded-t-sm ${RUNG_COLOR(r.bRung)}`} style={{ height: 6 + r.bRung * 9 }} title={`${sides.b.name}: ${r.bRung}`} />
                        </div>
                        <span className="text-[8px] tabular-nums text-muted-foreground">
                          {lang === "fa" ? toFaDigits(r.round) : r.round}
                          <span className="ms-0.5 opacity-50">+{r.simTimeDays}d</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-center text-xs text-muted-foreground">{t("wg.pressRun")}</p>
                )}
                {/* current rung row */}
                {displayA && displayB && (
                  <div className="mt-2 flex items-center justify-between border-t border-amber-600/20 pt-2 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className={`size-2.5 rounded-full ${RUNG_COLOR(displayA.rung)}`} />
                      {t("ladder.rung")} {displayA.rung}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {t("ladder.rung")} {displayB.rung}
                      <span className={`size-2.5 rounded-full ${RUNG_COLOR(displayB.rung)}`} />
                    </span>
                  </div>
                )}
              </div>

              {/* Interactive command row */}
              {liveA && !liveDone && (
                <div className="mt-3 rounded-md border border-border p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {t("wg.command", { side: humanSide ?? "—" })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {HUMAN_MOVES.map((mv) => (
                      <Button
                        key={mv.key}
                        variant={mv.dRung > 0 ? "default" : mv.dRung < 0 ? "outline" : "secondary"}
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => (humanSide ? playCommand(mv.key) : engineStep())}
                        disabled={!!humanSide && (humanSide === "A" ? displayA!.rung + mv.dRung < 0 : displayB!.rung + mv.dRung < 0)}
                        title={humanSide ? undefined : t("wg.autoHint")}
                      >
                        {t(mv.labelKey)} {mv.dRung > 0 ? `+${mv.dRung}` : mv.dRung || ""}
                      </Button>
                    ))}
                  </div>
                  {!humanSide && <p className="mt-1.5 text-[9.5px] text-muted-foreground">{t("wg.autoMode")}</p>}
                </div>
              )}

              {/* Monte-Carlo fan */}
              {mc && (
                <div className="mt-3 rounded-md border border-border p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {t("wg.mc")} · {fmtNum(mc.runs, lang)} {t("wg.runs")} · {t("wg.seed")} {fmtNum(mc.seed, lang)}
                  </p>
                  <div className="mt-2 flex items-end gap-1" role="img">
                    {mc.fan.map((f, i) => {
                      const fb = mc.fanB[i];
                      const maxH = 40;
                      return (
                        <div key={i} className="relative min-w-0 flex-1" style={{ height: maxH + 10 }}>
                          {/* A band */}
                          <div
                            className="absolute w-full rounded-sm bg-sky-600/30"
                            style={{ bottom: 10 + f.p10 * 4, height: Math.max(2, (f.p90 - f.p10) * 4) }}
                          />
                          <div className="absolute w-full" style={{ bottom: 10 + f.p50 * 4 }}>
                            <div className="h-0.5 w-full bg-sky-600" />
                          </div>
                          {/* B band */}
                          <div
                            className="absolute w-full rounded-sm bg-amber-600/30"
                            style={{ bottom: 10 + fb.p10 * 4, height: Math.max(2, (fb.p90 - fb.p10) * 4) }}
                          />
                          <div className="absolute w-full" style={{ bottom: 10 + fb.p50 * 4 }}>
                            <div className="h-0.5 w-full bg-amber-600" />
                          </div>
                          <span className="absolute inset-x-0 bottom-0 text-center text-[7px] tabular-nums text-muted-foreground">
                            {i}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 pt-1.5 text-[9px] text-muted-foreground">
                    {(Object.entries(mc.outcomes) as Array<[WargameOutcome, number]>)
                      .filter(([, n]) => n > 0)
                      .sort((x, y) => y[1] - x[1])
                      .map(([k, n]) => (
                        <span key={k}>
                          {t(OUTCOME_KEY[k])}: <b className="tabular-nums">{fmtNum(Math.round((n / mc.runs) * 100), lang)}%</b>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Actions row */}
              {displayOutcome && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => void persistRun()}>
                    ⬇ {t("wg.saveRun")}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" disabled={ai.busy !== null} onClick={() => void runAi("critique")}>
                    {ai.busy === "critique" ? "…" : t("wg.aiCritique")}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" disabled={ai.busy !== null} onClick={() => void runAi("narrate")}>
                    {ai.busy === "narrate" ? "…" : t("wg.aiNarrative")}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" disabled={ai.busy !== null} onClick={() => void runAi("brief")}>
                    {ai.busy === "brief" ? "…" : t("wg.aiBrief")}
                  </Button>
                </div>
              )}

              {/* AI analysis (Persian, SIMULATION-class output) */}
              {(ai.critique || ai.narrative || ai.brief) && (
                <div className="mt-3 space-y-2">
                  {(["brief", "critique", "narrative"] as const).map((k) =>
                    ai[k] ? (
                      <div key={k} className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                            {k === "critique" ? t("wg.aiCritique") : k === "narrative" ? t("wg.aiNarrative") : t("wg.aiBrief")}
                          </p>
                          <span className="rounded border border-dashed border-violet-500/50 px-1 text-[7.5px] font-bold uppercase text-violet-600 dark:text-violet-400">
                            AI · SIMULATION
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-start text-[11px] leading-5" dir="rtl">
                          {ai[k]}
                        </p>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {/* ── Right: saved runs ── */}
        <aside className="w-60 shrink-0 overflow-y-auto border-s border-border p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t("wg.saved")}</p>
          <div className="mt-2 space-y-1.5">
            {savedRuns === undefined && <div className="h-10 animate-pulse rounded bg-muted/50" />}
            {savedRuns?.length === 0 && <p className="text-[10px] text-muted-foreground">{t("change.empty")}</p>}
            {savedRuns?.map((w) => (
              <div key={w._id} className="rounded-md border border-border/60 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="shrink-0 rounded border border-dashed border-amber-600/60 px-1 text-[7.5px] font-bold uppercase text-amber-600">
                    SIM
                  </span>
                  <span className="shrink-0 text-[8.5px] text-muted-foreground">{fmtAgo(w.ts, lang)}</span>
                </div>
                <p className="mt-1 truncate text-[10.5px]">{w.title}</p>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">
                    {t(OUTCOME_KEY[w.outcome as WargameOutcome] ?? "sim.out.stalemate")} · {w.basisGrade}
                  </span>
                  <button
                    className="text-[9px] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      try {
                        const cfg = JSON.parse(w.config) as { mode: "PAIR" | "BLOC"; pressure: number; rounds: number; humanSide: "A" | "B" | null; seed: number; startRungs: { a: number; b: number }; basisGrade: string };
                        setMode(cfg.mode);
                        setPressure(cfg.pressure);
                        setRounds(cfg.rounds);
                        setHumanSide(cfg.humanSide);
                        setSeed(cfg.seed);
                        setStartOverride(cfg.startRungs);
                        setSideAKind(w.aSlug);
                        setSideBKind(w.bSlug);
                      } catch {
                        /* ignore corrupt */
                      }
                    }}
                  >
                    {t("sim.load")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
