// Tiny shared helpers for Convex modules (no Convex imports needed).

/** URL-safe slug for names (authors, sources). */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

/** Deterministic summary-hash for cross-post detection (FNV-1a over normalized title). */
export function contentHashOf(title: string): string {
  const norm = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
