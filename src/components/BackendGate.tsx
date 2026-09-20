// Data-layer resilience: Convex queries throw during render, so a single
// backend failure (plan quota, network, deploy error) would otherwise blank the
// whole product. This boundary converts that crash into a labelled, actionable
// state while the rest of the interface keeps rendering.
//
// Convex documents error boundaries as the supported way to catch query errors,
// so every consumer here is a boundary — never a try/catch around `useQuery`.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Database, ExternalLink, RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";

export type FailureKind = "QUOTA" | "UNREACHABLE" | "UNKNOWN";

// Markers are matched case-insensitively against the raw backend message.
const QUOTA_MARKERS = [
  "free plan limits",
  "exceeded the free plan",
  "upgrade to a pro plan",
  "deployments have been disabled",
  "plan limit",
  "quota",
  "too many requests",
];

const OFFLINE_MARKERS = [
  "failed to fetch",
  "networkerror",
  "network error",
  "load failed",
  "websocket",
  "dynamically imported module",
  "connection",
  "timed out",
  "timeout",
];

/** Map a raw failure message to the operator-facing class of problem. */
export function classifyBackendFailure(message: string): FailureKind {
  const m = (message ?? "").toLowerCase();
  if (QUOTA_MARKERS.some((k) => m.includes(k))) return "QUOTA";
  if (OFFLINE_MARKERS.some((k) => m.includes(k))) return "UNREACHABLE";
  return "UNKNOWN";
}

const KIND_KEY: Record<FailureKind, "quota" | "offline" | "unknown"> = {
  QUOTA: "quota",
  UNREACHABLE: "offline",
  UNKNOWN: "unknown",
};

// Root of the Convex console: the plan/billing controls live there, and unlike a
// deep link to this deployment it never goes stale.
const CONVEX_DASHBOARD_URL = "https://dashboard.convex.dev";

const STEP_KEYS: Record<FailureKind, string[]> = {
  QUOTA: ["backend.quotaStep1", "backend.quotaStep2", "backend.quotaStep3"],
  UNREACHABLE: ["backend.offlineStep1", "backend.offlineStep2"],
  UNKNOWN: ["backend.unknownStep1"],
};

interface BackendUnavailableProps {
  message: string;
  /** Clears the boundary so children re-render and re-subscribe. */
  onRetry?: () => void;
  /** "inline" renders a panel-sized placeholder instead of a full page. */
  variant?: "full" | "inline";
}

export function BackendUnavailable({
  message,
  onRetry,
  variant = "full",
}: BackendUnavailableProps) {
  const { t } = useI18n();
  const kind = classifyBackendFailure(message);
  const key = KIND_KEY[kind];
  const title = t(`backend.${key}Title`);
  const body = t(`backend.${key}Body`);
  const reload = () => window.location.reload();

  if (variant === "inline") {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <span className="flex size-9 items-center justify-center rounded-full border border-border/70 bg-muted/40">
          <AlertTriangle className="size-4 text-amber-500" />
        </span>
        <p className="text-sm font-medium tracking-tight">{title}</p>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">{body}</p>
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onRetry ?? reload}>
            <RefreshCw className="size-3.5" />
            {t("backend.retry")}
          </Button>
        </div>
        <details className="mt-1 w-full max-w-md text-start">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("backend.technical")}
          </summary>
          <pre
            dir="ltr"
            className="mt-2 max-h-24 overflow-auto rounded-md border border-border/70 bg-muted/30 p-2 text-[10px] leading-4 text-muted-foreground"
          >
            {message}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-xl rounded-lg border border-border/70 bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-8">
        <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          <Database className="size-3.5" />
          {t("backend.kicker")}
          <span className="ms-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] tracking-[0.16em] text-amber-600">
            {t(`backend.${key}Badge`)}
          </span>
        </p>

        <h1 className="mt-4 text-xl font-semibold leading-7 tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>

        <ul className="mt-5 space-y-2 border-t border-border/70 pt-4">
          {STEP_KEYS[kind].map((stepKey, i) => (
            <li key={stepKey} className="flex gap-2.5 text-xs leading-5 text-muted-foreground">
              <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium tabular-nums text-foreground/70">
                {i + 1}
              </span>
              <span>{t(stepKey)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onRetry ?? reload}>
            <RefreshCw className="size-3.5" />
            {t("backend.retry")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={reload}
          >
            <RotateCw className="size-3.5" />
            {t("backend.reload")}
          </Button>
          {kind === "QUOTA" && (
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
              <a href={CONVEX_DASHBOARD_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                {t("backend.dashboard")}
              </a>
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground">{t("backend.retryHint")}</span>
        </div>

        <details className="mt-6 border-t border-border/70 pt-4">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("backend.technical")}
          </summary>
          <pre
            dir="ltr"
            className="mt-2 max-h-40 overflow-auto rounded-md border border-border/70 bg-muted/30 p-3 text-[10px] leading-4 text-muted-foreground"
          >
            {message}
          </pre>
        </details>
      </div>
    </div>
  );
}

interface BackendErrorBoundaryProps {
  children: ReactNode;
  /** Changing this value clears a previous failure (e.g. on route change). */
  resetKey?: string;
  variant?: "full" | "inline";
}

interface BackendErrorBoundaryState {
  message: string | null;
}

export class BackendErrorBoundary extends Component<
  BackendErrorBoundaryProps,
  BackendErrorBoundaryState
> {
  state: BackendErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): BackendErrorBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[data-layer] query failed:", error.message, info.componentStack);
  }

  componentDidUpdate(prev: BackendErrorBoundaryProps) {
    if (this.state.message && prev.resetKey !== this.props.resetKey) {
      this.setState({ message: null });
    }
  }

  private reset = () => this.setState({ message: null });

  render() {
    if (this.state.message) {
      return (
        <BackendUnavailable
          message={this.state.message}
          onRetry={this.reset}
          variant={this.props.variant}
        />
      );
    }
    return this.props.children;
  }
}
