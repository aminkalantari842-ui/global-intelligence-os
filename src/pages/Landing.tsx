import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
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
  const { t, lang } = useI18n();
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
    const id = window.setInterval(() => setDemoTick((tick) => tick + 1), 4200);
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
    <div className="min-h-screen bg-background text-foreground" dir={lang === "fa" ? "rtl" : "ltr"}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="text-sm font-semibold tracking-tight">
              {t("app.name")}
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
            <a href="#graph" className="transition-colors hover:text-foreground">{t("land.navGraph")}</a>
            <a href="#method" className="transition-colors hover:text-foreground">{t("land.navMethod")}</a>
            <a href="#thinktanks" className="transition-colors hover:text-foreground">{t("land.navThinktanks")}</a>
            <a href="#analyst" className="transition-colors hover:text-foreground">{t("land.navAnalyst")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth" className="text-xs">{t("btn.signin")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth?returnTo=%2Fdashboard" className="text-xs">
                {t("btn.signup")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero: the graph, first glance ──────────────────────────────── */}
      <section id="graph" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <motion.div {...fadeSlow} className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            {t("land.kicker")}
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            {t("land.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            {t("land.desc")}
          </p>
          <div className="mt-7 flex items-center justify-center gap-3">
            <Button asChild size="sm" className="h-9 px-4">
              <Link to="/auth?returnTo=%2Fdashboard" className="gap-1.5 text-xs">
                {t("land.openGraph")}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 px-4">
              <a href="#method" className="text-xs">
                {t("btn.howConfidence")}
              </a>
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
                  {t("nav.graph")}
                </span>
                <span className="hidden sm:inline">
                  {graph
                    ? `${graph.actors.length} ${t("stat.actors")} · ${graph.relations.length} ${t("stat.edges")}`
                    : t("dash.loading")}
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
                    <p className="mt-3 text-xs text-muted-foreground">{t("dash.loading")}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-[10px] text-muted-foreground">
              <span>{t("graph.help")}</span>
              <span className="tabular-nums">
                {graph ? `${graph.relations.length} ${t("stat.edges")}` : "—"}
              </span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Proof strip ────────────────────────────────────────────────── */}
      <section className="border-y border-border/70 bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
          {(
            [
              [t("land.statsActors"), graph ? String(graph.actors.length) : "—"],
              [t("land.statsEdges"), graph ? String(graph.relations.length) : "—"],
              [
                t("land.statsCorroborated"),
                stats !== undefined ? `${stats.corroboratedShare}%` : "—",
              ],
              [t("land.statsEvents"), stats ? String(stats.evidenceCount) : "—"],
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
          <SectionHeading eyebrow={t("land.navMethod")} title={t("land.methodTitle")}>
            {t("land.methodDesc")}
          </SectionHeading>
        </motion.div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {(
            [
              {
                icon: FileSearch,
                title: t("land.method1Title"),
                body: t("land.method1Body"),
              },
              {
                icon: GitFork,
                title: t("land.method2Title"),
                body: t("land.method2Body"),
              },
              {
                icon: ShieldCheck,
                title: t("land.method3Title"),
                body: t("land.method3Body"),
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

      {/* ── Think Tanks ────────────────────────────────────────────────── */}
      <section id="thinktanks" className="border-y border-border/70 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div {...fadeSlow}>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {t("land.navThinktanks")}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("land.ttTitle")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t("land.ttDesc")}
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[t("land.ttConnect")].map((text) => (
                  <li key={text} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <span className="text-muted-foreground">{text}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" size="sm" className="mt-7 h-9 px-4">
                <Link to="/auth?returnTo=%2Fthinktanks" className="gap-1.5 text-xs">
                  {t("nav.thinktanks")}
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </motion.div>

            <motion.div {...fadeSlow} className="rounded-lg border border-border bg-card p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("stat.publications")}
              </p>
              <div className="mt-3 rounded-md border border-border/70 p-3">
                <p className="text-xs font-medium">
                  {t("land.ttTitle")}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {t("land.ttDesc")}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-md border border-border/70 p-2.5">
                  <p className="text-muted-foreground">{t("stat.actors")}</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    23+
                  </p>
                </div>
                <div className="rounded-md border border-border/70 p-2.5">
                  <p className="text-muted-foreground">{t("stat.publications")}</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {t("dash.loading")}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-border/70 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t("land.status")}
                </p>
                <p className="mt-1.5 text-xs font-medium">
                  {t("tt.feedActive")}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("tt.desc")}
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── AI Analyst ─────────────────────────────────────────────────── */}
      <section id="analyst" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <motion.div {...fadeSlow} className="order-2 lg:order-1 rounded-lg border border-border bg-card p-5">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs">👤</div>
                <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-5">
                  {lang === "fa" ? "تحلیل روابط ایران و چین در حوزه انرژی" : "Analyze Iran-China energy relations"}
                </div>
              </div>
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">GI</div>
                <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {lang === "fa"
                    ? "بر اساس گراف بازیگران، روابط ایران و چین شامل تأمین تسلیحاتی، همکاری انرژی و مذاکرات دیپلماتیک است..."
                    : "Based on the actor graph, Iran-China relations include arms supply, energy cooperation, and diplomatic negotiations..."}
                </div>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-6 h-9 px-4">
              <Link to="/auth?returnTo=%2Fanalyst" className="gap-1.5 text-xs">
                {t("nav.analyst")}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </motion.div>

          <motion.div {...fadeSlow} className="order-1 lg:order-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              {t("land.navAnalyst")}
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("land.aiTitle")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t("land.aiDesc")}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Evidence walkthrough ───────────────────────────────────────── */}
      <section id="evidence" className="border-y border-border/70 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div {...fadeSlow}>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {t("edge.evidenceTrail")}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("land.evidenceTitle")}
              </h2>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  t("land.method1Title"),
                  t("claim.REPORTED_CLAIM"),
                  t("edge.confidence"),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" size="sm" className="mt-7 h-9 px-4">
                <Link to="/auth?returnTo=%2Fdashboard" className="gap-1.5 text-xs">
                  {t("land.openGraph")}
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </motion.div>

            <motion.div {...fadeSlow} className="rounded-lg border border-border bg-card p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("land.sampleEdge")}
              </p>
              <div className="mt-3 rounded-md border border-border/70 p-3">
                <p className="text-xs font-medium">
                  {demoRel
                    ? `${nameOf(demoRel.sourceSlug)} ↔ ${nameOf(demoRel.targetSlug)}`
                    : t("dash.loading")}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {demoRel?.summary ?? ""}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-md border border-border/70 p-2.5">
                  <p className="text-muted-foreground">{t("edge.confidence")}</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {demoRel ? `${demoRel.confidence}%` : "—"}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 p-2.5">
                  <p className="text-muted-foreground">{t("edge.sources")}</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {demoRel ? demoRel.sourceCount : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-border/70 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t("land.status")}
                </p>
                <p className="mt-1.5 text-xs font-medium">
                  {demoRel ? (t(`status.${demoRel.status}`) ?? demoRel.status.replace("_", " ")) : "—"}
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Access ─────────────────────────────────────────────────────── */}
      <section id="access" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeSlow}>
          <SectionHeading eyebrow={t("land.navGraph")} title={t("land.accessTitle")}>
            {t("land.ttDesc")}
          </SectionHeading>
        </motion.div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-3">
          {(
            [
              {
                name: t("tier.desk"),
                desc: t("tier.deskDesc"),
                items: [t("edge.confidence"), t("edge.evidenceTrail"), t("tt.feedActive")],
                featured: false,
              },
              {
                name: t("tier.team"),
                desc: t("tier.teamDesc"),
                items: [t("dash.registryStatus"), t("dash.registryLive"), t("stat.publications")],
                featured: true,
              },
              {
                name: t("tier.institution"),
                desc: t("tier.instDesc"),
                items: [t("dash.registryStatus"), t("stat.publications"), t("tt.feedActive")],
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
                    {t("tier.mostCommon")}
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
            {t("land.accessCta")}
          </h3>
          <Button asChild size="sm" className="mt-6 h-9 px-5">
            <Link to="/auth?returnTo=%2Fdashboard" className="gap-1.5 text-xs">
              {t("btn.signup")}
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
            <span>{t("app.name")}</span>
          </div>
          <p>{t("land.footer")}</p>
          <p>© 2026</p>
        </div>
      </footer>
    </div>
  );
}
