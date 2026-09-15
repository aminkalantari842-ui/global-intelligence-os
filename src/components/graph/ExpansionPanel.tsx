// §8 Network-expansion UI — the minimal professional option list shown when a
// node is selected. Selecting a dimension runs the deterministic web-search +
// AI extraction pipeline, renders the proposal for review (every candidate
// with its sources), and commits accepted items as real child nodes + edges.
// Proposals are data, never auto-applied (rule: AI proposes, evidence commits).

import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FunctionArgs } from "convex/server";
import { useI18n } from "@/i18n/context";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtNum } from "./metrics";
import { aiErrorKey } from "@/lib/aiError";
import type { GraphActor, GraphRelation } from "./types";
import {
  Check,
  ChevronRight,
  ExternalLink,
  Handshake,
  Landmark,
  Loader2,
  Package,
  Radio,
  Sparkles,
  Swords,
  TrendingUp,
  X,
} from "lucide-react";

type CommitArgs = FunctionArgs<typeof api.searchExpansion.commitExpansion>;
type CommitCandidate = CommitArgs["candidates"][number];

interface RawCandidate {
  name: string;
  kind: string;
  country: string;
  region: string;
  existingActorSlug?: string;
  relation: string;
  direction: "PARENT_SOURCE" | "PARENT_TARGET";
  weight: number;
  confidence: number;
  status: string;
  summary: string;
  sources: Array<{ publication: string; title: string; url: string; date: string }>;
}

interface Proposal {
  candidates: RawCandidate[];
  searchQueries: string[];
  resultCount: number;
  model: string;
}

const DIMENSIONS = [
  { key: "ALLIES", icon: Handshake },
  { key: "RIVALS", icon: Swords },
  { key: "INSTITUTIONS", icon: Landmark },
  { key: "SUPPLY", icon: Package },
  { key: "MEDIA", icon: Radio },
  { key: "MARKETS", icon: TrendingUp },
] as const;

type Phase =
  | { status: "idle" }
  | { status: "running"; stage: "search" | "extract"; dimension: string }
  | { status: "review"; proposal: Proposal; dimension: string }
  | { status: "committing" }
  | { status: "done"; added: number }
  | { status: "error"; message: string };

export function ExpansionPanel({
  actor,
  actorsBySlug,
  allRelations,
  onCommitted,
}: {
  actor: GraphActor;
  actorsBySlug: Map<string, GraphActor>;
  allRelations: GraphRelation[];
  onCommitted?: (createdSlugs: string[]) => void;
}) {
  const { t, lang } = useI18n();
  const propose = useAction(api.searchExpansion.proposeExpansion);
  const commit = useMutation(api.searchExpansion.commitExpansion);
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const run = async (dimension: string) => {
    if (phase.status === "running" || phase.status === "committing") return;
    setPhase({ status: "running", stage: "search", dimension });
    setSelected(new Set());
    try {
      // Two-stage progress feedback; the single server call performs both.
      setTimeout(
        () =>
          setPhase((p) =>
            p.status === "running" && p.stage === "search"
              ? { ...p, stage: "extract" }
              : p,
          ),
        2500,
      );
      const proposal = (await propose({
        actorSlug: actor.slug,
        // Search/prompt use the Latin form: the source corpus and web queries
        // are overwhelmingly English, while the UI displays the Persian name.
        actorName: actor.nameEn ?? actor.name,
        actorKind: actor.kind,
        actorCountry: actor.country,
        dimension: dimension as never,
        existingActors: [...actorsBySlug.values()].map((a) => ({
          slug: a.slug,
          name: a.name,
        })),
        existingRelations: allRelations.map((r) => ({
          sourceSlug: r.sourceSlug,
          targetSlug: r.targetSlug,
          kind: r.kind,
        })),
      })) as unknown as Proposal;
      const keep = proposal.candidates
        .map((c, i) => (c.existingActorSlug ? -1 : i))
        .filter((i) => i >= 0);
      setPhase({ status: "review", proposal, dimension });
      // Pre-select new nodes only; links to existing actors stay opt-in.
      setSelected(new Set(proposal.candidates.map((_, i) => (keep.includes(i) ? i : -1)).filter((i) => i >= 0)));
      if (proposal.candidates.length === 0) {
        setPhase({
          status: "error",
          message: t("exp.noCandidates"),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = aiErrorKey(msg);
      setPhase({
        status: "error",
        message: msg.includes("NO_SEARCH_RESULTS")
          ? t("exp.noResults")
          : key
            ? t(key)
            : t("ai.error"),
      });
    }
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const commitSelected = async () => {
    if (phase.status !== "review") return;
    const picked = [...selected]
      .sort((a, b) => a - b)
      .map((i) => phase.proposal.candidates[i])
      .filter(Boolean);
    if (picked.length === 0) return;
    setPhase({ status: "committing" });
    try {
      const res = await commit({
        parentSlug: actor.slug,
        candidates: picked.map(
          (c) =>
            ({
              name: c.name,
              kind: c.kind,
              country: c.country,
              region: c.region,
              ...(c.existingActorSlug ? { existingActorSlug: c.existingActorSlug } : {}),
              relation: c.relation,
              direction: c.direction,
              weight: Number(c.weight) || 40,
              confidence: Number(c.confidence) || 40,
              status: c.status,
              summary: c.summary,
              sources: c.sources,
            }) as CommitCandidate,
        ),
      });
      if (res.added > 0) {
        setPhase({ status: "done", added: res.added });
        onCommitted?.(res.createdSlugs);
        setTimeout(() => setPhase({ status: "idle" }), 4000);
      } else {
        setPhase({ status: "error", message: t("exp.allDup") });
      }
    } catch {
      setPhase({ status: "error", message: t("ai.error") });
    }
  };

  const running = phase.status === "running";
  const review = phase.status === "review" ? phase.proposal : null;

  return (
    <div className="rounded-md border border-border/70 bg-card px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("exp.title")}
        </p>
        <span className="flex items-center gap-1 rounded border border-dashed border-violet-500/50 bg-violet-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
          <Sparkles className="size-2.5" />
          {t("exp.badge")}
        </span>
      </div>

      {/* ── Minimal dimension list ── */}
      {!review && (
        <ul className="mt-2 divide-y divide-border/50">
          {DIMENSIONS.map(({ key, icon: Icon }) => {
            const active = running && phase.dimension === key;
            return (
              <li key={key}>
                <button
                  onClick={() => void run(key)}
                  disabled={running || phase.status === "committing"}
                  className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-start transition-colors ${
                    active ? "bg-muted" : "hover:bg-muted/60"
                  } disabled:cursor-wait disabled:opacity-60`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded border border-border/70 bg-background text-muted-foreground transition-colors group-hover:text-foreground ${
                      active ? "text-foreground" : ""
                    }`}
                  >
                    {active ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Icon className="size-3" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {t(`exp.dim.${key}`)}
                  </span>
                  {active ? (
                    <span className="shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground">
                      {phase.stage === "search" ? t("exp.searching") : t("exp.extracting")}
                    </span>
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Review: extracted candidates with sources ── */}
      {review && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {t("exp.found", {
                count: fmtNum(review.candidates.length, lang),
                sources: fmtNum(review.resultCount, lang),
              })}
            </span>
            <button
              className="underline decoration-dotted hover:text-foreground"
              onClick={() =>
                setSelected(
                  selected.size === review.candidates.length
                    ? new Set()
                    : new Set(review.candidates.map((_, i) => i)),
                )
              }
            >
              {selected.size === review.candidates.length ? t("exp.clearAll") : t("exp.selectAll")}
            </button>
          </div>
          <ul className="mt-1.5 space-y-1">
            {review.candidates.map((c, i) => {
              const exists = !!c.existingActorSlug;
              const on = selected.has(i);
              return (
                <li key={i}>
                  <button
                    onClick={() => toggle(i)}
                    className={`w-full rounded-md border px-2 py-1.5 text-start transition-colors ${
                      on ? "border-foreground/40 bg-muted/60" : "border-border/60 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`flex size-3.5 shrink-0 items-center justify-center rounded-sm border ${
                          on ? "border-foreground bg-foreground text-background" : "border-border"
                        }`}
                      >
                        {on && <Check className="size-2.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                        {c.name}
                      </span>
                      {exists && (
                        <span className="shrink-0 rounded bg-muted px-1 py-px text-[8px] uppercase tracking-wider text-muted-foreground">
                          {t("exp.link")}
                        </span>
                      )}
                      <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                        {fmtNum(Math.round(c.confidence), lang)}%
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 ps-5 text-[10px] leading-3.5 text-muted-foreground">
                      {c.summary}
                    </p>
                    <div className="mt-1 flex items-center gap-1 ps-5">
                      <span className="rounded-sm bg-muted px-1 py-px text-[8px] uppercase tracking-wider text-muted-foreground">
                        {t(`rel.${c.relation}`) ?? c.relation}
                      </span>
                      {c.sources.slice(0, 2).map((s, j) => (
                        <a
                          key={j}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-w-0 items-center gap-0.5 text-[9px] text-muted-foreground underline decoration-dotted hover:text-foreground"
                        >
                          <ExternalLink className="size-2.5 shrink-0" />
                          <span className="max-w-28 truncate">{s.publication}</span>
                        </a>
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 flex-1 text-[10px]"
              disabled={selected.size === 0 || phase.status === "committing"}
              onClick={() => void commitSelected()}
            >
              {phase.status === "committing" ? (
                <Loader2 className="me-1 size-3 animate-spin" />
              ) : (
                <Check className="me-1 size-3" />
              )}
              {phase.status === "committing"
                ? t("exp.committing")
                : t("exp.commit", { count: fmtNum(selected.size, lang) })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[10px]"
              disabled={phase.status === "committing"}
              onClick={() => setPhase({ status: "idle" })}
            >
              <X className="size-3" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Outcomes ── */}
      {phase.status === "done" && (
        <p className="mt-2 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-700 dark:text-emerald-400">
          ✓ {t("exp.committed", { count: fmtNum(phase.added, lang) })}
        </p>
      )}
      {phase.status === "error" && (
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{phase.message}</p>
      )}

      <p className="mt-2 text-[8.5px] leading-3 text-muted-foreground">{t("exp.disclaimer")}</p>
    </div>
  );
}
