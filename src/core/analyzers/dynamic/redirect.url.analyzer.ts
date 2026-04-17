/**
 * RedirectUrlAnalyzer — URL-task specialization of RedirectAnalyzer.
 *
 * Differences from the base (email) behavior:
 *   1. 1-hop shortener resolver: when the target URL is a known shortener
 *      (bit.ly, t.co, tinyurl.com, goo.gl, ow.ly, is.gd, buff.ly,
 *      rebrand.ly) we perform a single navigation through the shared
 *      browser pool and emit a `suspicious_redirect` (severity: low) so
 *      downstream analyzers see the resolved destination.
 *   2. Known-domain redirect/script downgrade: if the final URL is a
 *      known-safe host, suspicious_redirect / script_execution_detected
 *      signals are demoted. automatic_download_detected stays untouched
 *      (browser-triggered downloads are severe regardless of origin).
 */
import { getBrowserPool } from '../../../infrastructure/browser/browser-pool.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import type { AnalysisSignal, SignalSeverity } from '../../models/analysis-result.js';
import type { ContentPrescanMode } from '../../models/content-prescan.js';
import type { NormalizedInput } from '../../models/input.js';
import { isUrlInput } from '../../models/input.js';
import { getKnownDomainPolicy } from '../../policies/known-domain.policy.js';
import { RedirectAnalyzer } from './redirect.analyzer.js';

const logger = getLogger();

/** 1-hop shortener hostnames we'll resolve via Playwright. */
const KNOWN_SHORTENERS = new Set<string>([
  'bit.ly',
  't.co',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rebrand.ly',
  'rb.gy',
  'cutt.ly',
  'shorturl.at',
  'tiny.cc',
]);

const RESOLVE_TIMEOUT_MS = 4000;

function downgrade(severity: SignalSeverity): SignalSeverity {
  switch (severity) {
    case 'critical': return 'medium';
    case 'high': return 'low';
    case 'medium': return 'low';
    default: return severity;
  }
}

function extractHost(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export class RedirectUrlAnalyzer extends RedirectAnalyzer {
  override getName(): string {
    return 'RedirectAnalyzer';
  }

  getSupportedPrescanModes(): ContentPrescanMode[] {
    return ['url'];
  }

  override async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals = await super.analyze(input);
    if (!isUrlInput(input)) return signals;

    const url = input.data.url;
    const policy = getKnownDomainPolicy();
    const host = extractHost(url);

    // 1-hop shortener resolver
    let resolvedUrl: string | null = null;
    if (host && KNOWN_SHORTENERS.has(host)) {
      resolvedUrl = await this.resolveShortener(url);
      if (resolvedUrl && resolvedUrl !== url) {
        const resolvedHost = extractHost(resolvedUrl);
        const targetIsKnownSafe = resolvedUrl ? policy.isKnownSafeHost(resolvedUrl) : false;
        signals.push(
          this.createSignal({
            signalType: 'suspicious_redirect',
            severity: targetIsKnownSafe ? 'low' : 'medium',
            confidence: 0.75,
            description: `Shortener '${host}' resolved to '${resolvedHost ?? resolvedUrl}'`,
            evidence: {
              shortener: host,
              sourceUrl: url,
              resolvedUrl,
              resolvedHost,
              targetKnownSafe: targetIsKnownSafe,
            },
          })
        );
      }
    }

    // Known-domain downgrade for redirect / script signals
    const out: AnalysisSignal[] = [];
    for (const signal of signals) {
      // automatic_download_detected stays critical regardless of origin.
      if (signal.signalType === 'automatic_download_detected') {
        out.push(signal);
        continue;
      }

      if (
        (signal.signalType === 'suspicious_redirect' ||
          signal.signalType === 'script_execution_detected') &&
        policy.isKnownSafeHost(url)
      ) {
        logger.debug({
          msg: 'RedirectUrlAnalyzer: downgrading signal for known-safe host',
          url,
          signalType: signal.signalType,
          originalSeverity: signal.severity,
        });
        out.push({ ...signal, severity: downgrade(signal.severity) });
        continue;
      }

      out.push(signal);
    }

    logger.info({
      msg: 'RedirectUrlAnalyzer completed',
      url,
      shortenerResolved: resolvedUrl,
      baseSignalCount: signals.length,
      finalSignalCount: out.length,
    });

    return out;
  }

  /**
   * Resolve a 1-hop shortener by following the first navigation via the
   * shared browser pool. Returns the destination URL or null on failure.
   */
  private async resolveShortener(url: string): Promise<string | null> {
    const start = Date.now();
    const pool = getBrowserPool();
    const acquired = await pool.acquirePage('RedirectUrlAnalyzer.shortener');
    const { page, release } = acquired;

    try {
      const response = await page.goto(url, {
        timeout: RESOLVE_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      const finalUrl = response?.url() ?? page.url();
      logger.info({
        msg: '1-hop shortener resolved',
        sourceUrl: url,
        finalUrl,
        durationMs: Date.now() - start,
      });
      return finalUrl;
    } catch (err) {
      logger.warn({
        msg: '1-hop shortener resolution failed',
        sourceUrl: url,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
      return null;
    } finally {
      await release();
    }
  }
}
