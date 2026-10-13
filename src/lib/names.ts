const BRACKETED = /[[({<][^\])}>]{1,12}[\])}>]/g;
const TAG_PREFIX = /^[^|]{1,12}\|/;

/**
 * Collapses the cosmetic churn in CS2 handles: clan tags, fullwidth and accented
 * glyphs, spacing, punctuation. Deliberately conservative — this string is used as the
 * alias lookup key, so folding too aggressively (leetspeak, vowel stripping) would make
 * two genuinely different people share one entry. Fuzzy suggestions belong at the
 * confirm step, where a human is already looking.
 */
export function normalizeName(raw: string): string {
  const stripped = raw
    .replace(BRACKETED, " ")
    .replace(TAG_PREFIX, " ")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

  // An all-punctuation handle would otherwise normalise to "" and collide with every
  // other all-punctuation handle.
  return stripped || raw.trim().toLowerCase();
}
