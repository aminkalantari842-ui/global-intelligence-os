// D-layer per-article AI panel + K-layer provenance. The AI buttons run the
// aiAnalysis actions; results are stored artifacts (ASSESSMENT class) with
// full provenance (pubId, model, ts). The provenance block shows translation
// model/date/chars and offers one-click re-translate (invalidates the cache).

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/i18n/context";
import { useState } from "react";
import { Brain, FileSearch, FileText, Gavel, Languages, Loader2, ScrollText } from "lucide-react";

type Kind = "BRIEF" | "THESIS" | "RED_TEAM" | "SUMMARY";

export function AiPanel({ pubId }: { pubId: string }) {
  const { t, lang } = useI18n();
  const runBrief = useAction(api.aiAnalysis.articleBrief);
  const runThesis = useAction(api.aiAnalysis.thesisExtraction);
  const runRedTeam = useAction(api.aiAnalysis.redTeam);
  const runSummary = useAction(api.aiAnalysis.summarizeAt);

  const provenance = useQuery(api.enrichment.getTranslationProvenance, { pubId: pubId as never });
  const refs = useQuery(api.enrichment.getArticleRefs, { pubId: pubId as never });
  const retranslate = useMutation(api.enrichment.retranslate);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [showProv, setShowProv] = useState(false);

  const run = async (kind: Kind, level?: "TLDR" | "EXEC" | "OUTLINE") => {
    setBusy(kind);
    setErr("");
    setText(null);
    try {
      const r =
        kind === "BRIEF"
          ? await runBrief({ pubId: pubId as never })
          : kind === "THESIS"
            ? await runThesis({ pubId: pubId as never })
            : kind === "RED_TEAM"
              ? await runRedTeam({ pubId: pubId as never })
              : await runSummary({ pubId: pubId as never, level: level ?? "EXEC" });
      setText(r.text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      setErr(msg.includes("AI_API_KEY") ? t("ai.noKey") : msg.slice(0, 100));
    } finally {
      setBusy(null);
    }
  };

  const btn = "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors disabled:opacity-40";

  return (
    <div className="border-b border-border px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => void run("BRIEF")} disabled={busy !== null} className={`${btn} border-sky-500/40 bg-sky-500/10 text-sky-600 hover:bg-sky-500/20`}>
          {busy === "BRIEF" ? <Loader2 className="size-3 animate-spin" /> : <ScrollText className="size-3" />} {t("ai.brief")}
        </button>
        <button onClick={() => void run("THESIS")} disabled={busy !== null} className={`${btn} border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20`}>
          {busy === "THESIS" ? <Loader2 className="size-3 animate-spin" /> : <Brain className="size-3" />} {t("ai.thesis")}
        </button>
        <button onClick={() => void run("RED_TEAM")} disabled={busy !== null} className={`${btn} border-rose-500/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20`}>
          {busy === "RED_TEAM" ? <Loader2 className="size-3 animate-spin" /> : <Gavel className="size-3" />} {t("ai.redteam")}
        </button>
        <span className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {(["TLDR", "EXEC", "OUTLINE"] as const).map((lv) => (
            <button
              key={lv}
              onClick={() => void run("SUMMARY", lv)}
              disabled={busy !== null}
              className="rounded px-1.5 py-0.5 text-[9.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              {busy === "SUMMARY" ? <Loader2 className="size-3 animate-spin" /> : t(`ai.sum.${lv.toLowerCase()}`)}
            </button>
          ))}
        </span>
        <button
          onClick={() => setShowProv((v) => !v)}
          className={`ms-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] ${showProv ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <FileSearch className="size-3" /> {t("ai.provenance")}
        </button>
      </div>

      {/* Provenance: model, chars, status, refs, re-translate */}
      {showProv && (
        <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[10.5px]">
          {provenance === undefined && <p className="text-muted-foreground">…</p>}
          {provenance === null && (
            <p className="text-muted-foreground">{t("ai.noContent")}</p>
          )}
          {provenance && (
            <div className="space-y-1" dir={lang === "fa" ? "rtl" : "ltr"}>
              <p>
                <span className="text-muted-foreground">{t("ai.model")}:</span>{" "}
                <span className="font-mono text-[10px]">{provenance.model}</span>{" · "}
                <span className="tabular-nums">{provenance.chars.toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} {t("ai.chars")}</span>{" · "}
                <span className={provenance.status === "READY" ? "text-emerald-600" : "text-amber-600"}>{provenance.status}</span>{" · "}
                {new Date(provenance.createdAt).toLocaleString(lang === "fa" ? "fa-IR" : "en-GB")}
              </p>
              <p className="text-muted-foreground">
                FA {provenance.textFaLen.toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} / EN {provenance.textEnLen.toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} {t("ai.chars")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await retranslate({ pubId: pubId as never });
                    window.location.reload();
                  }}
                  className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-muted"
                >
                  <Languages className="size-3" /> {t("ai.retranslate")}
                </button>
                <span className="text-[9px] text-muted-foreground">{t("ai.retranslateHint")}</span>
              </div>
              {refs && refs.length > 0 && (
                <details className="pt-1">
                  <summary className="cursor-pointer text-muted-foreground">{t("ai.refs")} ({refs.length})</summary>
                  <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto" dir="ltr">
                    {refs.slice(0, 15).map((r) => (
                      <li key={r._id} className="flex items-center gap-1.5">
                        <span className={`rounded-sm px-1 text-[8px] font-bold ${r.kind === "GOV_MIL" ? "bg-amber-500/15 text-amber-600" : r.kind === "INTERNAL" ? "bg-sky-500/15 text-sky-600" : "bg-muted text-muted-foreground"}`}>{r.kind}</span>
                        <a href={r.url} target="_blank" rel="noreferrer" className="truncate text-[10px] text-sky-600 hover:underline" dir="ltr">{r.url}</a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {err && <p className="mt-2 text-[10.5px] text-red-500">{err}</p>}
      {text && (
        <div className="mt-2 rounded-md border border-border bg-card p-3">
          <p className="mb-1.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-violet-600">
            <FileText className="size-3" /> ASSESSMENT
          </p>
          <p className="whitespace-pre-wrap text-[12px] leading-6" dir="rtl">{text}</p>
        </div>
      )}
    </div>
  );
}
