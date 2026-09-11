import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, BookOpen } from "lucide-react";

export default function ThinkTanks() {
  const { t } = useI18n();
  const [selectedTank, setSelectedTank] = useState<string | undefined>();

  const tanks = useQuery(api.thinkTanks.listEnabled);
  const pubs = useQuery(api.thinkTanks.listPublications, { tankSlug: selectedTank, limit: 40 });

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString("fa-IR", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">GI</span>
              <span className="text-sm font-semibold tracking-tight">{t("app.name")}</span>
            </Link>
            <span className="text-xs text-muted-foreground">/ {t("tt.title")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/dashboard"><Button variant="ghost" size="sm" className="text-xs">{t("nav.graph")}</Button></Link>
            <Link to="/analyst"><Button variant="ghost" size="sm" className="text-xs">{t("nav.analyst")}</Button></Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("tt.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("tt.desc")}</p>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{tanks ? `${tanks.length} ${t("tt.institutions")}` : "…"}</span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-foreground" />
            {t("tt.feedActive")}
          </span>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Sidebar filter */}
          <aside className="flex flex-col gap-1">
            <button
              onClick={() => setSelectedTank(undefined)}
              className={`rounded-md px-3 py-1.5 text-right text-xs transition-colors ${
                !selectedTank ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {t("tt.allTanks")}
            </button>
            {tanks?.map((tank) => (
              <button
                key={tank._id}
                onClick={() => setSelectedTank(tank.slug)}
                className={`rounded-md px-3 py-1.5 text-right text-xs transition-colors ${
                  selectedTank === tank.slug ? "bg-foreground text-background" : "hover:bg-muted"
                }`}
              >
                {tank.name}
              </button>
            ))}
          </aside>

          {/* Publications list */}
          <div className="flex flex-col gap-3">
            {!pubs && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" />
                {t("tt.refreshing")}
              </div>
            )}
            {pubs && pubs.length === 0 && (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
                <BookOpen className="mx-auto size-6 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("tt.noPubs")}</p>
              </div>
            )}
            {pubs?.map((pub) => (
              <a
                key={pub._id}
                href={pub.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-md border border-border/70 bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium leading-5 group-hover:underline">
                      {pub.title}
                    </h3>
                    {pub.summary && (
                      <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
                        {pub.summary}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{pub.thinkTankSlug}</span>
                  <span>{fmtDate(pub.publishedAt)}</span>
                  {pub.topics.length > 0 && (
                    <span>{pub.topics.slice(0, 3).join(" · ")}</span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
