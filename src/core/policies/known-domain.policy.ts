/**
 * Known-Domain Policy
 *
 * Centralizes the logic for deciding "is this host a well-known brand we
 * should trust by default?" Combines two inputs:
 *   1. The bundled Tranco top-1M snapshot.
 *   2. Optional WHOIS-derived domain age.
 *
 * Also exposes the canonical KNOWN_AUTH_ORIGINS allowlist used by the URL
 * analyzer subclasses (e.g. to suppress a `credential_form` critical on
 * accounts.google.com / login.microsoftonline.com / etc.) and a
 * `downgradeSeverityForKnownHost` helper so analyzers can rewrite their
 * own output consistently before it reaches the verdict service.
 */
import { parse as parseTldts } from 'tldts';

import { getLogger } from '../../infrastructure/logging/index.js';
import { getTrancoService } from '../../infrastructure/reputation/tranco.service.js';
import {
  getDomainAgeService,
  type WhoisResult,
} from '../../infrastructure/reputation/whois.client.js';
import type { SignalSeverity } from '../models/analysis-result.js';

const logger = getLogger();

/**
 * Hostnames where seeing a credential form / redirect / script load is
 * expected and should NOT trigger a Malicious verdict.
 * Populated from real-world OAuth / SSO / account-recovery endpoints.
 */
export const KNOWN_AUTH_ORIGINS: ReadonlySet<string> = new Set([
  'accounts.google.com',
  'login.microsoft.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'github.com',
  'login.yahoo.com',
  'signin.aws.amazon.com',
  'auth0.com',
  'okta.com',
  'login.salesforce.com',
  'login.okta.com',
  'secure.paypal.com',
  'www.paypal.com',
  'login.yahoo.com',
  'signin.ebay.com',
  'accounts.spotify.com',
  'account.live.com',
]);

/** Two-label public suffixes we need to keep 3 labels for (eTLD+1). */
const TWO_LABEL_PUBLIC_SUFFIXES = new Set<string>([
  'co.uk', 'co.jp', 'co.kr', 'co.in', 'co.nz', 'co.za', 'co.il',
  'com.au', 'com.br', 'com.mx', 'com.sg', 'com.tr',
  'ac.uk', 'gov.uk', 'org.uk',
]);

export interface KnownDomainDecision {
  host: string | null;
  registrable: string | null;
  isKnownSafeHost: boolean;
  isKnownAuthOrigin: boolean;
  trancoRank: number | null;
  ageDays: number | null;
  reasons: string[];
  evaluatedAt: string;
}

export interface KnownDomainPolicyOptions {
  /**
   * If true, the policy will fetch WHOIS for unknown registrables. When
   * false (the default for synchronous call-sites) age is left as null.
   */
  fetchWhois?: boolean;
  /**
   * Minimum domain age (days) required for a non-Tranco domain to still
   * qualify as "known safe". Default 180.
   */
  minAgeDaysForUnknown?: number;
}

export class KnownDomainPolicy {
  /** Extract eTLD+1 from a hostname. */
  extractRegistrableDomain(host: string | undefined | null): string | null {
    if (!host) return null;
    const cleaned = host.trim().toLowerCase().replace(/^\*\./, '');
    if (!cleaned || cleaned.indexOf('.') === -1) return null;
    // Prefer tldts when the public suffix list is available
    try {
      const parsed = parseTldts(`http://${cleaned}`);
      if (parsed.domain) return parsed.domain;
    } catch {
      /* fall through to manual */
    }
    const labels = cleaned.split('.').filter((l) => l.length > 0);
    if (labels.length < 2) return null;
    const lastTwo = labels.slice(-2).join('.');
    if (labels.length >= 3 && TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
      return labels.slice(-3).join('.');
    }
    return lastTwo;
  }

  /** Extract hostname from a URL (or hostname) string. */
  extractHostname(urlOrHost: string): string | null {
    if (!urlOrHost) return null;
    // Reject non-http schemes explicitly before attempting to parse so that
    // strings like "mailto:a@b.com" don't round-trip through `http://...`.
    const schemeMatch = /^([a-z][a-z0-9+\-.]*):/i.exec(urlOrHost);
    if (schemeMatch && schemeMatch[1] && !['http', 'https'].includes(schemeMatch[1].toLowerCase())) {
      // The "//" check distinguishes e.g. "http://" from a bare "host:port".
      if (!urlOrHost.startsWith(`${schemeMatch[1]}://`)) {
        return null;
      }
    }
    try {
      const u = urlOrHost.includes('://') ? new URL(urlOrHost) : new URL(`http://${urlOrHost}`);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.hostname.toLowerCase() || null;
    } catch {
      return null;
    }
  }

  /** Fast, synchronous check against the Tranco snapshot only. */
  isKnownSafeHost(urlOrHost: string): boolean {
    const host = this.extractHostname(urlOrHost);
    if (!host) return false;
    if (KNOWN_AUTH_ORIGINS.has(host)) return true;
    const registrable = this.extractRegistrableDomain(host);
    if (!registrable) return false;
    return getTrancoService().has(registrable);
  }

  /** Alias for isKnownSafeHost (accepts full URLs). */
  isKnownSafeUrl(url: string): boolean {
    return this.isKnownSafeHost(url);
  }

  /** True if the host is an approved auth/SSO origin. */
  isKnownAuthOrigin(urlOrHost: string): boolean {
    const host = this.extractHostname(urlOrHost);
    return host !== null && KNOWN_AUTH_ORIGINS.has(host);
  }

  /**
   * Rich decision object. When `fetchWhois` is true, this may issue a
   * WHOIS/RDAP lookup (cached); otherwise `ageDays` is left null.
   */
  async evaluate(
    urlOrHost: string,
    options: KnownDomainPolicyOptions = {}
  ): Promise<KnownDomainDecision> {
    const { fetchWhois = false, minAgeDaysForUnknown = 180 } = options;
    const start = Date.now();
    const host = this.extractHostname(urlOrHost);
    const registrable = host ? this.extractRegistrableDomain(host) : null;
    const reasons: string[] = [];

    let isKnownAuthOrigin = false;
    if (host && KNOWN_AUTH_ORIGINS.has(host)) {
      isKnownAuthOrigin = true;
      reasons.push(`host '${host}' is in KNOWN_AUTH_ORIGINS`);
    }

    let trancoRank: number | null = null;
    if (registrable) {
      trancoRank = getTrancoService().rank(registrable);
      if (trancoRank !== null) {
        reasons.push(`Tranco rank ${trancoRank}`);
      }
    }

    let ageDays: number | null = null;
    if (fetchWhois && registrable) {
      try {
        const age = await getDomainAgeService().getAgeDays(registrable);
        ageDays = age;
        if (age !== null) {
          reasons.push(`WHOIS age ${age}d`);
        } else {
          reasons.push('WHOIS age unknown');
        }
      } catch (err) {
        logger.debug({
          msg: 'KnownDomainPolicy: WHOIS lookup failed',
          registrable,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const isKnownByTranco = trancoRank !== null;
    const isKnownByAge =
      ageDays !== null && ageDays >= minAgeDaysForUnknown && registrable !== null;
    const isKnownSafeHost = isKnownAuthOrigin || isKnownByTranco || isKnownByAge;

    const decision: KnownDomainDecision = {
      host,
      registrable,
      isKnownSafeHost,
      isKnownAuthOrigin,
      trancoRank,
      ageDays,
      reasons,
      evaluatedAt: new Date().toISOString(),
    };

    logger.debug({
      msg: 'KnownDomainPolicy: decision',
      ...decision,
      evaluationDurationMs: Date.now() - start,
    });

    return decision;
  }

  /**
   * Downgrade a severity when the host is known-safe. Rules:
   *   critical -> medium
   *   high     -> low
   *   medium   -> low
   *   low/info -> unchanged
   * If the host is NOT known-safe, returns the severity unchanged.
   */
  downgradeSeverityForKnownHost(
    severity: SignalSeverity,
    urlOrHost: string
  ): SignalSeverity {
    if (!this.isKnownSafeHost(urlOrHost)) return severity;
    switch (severity) {
      case 'critical':
        return 'medium';
      case 'high':
        return 'low';
      case 'medium':
        return 'low';
      default:
        return severity;
    }
  }

  /**
   * Convenience: decide once and surface whether the given host should
   * bypass the verdict critical-path. Used by UrlVerdictService.
   */
  shouldBypassCritical(urlOrHost: string): boolean {
    return this.isKnownSafeHost(urlOrHost);
  }
}

let policyInstance: KnownDomainPolicy | null = null;

export function getKnownDomainPolicy(): KnownDomainPolicy {
  if (!policyInstance) {
    policyInstance = new KnownDomainPolicy();
  }
  return policyInstance;
}

/** Test-only. */
export function resetKnownDomainPolicy(): void {
  policyInstance = null;
}

// Re-export types consumers may need
export type { WhoisResult };
