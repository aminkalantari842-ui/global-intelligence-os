export interface GraphActor {
  slug: string;
  name: string; // canonical display name (Persian)
  nameEn?: string; // original Latin name, provenance only
  aliases: string[];
  kind: string;
  country: string;
  region: string;
  tier: number;
  description: string;
  sourceCount: number;
  status: string;
  firstSeen: number;
  lastSeen: number;
}

export interface GraphRelation {
  _id: string;
  sourceSlug: string;
  targetSlug: string;
  kind: string;
  weight: number;
  confidence: number;
  status: string;
  since: number;
  updatedAt: number;
  sourceCount: number;
  summary: string;
  // ─── §3.2 edge dynamics (optional, older rows may predate them) ───
  symmetry?: "SYMMETRIC" | "ASYMMETRIC";
  benefitSource?: number;
  benefitTarget?: number;
  breaks?: number;
  coldSpellDays?: number;
  regimeShifts?: Array<{ from: string; to: string; ts: number }>;
}

export interface GraphPayload {
  actors: GraphActor[];
  relations: GraphRelation[];
  generatedAt: number;
}
