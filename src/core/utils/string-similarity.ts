/**
 * String Similarity — Jaro-Winkler algorithm for brand lookalike detection.
 *
 * Jaro-Winkler is preferred over Levenshtein for domain names because:
 *   - Gives higher weight to prefix matches (domains share prefixes: google/googIe)
 *   - Better for short strings (domain labels are typically 3-15 chars)
 *   - Returns 0-1 range directly (no normalization needed)
 */

/**
 * Compute Jaro similarity between two strings.
 * Returns a value between 0 (no match) and 1 (exact match).
 */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(s2.length - 1, i + matchWindow);

    for (let j = start; j <= end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  );
}

/**
 * Compute Jaro-Winkler similarity between two strings.
 * Boosts score for common prefixes (up to 4 chars).
 *
 * @param s1 First string
 * @param s2 Second string
 * @param prefixScale Winkler prefix scaling factor (default 0.1, max 0.25)
 * @returns Similarity score 0.0-1.0
 */
export function jaroWinkler(s1: string, s2: string, prefixScale = 0.1): number {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();

  const jaroScore = jaro(a, b);

  // Common prefix length (max 4)
  let prefixLen = 0;
  const maxPrefix = Math.min(4, Math.min(a.length, b.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) {
      prefixLen++;
    } else {
      break;
    }
  }

  const scale = Math.min(prefixScale, 0.25);
  return jaroScore + prefixLen * scale * (1 - jaroScore);
}
