/**
 * Tranco top-domain membership service.
 *
 * Tranco (https://tranco-list.eu/) publishes a research-grade ranking of the
 * top 1M domains on the web, combining Alexa/Umbrella/Majestic/Farsight/etc.
 * We bundle a gzipped snapshot (`data/tranco-top-1m.txt.gz`, one domain per
 * line, rank implied by line number) and expose simple membership/lookup
 * helpers.
 *
 * If the bundled snapshot is missing (e.g. in dev before `scripts/refresh-tranco.ts`
 * has been run), we fall back to a small hardcoded allowlist of very
 * well-known brands so the rest of the URL pipeline can still reason about
 * "known" domains. The fallback is intentionally tiny — the real safety
 * gate is the bundled list plus domain age.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import { getLogger } from '../logging/index.js';

const logger = getLogger();

/**
 * Fallback list used when the bundled Tranco snapshot is not present.
 * These are the registrable domains we already treat as "probably safe"
 * based on the URL test matrix. They mirror KNOWN_AUTH_ORIGINS plus the
 * most common top-level brands referenced in admin-ui/src/data/url-scenarios.ts.
 */
const FALLBACK_TOP_DOMAINS: string[] = [
  'google.com',
  'youtube.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'amazon.com',
  'aws.amazon.com',
  'microsoft.com',
  'microsoftonline.com',
  'live.com',
  'office.com',
  'apple.com',
  'icloud.com',
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'slack.com',
  'salesforce.com',
  'zoom.us',
  'dropbox.com',
  'adobe.com',
  'netflix.com',
  'wikipedia.org',
  'stackoverflow.com',
  'reddit.com',
  'paypal.com',
  'stripe.com',
  'cloudflare.com',
  'yahoo.com',
  'bing.com',
  'ebay.com',
];

export interface TrancoSnapshotMeta {
  version: string;
  generatedAt?: string;
  size: number;
  source: 'bundled' | 'fallback';
}

/**
 * Tranco top-domain service. Loaded once per process; thread-safe by
 * virtue of being a simple in-memory Set.
 */
export class TrancoService {
  private topSet: Set<string> = new Set();
  private rankMap: Map<string, number> = new Map();
  private meta: TrancoSnapshotMeta = {
    version: 'unloaded',
    size: 0,
    source: 'fallback',
  };
  private loaded = false;

  constructor(private readonly dataDir: string = path.resolve(process.cwd(), 'data')) {}

  /**
   * Lazily load the snapshot. Safe to call many times.
   */
  ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    const loadStart = Date.now();

    const gzPath = path.join(this.dataDir, 'tranco-top-1m.txt.gz');
    const metaPath = path.join(this.dataDir, 'tranco-version.json');

    if (fs.existsSync(gzPath)) {
      try {
        const raw = zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8');
        const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          // Support two formats:
          //   (a) "domain.com"                       -> rank = line index + 1
          //   (b) "123,domain.com" (Tranco CSV style) -> explicit rank
          const commaIdx = line.indexOf(',');
          let domain: string;
          let rank: number;
          if (commaIdx !== -1 && /^\d+$/.test(line.slice(0, commaIdx))) {
            const parsedRank = parseInt(line.slice(0, commaIdx), 10);
            rank = Number.isFinite(parsedRank) ? parsedRank : i + 1;
            domain = line.slice(commaIdx + 1).trim().toLowerCase();
          } else {
            rank = i + 1;
            domain = line.trim().toLowerCase();
          }
          if (!domain) continue;
          this.topSet.add(domain);
          this.rankMap.set(domain, rank);
        }
        let version = 'bundled';
        let generatedAt: string | undefined;
        if (fs.existsSync(metaPath)) {
          try {
            const metaJson = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
              version?: string;
              generatedAt?: string;
            };
            version = metaJson.version ?? 'bundled';
            generatedAt = metaJson.generatedAt;
          } catch {
            /* ignore malformed meta */
          }
        }
        this.meta = {
          version,
          generatedAt,
          size: this.topSet.size,
          source: 'bundled',
        };
        logger.info({
          msg: 'Tranco list loaded',
          count: this.topSet.size,
          version,
          generatedAt,
          durationMs: Date.now() - loadStart,
        });
        return;
      } catch (err) {
        logger.warn({
          msg: 'Tranco snapshot load failed, falling back to hardcoded list',
          gzPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fallback path
    for (let i = 0; i < FALLBACK_TOP_DOMAINS.length; i++) {
      const d = FALLBACK_TOP_DOMAINS[i];
      if (!d) continue;
      const dl = d.toLowerCase();
      this.topSet.add(dl);
      this.rankMap.set(dl, i + 1);
    }
    this.meta = {
      version: 'fallback-hardcoded',
      size: this.topSet.size,
      source: 'fallback',
    };
    logger.warn({
      msg: 'Tranco bundled snapshot missing — using hardcoded fallback allowlist',
      fallbackSize: this.topSet.size,
      dataDir: this.dataDir,
      hint: 'Run `tsx scripts/refresh-tranco.ts` to populate data/tranco-top-1m.txt.gz',
      durationMs: Date.now() - loadStart,
    });
  }

  /** Returns true if the registrable domain is present in the snapshot. */
  has(registrable: string): boolean {
    this.ensureLoaded();
    if (!registrable) return false;
    return this.topSet.has(registrable.toLowerCase());
  }

  /** Returns true if the registrable domain is ranked in the top 10,000. */
  isTop10k(registrable: string): boolean {
    const r = this.rank(registrable);
    return r !== null && r <= 10_000;
  }

  /** Returns the rank (1-based) or null if not present. */
  rank(registrable: string): number | null {
    this.ensureLoaded();
    if (!registrable) return null;
    return this.rankMap.get(registrable.toLowerCase()) ?? null;
  }

  getMeta(): TrancoSnapshotMeta {
    this.ensureLoaded();
    return { ...this.meta };
  }

  /** Test-only: replace the in-memory set with a controlled fixture. */
  __setForTest(entries: string[] | Map<string, number>): void {
    this.topSet = new Set();
    this.rankMap = new Map();
    if (entries instanceof Map) {
      for (const [d, r] of entries) {
        this.topSet.add(d.toLowerCase());
        this.rankMap.set(d.toLowerCase(), r);
      }
    } else {
      entries.forEach((d, i) => {
        this.topSet.add(d.toLowerCase());
        this.rankMap.set(d.toLowerCase(), i + 1);
      });
    }
    this.meta = {
      version: 'test',
      size: this.topSet.size,
      source: 'fallback',
    };
    this.loaded = true;
  }
}

let trancoInstance: TrancoService | null = null;

export function getTrancoService(): TrancoService {
  if (!trancoInstance) {
    trancoInstance = new TrancoService();
  }
  return trancoInstance;
}

/** Test-only helper. */
export function resetTrancoService(): void {
  trancoInstance = null;
}
