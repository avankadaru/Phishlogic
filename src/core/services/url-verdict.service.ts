/**
 * UrlVerdictService — URL-task specialization of VerdictService.
 *
 * Extends the email-focused base with URL-specific rules:
 *   1. Known-host critical bypass: if a critical signal is the ONLY
 *      indicator and its URL's registrable domain is in the Tranco
 *      top-1M / KNOWN_AUTH_ORIGINS, suppress the bypass and fall
 *      through to the weighted calculation. automatic_download_detected
 *      is never suppressed.
 *   2. AI short-circuit preserved: when a `final_verdict` signal is
 *      present (hybrid / AI modes), the base implementation already
 *      short-circuits; we do NOT touch that path so the AI verdict is
 *      honored verbatim.
 *
 * Email behavior is 100% unchanged — the base VerdictService is used for
 * email inputs via the VerdictFactory.
 */
import type { AnalysisSignal, Verdict } from '../models/analysis-result.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import { getKnownDomainPolicy } from '../policies/known-domain.policy.js';
import type { VerdictResult } from './verdict.service.js';
import { VerdictService } from './verdict.service.js';

const logger = getLogger();

/**
 * Signals which must NEVER be downgraded by the known-host check.
 * Browser-triggered downloads and verified TI hits are severe regardless
 * of how reputable the host appears.
 */
const NEVER_DOWNGRADE: ReadonlySet<string> = new Set([
  'automatic_download_detected',
  'url_in_malware_database',
  'url_in_phishing_database',
]);

export class UrlVerdictService extends VerdictService {
  /**
   * The URL under analysis. Set explicitly by the factory / caller before
   * calculateVerdict so we can consult the known-domain policy without
   * re-deriving it from the signal set.
   */
  private targetUrl: string | null = null;

  setTargetUrl(url: string | null): void {
    this.targetUrl = url;
  }

  override calculateVerdict(
    signals: AnalysisSignal[],
    analyzerWeights: Map<string, number>
  ): VerdictResult {
    // If AI mode (final_verdict present) delegate straight through so the AI
    // verdict is honored without any native-side rewriting.
    const hasFinalVerdict = signals.some(
      (s) => (s.signalType as string) === 'final_verdict'
    );
    if (hasFinalVerdict) {
      logger.debug({
        msg: 'UrlVerdictService: final_verdict present, delegating to base (AI short-circuit)',
      });
      return super.calculateVerdict(signals, analyzerWeights);
    }

    // Apply known-host demotion BEFORE the base runs, so that a single
    // "critical" TI hit on google.com never triggers the bypass.
    const demoted = this.applyKnownHostDemotion(signals);
    const result = super.calculateVerdict(demoted, analyzerWeights);

    const clamped = this.applyKnownHostVerdictFloor(result, signals);

    logger.info({
      msg: 'UrlVerdictService verdict',
      targetUrl: this.targetUrl,
      verdict: clamped.verdict,
      score: clamped.score,
      originalSignalCount: signals.length,
      demotedSignalCount: demoted.length,
      clamped: clamped.verdict !== result.verdict || clamped.score !== result.score,
    });

    return clamped;
  }

  /**
   * Override: add URL-specific critical-threat rules.
   * Currently this just delegates; the real work happens in
   * applyKnownHostDemotion before the base sees the signals.
   */
  protected override detectCriticalThreat(
    signals: AnalysisSignal[]
  ): { reason: string } | null {
    return super.detectCriticalThreat(signals);
  }

  /**
   * Final safety net for legitimate brands: if the URL is on a known-safe host
   * and no NEVER_DOWNGRADE signal is present, clamp the verdict.
   *
   *   - bare known-safe host (no path/query/hash) -> force Safe (score <= 1.5)
   *   - non-bare known-safe host + Malicious      -> demote to Suspicious (score <= 6.5)
   *   - non-bare known-safe host + Suspicious     -> leave as-is (allowed)
   *
   * This protects flows like https://www.google.com from accumulating enough
   * medium signals to land on Suspicious or Malicious based on heuristic noise.
   */
  private applyKnownHostVerdictFloor(
    result: VerdictResult,
    signals: AnalysisSignal[]
  ): VerdictResult {
    if (!this.targetUrl) return result;

    const hasUndowngradable = signals.some((s) => NEVER_DOWNGRADE.has(s.signalType));
    if (hasUndowngradable) return result;

    const policy = getKnownDomainPolicy();
    if (!policy.isKnownSafeHost(this.targetUrl)) return result;

    if (this.isBareKnownHostUrl(this.targetUrl)) {
      if (result.verdict === 'Safe' && result.score <= 1.5) return result;

      logger.info({
        msg: 'UrlVerdictService: clamping bare known-safe host to Safe',
        targetUrl: this.targetUrl,
        previousVerdict: result.verdict,
        previousScore: result.score,
      });

      const cappedScore = Math.min(result.score, 1.5);
      return {
        ...result,
        verdict: 'Safe',
        score: cappedScore,
        alertLevel: 'none',
        redFlags: [
          {
            category: 'suspicious_behavior',
            message: 'Known brand: analysis findings downgraded to informational.',
            severity: 'low',
          },
          ...result.redFlags,
        ],
      };
    }

    if (result.verdict === 'Malicious') {
      logger.info({
        msg: 'UrlVerdictService: demoting Malicious to Suspicious for known-safe host (path)',
        targetUrl: this.targetUrl,
        previousScore: result.score,
      });

      return {
        ...result,
        verdict: 'Suspicious',
        score: Math.min(result.score, 6.5),
        alertLevel: result.alertLevel === 'high' ? 'medium' : result.alertLevel,
      };
    }

    return result;
  }

  /**
   * Bare host means: scheme://host with no path beyond '/', no query, no hash.
   * Exposed as a method so unit tests can exercise it directly.
   */
  private isBareKnownHostUrl(url: string): boolean {
    try {
      const u = new URL(url);
      const path = u.pathname || '/';
      const search = u.search || '';
      const hash = u.hash || '';
      const bare = (path === '' || path === '/') && (search === '' || search === '?') && hash === '';
      return bare;
    } catch {
      return false;
    }
  }

  /**
   * If targetUrl is known-safe, downgrade (but do not drop) URL-specific
   * critical signals so they contribute to the weighted score instead of
   * triggering an instant Malicious verdict. Browser-triggered downloads
   * and verified TI hits are always preserved.
   */
  private applyKnownHostDemotion(signals: AnalysisSignal[]): AnalysisSignal[] {
    if (!this.targetUrl) return signals;
    const policy = getKnownDomainPolicy();
    if (!policy.isKnownSafeHost(this.targetUrl)) return signals;

    return signals.map((signal) => {
      if (signal.severity !== 'critical') return signal;
      if (NEVER_DOWNGRADE.has(signal.signalType)) return signal;

      logger.info({
        msg: 'UrlVerdictService: demoting critical signal for known-safe host',
        targetUrl: this.targetUrl,
        signalType: signal.signalType,
      });
      return { ...signal, severity: 'medium' as const };
    });
  }
}

// Re-export VerdictResult/Verdict for factory callers convenience.
export type { VerdictResult, Verdict };
