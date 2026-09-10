import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import ActorGraph from "@/components/graph/ActorGraph";
import type { GraphRelation } from "@/components/graph/types";
import { ArrowRight, Check, FileSearch, GitFork, ShieldCheck } from "lucide-react";

const fadeSlow = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

function Mark({ className = "size-5" }: { className?: string }) {
  return (
    <span
      className={`flex items-center justify-center rounded-md bg-foreground text-[10px] font-bold tracking-tight text-background ${className}`}
    >
      GI
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {children && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{children}</p>
      )}
    </div>
  );
}

export default function Landing() {
  const graph = useQuery(api.graph.getGraph);
  const stats = useQuery(api.graph.getStats);
  const seed = useMutation(api.graph.seedIfEmpty);

  // Idempotent first-boot seeding, kept out of the render pass.
  const needsSeed = graph !== undefined && graph.actors.length === 0;
  useEffect(() => {
    if (needsSeed) void seed();
  }, [needsSeed, seed]);

  const [demoTick, setDemoTick] = useState(0);

  // Gentle demo loop: rotate the highlighted edge every few seconds.
  useEffect(() => {
    if (!graph || graph.relations.length === 0) return;
    const id = window.setInterval(() => setDemoTick((t) => t + 1), 4200);
    return () => window.clearInterval(id);
  }, [graph === undefined]);

  const demoRels = useMemo(
    () => (graph?.relations ?? []).filter((r) => r.weight > 0),
    [graph?.relations],
  );
  const demoRel: GraphRelation | null =
    demoRels.length > 0 ? demoRels[demoTick % demoRels.length] : null;

  const demoHighlight = demoRel
    ? demoTick % 2 === 0
      ? demoRel.sourceSlug
      : demoRel.targetSlug
    : null;

  const nameOf = (slug: string) =>
    graph?.actors.find((a) => a.slug === slug)?.name ?? slug;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="text-sm font-semibold tracking-tight">
              Global Intelligence OS
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
            <a href="#graph" className="transition-colors hover:text-foreground">Graph</a>
            <a href="#method" className="transition-colors hover:text-foreground">Method</a>
            <a href="#evidence" className="transition-colors hover:text-foreground">Evidence</a>
            <a href="#access" className="transition-colors hover:text-foreground">Access</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth" className="text-xs">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth?returnTo=%2Fdashboard" className="text-xs">
                Request access
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero: the graph, first glance ──────────────────────────────── */}
      <section id="graph" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <motion.div {...fadeSlow} className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Actor Relationship Intelligence · Enterprise
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            The map of who moves whom.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            A relationship graph of geopolitical actors — states, institutions,
            networks — where every edge is backed by a traceable evidence trail.
            No assertions without attribution.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3">
            <Button asChild size="sm" className="h-9 px-4">
              <Link to="/auth?returnTo=%2Fdashboard" className="gap-1.5 text-xs">
                Open the graph
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 px-4">
              <a href="#method" className="text-xs">How confidence is built</a>
            </Button>
          </div>
        </motion.div>

        {/* Hero graph — the centerpiece */}
        <motion.div
          {...fadeSlow}
          transition={{ duration: 0.6, delay: 0.12, ease: "easeOut" }}
          className="mx-auto mt-12 max-w-4xl"
        >
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <GitFork className="size-3.5" />
                  Actor Relationship Graph
                </span>
                <span className="hidden sm:inline">
                  {graph
                    ? `${graph.actors.length} actors · ${graph.relations.length} edges`
                    : "loading…"}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {demoRel
                  ? `${nameOf(demoRel.sourceSlug)} ↔ ${nameOf(demoRel.targetSlug)}`
                  : "live sample"}
              </span>
            </div>
            <div className="h-[440px] bg-white sm:h-[500px]">
              {graph && graph.actors.length > 0 ? (
                <ActorGraph
                  actors={graph.actors}
                  relations={graph.relations}
                  selectedSlug={demoHighlight}
                  onSelect={() => {}}
                  onEdgeSelect={() => {}}
                  focusMode
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto size-6 animate-spin rounded-full border border-border border-t-foreground/60" />
                    <p className="mt-3 text-xs text-muted-foreground">Rendering graph…</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-[10px] text-muted-foreground">
              <span>Every edge carries a confidence score and typed sources.</span>
              <span className="tabular-nums">
                {graph ? `${graph.relations.length} live edges` : "—"}
              </span>
            </div>
          </div>
          <p className="mt-3 text-center text-[10px] text-muted-foreground/70">
            Interactive sample · drag nodes, scroll to zoom, click an edge to inspect it
            in the console.
          </p>
        </motion.div>
      </section>

      {/* ── Proof strip ────────────────────────────────────────────────── */}
      <section className="border-y border-border/70 bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
          {(
            [
              ["Actors under watch", graph ? String(graph.actors.length) : "—"],
              ["Evidence-backed edges", graph ? String(graph.relations.length) : "—"],
              [
                "Corroborated ties",
                stats !== undefined ? `${stats.corroboratedShare}%` : "—",
              ],
              ["Traceable events", stats ? String(stats.evidenceCount) : "—"],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Method ─────────────────────────────────────────────────────── */}
      <section id="method" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeSlow}>
          <SectionHeading eyebrow="Method" title="Edges are earned, not assumed.">
            Confidence is computed deterministically from source quality,
            corroboration and freshness. The graph never invents a relationship; it
            renders what the evidence supports — and marks what it disputes.
          </SectionHeading>
        </motion.div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {(
            [
              {
                icon: FileSearch,
                title: "Typed sources",
                body: "Each event cites publication, URL, date, and a stance: corroborating, reporting, or skeptical.",
              },
              {
                icon: GitFork,
                title: "Disagreement preserved",
                body: "Conflicting assessments become disputed records — surfaced in the graph, never silently merged.",
              },
              {
                icon: ShieldCheck,
                title: "Deterministic scoring",
                body: "Confidence and intensity are model outputs, not model opinions. Recompute the pipeline, get the same number.",
              },
            ] as const
          ).map((card) => (
            <div key={card.title} className="bg-card p-6">
              <card.icon className="size-5 text-foreground" strokeWidth={1.5} />
              <p className="mt-4 text-sm font-semibold">{card.title}</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Evidence walkthrough ───────────────────────────────────────── */}
      <section id="evidence" className="border-y border-border/70 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div {...fadeSlow}>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Evidence trail
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Click any edge. Read the receipts.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Every relationship opens into a timestamped trail of events. Every
                event is labeled observed fact, reported claim, or assessment — and
                links to the original publication.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Typed sources with stance on every claim",
                  "Claim labels: observed / reported / assessment",
                  "Confidence shown per event, recomputed on arrival",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <span className="text-muted-foreground">{t}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" size="sm" className="mt-7 h-9 px-4">
                <Link to="/auth?returnTo=%2Fdashboard" className="gap-1.5 text-xs">
                  Inspect an edge
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </motion.div>

            <motion.div {...fadeSlow} className="rounded-lg border border-border bg-card p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Sample edge record
              </p>
              <div className="mt-3 rounded-md border border-border/70 p-3">
                <p className="text-xs font-medium">
                  {demoRel
                    ? `${nameOf(demoRel.sourceSlug)} ↔ ${nameOf(demoRel.targetSlug)}`
                    : "Loading sample…"}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {demoRel?.summary ?? ""}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-md border border-border/70 p-2.5">
                  <p className="text-muted-foreground">Confidence</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {demoRel ? `${demoRel.confidence}%` : "—"}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 p-2.5">
                  <p className="text-muted-foreground">Independent sources</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {demoRel ? demoRel.sourceCount : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-border/70 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Status
                </p>
                <p className="mt-1.5 text-xs font-medium">
                  {demoRel ? demoRel.status.replace("_", " ") : "—"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Reuters · AP · IAEA · open-source trackers — cited per event in the
                  console.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Access ─────────────────────────────────────────────────────── */}
      <section id="access" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeSlow}>
          <SectionHeading eyebrow="Access" title="Built for institutional teams.">
            Analyst desks, due-diligence units, and policy shops that need the
            relationship layer under their own workflow.
          </SectionHeading>
        </motion.div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-3">
          {(
            [
              {
                name: "Desk",
                desc: "Single-analyst access to the live graph and evidence trails.",
                items: ["Full graph console", "Evidence inspection", "Email support"],
                featured: false,
              },
              {
                name: "Team",
                desc: "Shared watchlists and annotations for research units.",
                items: ["Everything in Desk", "Shared workspaces", "Export to PDF/CSV"],
                featured: true,
              },
              {
                name: "Institution",
                desc: "API access and private ingestion of your own sources.",
                items: ["Everything in Team", "REST + export API", "Private connectors"],
                featured: false,
              },
            ] as const
          ).map((tier) => (
            <motion.div
              key={tier.name}
              {...fadeSlow}
              className={`rounded-lg border p-6 ${
                tier.featured ? "border-foreground/40" : "border-border"
              } bg-card`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{tier.name}</p>
                {tier.featured && (
                  <span className="rounded-full border border-foreground/30 px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                    Most common
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{tier.desc}</p>
              <ul className="mt-4 space-y-2">
                {tier.items.map((i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                    {i}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <motion.div
          {...fadeSlow}
          className="mx-auto mt-12 max-w-4xl rounded-lg border border-border bg-card px-6 py-10 text-center"
        >
          <h3 className="text-lg font-semibold tracking-tight">
            See the graph with your own data.
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Bring a country file, a sanctions portfolio, or a supply chain. We map the
            actors and connect them to what the sources actually say.
          </p>
          <Button asChild size="sm" className="mt-6 h-9 px-5">
            <Link to="/auth?returnTo=%2Fdashboard" className="gap-1.5 text-xs">
              Request access
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Mark className="size-4" />
            <span>Global Intelligence OS</span>
          </div>
          <p>Evidence → Intelligence → Analysis → Decision Support</p>
          <p>© 2026</p>
        </div>
      </footer>
    </div>
  );
}
