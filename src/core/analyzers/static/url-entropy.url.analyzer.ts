/**
 * UrlEntropyUrlAnalyzer — URL-task specialization of UrlEntropyAnalyzer.
 *
 * Differences from the base (email) behavior:
 *   1. Known-domain suppression: when the registrable domain is in the
 *      bundled Tranco top-1M (or KNOWN_AUTH_ORIGINS), downgrade / drop
 *      noisy `suspicious_hostname_structure`, `high_entropy_url`,
 *      `https_missing`, and `url_shortener` findings — these are
 *      expected on many legitimate sites.
 *   2. RFC1918 / loopback demotion: raw private IPs produce
 *      `numeric_ip_hostname` at 'medium' severity instead of 'high'.
 *   3. Homoglyph / punycode typosquat boost: when the host is an IDN
 *      (xn-- prefix) and the registrable domain is NOT known-safe,
 *      escalate `typosquat_hostname` to 'critical'.
 *   4. New-domain boost: when WHOIS returns ageDays < 30, emit a
 *      `domain_recently_registered` signal (logged, non-blocking so the
 *      result is deterministic in absence of WHOIS).
 *   5. URL normalization: recursive percent-decode, punycode decode, IP
 *      normalization. Emits `url_obfuscation_detected` if URL was encoded.
 *   6. Brand lookalike detection: Jaro-Winkler similarity against ~30
 *      major brands. Emits `brand_lookalike_domain` for close matches.
 *
 * The base class still does ALL keyword / entropy / TLD work. We only
 * post-process its output and emit additional signals.
 */
import { isIPv4 } from 'node:net';

import { getLogger } from '../../../infrastructure/logging/index.js';
import { getDomainAgeService } from '../../../infrastructure/reputation/whois.client.js';
import { getTrancoService } from '../../../infrastructure/reputation/tranco.service.js';
import type { AnalysisSignal, SignalSeverity } from '../../models/analysis-result.js';
import type { ContentPrescanMode } from '../../models/content-prescan.js';
import type { NormalizedInput } from '../../models/input.js';
import { isUrlInput } from '../../models/input.js';
import { getKnownDomainPolicy } from '../../policies/known-domain.policy.js';
import { normalizeUrl } from '../../utils/url-normalizer.js';
import { jaroWinkler } from '../../utils/string-similarity.js';
import { UrlEntropyAnalyzer } from './url-entropy.analyzer.js';

const logger = getLogger();

const RFC1918 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^127\./];

function isPrivateIPv4(host: string): boolean {
  if (!isIPv4(host)) return false;
  return RFC1918.some((re) => re.test(host));
}

function downgrade(severity: SignalSeverity): SignalSeverity {
  switch (severity) {
    case 'critical': return 'medium';
    case 'high': return 'medium';
    case 'medium': return 'low';
    default: return severity;
  }
}

/** Number of top Tranco domains to use for brand-lookalike detection. */
const BRAND_LIST_TOP_N = 500;

/**
 * Brand list loaded once at module level.
 * Prefers Tranco top-500 labels (dynamic, covers popular domains);
 * falls back to the static JSON file if the Tranco snapshot is tiny
 * (i.e. running on the hardcoded fallback list only).
 */
let brandList: string[] | null = null;
function getBrandList(): string[] {
  if (!brandList) {
    const trancoLabels = getTrancoService().getTopNLabels(BRAND_LIST_TOP_N);
    if (trancoLabels.length >= 50) {
      brandList = trancoLabels;
      logger.info({
        msg: 'Brand lookalike list loaded from Tranco',
        brandCount: brandList.length,
      });
    } else {
      // Tranco snapshot missing or too small — use static JSON fallback
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const data = require('../../../config/brand-list.json') as { brands: string[] };
        brandList = data.brands;
        logger.info({
          msg: 'Brand lookalike list loaded from static JSON fallback',
          brandCount: brandList.length,
        });
      } catch {
        brandList = [];
        logger.warn({ msg: 'Brand lookalike list empty — no Tranco snapshot and JSON fallback failed' });
      }
    }
  }
  return brandList;
}

/** Similarity threshold for brand lookalike detection. */
const BRAND_SIMILARITY_THRESHOLD = 0.85;

export class UrlEntropyUrlAnalyzer extends UrlEntropyAnalyzer {
  override getName(): string {
    return 'UrlEntropyAnalyzer';
  }

  getSupportedPrescanModes(): ContentPrescanMode[] {
    return ['url'];
  }

  override async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals = await super.analyze(input);
    if (!isUrlInput(input)) return signals;

    const url = input.data.url;
    const policy = getKnownDomainPolicy();
    const host = policy.extractHostname(url);
    const isKnownSafe = host ? policy.isKnownSafeHost(host) : false;
    const rawHost = (host ?? '').replace(/^\[|\]$/g, '');
    const isPrivateIp = isPrivateIPv4(rawHost) || rawHost === '::1';
    const isIdn = rawHost.startsWith('xn--') || rawHost.split('.').some((l) => l.startsWith('xn--'));

    const postProcessed: AnalysisSignal[] = [];

    // ── 0. URL Normalization ──────────────────────────────────────────
    const normResult = normalizeUrl(url);
    if (normResult.wasObfuscated) {
      logger.info({
        msg: 'UrlEntropyUrlAnalyzer: obfuscation detected',
        originalUrl: url,
        normalizedUrl: normResult.normalized,
        iterations: normResult.iterations,
        unicodeHostname: normResult.unicodeHostname,
      });
      postProcessed.push(
        this.createSignal({
          signalType: 'url_obfuscation_detected',
          severity: 'medium',
          confidence: Math.min(0.9, 0.5 + normResult.iterations * 0.15),
          description: `URL uses obfuscated encoding (${normResult.iterations} decode pass${normResult.iterations === 1 ? '' : 'es'} required)`,
          evidence: {
            originalUrl: url,
            normalizedUrl: normResult.normalized,
            decodingIterations: normResult.iterations,
            unicodeHostname: normResult.unicodeHostname,
          },
        })
      );
    }

    // ── Post-process base signals ─────────────────────────────────────
    for (const signal of signals) {
      // 1. Known-domain suppression for noisy URL-structure findings
      if (
        isKnownSafe &&
        (signal.signalType === 'suspicious_hostname_structure' ||
          signal.signalType === 'high_entropy_url' ||
          signal.signalType === 'url_shortener' ||
          signal.signalType === 'https_missing')
      ) {
        logger.debug({
          msg: 'UrlEntropyUrlAnalyzer: downgrading signal for known-safe host',
          host,
          signalType: signal.signalType,
          originalSeverity: signal.severity,
        });
        const newSev = downgrade(signal.severity);
        postProcessed.push({
          ...signal,
          severity: newSev,
          description: `${signal.description} (downgraded: host is in Tranco top-1M known domains)`,
          evidence: {
            ...signal.evidence,
            contextDowngraded: true,
            originalSeverity: signal.severity,
            downgradeReason: 'host is in Tranco top-1M known domains',
          },
        });
        continue;
      }

      // 2. RFC1918 demotion of numeric_ip_hostname
      if (signal.signalType === 'numeric_ip_hostname' && isPrivateIp) {
        logger.debug({
          msg: 'UrlEntropyUrlAnalyzer: demoting numeric_ip_hostname for RFC1918 host',
          host: rawHost,
        });
        postProcessed.push({
          ...signal,
          severity: 'medium',
          description: 'URL host is a private/loopback IP address (RFC1918 or 127.0.0.0/8)',
        });
        continue;
      }

      // 3a. Blocklist typosquat → critical (deterministic known-bad match)
      if (signal.signalType === 'typosquat_hostname' && !isKnownSafe) {
        logger.debug({
          msg: 'UrlEntropyUrlAnalyzer: escalating blocklist typosquat to critical',
          host,
          isIdn,
        });
        postProcessed.push({ ...signal, severity: 'critical', confidence: 0.95 });
        continue;
      }

      // 3b. Public IP hostname → critical (non-RFC1918 IPs serving content)
      if (signal.signalType === 'numeric_ip_hostname' && !isPrivateIp && !isKnownSafe) {
        logger.debug({
          msg: 'UrlEntropyUrlAnalyzer: escalating public IP hostname to critical',
          host: rawHost,
        });
        postProcessed.push({ ...signal, severity: 'critical', confidence: 0.9 });
        continue;
      }

      postProcessed.push(signal);
    }

    // ── 4. New-domain boost ───────────────────────────────────────────
    if (host && !isKnownSafe) {
      try {
        const ageDays = await getDomainAgeService().getAgeDays(host);
        if (ageDays !== null && ageDays < 30) {
          postProcessed.push(
            this.createSignal({
              signalType: 'domain_recently_registered',
              severity: 'high',
              confidence: 0.85,
              description: `Domain was registered ${ageDays} day(s) ago — unusually young for a legitimate brand`,
              evidence: { url, host, ageDays },
            })
          );
        } else if (ageDays !== null && ageDays < 180 && isIdn) {
          postProcessed.push(
            this.createSignal({
              signalType: 'domain_recently_registered',
              severity: 'medium',
              confidence: 0.7,
              description: `Young IDN/punycode domain (${ageDays} days) — elevated phishing risk`,
              evidence: { url, host, ageDays, idn: true },
            })
          );
        }
      } catch (err) {
        logger.debug({
          msg: 'UrlEntropyUrlAnalyzer: WHOIS age lookup failed',
          host,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── 4b. DNS resolution check ─────────────────────────────────────
    if (host && !isKnownSafe && !isPrivateIp && !isIPv4(rawHost)) {
      try {
        const dns = await import('node:dns');
        const registrable = policy.extractRegistrableDomain(host);
        const lookupHost = registrable ?? rawHost;
        await Promise.race([
          dns.promises.resolve4(lookupHost),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DNS timeout')), 3000)
          ),
        ]);
      } catch {
        logger.info({
          msg: 'UrlEntropyUrlAnalyzer: domain does not resolve',
          host,
        });
        postProcessed.push(
          this.createSignal({
            signalType: 'domain_resolution_failure',
            severity: 'medium',
            confidence: 0.7,
            description: `Domain "${host}" does not resolve to any IP address`,
            evidence: { url, host, lookupType: 'A' },
          })
        );
      }
    }

    // ── 4c. Prescan navigation failure ─────────────────────────────────
    // When the prescan browser couldn't reach the page (timeout, connection
    // refused, etc.) emit a signal so the user sees why analysis was limited.
    // Only emit when domain_resolution_failure wasn't already added (that
    // covers the "domain doesn't exist" case; this covers "domain resolves
    // but server is unreachable").
    const hasDnsFailure = postProcessed.some(
      (s) => s.signalType === 'domain_resolution_failure'
    );
    if (!hasDnsFailure && !isKnownSafe) {
      const fetchError = (input.riskProfile as any)?.urlFetch?.fetchError;
      if (fetchError) {
        logger.info({
          msg: 'UrlEntropyUrlAnalyzer: prescan navigation failed',
          host,
          fetchError,
        });
        postProcessed.push(
          this.createSignal({
            signalType: 'prescan_navigation_failed',
            severity: 'medium',
            confidence: 0.7,
            description: `Browser could not reach "${host}" — the server may be down, blocking connections, or unreachable`,
            evidence: { url, host, fetchError },
          })
        );
      }
    }

    // ── 5. Brand lookalike detection ──────────────────────────────────
    // Skip if domain is already flagged as typosquat (blocklist hit) or is known-safe
    const alreadyTyposquat = postProcessed.some(
      (s) => s.signalType === 'typosquat_hostname'
    );
    if (!isKnownSafe && !alreadyTyposquat && host) {
      const registrable = policy.extractRegistrableDomain(host);
      if (registrable) {
        // Extract label (domain without TLD): "paypa1.com" → "paypa1"
        const label = registrable.split('.')[0] ?? '';
        let match: { brand: string; similarity: number } | null = null;
        if (label.length >= 3) {
          match = this.findBrandMatch(label);
        }
        // Also try unicode-decoded hostname for punycode domains
        if (!match && normResult.unicodeHostname) {
          const unicodeRegistrable = policy.extractRegistrableDomain(normResult.unicodeHostname);
          if (unicodeRegistrable) {
            const unicodeLabel = unicodeRegistrable.split('.')[0] ?? '';
            if (unicodeLabel.length >= 3 && unicodeLabel !== label) {
              match = this.findBrandMatch(unicodeLabel);
            }
          }
        }
        if (match) {
          logger.info({
            msg: 'UrlEntropyUrlAnalyzer: brand lookalike detected',
            domain: registrable,
            matchedBrand: match.brand,
            similarity: match.similarity,
          });
          postProcessed.push(
            this.createSignal({
              signalType: 'brand_lookalike_domain',
              severity: 'high',
              confidence: Math.min(0.95, match.similarity),
              description: `Domain "${registrable}" is suspiciously similar to brand "${match.brand}" (${Math.round(match.similarity * 100)}% match)`,
              evidence: {
                originalDomain: registrable,
                matchedBrand: match.brand,
                similarity: Math.round(match.similarity * 1000) / 1000,
                algorithm: 'jaro-winkler',
              },
            })
          );
        }
      }
    }

    logger.info({
      msg: 'UrlEntropyUrlAnalyzer completed',
      host,
      isKnownSafe,
      isPrivateIp,
      isIdn,
      obfuscated: normResult.wasObfuscated,
      baseSignalCount: signals.length,
      finalSignalCount: postProcessed.length,
    });

    return postProcessed;
  }

  /**
   * Find the best brand match for a domain label using Jaro-Winkler.
   * Returns null if no brand exceeds the similarity threshold.
   */
  private findBrandMatch(label: string): { brand: string; similarity: number } | null {
    const brands = getBrandList();
    let bestBrand = '';
    let bestScore = 0;

    for (const brand of brands) {
      // Skip exact match (the domain IS the brand — not an impersonator)
      if (label.toLowerCase() === brand.toLowerCase()) continue;

      const score = jaroWinkler(label, brand);
      if (score > bestScore) {
        bestScore = score;
        bestBrand = brand;
      }
    }

    if (bestScore >= BRAND_SIMILARITY_THRESHOLD) {
      return { brand: bestBrand, similarity: bestScore };
    }
    return null;
  }
}
