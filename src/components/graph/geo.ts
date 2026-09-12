// Phase 3: geographic reference layout. Deterministic equirectangular
// projection of each actor's seat-of-power onto an abstract canvas — a
// *reference* frame for reading the graph, not a cartographic product.

import type { GraphActor } from "./types";

export interface LonLat {
  lon: number;
  lat: number;
}

/** Seat-of-power anchors (capital / primary operating geography). */
export const COUNTRY_ANCHORS: Record<string, LonLat> = {
  // Core dataset
  "United States": { lon: -77, lat: 38.9 }, // Washington, D.C.
  Belgium: { lon: 4.35, lat: 50.85 }, // Brussels
  Russia: { lon: 37.6, lat: 55.75 }, // Moscow
  Iran: { lon: 51.4, lat: 35.7 }, // Tehran
  Israel: { lon: 35.2, lat: 31.78 }, // Jerusalem
  Ukraine: { lon: 30.5, lat: 50.45 }, // Kyiv
  China: { lon: 116.4, lat: 39.9 }, // Beijing
  Turkey: { lon: 32.85, lat: 39.93 }, // Ankara
  "Saudi Arabia": { lon: 46.7, lat: 24.7 }, // Riyadh
  Lebanon: { lon: 35.5, lat: 33.9 }, // Beirut
  Palestine: { lon: 35.2, lat: 31.9 },
  Yemen: { lon: 44.2, lat: 15.35 }, // Sanaa
  Austria: { lon: 16.37, lat: 48.2 }, // Vienna
  // Robustness for registry growth
  "United Kingdom": { lon: -0.13, lat: 51.5 },
  France: { lon: 2.35, lat: 48.85 },
  Germany: { lon: 13.4, lat: 52.5 },
  Switzerland: { lon: 7.45, lat: 46.95 },
  Sweden: { lon: 18.07, lat: 59.33 },
  Netherlands: { lon: 4.9, lat: 52.38 },
  Italy: { lon: 12.5, lat: 41.9 },
  Spain: { lon: -3.7, lat: 40.4 },
  Poland: { lon: 21, lat: 52.23 },
  Egypt: { lon: 31.24, lat: 30.04 },
  UAE: { lon: 54.37, lat: 24.45 },
  Qatar: { lon: 51.53, lat: 25.29 },
  Iraq: { lon: 44.36, lat: 33.31 },
  Syria: { lon: 36.3, lat: 33.51 },
  Jordan: { lon: 35.93, lat: 31.95 },
  Pakistan: { lon: 73.05, lat: 33.68 },
  India: { lon: 77.2, lat: 28.6 },
  Afghanistan: { lon: 69.17, lat: 34.53 },
  Japan: { lon: 139.7, lat: 35.7 },
  "South Korea": { lon: 126.98, lat: 37.57 },
  Indonesia: { lon: 106.85, lat: -6.2 },
  Australia: { lon: 149.13, lat: -35.28 },
  Canada: { lon: -75.7, lat: 45.42 },
  Mexico: { lon: -99.13, lat: 19.43 },
  Brazil: { lon: -47.9, lat: -15.78 },
  Nigeria: { lon: 7.49, lat: 9.06 },
  "South Africa": { lon: 28.19, lat: -25.75 },
  Ethiopia: { lon: 38.75, lat: 9.02 },
  Kenya: { lon: 36.82, lat: -1.29 },
  Singapore: { lon: 103.85, lat: 1.29 },
};

/** Equirectangular projection to world units. Scale ≈ 140 → ~500u span. */
export function projectGeo(p: LonLat, scale = 140): { x: number; y: number } {
  return {
    x: ((p.lon * Math.PI) / 180) * scale,
    y: -((p.lat * Math.PI) / 180) * scale,
  };
}

/**
 * Compute pinned positions for all actors. Co-located actors (same country)
 * are sidestepped deterministically in registration order — small offsets on
 * a fixed spiral, no randomness (same input → same layout).
 */
export function geoLayout(
  actors: GraphActor[],
  scale = 140,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const occupancy = new Map<string, number>();

  for (const a of actors) {
    const anchor = COUNTRY_ANCHORS[a.country] ?? COUNTRY_ANCHORS["United States"];
    const base = projectGeo(anchor, scale);
    const key = `${anchor.lon},${anchor.lat}`;
    const idx = occupancy.get(key) ?? 0;
    occupancy.set(key, idx + 1);
    if (idx > 0) {
      const angle = idx * 2.1; // deterministic spread
      const radius = 22 + idx * 13;
      out.set(a.slug, {
        x: base.x + Math.cos(angle) * radius,
        y: base.y + Math.sin(angle) * radius,
      });
    } else {
      out.set(a.slug, base);
    }
  }
  return out;
}

// ─── Simplified reference coastlines (lon/lat polylines, stylized) ──────────
// Deliberately low-poly: a subtle orientation aid, drawn at very low opacity —
// never a competing visual layer.

const CONTINENTS: number[][][] = [
  // North America
  [[-168,66],[-140,70],[-124,74],[-90,80],[-70,77],[-60,60],[-64,46],[-75,38],[-80,26],[-97,25],[-105,20],[-97,16],[-84,10],[-79,8],[-83,14],[-92,18],[-106,24],[-114,28],[-124,40],[-130,54],[-152,60],[-166,60]],
  // Greenland
  [[-45,60],[-38,65],[-25,70],[-22,73],[-30,76],[-40,77],[-50,80],[-58,76],[-62,72],[-58,68],[-52,64],[-48,61]],
  // South America
  [[-77,8],[-62,10],[-52,4],[-42,-3],[-35,-8],[-40,-20],[-48,-28],[-58,-35],[-62,-41],[-66,-48],[-70,-54],[-73,-46],[-72,-35],[-70,-25],[-76,-14],[-81,-5],[-79,2]],
  // Africa
  [[-17,15],[-5,35],[0,37],[10,37],[20,33],[32,31],[43,12],[51,12],[48,5],[40,-5],[38,-15],[35,-24],[28,-33],[18,-34],[14,-23],[12,-16],[9,-1],[9,4],[-8,5],[-13,9]],
  // Eurasia (incl. Arabia, India, SE Asia)
  [[-9,39],[-9,44],[-2,48],[3,52],[8,55],[12,56],[18,60],[24,66],[30,71],[45,68],[60,71],[75,73],[100,77],[130,73],[160,70],[178,65],[163,60],[160,53],[142,54],[135,48],[128,38],[121,32],[109,15],[103,2],[98,8],[95,16],[88,22],[80,10],[72,20],[62,25],[57,26],[55,17],[43,12],[35,28],[34,31],[35,33],[30,36],[26,39],[22,38],[19,42],[14,45],[16,40],[15,38],[12,42],[9,44],[0,40],[-5,36],[-9,38]],
  // Britain
  [[-5,50],[-1,51],[1,52],[0,53],[-1,56],[-3,58],[-5,57],[-6,55],[-5,53]],
  // Japan
  [[130,31],[134,33],[139,35],[141,38],[142,42],[145,44],[143,45],[140,41],[136,36],[131,33]],
  // Sumatra / Java
  [[95,5],[98,2],[102,-3],[106,-7],[112,-8],[115,-8],[110,-6],[104,-2],[98,3]],
  // Borneo
  [[109,2],[113,4],[117,4],[119,-1],[116,-4],[111,-3],[109,0]],
  // New Guinea
  [[131,-1],[136,-2],[141,-3],[146,-6],[144,-8],[139,-7],[134,-4],[131,-2]],
  // Philippines
  [[120,18],[122,16],[124,12],[125,8],[123,10],[121,14]],
  // Australia
  [[114,-22],[114,-30],[116,-34],[124,-33],[130,-32],[136,-35],[140,-38],[147,-39],[150,-37],[153,-31],[153,-26],[149,-20],[145,-15],[142,-11],[135,-12],[128,-14],[120,-19]],
  // New Zealand
  [[167,-45],[170,-44],[173,-41],[175,-38],[177,-38],[175,-40],[171,-43],[168,-46]],
  // Madagascar
  [[44,-25],[47,-25],[50,-22],[49,-15],[47,-13],[45,-16],[43,-21]],
];

export type ProjectedPoly = Array<{ x: number; y: number }>;

/** Precompute projected continent polygons once per scale. */
export function worldPolygons(scale = 140): ProjectedPoly[] {
  return CONTINENTS.map((poly) =>
    poly.map(([lon, lat]) => projectGeo({ lon, lat }, scale)),
  );
}

/** Point-in-polygon (ray casting) — used by the lasso selector. */
export function pointInPolygon(
  p: { x: number; y: number },
  poly: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
