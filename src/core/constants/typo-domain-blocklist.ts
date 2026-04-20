/**
 * Known brand typosquat / homoglyph hostnames (registrable labels, lowercase).
 * Shared by URL static analysis and sender reputation (email domain checks).
 */
export const BRAND_TYPOSQUAT_HOSTNAMES = new Set<string>([
  'paypa1.com',
  'g00gle.com',
  'amaz0n.com',
  'faceb00k.com',
  'appl3.com',
  'micr0s0ft.com',
  'yah00.com',
  'rnicrosoft.com',
  'inv0ices.com',
  'xn--pple-43d.com', // αpple.com — Cyrillic 'а' homoglyph
]);

/**
 * Returns true if hostname (with or without port, with or without www.) matches a known typosquat entry.
 */
export function isKnownBrandTyposquatHost(hostname: string): boolean {
  let host = hostname.split(':')[0]?.toLowerCase() ?? '';
  if (host.startsWith('www.')) {
    host = host.slice(4);
  }
  return BRAND_TYPOSQUAT_HOSTNAMES.has(host);
}
