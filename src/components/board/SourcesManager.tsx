// A1/A2 Source catalog + health monitor. Add/edit/disable think-tank feeds
// (RSS/Atom/SITEMAP/SCRAPE), watch error streaks and latency, and re-fetch a
// single source with one click. Seed rows are protected from deletion.

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";

type TankRow = {
  _id: string;
  slug: string;
  name: string;
  region: string;
  website?: string;
  feedUrl: string;
  feedType: string;
  enabled: boolean;
  tier?: string;
  custom?: boolean;
  lastFetched?: number;
  errorStreak?: number;
  lastError?: string;
  lastLatencyMs?: number;
  lastItemCount?: number;
};

function healthColor(streak: number | undefined): string {
  const s = streak ?? 0;
  if (s === 0) return "bg-emerald-500";
  if (s <= 2) return "bg-amber-500";
  return "bg-rose-500";
}

function fmtAgo(ts: number | undefined, fa: boolean): string {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - ts) / 60_000);
  const v = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
  return fa ? v.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]) : v;
}

export function SourcesManager({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const sources = useQuery(api.thinkTanks.listAllSources, {});
  const addSource = useMutation(api.thinkTanks.addSource);
  const toggleSource = useMutation(api.thinkTanks.toggleSource);
  const updateSource = useMutation(api.thinkTanks.updateSource);
  const deleteSource = useMutation(api.thinkTanks.deleteSource);
  const refresh = useAction(api.rssIngest.refreshFeeds);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ name: "", feedUrl: "", website: "", region: "North America", feedType: "RSS" as const });

  const refetchOne = async (slug: string) => {
    setBusySlug(slug);
    setStatus("");
    try {
      const r = await refresh({ tankSlug: slug });
      setStatus(`${slug}: +${r.inserted}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message.slice(0, 80) : "error");
    } finally {
      setBusySlug(null);
    }
  };

  const doAdd = async () => {
    if (!form.name || !form.feedUrl) return;
    try {
      await addSource({
        name: form.name,
        feedUrl: form.feedUrl,
        website: form.website || undefined,
        region: form.region,
        country: form.region,
        feedType: form.feedType,
        description: undefined,
      });
      setShowAdd(false);
      setForm({ name: "", feedUrl: "", website: "", region: "North America", feedType: "RSS" });
    } catch (e) {
      setStatus(e instanceof Error ? e.message.slice(0, 80) : "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-background shadow-2xl"
        dir={lang === "fa" ? "rtl" : "ltr"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("src.title")}</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
            >
              <Plus className="size-3" /> {t("src.add")}
            </button>
            <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="close">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="grid grid-cols-2 gap-2 border-b border-border bg-muted/30 px-4 py-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("src.fName")} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
            <input value={form.feedUrl} onChange={(e) => setForm({ ...form, feedUrl: e.target.value })} placeholder="https://… /feed" className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" dir="ltr" />
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder={t("src.fSite")} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" dir="ltr" />
            <div className="flex gap-2">
              <select value={form.feedType} onChange={(e) => setForm({ ...form, feedType: e.target.value as typeof form.feedType })} className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                {["RSS", "ATOM", "SITEMAP", "SCRAPE"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <button onClick={() => void doAdd()} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">{t("src.submit")}</button>
            </div>
          </div>
        )}

        {status && <p className="border-b border-border bg-muted/40 px-4 py-1.5 text-[11px] text-muted-foreground">{status}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sources === undefined && (
            <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> …</p>
          )}
          {sources?.map((s: TankRow) => (
            <div key={s._id} className="flex items-center gap-2 border-b border-border/50 px-4 py-2 text-xs">
              <span className={`size-2 shrink-0 rounded-full ${healthColor(s.errorStreak)}`} title={s.lastError ?? ""} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-medium">
                  {s.name}
                  {s.tier && <span className="rounded bg-muted px-1 text-[8px] font-bold">{s.tier}</span>}
                  {s.custom && <span className="rounded bg-sky-500/15 px-1 text-[8px] text-sky-600">{t("src.custom")}</span>}
                  {!s.enabled && <span className="rounded bg-muted px-1 text-[8px] text-muted-foreground">{t("src.disabled")}</span>}
                </p>
                <p className="truncate text-[10px] text-muted-foreground" dir="ltr">
                  {s.feedType} · {fmtAgo(s.lastFetched, lang === "fa")} · {s.lastItemCount ?? 0} items · {s.lastLatencyMs ? `${(s.lastLatencyMs / 1000).toFixed(1)}s` : "—"}
                  {s.lastError ? ` · ⚠ ${s.lastError.slice(0, 60)}` : ""}
                </p>
              </div>
              <button
                onClick={() => void refetchOne(s.slug)}
                disabled={busySlug !== null}
                className="rounded border border-border p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                title={t("src.refetch")}
              >
                {busySlug === s.slug ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              </button>
              <button
                onClick={() => void toggleSource({ id: s._id as never, enabled: !s.enabled })}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${s.enabled ? "border-border text-muted-foreground" : "border-emerald-500/40 text-emerald-600"}`}
              >
                {s.enabled ? t("src.off") : t("src.on")}
              </button>
              {s.custom && (
                <button
                  onClick={() => void deleteSource({ id: s._id as never }).catch(() => {})}
                  className="rounded border border-border p-1 text-muted-foreground hover:text-red-500"
                  title={t("src.delete")}
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
