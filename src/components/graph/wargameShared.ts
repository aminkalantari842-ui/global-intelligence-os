// Shared constants between wargame.ts and wargameStudio.ts (Convex cannot
// import client modules, so alerts.ts keeps its own copy server-side).

export const HOSTILE_KINDS = new Set([
  "TENSION", "CONFLICT", "SANCTIONS", "COMPETITION", "PROXY_SUPPORT",
]);
