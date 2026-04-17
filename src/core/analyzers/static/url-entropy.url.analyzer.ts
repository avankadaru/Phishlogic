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
 *      `numeric_ip_hostname` at 'low' severity instead of 'high'.
 *   3. Homoglyph / punycode typosquat boost: when the host is an IDN
 *      (xn-- prefix) and the registrable domain is NOT known-safe,
 *      escalate `typosquat_hostname` to 'critical'.
 *   4. New-domain boost: when WHOIS returns ageDays < 30, emit a
 *      `domain_recently_registered` signal (logged, non-blocking so the
 *      result is deterministic in absence of WHOIS).
 *
 * The base class still does ALL keyword / entropy / TLD work. We only
 * post-process its output and emit at most one additional signal.
 */
import { isIPv4 } from 'node:net';

import { getLogger } from '../../../infrastructure/logging/index.js';
import { getDomainAgeService } from '../../../infrastructure/reputation/whois.client.js';
import type { AnalysisSignal, SignalSeverity } from '../../models/analysis-result.js';
import type { ContentPrescanMode } from '../../models/content-prescan.js';
import type { NormalizedInput } from '../../models/input.js';
import { isUrlInput } from '../../models/input.js';
import { getKnownDomainPolicy } from '../../policies/known-domain.policy.js';
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
    case 'high': return 'low';
    case 'medium': return 'low';
    default: return severity;
  }
}

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
        postProcessed.push({ ...signal, severity: downgrade(signal.severity) });
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
          severity: 'low',
          description: 'URL host is a private/loopback IP address (RFC1918 or 127.0.0.0/8)',
        });
        continue;
      }

      // 3. Homoglyph / punycode typosquat boost
      if (signal.signalType === 'typosquat_hostname' && isIdn && !isKnownSafe) {
        logger.debug({
          msg: 'UrlEntropyUrlAnalyzer: escalating typosquat to critical for IDN/punycode host',
          host,
        });
        postProcessed.push({ ...signal, severity: 'critical', confidence: 0.95 });
        continue;
      }

      postProcessed.push(signal);
    }

    // 4. New-domain boost (fire-and-forget; if WHOIS fails we silently skip).
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

    logger.info({
      msg: 'UrlEntropyUrlAnalyzer completed',
      host,
      isKnownSafe,
      isPrivateIp,
      isIdn,
      baseSignalCount: signals.length,
      finalSignalCount: postProcessed.length,
    });

    return postProcessed;
  }
}
