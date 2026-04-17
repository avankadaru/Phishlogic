/**
 * WHOIS / RDAP Client with Redis caching.
 *
 * Used by URL analysis to detect recently registered domains (a strong
 * phishing signal). Strategy:
 *   1. RDAP first (https://rdap.org/domain/<domain>) — JSON, modern, fast.
 *   2. Fall back to `whois-json` (raw WHOIS over TCP) if RDAP is unavailable
 *      or returns nothing useful.
 *
 * Caching:
 *   - Successful lookups cached 7 days.
 *   - Null/negative lookups cached 30 minutes to avoid hammering registrars.
 *
 * All external calls are traced via `logger.debug` with duration; callers
 * can additionally report a `whois_lookup` cost to the `AnalysisContext`.
 */
import axios from 'axios';
import { parse as parseTldts } from 'tldts';

import { getRedisCache } from '../cache/redis-cache.service.js';
import { getLogger } from '../logging/index.js';

const logger = getLogger();

export interface WhoisResult {
  domain: string;
  registeredAt: string | null; // ISO-8601
  ageDays: number | null;
  registrar: string | null;
  source: 'rdap' | 'whois' | 'cache' | 'negative-cache';
  lookupDurationMs: number;
}

const POSITIVE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const NEGATIVE_TTL_SECONDS = 30 * 60; // 30 min
const RDAP_TIMEOUT_MS = 4000;

function extractRegistrable(input: string): string | null {
  if (!input) return null;
  try {
    const maybeUrl = input.includes('://') ? input : `http://${input}`;
    const parsed = parseTldts(maybeUrl);
    return parsed.domain ?? null;
  } catch {
    return null;
  }
}

function diffDays(from: Date, to: Date = new Date()): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export class WhoisClient {
  async lookup(domainOrUrl: string): Promise<WhoisResult | null> {
    const registrable = extractRegistrable(domainOrUrl);
    if (!registrable) {
      logger.debug({
        msg: 'WhoisClient: could not extract registrable domain',
        input: domainOrUrl,
      });
      return null;
    }

    const cacheKey = `whois:${registrable}`;
    const cache = getRedisCache();
    const cached = await cache.get<WhoisResult | { negative: true }>(cacheKey);
    if (cached) {
      if ('negative' in cached && cached.negative) {
        return {
          domain: registrable,
          registeredAt: null,
          ageDays: null,
          registrar: null,
          source: 'negative-cache',
          lookupDurationMs: 0,
        };
      }
      return {
        ...(cached as WhoisResult),
        // Recompute ageDays from registeredAt so cache stays accurate as time passes
        ageDays: (cached as WhoisResult).registeredAt
          ? diffDays(new Date((cached as WhoisResult).registeredAt as string))
          : null,
        source: 'cache',
      };
    }

    const lookupStart = Date.now();

    // 1. RDAP first
    const rdap = await this.tryRdap(registrable);
    if (rdap) {
      const result: WhoisResult = {
        domain: registrable,
        registeredAt: rdap.registeredAt,
        ageDays: rdap.registeredAt ? diffDays(new Date(rdap.registeredAt)) : null,
        registrar: rdap.registrar,
        source: 'rdap',
        lookupDurationMs: Date.now() - lookupStart,
      };
      await cache.set(cacheKey, result, POSITIVE_TTL_SECONDS);
      logger.debug({
        msg: 'WhoisClient: RDAP success',
        domain: registrable,
        ageDays: result.ageDays,
        durationMs: result.lookupDurationMs,
      });
      return result;
    }

    // 2. whois-json fallback
    const whois = await this.tryWhoisJson(registrable);
    if (whois) {
      const result: WhoisResult = {
        domain: registrable,
        registeredAt: whois.registeredAt,
        ageDays: whois.registeredAt ? diffDays(new Date(whois.registeredAt)) : null,
        registrar: whois.registrar,
        source: 'whois',
        lookupDurationMs: Date.now() - lookupStart,
      };
      await cache.set(cacheKey, result, POSITIVE_TTL_SECONDS);
      logger.debug({
        msg: 'WhoisClient: whois-json success',
        domain: registrable,
        ageDays: result.ageDays,
        durationMs: result.lookupDurationMs,
      });
      return result;
    }

    // 3. Negative cache
    await cache.set(cacheKey, { negative: true }, NEGATIVE_TTL_SECONDS);
    logger.debug({
      msg: 'WhoisClient: no creation date available',
      domain: registrable,
      durationMs: Date.now() - lookupStart,
    });
    return {
      domain: registrable,
      registeredAt: null,
      ageDays: null,
      registrar: null,
      source: 'negative-cache',
      lookupDurationMs: Date.now() - lookupStart,
    };
  }

  private async tryRdap(
    domain: string
  ): Promise<{ registeredAt: string | null; registrar: string | null } | null> {
    try {
      const resp = await axios.get(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        timeout: RDAP_TIMEOUT_MS,
        validateStatus: (s) => s < 500,
      });
      if (resp.status !== 200 || typeof resp.data !== 'object' || !resp.data) {
        return null;
      }
      const events = (resp.data as { events?: Array<{ eventAction?: string; eventDate?: string }> })
        .events;
      const registration = events?.find(
        (e) => e.eventAction === 'registration' || e.eventAction === 'created'
      );
      const registeredAt = registration?.eventDate ?? null;

      const entities = (resp.data as {
        entities?: Array<{ roles?: string[]; vcardArray?: unknown }>;
      }).entities;
      let registrar: string | null = null;
      const registrarEntity = entities?.find((e) => (e.roles ?? []).includes('registrar'));
      if (registrarEntity && Array.isArray(registrarEntity.vcardArray)) {
        const vcard = registrarEntity.vcardArray[1];
        if (Array.isArray(vcard)) {
          const fn = (vcard as unknown[][]).find(
            (field) => Array.isArray(field) && field[0] === 'fn'
          );
          if (fn && typeof fn[3] === 'string') {
            registrar = fn[3];
          }
        }
      }

      if (!registeredAt && !registrar) return null;
      return { registeredAt, registrar };
    } catch (err) {
      logger.debug({
        msg: 'WhoisClient: RDAP lookup failed',
        domain,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async tryWhoisJson(
    domain: string
  ): Promise<{ registeredAt: string | null; registrar: string | null } | null> {
    try {
      // Dynamic import so test environments without TCP can stub this easily.
      const mod: { default?: unknown } = await import('whois-json');
      const whois = (mod.default ?? mod) as (d: string, opts?: unknown) => Promise<unknown>;
      const data = (await whois(domain, { follow: 2, timeout: 5000 })) as Record<string, unknown>;

      const dateFields = ['creationDate', 'created', 'registered', 'createdOn', 'registeredOn'];
      let registeredAt: string | null = null;
      for (const field of dateFields) {
        const v = data[field];
        if (typeof v === 'string' && v.trim().length > 0) {
          const d = new Date(v);
          if (!Number.isNaN(d.getTime())) {
            registeredAt = d.toISOString();
            break;
          }
        }
      }
      const registrar =
        typeof data['registrar'] === 'string' ? (data['registrar'] as string) : null;

      if (!registeredAt && !registrar) return null;
      return { registeredAt, registrar };
    } catch (err) {
      logger.debug({
        msg: 'WhoisClient: whois-json lookup failed',
        domain,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}

let whoisClientInstance: WhoisClient | null = null;

export function getWhoisClient(): WhoisClient {
  if (!whoisClientInstance) {
    whoisClientInstance = new WhoisClient();
  }
  return whoisClientInstance;
}

/**
 * Convenience service that exposes just the "age in days" view most
 * analyzers need. Returns null when the domain is unknown.
 */
export class DomainAgeService {
  async getAgeDays(domainOrUrl: string): Promise<number | null> {
    const r = await getWhoisClient().lookup(domainOrUrl);
    return r?.ageDays ?? null;
  }
}

let domainAgeServiceInstance: DomainAgeService | null = null;

export function getDomainAgeService(): DomainAgeService {
  if (!domainAgeServiceInstance) {
    domainAgeServiceInstance = new DomainAgeService();
  }
  return domainAgeServiceInstance;
}

/** Test-only helper. */
export function resetWhoisClient(): void {
  whoisClientInstance = null;
  domainAgeServiceInstance = null;
}
