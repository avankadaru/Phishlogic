/**
 * Link Reputation Analyzer
 * Checks all URLs against multiple threat intelligence sources
 *
 * Replaces manual URL checking with systematic validation:
 * - URLhaus (malware URLs - free)
 * - PhishTank (phishing URLs - free)
 * - Future: VirusTotal, Google Safe Browsing (requires API keys)
 *
 * All checks run in parallel with Redis caching (24h TTL)
 */

import * as crypto from 'crypto';
import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput, isUrlInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import { getRedisCache } from '../../../infrastructure/cache/redis-cache.service.js';
import { URLhausClient, type URLhausResult } from '../../../infrastructure/external/urlhaus.client.js';
import { PhishTankClient, type PhishTankResult } from '../../../infrastructure/external/phishtank.client.js';

const logger = getLogger();

interface URLReputationResult {
  url: string;
  urlhaus: URLhausResult;
  phishtank: PhishTankResult;
  overallThreat: 'clean' | 'suspicious' | 'malicious';
  confidence: number;
  reasons: string[];
}

/**
 * Link Reputation Analyzer
 * Systematically checks URLs against threat intelligence sources
 */
export class LinkReputationAnalyzer extends BaseAnalyzer {
  private cache = getRedisCache();
  private urlhausClient = new URLhausClient();
  private phishtankClient = new PhishTankClient();

  getName(): string {
    return 'LinkReputationAnalyzer';
  }

  getWeight(): number {
    return this.config.analysis.analyzerWeights.linkReputation; // Configurable from env (default: 2.5)
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    // Applicable to both email (check all links) and URL inputs
    return isEmailInput(input) || isUrlInput(input);
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    // Extract URLs to check
    let urls: string[] = [];

    if (isEmailInput(input)) {
      urls = input.data.parsed.urls || [];
    } else if (isUrlInput(input)) {
      // For URL inputs, the parsed data is directly on input.data
      urls = [(input.data as any).parsed?.url || input.data.url];
    }

    if (urls.length === 0) {
      logger.debug('No URLs to check in input');
      return signals;
    }

    logger.debug({
      msg: 'Starting link reputation analysis',
      urlCount: urls.length,
    });

    // Check all URLs in parallel
    const reputationResults = await Promise.allSettled(
      urls.map((url) => this.checkUrlReputation(url))
    );

    // Process results
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i] || '';
      const resultSettled = reputationResults[i];

      if (!resultSettled) continue;

      if (resultSettled.status === 'fulfilled') {
        const result = resultSettled.value;

        // Generate signals based on reputation
        if (result.overallThreat === 'malicious') {
          // Critical threat detected
          signals.push(
            this.createSignal({
              signalType: 'url_flagged_malicious',
              severity: 'critical',
              confidence: result.confidence,
              description: `URL flagged as malicious: ${result.reasons.join(', ')}`,
              evidence: {
                url: result.url,
                urlhaus: result.urlhaus.found ? {
                  malicious: result.urlhaus.malicious,
                  threatType: result.urlhaus.threatType,
                  dateAdded: result.urlhaus.dateAdded,
                } : null,
                phishtank: result.phishtank.found ? {
                  phishing: result.phishtank.phishing,
                  verified: result.phishtank.verified,
                  target: result.phishtank.target,
                } : null,
                reasons: result.reasons,
              },
            })
          );
        } else if (result.overallThreat === 'suspicious') {
          // Potential threat
          signals.push(
            this.createSignal({
              signalType: 'url_flagged_suspicious',
              severity: 'high',
              confidence: result.confidence,
              description: `URL flagged as suspicious: ${result.reasons.join(', ')}`,
              evidence: {
                url: result.url,
                reasons: result.reasons,
              },
            })
          );
        }

        // Specific threat intelligence signals
        if (result.urlhaus.found && result.urlhaus.malicious) {
          signals.push(
            this.createSignal({
              signalType: 'url_in_malware_database',
              severity: 'critical',
              confidence: 0.98,
              description: `URL found in URLhaus malware database (${result.urlhaus.threatType})`,
              evidence: {
                url: result.url,
                threatType: result.urlhaus.threatType,
                dateAdded: result.urlhaus.dateAdded,
                reporter: result.urlhaus.reporter,
                tags: result.urlhaus.tags,
              },
            })
          );
        }

        if (result.phishtank.found && result.phishtank.phishing) {
          signals.push(
            this.createSignal({
              signalType: 'url_in_phishing_database',
              severity: 'critical',
              confidence: result.phishtank.verified ? 0.98 : 0.85,
              description: result.phishtank.verified
                ? `URL verified as phishing in PhishTank database`
                : `URL reported as phishing in PhishTank database (unverified)`,
              evidence: {
                url: result.url,
                verified: result.phishtank.verified,
                target: result.phishtank.target,
                submittedAt: result.phishtank.submittedAt,
              },
            })
          );
        }
      } else {
        // Check failed - log but don't generate signal
        logger.warn({
          msg: 'URL reputation check failed',
          url,
          error: resultSettled.reason,
        });
      }
    }

    // Domain cohesion check: body links pointing to a domain different from
    // the sender's is a classic phishing pattern. Only applies to email inputs
    // (URL inputs have no "sender" concept).
    if (isEmailInput(input)) {
      const mismatchSignal = this.detectSenderDomainMismatch(
        input.data.parsed.from?.address,
        urls
      );
      if (mismatchSignal) {
        signals.push(mismatchSignal);
      }
    }

    logger.debug({
      msg: 'Link reputation analysis complete',
      urlsChecked: urls.length,
      signalsGenerated: signals.length,
    });

    return signals;
  }

  /**
   * Tracker / CDN / ESP roots that legitimately appear as link hosts even when
   * a brand sends from its own domain. Excluded from mismatch detection to
   * avoid flagging legitimate marketing mail.
   */
  private static readonly ALLOWED_LINK_HOST_ROOTS = new Set<string>([
    'googleusercontent.com',
    'sendgrid.net',
    'mailchimp.com',
    'list-manage.com',
    'amazonses.com',
    'mandrillapp.com',
    'constantcontact.com',
    'bit.ly',
    't.co',
  ]);

  /**
   * Small public-suffix allowlist for correct eTLD+1 extraction on common
   * two-label TLDs. Keeps the check deterministic without pulling in the full
   * public suffix list.
   */
  private static readonly TWO_LABEL_PUBLIC_SUFFIXES = new Set<string>([
    'co.uk',
    'co.in',
    'co.jp',
    'co.kr',
    'co.nz',
    'co.za',
    'com.au',
    'com.br',
    'com.cn',
    'com.mx',
    'com.sg',
    'com.tr',
    'ac.uk',
    'gov.uk',
    'org.uk',
  ]);

  /**
   * Extract an eTLD+1 registrable domain. Returns lowercase, or null if input
   * is malformed.
   */
  private extractRegistrableDomain(host: string | undefined | null): string | null {
    if (!host) return null;
    const cleaned = host.trim().toLowerCase().replace(/^\*\./, '');
    if (!cleaned || cleaned.indexOf('.') === -1) return null;
    const labels = cleaned.split('.').filter((l) => l.length > 0);
    if (labels.length < 2) return null;

    const lastTwo = labels.slice(-2).join('.');
    if (
      labels.length >= 3 &&
      LinkReputationAnalyzer.TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo)
    ) {
      return labels.slice(-3).join('.');
    }
    return lastTwo;
  }

  /**
   * Extract hostname from a URL string; returns null for mailto / javascript /
   * relative / malformed input.
   */
  private extractHostname(url: string): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed.hostname || null;
    } catch {
      return null;
    }
  }

  /**
   * Compare sender registrable domain against body link registrable domains.
   * Emits a single `link_sender_domain_mismatch` signal when at least one
   * externally-hosted link points to a domain that is neither the sender's
   * registrable domain nor an allow-listed tracker/CDN/ESP.
   */
  private detectSenderDomainMismatch(
    fromAddress: string | undefined,
    urls: string[]
  ): AnalysisSignal | null {
    if (!fromAddress) return null;
    const atIdx = fromAddress.lastIndexOf('@');
    if (atIdx === -1) return null;
    const senderDomain = this.extractRegistrableDomain(fromAddress.slice(atIdx + 1));
    if (!senderDomain) return null;

    const linkDomains = new Set<string>();
    for (const url of urls) {
      const host = this.extractHostname(url);
      if (!host) continue;
      const registrable = this.extractRegistrableDomain(host);
      if (!registrable) continue;
      if (registrable === senderDomain) continue;
      if (LinkReputationAnalyzer.ALLOWED_LINK_HOST_ROOTS.has(registrable)) continue;
      linkDomains.add(registrable);
    }

    if (linkDomains.size === 0) return null;

    const mismatched = Array.from(linkDomains);
    const preview = mismatched.slice(0, 3).join(', ');
    const suffix = mismatched.length > 3 ? `, +${mismatched.length - 3} more` : '';

    return this.createSignal({
      signalType: 'link_sender_domain_mismatch',
      severity: 'high',
      confidence: 0.85,
      description: `Body link(s) point to a different domain than the sender (${preview}${suffix})`,
      evidence: {
        senderDomain,
        mismatchedLinkDomains: mismatched,
      },
    });
  }

  /**
   * Check URL reputation against all sources
   * Results are cached for 24 hours
   */
  private async checkUrlReputation(url: string): Promise<URLReputationResult> {
    // Generate cache key
    const cacheKey = this.getCacheKey(url);

    // Check cache first
    const cached = await this.cache.get<URLReputationResult>(cacheKey);
    if (cached) {
      logger.debug({
        msg: 'URL reputation cache hit',
        url,
      });
      return cached;
    }

    logger.debug({
      msg: 'Checking URL reputation (cache miss)',
      url,
    });

    // Query all services in parallel
    const [urlhausResult, phishtankResult] = await Promise.allSettled([
      this.urlhausClient.checkUrl(url),
      this.phishtankClient.checkUrl(url),
    ]);

    // Extract results
    const urlhaus: URLhausResult = urlhausResult.status === 'fulfilled'
      ? urlhausResult.value
      : { found: false, malicious: false };

    const phishtank: PhishTankResult = phishtankResult.status === 'fulfilled'
      ? phishtankResult.value
      : { found: false, phishing: false, verified: false };

    // Combine verdicts with weighted scoring
    const result = this.combineReputationResults(url, urlhaus, phishtank);

    // Cache for 24 hours
    await this.cache.set(cacheKey, result, 86400);

    return result;
  }

  /**
   * Combine results from multiple threat intelligence sources
   */
  private combineReputationResults(
    url: string,
    urlhaus: URLhausResult,
    phishtank: PhishTankResult
  ): URLReputationResult {
    const reasons: string[] = [];
    let threatLevel: 'clean' | 'suspicious' | 'malicious' = 'clean';
    let confidence = 0;

    // URLhaus malware detection (highest priority)
    if (urlhaus.found && urlhaus.malicious) {
      reasons.push(`Active malware distribution (${urlhaus.threatType})`);
      threatLevel = 'malicious';
      confidence = Math.max(confidence, 0.98);
    } else if (urlhaus.found && !urlhaus.malicious) {
      reasons.push('Previously flagged for malware (now offline)');
      threatLevel = 'suspicious';
      confidence = Math.max(confidence, 0.7);
    }

    // PhishTank phishing detection
    if (phishtank.found && phishtank.phishing) {
      if (phishtank.verified) {
        reasons.push('Verified phishing URL');
        threatLevel = 'malicious';
        confidence = Math.max(confidence, 0.98);
      } else {
        reasons.push('Reported as phishing (unverified)');
        threatLevel = threatLevel === 'malicious' ? 'malicious' : 'suspicious';
        confidence = Math.max(confidence, 0.75);
      }
    }

    // Both sources agree - high confidence
    if (urlhaus.malicious && phishtank.phishing) {
      confidence = Math.min(confidence + 0.01, 0.99); // Boost confidence
      reasons.push('Multiple sources confirm threat');
    }

    // Clean URL
    if (reasons.length === 0) {
      confidence = 0.1; // Low confidence in clean verdict (absence of evidence)
    }

    return {
      url,
      urlhaus,
      phishtank,
      overallThreat: threatLevel,
      confidence,
      reasons,
    };
  }

  /**
   * Generate cache key for URL reputation
   */
  private getCacheKey(url: string): string {
    const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
    return `url_reputation:${hash}`;
  }
}
