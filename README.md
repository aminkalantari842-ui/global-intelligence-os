# Global Intelligence OS — Actor Relationship Graph (v1)

A minimalist, enterprise-facing **actor relationship graph** for geopolitical
intelligence: canonical actors (states, institutions, networks), evidence-backed
relationships between them, and a traceable evidence trail behind every edge.

**v1 scope (intentionally narrow):**

- Actor relationship graph — the primary experience
- Evidence trails: every relationship opens into timestamped, source-typed events
- Enterprise console (protected) with focus mode, relation-type filters, search
- Graph-first landing page

Anything else (events on maps, narratives, risk engines, AI research, Iran
workspace, MCP, …) is **out of v1** by design.

---

## Architecture (v1)

```
React 19 + Vite + Tailwind v4 + shadcn/ui          ← console & landing
        │
        ▼
Convex (reactive queries)                          ← no separate BFF needed
        │
        ├── actors          canonical actor registry
        ├── relationships   directed, evidence-backed edges
        └── relationEvents  timestamped evidence with typed sources
```

- **Rendering:** `d3-force` simulation on a `<canvas>` (not SVG) so it stays
  smooth as the graph grows.
- **Confidence / intensity** are stored model outputs (deterministic pipeline at
  ingestion), never LLM opinions, and never recomputed at render time.
- **Disagreement is preserved:** relationships carry a status of `CONFIRMED`,
  `REPORTED`, or `DISPUTED`. Disputed edges are surfaced with a distinct dash
  pattern — never silently merged.
- **Idempotent seeding:** the canonical dataset seeds on first boot keyed by
  natural keys (`slug`, `(source, target)`), so re-running never duplicates rows.

### Edge encoding (no color required)

| Visual                    | Meaning                          |
| ------------------------- | -------------------------------- |
| Solid edge                | Confirmed (corroborated)         |
| Dashed (`6 6` / `2 4`)    | Reported (single/secondhand)     |
| Fine dashed (`2 5`)       | Disputed — sources disagree      |
| Edge thickness            | Engagement intensity (0–100)     |
| Edge opacity              | Confidence (0–100)               |
| Perpendicular ticks       | Intensity quartile               |
| Outer ring arc on a node  | Mean confidence of its edges     |

---

## Routes

| Route        | Access      | Purpose                                        |
| ------------ | ----------- | ---------------------------------------------- |
| `/`          | Public      | Landing — the graph is the first-glance centerpiece |
| `/auth`      | Public      | Email-OTP sign-in / guest access               |
| `/dashboard` | Protected   | Graph console: filters, inspector, evidence trail |

Signed-out users hitting `/dashboard` are redirected to
`/auth?returnTo=%2Fdashboard` and returned there after sign-in.

---

## Development

```bash
bun install
bun convex dev --once   # regenerate Convex types / push functions
bun tsc -b --noEmit     # typecheck
bun run dev             # (managed by the platform preview)
```

The canonical dataset seeds automatically the first time the app loads with an
empty registry.

## Adding an actor

Append to `SEED_ACTORS` in `src/convex/data/seed.ts` (slug-keyed), or insert via
the `actors` table. Aliases support multilingual variants; add the actor's
relationships to `SEED_RELATIONSHIPS` with at least one typed source.

## Data contract

Every relationship event carries:

```ts
{
  timestamp, type, title, summary, confidence,
  claimType,           // OBSERVED_FACT | REPORTED_CLAIM | ASSESSMENT
  sources: [{ publication, title, url, date, stance }]
                        // stance: CORROBORATING | REPORTING | SKEPTICAL
}
```

## Roadmap (post-v1, per master spec)

Source registry & RSS ingestion → document/event layers → think-tank
intelligence → search & graph services → AI research agents → alerts, risk,
narratives → Iran workspace → observability & deployment. Each phase lands
behind feature flags with the same provenance rules enforced in v1.
