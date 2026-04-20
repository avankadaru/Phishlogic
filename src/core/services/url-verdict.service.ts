/**
 * UrlVerdictService — self-contained URL verdict engine.
 *
 * Extends the email-focused base with a completely independent scoring
 * pipeline for URL analysis. The base class is used only for:
 *   - detectCriticalThreat() — signal identification (not scoring)
 *   - generateRedFlags() — plain English conversion
 *   - calculateAlertLevel() — score → alert mapping
 *   - categorizeSignal() — signal → UI category
 *
 * Scoring, verdict determination, AI handling, and URL-specific policies
 * are all implemented here — no call to super.calculateVerdict().
 *
 * Email behavior is 100% unchanged — the base VerdictService is used for
 * email inputs via the VerdictFactory.
 */
import type {
  AnalysisSignal,
  Verdict,
  RedFlag,
} from '../models/analysis-result.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import { getKnownDomainPolicy } from '../policies/known-domain.policy.js';
import {
  loadSignalConfig,
  getSignalTypeConfig,
  getSeverityMultiplier,
  getUrlVerdictActions,
  type SignalConfig,
} from '../models/signal-config.js';
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

/**
 * Signal categories that trigger the medium-severity floor for unknown hosts.
 * Any signal with severity >= medium in one of these categories makes the
 * minimum verdict Suspicious when the host is NOT in the Tranco top-1M.
 */
const URL_FLOOR_CATEGORIES: ReadonlySet<string> = new Set([
  'url_pattern',
  'redirect_chain',
  'reputation',
  'credential_harvesting',
  'malicious_behavior',
]);

/**
 * Default cumulative ceiling — controls how quickly signals accumulate to Malicious.
 * Lower = more aggressive (fewer signals needed to reach Malicious).
 */
const DEFAULT_CUMULATIVE_CEILING = 5.0;

export class UrlVerdictService extends VerdictService {
  /**
   * The URL under analysis. Set explicitly by the factory / caller before
   * calculateVerdict so we can consult the known-domain policy without
   * re-deriving it from the signal set.
   */
  private targetUrl: string | null = null;

  /** URL-local signal configuration — loaded independently from base. */
  private urlSignalConfig: SignalConfig;

  constructor(config: any) {
    super(config);
    this.urlSignalConfig = loadSignalConfig();
  }

  setTargetUrl(url: string | null): void {
    this.targetUrl = url;
  }

  override calculateVerdict(
    signals: AnalysisSignal[],
    analyzerWeights: Map<string, number>
  ): VerdictResult {
    // ──────────────────────────────────────────────────────────────────
    // 1. AI MODE — structured output for UI, return early
    // ──────────────────────────────────────────────────────────────────
    const finalVerdictSignal = signals.find(
      (s) => (s.signalType as string) === 'final_verdict'
    );

    if (finalVerdictSignal?.description && finalVerdictSignal.confidence !== undefined) {
      logger.debug({
        msg: 'UrlVerdictService: AI final_verdict present, handling locally',
      });
      return this.handleAiVerdict(finalVerdictSignal, signals);
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. KNOWN-HOST DEMOTION — before any scoring
    // ──────────────────────────────────────────────────────────────────
    const demoted = this.applyKnownHostDemotion(signals);

    // ──────────────────────────────────────────────────────────────────
    // 3. CRITICAL THREAT CHECK — immediate Malicious bypass
    // ──────────────────────────────────────────────────────────────────
    const criticalThreat = this.detectCriticalThreat(demoted);
    if (criticalThreat) {
      logger.warn({
        msg: 'UrlVerdictService: critical threat detected',
        reason: criticalThreat.reason,
        targetUrl: this.targetUrl,
      });

      const redFlags = this.generateRedFlags(demoted);
      const reasoning = this.generateUrlGuidance('Malicious', demoted, redFlags);
      const actions = getUrlVerdictActions(this.urlSignalConfig, 'Malicious');

      return {
        verdict: 'Malicious',
        confidence: 0.9,
        score: 9.0,
        alertLevel: 'high',
        redFlags,
        reasoning,
        actions,
      };
    }

    // ──────────────────────────────────────────────────────────────────
    // 4. URL CUMULATIVE SCORING
    // ──────────────────────────────────────────────────────────────────
    const confidence = this.calculateUrlConfidence(demoted, analyzerWeights);
    let score = Math.round(confidence * 100) / 10; // 0-10, 1 decimal
    let verdict: Verdict = this.determineUrlVerdict(score);

    // ──────────────────────────────────────────────────────────────────
    // 5. SEVERITY FLOORS
    // ──────────────────────────────────────────────────────────────────
    // High/critical signal → min Suspicious
    const hasHighOrCritical = demoted.some(
      (s) => s.severity === 'high' || s.severity === 'critical'
    );
    if (hasHighOrCritical && verdict === 'Safe') {
      verdict = 'Suspicious';
      score = Math.max(score, 4.0);
      logger.info({
        msg: 'UrlVerdictService: severity floor applied (high/critical → Suspicious)',
        targetUrl: this.targetUrl,
      });
    }

    // Medium URL-pattern signal on unknown host → min Suspicious
    if (verdict === 'Safe' && this.hasMediumUrlSignalOnUnknownHost(demoted)) {
      verdict = 'Suspicious';
      score = Math.max(score, 4.0);
      logger.info({
        msg: 'UrlVerdictService: medium URL signal floor applied (unknown host → Suspicious)',
        targetUrl: this.targetUrl,
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // 6. KNOWN-HOST VERDICT FLOOR — post scoring
    // ──────────────────────────────────────────────────────────────────
    let result: VerdictResult = {
      verdict,
      confidence,
      score,
      alertLevel: this.calculateAlertLevel(score, verdict),
      redFlags: this.generateRedFlags(demoted),
      reasoning: this.generateUrlGuidance(verdict, demoted, this.generateRedFlags(demoted)),
      actions: getUrlVerdictActions(this.urlSignalConfig, verdict),
    };

    result = this.applyKnownHostVerdictFloor(result, signals);

    logger.info({
      msg: 'UrlVerdictService verdict',
      targetUrl: this.targetUrl,
      verdict: result.verdict,
      score: result.score,
      confidence: result.confidence,
      signalCount: signals.length,
      demotedSignalCount: demoted.length,
    });

    return result;
  }

  // ════════════════════════════════════════════════════════════════════
  // AI MODE HANDLER
  // ════════════════════════════════════════════════════════════════════

  /**
   * Handle AI final_verdict signal — parse and structure for UI.
   * No scoring logic — the AI has already decided.
   */
  private handleAiVerdict(
    finalVerdictSignal: AnalysisSignal,
    allSignals: AnalysisSignal[]
  ): VerdictResult {
    // Extract AI verdict from description
    const verdictMatch = finalVerdictSignal.description.match(/^VERDICT:\s*(\w+)/i);
    let verdict: Verdict = 'Safe';
    if (verdictMatch?.[1]) {
      const v = verdictMatch[1].toLowerCase();
      if (v === 'malicious') verdict = 'Malicious';
      else if (v === 'suspicious') verdict = 'Suspicious';
    }

    const confidence = Math.max(0, Math.min(1, finalVerdictSignal.confidence));
    const score = Math.round(confidence * 100) / 10;
    const alertLevel = this.calculateAlertLevel(score, verdict);

    // Red flags from top 5 AI signals (exclude final_verdict itself)
    const aiSignals = allSignals
      .filter((s) => (s.signalType as string) !== 'final_verdict' && s.analyzerName === 'AI')
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 5);

    const redFlags: RedFlag[] = aiSignals.map((signal) => ({
      message: signal.description || String(signal.signalType),
      category: this.categorizeSignal(signal.signalType),
      severity: signal.severity,
    }));

    const reasoning = finalVerdictSignal.description.trim();
    const actions = getUrlVerdictActions(this.urlSignalConfig, verdict);

    logger.debug({
      msg: 'UrlVerdictService: AI verdict structured for UI',
      verdict,
      confidence,
      score,
      redFlagsCount: redFlags.length,
    });

    return { verdict, confidence, score, alertLevel, redFlags, reasoning, actions };
  }

  // ════════════════════════════════════════════════════════════════════
  // URL CUMULATIVE SCORING
  // ════════════════════════════════════════════════════════════════════

  /**
   * Cumulative risk scoring — signals add up rather than average.
   *
   * Each signal contributes:
   *   signalConfigBaseWeight × severityMultiplier × confidence
   *
   * Total is normalized to [0, 1] via a configurable ceiling.
   */
  private calculateUrlConfidence(
    signals: AnalysisSignal[],
    _analyzerWeights: Map<string, number>
  ): number {
    if (signals.length === 0) return 0;

    let totalRisk = 0;

    for (const signal of signals) {
      // Skip positive signals (they reduce risk in email, not relevant for URL mode)
      if (['spf_pass', 'dkim_pass', 'domain_reputation_good'].includes(signal.signalType)) {
        continue;
      }

      const typeConfig = getSignalTypeConfig(this.urlSignalConfig, signal.signalType);
      const baseWeight = typeConfig?.baseWeight ?? 1.0;
      const severityMul = getSeverityMultiplier(this.urlSignalConfig, signal.severity);

      const contribution = baseWeight * severityMul * signal.confidence;
      totalRisk += contribution;

      logger.debug({
        msg: 'URL signal contribution',
        signalType: signal.signalType,
        severity: signal.severity,
        confidence: signal.confidence,
        baseWeight,
        severityMul,
        contribution: Math.round(contribution * 1000) / 1000,
      });
    }

    const ceiling = DEFAULT_CUMULATIVE_CEILING;
    const normalized = Math.max(0, Math.min(1, totalRisk / ceiling));

    logger.debug({
      msg: 'URL cumulative score',
      totalRisk: Math.round(totalRisk * 1000) / 1000,
      ceiling,
      normalized: Math.round(normalized * 1000) / 1000,
    });

    return normalized;
  }

  /**
   * Determine verdict from score using configurable thresholds.
   */
  private determineUrlVerdict(score: number): Verdict {
    if (score >= 7.0) return 'Malicious';
    if (score >= 4.0) return 'Suspicious';
    return 'Safe';
  }

  /**
   * Check if any medium+ URL-pattern signal exists on a non-Tranco host.
   * Uses the signal's category from signal-config.json — not hardcoded signal types.
   */
  private hasMediumUrlSignalOnUnknownHost(signals: AnalysisSignal[]): boolean {
    if (!this.targetUrl) return false;

    const policy = getKnownDomainPolicy();
    if (policy.isKnownSafeHost(this.targetUrl)) return false;

    return signals.some((s) => {
      if (s.severity !== 'medium' && s.severity !== 'high' && s.severity !== 'critical') {
        return false;
      }
      const typeConfig = getSignalTypeConfig(this.urlSignalConfig, s.signalType);
      const category = typeConfig?.category;
      return category ? URL_FLOOR_CATEGORIES.has(category) : false;
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // URL-SPECIFIC GUIDANCE
  // ════════════════════════════════════════════════════════════════════

  /**
   * Generate URL-appropriate guidance text (not email-oriented).
   */
  private generateUrlGuidance(
    verdict: Verdict,
    signals: AnalysisSignal[],
    _redFlags: RedFlag[]
  ): string {
    const parts: string[] = [];

    if (verdict === 'Malicious') {
      parts.push('DANGER: This URL is highly likely to be malicious.');
      parts.push('Do not visit this URL. Close the browser tab if already open.');

      if (signals.some((s) => s.signalType === 'automatic_download_detected')) {
        parts.push('An automatic download was triggered — this is a common malware delivery method.');
      }
      if (signals.some((s) => s.signalType === 'url_in_phishing_database' || s.signalType === 'url_in_malware_database' || s.signalType === 'url_flagged_malicious')) {
        parts.push('This URL is flagged in threat intelligence databases as a known threat.');
      }
      if (signals.some((s) => s.signalType === 'typosquat_hostname')) {
        parts.push('The domain is a typosquat — it closely mimics a well-known brand to deceive visitors.');
      }
      if (signals.some((s) => s.signalType === 'brand_lookalike_domain')) {
        parts.push('The domain name is suspiciously similar to a major brand — likely an impersonation attempt.');
      }
      if (signals.some((s) => s.signalType === 'numeric_ip_hostname')) {
        parts.push('The URL uses a raw IP address instead of a domain name — a common indicator of phishing infrastructure.');
      }
      if (signals.some((s) => s.signalType === 'script_execution_detected')) {
        parts.push('Malicious JavaScript execution was detected on this page.');
      }
      if (signals.some((s) => s.signalType === 'form_detected' && s.severity === 'critical')) {
        parts.push('A credential harvesting form was detected on an untrusted domain.');
      }
      if (signals.some((s) => s.signalType === 'domain_resolution_failure')) {
        parts.push('The domain does not resolve to any IP address — it may be a dead phishing page or recently taken-down site.');
      }
      if (signals.some((s) => s.signalType === 'prescan_navigation_failed')) {
        parts.push('The server could not be reached — the page may be down, blocking connections, or hosted on an unusual port.');
      }

    } else if (verdict === 'Suspicious') {
      parts.push('CAUTION: This URL shows characteristics commonly associated with phishing or scam sites.');
      parts.push('Proceed with care and verify the destination before interacting.');

      if (signals.some((s) => s.signalType === 'suspicious_hostname_structure')) {
        parts.push('The hostname structure is unusual — excessive hyphens, subdomains, or non-standard port.');
      }
      if (signals.some((s) => s.signalType === 'suspicious_tld')) {
        parts.push('The top-level domain is frequently abused in phishing campaigns.');
      }
      if (signals.some((s) => s.signalType === 'https_missing')) {
        parts.push('This URL does not use HTTPS — data sent to this site is not encrypted.');
      }
      if (signals.some((s) => s.signalType === 'brand_lookalike_domain')) {
        parts.push('The domain name resembles a well-known brand — verify you are on the official site.');
      }
      if (signals.some((s) => s.signalType === 'form_detected')) {
        parts.push('A login or credential form was detected — do not enter passwords or personal data.');
      }
      if (signals.some((s) => s.signalType === 'suspicious_redirect' || s.signalType === 'shortener_chain_detected')) {
        parts.push('The URL redirects through multiple intermediaries — the final destination may differ from what was shown.');
      }
      if (signals.some((s) => s.signalType === 'domain_recently_registered')) {
        parts.push('This domain was recently registered — legitimate brands have long-established domains.');
      }
      if (signals.some((s) => s.signalType === 'url_obfuscation_detected')) {
        parts.push('The URL uses encoding techniques to hide its true destination.');
      }
      if (signals.some((s) => s.signalType === 'qrcode_in_page')) {
        parts.push('A QR code containing a URL was found on this page — scan with caution.');
      }
      if (signals.some((s) => s.signalType === 'script_execution_detected')) {
        parts.push('Suspicious JavaScript activity was detected on this page.');
      }
      if (signals.some((s) => s.signalType === 'domain_resolution_failure')) {
        parts.push('The domain does not resolve to any IP address — it may be a dead phishing page or recently taken-down site.');
      }
      if (signals.some((s) => s.signalType === 'prescan_navigation_failed')) {
        parts.push('The server could not be reached — the page may be down, blocking connections, or hosted on an unusual port.');
      }

    } else {
      parts.push('This URL appears safe. No significant security concerns were detected.');
      parts.push('Standard security practices still apply — avoid entering sensitive information on unexpected pages.');
    }

    return parts.join(' ');
  }

  // ════════════════════════════════════════════════════════════════════
  // KNOWN-HOST POLICIES (preserved from original)
  // ════════════════════════════════════════════════════════════════════

  /**
   * Override: URL-specific critical threat detection.
   * Delegates to base for signal identification only.
   */
  protected override detectCriticalThreat(
    signals: AnalysisSignal[]
  ): { reason: string } | null {
    return super.detectCriticalThreat(signals);
  }

  /**
   * Final safety net for legitimate brands: if the URL is on a known-safe host
   * and no NEVER_DOWNGRADE signal is present, clamp the verdict.
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
   * triggering an instant Malicious verdict.
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
      return {
        ...signal,
        severity: 'medium' as const,
        description: `${signal.description} (downgraded: critical severity capped — host is in Tranco top-1M)`,
        evidence: {
          ...signal.evidence,
          contextDowngraded: true,
          originalSeverity: signal.severity,
          downgradeReason: 'critical severity capped — host is in Tranco top-1M',
        },
      };
    });
  }
}

// Re-export VerdictResult/Verdict for factory callers convenience.
export type { VerdictResult, Verdict };
