// Persian display names for every canonical graph actor.
//
// The graph's canonical display name is Persian: this map is the single source
// of truth used by the ingest (seed + ME2026) and by the applyPersianNames
// migration, so the canvas, inspector, search, evidence flows and AI prompts
// all render Persian names. The original Latin name is preserved verbatim in
// each actor's `nameEn` field (provenance), never discarded.

import { ME2026_NEW_ACTORS } from "./me2026Actors";

// The 14 originally-seeded actors (see data/seed.ts). The 57 actors added by
// the ME2026 mapping already carry `nameFa` in their profiles, so they are
// derived below instead of duplicated here.
const SEED_NAMES_FA: Record<string, string> = {
  iran: "ایران",
  israel: "اسرائیل",
  "united-states": "ایالات متحده",
  russia: "روسیه",
  china: "چین",
  "european-union": "اتحادیه اروپا",
  iaea: "آژانس بین‌المللی انرژی اتمی",
  "saudi-arabia": "عربستان سعودی",
  hezbollah: "حزب‌الله",
  houthis: "انصارالله (حوثی‌ها)",
  hamas: "حماس",
  nato: "ناتو",
  ukraine: "اوکراین",
  turkey: "ترکیه",
};

export const ACTOR_NAMES_FA: Record<string, string> = {
  ...SEED_NAMES_FA,
  ...Object.fromEntries(ME2026_NEW_ACTORS.map((p) => [p.slug, p.nameFa])),
};

// Deterministic lookup: Persian name if known, otherwise the current value
// (an AI-proposed or user-added actor keeps whatever name it arrived with).
export function faNameFor(slug: string, fallback: string): string {
  return ACTOR_NAMES_FA[slug] ?? fallback;
}
