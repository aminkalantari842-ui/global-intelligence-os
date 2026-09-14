// ME2026 strategic actor mapping — shared types + deterministic builders.
// Source: "نقشه‌برداری راهبردی بازیگران ژئوپلیتیک خاورمیانه" (2026-09-13,
// OSINT + primary/official + think-tank synthesis). Nothing here is invented:
// all profile text is transcribed from the dataset; scores/weights map the
// dataset's own relationship labels onto the graph's fixed vocabulary.

export const ME2026_DATE = "2026-09-13";
export const T26 = (iso: string) => new Date(iso).getTime();

// The 16 standard analysis dimensions (identical for every actor).
export const DIM_TITLES = [
  "هویت و مشخصات پایه",
  "سوابق و روند تاریخی حضور در خاورمیانه",
  "منافع راهبردی، اقتصادی، امنیتی و ایدئولوژیک",
  "ملاحظات راهبردی و دغدغه‌های کلیدی",
  "اهداف کلان و اولویت‌های راهبردی در منطقه",
  "ساختار و فرآیند تصمیم‌گیری",
  "الگوی رفتاری و دکترین راهبردی",
  "متحدان",
  "رقبا",
  "دشمنان و مناقشات فعال",
  "توانمندی‌ها",
  "عوامل داخلی مؤثر",
  "عوامل خارجی مؤثر و وابستگی‌های اقتصادی",
  "خطوط قرمز و منافع حیاتی",
  "متغیرها، نقاط آسیب‌پذیری و سناریوهای تغییر رفتار",
  "روند اخیر سیاست‌ها و چشم‌انداز آینده",
] as const;

export type Me2026Kind =
  | "STATE"
  | "ORGANIZATION"
  | "NON_STATE"
  | "MILITARY_ORG"
  | "TRANSNATIONAL_MOVEMENT"
  | "STATE_ENTERPRISE"
  | "COMPANY"
  | "DEV_BANK";

export interface Me2026Profile {
  id: string; // dataset actor_id, e.g. "IRN"
  slug: string; // canonical graph slug
  nameFa: string;
  nameEn: string;
  kind: Me2026Kind;
  country: string;
  region: string;
  tier: 1 | 2 | 3;
  dims: string[]; // exactly 16 entries, in DIM_TITLES order
  src: string[]; // S01..S35 source ids
}

// Deterministic mapping of the 16 dims onto the graph's structured fields:
//   description   ← all 16 dims (full fidelity, compact FA digest)
//   decisionCycle ← d6 (structure), d7 (doctrine), d16 (horizon)
//   monitoring    ← what = d16 outlook, why = d4 concerns, sources = S-ids
export function buildDescription(dims: string[]): string {
  return dims
    .map((c, i) => `«${DIM_TITLES[i]}» ${c}`)
    .join(" ｜ ");
}

export function buildDecisionCycle(dims: string[]) {
  return {
    hardCore: dims[5],
    commandStructure: dims[5],
    doctrine: dims[6],
    strategicCulture: dims[6],
    planningHorizon: dims[15],
  };
}

export function buildMonitoring(dims: string[], src: string[]) {
  return {
    what: dims[15],
    why: dims[3],
    sources: src.join(", "),
  };
}

// ─── Edge vocabulary mapping (dataset label → graph kind/weight) ────────────
export type EdgeKind =
  | "ALLIANCE"
  | "COOPERATION"
  | "NEGOTIATION"
  | "SUPPLY"
  | "PROXY_SUPPORT"
  | "COMPETITION"
  | "TENSION"
  | "SANCTIONS"
  | "CONFLICT"
  | "INTERDEPENDENCE"
  | "MEDIATION"
  | "DETERRENCE"
  | "NON_AGGRESSION"
  | "TREATY"
  | "SECURITY_CONSULT"
  | "INTEL_SHARING"
  | "TRANSIT_ACCESS"
  | "DEBT_AID"
  | "DEPENDENCY";

export type EventKind =
  | "STATEMENT"
  | "MEETING"
  | "SANCTION"
  | "STRIKE"
  | "TRANSFER"
  | "REPORT"
  | "AGREEMENT"
  | "POSTURE"
  | "TREATY_SIGNED"
  | "MILITARY_EXERCISE"
  | "BLOCKADE"
  | "SEIZURE"
  | "DIPLOMATIC_SUMMIT";

export interface Me2026Edge {
  s: string; // dataset actor_id of source
  t: string; // dataset actor_id of target
  kind: EdgeKind;
  w: number; // engagement intensity 0–100 (mapped from the dataset's label)
  summary: string; // FA assessment summary
  srcs: string[]; // S01..S35 citations
  type?: EventKind; // event type, default POSTURE
  title?: string; // event title, default generated
}

// The 13 already-seeded actors were enriched in place (aliases + decisionCycle
// + monitoring merged by the ingest), so this dataset is fully consumed:
