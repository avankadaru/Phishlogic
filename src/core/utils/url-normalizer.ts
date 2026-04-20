/**
 * URL Normalizer — recursive decode, punycode, IP format normalization.
 *
 * Used by URL analyzers before signal detection to defeat obfuscation:
 *   - Multi-layer percent encoding (%2568%2574%2574%2570 → http)
 *   - Punycode / IDN labels (xn--pple-43d.com → àpple.com)
 *   - Numeric IP formats (0x7f000001, 017700000001, 2130706433 → 127.0.0.1)
 *   - Path traversal cleanup (/../, /./, //)
 */

import { URL } from 'url';

const MAX_DECODE_ITERATIONS = 5;

export interface NormalizationResult {
  /** Fully normalized URL string */
  normalized: string;
  /** True if the URL was decoded/transformed (differs from original) */
  wasObfuscated: boolean;
  /** Number of percent-decode iterations required */
  iterations: number;
  /** Unicode hostname (after punycode decode), if different from original */
  unicodeHostname?: string;
}

/**
 * Normalize a URL by recursively decoding, resolving punycode, and
 * canonicalizing IP addresses and paths.
 */
export function normalizeUrl(raw: string): NormalizationResult {
  const trimmed = raw.trim();
  let decoded = recursiveDecode(trimmed);
  const iterations = decoded.iterations;

  let parsed: URL;
  try {
    parsed = new URL(decoded.value);
  } catch {
    return { normalized: trimmed, wasObfuscated: false, iterations: 0 };
  }

  // Punycode → unicode hostname
  let unicodeHostname: string | undefined;
  try {
    const unicode = domainToUnicode(parsed.hostname);
    if (unicode && unicode !== parsed.hostname) {
      unicodeHostname = unicode;
    }
  } catch { /* keep original */ }

  // Numeric IP normalization (hex, octal, decimal long form → dotted quad)
  const normalizedIp = normalizeNumericIp(parsed.hostname);
  if (normalizedIp) {
    parsed.hostname = normalizedIp;
  }

  // Path normalization: resolve /../, /./, collapse //
  parsed.pathname = normalizePath(parsed.pathname);

  // Lowercase scheme + host (URL constructor already does this, but be explicit)
  const normalized = parsed.toString();

  // Only flag obfuscation for real decode work — not trivial canonicalization
  // like trailing slash addition or case normalization by the URL constructor.
  const wasObfuscated = iterations > 1 || !!unicodeHostname || !!normalizedIp;

  return { normalized, wasObfuscated, iterations, unicodeHostname };
}

/**
 * Recursively percent-decode until stable (max MAX_DECODE_ITERATIONS).
 */
function recursiveDecode(value: string): { value: string; iterations: number } {
  let current = value;
  let iterations = 0;

  for (let i = 0; i < MAX_DECODE_ITERATIONS; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      break; // malformed encoding — stop
    }
    iterations++;
    if (decoded === current) break;
    current = decoded;
  }

  return { value: current, iterations };
}

/**
 * Convert punycode hostname to unicode using Node built-in.
 */
function domainToUnicode(hostname: string): string {
  // Node's url module has domainToUnicode
  try {
    const urlModule = await_free_domainToUnicode(hostname);
    return urlModule;
  } catch {
    return hostname;
  }
}

/** Synchronous wrapper — Node's url.domainToUnicode is sync. */
function await_free_domainToUnicode(hostname: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { domainToUnicode: dtu } = require('url') as { domainToUnicode: (d: string) => string };
  return dtu(hostname);
}

/**
 * Normalize numeric IP formats to dotted-quad:
 *   - Hex: 0x7f000001 → 127.0.0.1
 *   - Octal: 0177.0.0.01 → 127.0.0.1
 *   - Decimal long: 2130706433 → 127.0.0.1
 *   - Hex dotted: 0x7f.0x0.0x0.0x1 → 127.0.0.1
 *
 * Returns null if hostname is not a numeric IP.
 */
export function normalizeNumericIp(hostname: string): string | null {
  // Already a standard dotted-quad?
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return null; // already normal
  }

  // Single decimal integer (e.g. 2130706433)
  if (/^\d+$/.test(hostname)) {
    const num = parseInt(hostname, 10);
    if (num >= 0 && num <= 0xffffffff) {
      return longToQuad(num);
    }
  }

  // Single hex integer (e.g. 0x7f000001)
  if (/^0x[0-9a-fA-F]+$/i.test(hostname)) {
    const num = parseInt(hostname, 16);
    if (num >= 0 && num <= 0xffffffff) {
      return longToQuad(num);
    }
  }

  // Dotted with hex/octal octets (e.g. 0177.0.0.01 or 0x7f.0x0.0x0.0x1)
  const parts = hostname.split('.');
  if (parts.length === 4) {
    const octets = parts.map(parseOctet);
    if (octets.every((o) => o !== null && o >= 0 && o <= 255)) {
      return octets.join('.');
    }
  }

  return null;
}

function parseOctet(s: string): number | null {
  if (/^0x[0-9a-fA-F]+$/i.test(s)) return parseInt(s, 16);
  if (/^0[0-7]+$/.test(s) && s.length > 1) return parseInt(s, 8);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

function longToQuad(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join('.');
}

/**
 * Normalize URL path: resolve /../, /./, collapse //.
 */
function normalizePath(path: string): string {
  // Collapse multiple slashes
  let normalized = path.replace(/\/\/+/g, '/');
  // Resolve /./ and /../
  const segments: string[] = [];
  for (const segment of normalized.split('/')) {
    if (segment === '.') continue;
    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  normalized = segments.join('/') || '/';
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  return normalized;
}
