// §Evidence flow UI — propose a publication's claim as a relationEvent
// candidate. Lives inside the article reader: analyst clicks "Propose as
// evidence", the AI extraction action returns claim candidates grounded in
// the article text, each is reviewed (resolve actors to canonical graph
// nodes, pick relation kind/event type/direction) and committed as a
// REPORTED_CLAIM event on the chosen edge. AI proposes; the analyst and the
// deterministic commit guard decide — nothing enters the graph unreviewed.

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Network, Quote, X } from "lucide-react";

type Candidate = {
  sourceSlug: string;
  targetSlug: string;
  sourceName: string;
  targetName: string;
  actorResolved: boolean;
  kind: string;
  eventType: string;
  summary: string;
  quote: string;
  stance: string;
};

const KINDS = [
  "ALLIANCE", "COOPERATION", "NEGOTIATION", "SUPPLY", "PROXY_SUPPORT",
  "COMPETITION", "TENSION", "SANCTIONS", "CONFLICT", "INTERDEPENDENCE",
  "MEDIATION", "DETERRENCE", "NON_AGGRESSION", "TREATY", "SECURITY_CONSULT",
  "INTEL_SHARING", "TRANSIT_ACCESS", "DEBT_AID", "DEPENDENCY",
];

const EVENT_TYPES = [
  "STATEMENT", "MEETING", "SANCTION", "STRIKE", "TRANSFER", "REPORT",
  "AGREEMENT", "POSTURE", "TREATY_SIGNED", "MILITARY_EXERCISE", "MISSILE_TEST",
  "DIPLOMATIC_SUMMIT", "AMBASSADOR_RECALL", "RELATIONS_SEVERED", "WITHDRAWAL",
  "RECOGNITION", "CYBER_ATTACK",
];

const stanceColor: Record<string, string> = {
  CORROBORATING: "bg-emerald-500/15 text-emerald-600",
  REPORTING: "bg-sky-500/15 text-sky-600",
  SKEPTICAL: "bg-amber-500/15 text-amber-600",
};

// ─── One candidate row ──────────────────────────────────────────────────────

function CandidateCard({
  c,
  index,
  total,
  pubId,
  onPrev,
  onNext,
}: {
  c: Candidate;
  index: number;
  total: number;
  pubId: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t, lang } = useI18n();
  const roster = useQuery(api.evidenceFlow.getActorRoster);
  const graph = useQuery(api.graph.getGraph);
  const commit = useMutation(api.evidenceFlow.commitClaim);

  const [a, setA] = useState(c.sourceSlug);
  const [b, setB] = useState(c.targetSlug);
  const [kind, setKind] = useState(KINDS.includes(c.kind) ? c.kind : "COOPERATION");
  const [eventType, setEventType] = useState(
    EVENT_TYPES.includes(c.eventType) ? c.eventType : "REPORT",
  );
  const [summary, setSummary] = useState(c.summary);
  const [state, setState] = useState<"idle" | "busy" | "done" | "dupe" | "error">("idle");
  const [err, setErr] = useState("");

  const actors = roster ?? [];
  const nameOf = (slug: string) => actors.find((x) => x.slug === slug)?.name ?? slug;

  const edge = useMemo(() => {
    if (!graph || !a || !b || a === b) return null;
    return (
      graph.relations.find(
        (r) =>
          (r.sourceSlug === a && r.targetSlug === b) ||
          (r.sourceSlug === b && r.targetSlug === a),
      ) ?? null
    );
  }, [graph, a, b]);

  const ready = a && b && a !== b && edge && state === "idle";

  const doCommit = async () => {
    if (!edge) return;
    setState("busy");
    setErr("");
    try {
      await commit({
        pubId: pubId as never,
        relationId: edge._id,
        eventType,
        title: summary,
        summary,
        quote: c.quote,
        stance: c.stance,
        actorALabel: nameOf(a),
        actorBLabel: nameOf(b),
      });
      setState("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("DUPLICATE")) setState("dupe");
      else {
        setState("error");
        setErr(msg.slice(0, 120));
      }
    }
  };

  const sel =
    "w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3" dir={lang === "fa" ? "rtl" : "ltr"}>
      {/* header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold ${stanceColor[c.stance] ?? stanceColor.REPORTING}`}>
            {c.stance}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {t("ev.candidate")} {lang === "fa" ? `${index + 1}/${total}` : `${index + 1} / ${total}`}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={onPrev} disabled={index === 0} className="rounded p-0.5 text-muted-foreground disabled:opacity-30 hover:text-foreground" aria-label="prev">
            {lang === "fa" ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          </button>
          <button onClick={onNext} disabled={index === total - 1} className="rounded p-0.5 text-muted-foreground disabled:opacity-30 hover:text-foreground" aria-label="next">
            {lang === "fa" ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* actor resolution */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{t("ev.actorA")}</span>
          <select className={sel} value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">{t("ev.none")}</option>
            {actors.map((x) => (
              <option key={x.slug} value={x.slug}>{x.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{t("ev.actorB")}</span>
          <select className={sel} value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">{t("ev.none")}</option>
            {actors.map((x) => (
              <option key={x.slug} value={x.slug}>{x.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{t("ev.kind")}</span>
          <select className={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{t(`rel.${k}`) ?? k}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{t("ev.eventType")}</span>
          <select className={sel} value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {EVENT_TYPES.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>

      {/* editable title/summary */}
      <label className="mt-2 block">
        <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{t("ev.summary")}</span>
        <input
          className={sel}
          value={summary}
          maxLength={220}
          onChange={(e) => setSummary(e.target.value)}
        />
      </label>

      {/* quote */}
      {c.quote && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-[10.5px] leading-5 text-muted-foreground">
          <Quote className="mt-0.5 size-3 shrink-0" />
          <span className="line-clamp-3 italic">{c.quote}</span>
        </p>
      )}

      {/* edge status + commit */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {state === "done" ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
            <Check className="size-3.5" /> {t("ev.committed")}
          </span>
        ) : state === "dupe" ? (
          <span className="text-[11px] text-amber-600">{t("ev.dupe")}</span>
        ) : !edge && a && b ? (
          <span className="text-[10.5px] leading-4 text-amber-600">{t("ev.noEdge")}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {a && b ? (lang === "fa" ? `${nameOf(a)} → ${nameOf(b)}` : `${nameOf(a)} → ${nameOf(b)}`) : t("ev.pickActors")}
          </span>
        )}
        {state === "error" && <span className="text-[10px] text-red-500">{err}</span>}
        <button
          onClick={() => void doCommit()}
          disabled={!ready}
          className="flex shrink-0 items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[10.5px] font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
        >
          {state === "busy" ? <Loader2 className="size-3 animate-spin" /> : <Network className="size-3" />}
          {t("ev.commit")}
        </button>
      </div>
    </div>
  );
}

// ─── Panel with extraction trigger ──────────────────────────────────────────

export function EvidenceFlow({
  pubId,
  title,
  text,
}: {
  pubId: string;
  title: string;
  text: string;
}) {
  const { t, lang } = useI18n();
  const roster = useQuery(api.evidenceFlow.getActorRoster);
  const propose = useAction(api.evidenceFlow.proposeClaimCandidates);

  const [phase, setPhase] = useState<"idle" | "busy" | "review" | "empty" | "error">("idle");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState("");

  const run = async () => {
    if (!roster || roster.length === 0) return;
    setPhase("busy");
    setErr("");
    try {
      const out = (await propose({
        title,
        summary: "",
        articleText: text,
        actors: roster,
      })) as Candidate[];
      if (out.length === 0) {
        setPhase("empty");
      } else {
        setCandidates(out);
        setIdx(0);
        setPhase("review");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 140) : "error");
      setPhase("error");
    }
  };

  return (
    <div className="border-b border-border px-4 py-2.5">
      {phase === "idle" && (
        <button
          onClick={() => void run()}
          className="flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-600 transition-colors hover:bg-sky-500/20"
        >
          <Network className="size-3.5" /> {t("ev.propose")}
        </button>
      )}

      {phase === "busy" && (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {t("ev.extracting")}
        </span>
      )}

      {phase === "empty" && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t("ev.empty")}</span>
          <button onClick={() => setPhase("idle")} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="reset">
            <X className="size-3" />
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-red-500">{err || t("ev.failed")}</span>
          <button onClick={() => setPhase("idle")} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="reset">
            <X className="size-3" />
          </button>
        </div>
      )}

      {phase === "review" && candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-600">{t("ev.title")}</p>
          <CandidateCard
            c={candidates[idx]}
            index={idx}
            total={candidates.length}
            pubId={pubId}
            onPrev={() => setIdx((v) => Math.max(0, v - 1))}
            onNext={() => setIdx((v) => Math.min(candidates.length - 1, v + 1))}
          />
        </div>
      )}
    </div>
  );
}
