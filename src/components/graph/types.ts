export interface GraphActor {
  slug: string;
  name: string;
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
}

export interface GraphPayload {
  actors: GraphActor[];
  relations: GraphRelation[];
  generatedAt: number;
}
