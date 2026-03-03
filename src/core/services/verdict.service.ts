/**
 * Verdict Service
 * Calculates final verdict, score, red flags, and alert level from analysis signals
 */

import type {
  Verdict,
  AnalysisSignal,
  RedFlag,
  RedFlagCategory,
  AlertLevel,
} from '../models/analysis-result.js';
import type { AppConfig } from '../../config/app.config.js';
import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();

/**
 * Verdict calculation result
 */
export interface VerdictResult {
  verdict: Verdict;
  confidence: number;
  score: number;
  alertLevel: AlertLevel;
  redFlags: RedFlag[];
  reasoning: string;
}

/**
 * Verdict Service
 */
export class VerdictService {
  constructor(private config: AppConfig) {}

  /**
   * Calculate verdict from analysis signals
   */
  calculateVerdict(signals: AnalysisSignal[], analyzerWeights: Map<string, number>): VerdictResult {
    // Calculate weighted confidence score
    const confidence = this.calculateConfidence(signals, analyzerWeights);

    // Convert to 0-10 score
    const score = this.convertToUserScore(confidence);

    // Determine verdict
    const verdict = this.determineVerdict(confidence);

    // Calculate alert level
    const alertLevel = this.calculateAlertLevel(score, verdict);

    // Generate red flags
    const redFlags = this.generateRedFlags(signals);

    // Generate reasoning
    const reasoning = this.generateReasoning(verdict, signals, redFlags);

    logger.debug({
      msg: 'Verdict calculated',
      verdict,
      confidence,
      score,
      alertLevel,
      redFlagsCount: redFlags.length,
    });

    return {
      verdict,
      confidence,
      score,
      alertLevel,
      redFlags,
      reasoning,
    };
  }

  /**
   * Calculate weighted confidence from signals
   */
  private calculateConfidence(signals: AnalysisSignal[], analyzerWeights: Map<string, number>): number {
    if (signals.length === 0) {
      return 0;
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const weight = analyzerWeights.get(signal.analyzerName) ?? 1.0;

      // Positive signals (pass) decrease risk, negative signals increase risk
      const signalValue = this.getSignalValue(signal);

      weightedSum += signalValue * signal.confidence * weight;
      totalWeight += weight;
    }

    const avgConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, avgConfidence));
  }

  /**
   * Get signal value (positive or negative)
   */
  private getSignalValue(signal: AnalysisSignal): number {
    // Positive signals (decrease risk)
    const positiveSignals = ['spf_pass', 'dkim_pass', 'domain_reputation_good'];

    if (positiveSignals.includes(signal.signalType)) {
      return -0.5; // Reduce risk
    }

    // Negative signals (increase risk) - weighted by severity
    const severityMultiplier = {
      low: 0.25,
      medium: 0.5,
      high: 0.75,
      critical: 1.0,
    };

    return severityMultiplier[signal.severity];
  }

  /**
   * Convert internal confidence (0-1) to user-facing score (0-10)
   */
  private convertToUserScore(confidence: number): number {
    // Scale confidence to 0-10
    const score = confidence * 10;

    // Round to 1 decimal place
    return Math.round(score * 10) / 10;
  }

  /**
   * Determine verdict based on confidence
   */
  private determineVerdict(confidence: number): Verdict {
    if (confidence >= this.config.analysis.thresholds.malicious) {
      return 'Malicious';
    } else if (confidence >= this.config.analysis.thresholds.suspicious) {
      return 'Suspicious';
    } else {
      return 'Safe';
    }
  }

  /**
   * Calculate alert level based on score and verdict
   */
  private calculateAlertLevel(score: number, verdict: Verdict): AlertLevel {
    if (verdict === 'Malicious' || score >= 7.0) {
      return 'high';
    } else if (verdict === 'Suspicious' || score >= 4.0) {
      return 'medium';
    } else if (score >= 2.0) {
      return 'low';
    } else {
      return 'none';
    }
  }

  /**
   * Generate plain English red flags from signals
   */
  private generateRedFlags(signals: AnalysisSignal[]): RedFlag[] {
    const redFlags: RedFlag[] = [];
    const seenCategories = new Set<string>();

    for (const signal of signals) {
      // Skip positive signals
      if (['spf_pass', 'dkim_pass', 'domain_reputation_good'].includes(signal.signalType)) {
        continue;
      }

      // Convert signal to red flag
      const redFlag = this.signalToRedFlag(signal);

      // Avoid duplicate categories for similar signals
      const categoryKey = `${redFlag.category}-${redFlag.severity}`;
      if (!seenCategories.has(categoryKey)) {
        redFlags.push(redFlag);
        seenCategories.add(categoryKey);
      }
    }

    // Sort by severity (critical > high > medium > low)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    redFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return redFlags;
  }

  /**
   * Convert technical signal to plain English red flag
   */
  private signalToRedFlag(signal: AnalysisSignal): RedFlag {
    const category = this.categorizeSignal(signal.signalType);
    const message = this.simplifyMessage(signal.description);

    return {
      category,
      message,
      severity: signal.severity,
    };
  }

  /**
   * Categorize signal type
   */
  private categorizeSignal(signalType: string): RedFlagCategory {
    if (['spf_fail', 'dkim_fail', 'header_anomaly'].includes(signalType)) {
      return 'authentication';
    }
    if (['sender_mismatch'].includes(signalType)) {
      return 'sender';
    }
    if (['high_entropy_url', 'suspicious_tld', 'url_shortener', 'https_missing', 'suspicious_redirect'].includes(signalType)) {
      return 'url';
    }
    if (['phishing_keywords', 'form_detected'].includes(signalType)) {
      return 'content';
    }
    return 'suspicious_behavior';
  }

  /**
   * Simplify technical message to plain English
   */
  private simplifyMessage(technicalMessage: string): string {
    // Already written in plain English by analyzers, but we can simplify further if needed
    return technicalMessage;
  }

  /**
   * Generate reasoning explanation
   */
  private generateReasoning(verdict: Verdict, signals: AnalysisSignal[], redFlags: RedFlag[]): string {
    const parts: string[] = [];

    // Verdict statement
    if (verdict === 'Malicious') {
      parts.push('This appears to be a phishing attempt or malicious content.');
    } else if (verdict === 'Suspicious') {
      parts.push('This shows several suspicious characteristics that warrant caution.');
    } else {
      parts.push('No significant security concerns were detected.');
    }

    // Key findings
    if (redFlags.length > 0) {
      const criticalFlags = redFlags.filter((f) => f.severity === 'critical');
      const highFlags = redFlags.filter((f) => f.severity === 'high');

      if (criticalFlags.length > 0) {
        parts.push(`Critical issues found: ${criticalFlags.map((f) => f.message.toLowerCase()).join('; ')}.`);
      } else if (highFlags.length > 0) {
        parts.push(`High-risk issues found: ${highFlags.map((f) => f.message.toLowerCase()).join('; ')}.`);
      } else {
        parts.push(`${redFlags.length} warning${redFlags.length > 1 ? 's' : ''} detected.`);
      }
    }

    // Positive indicators
    const positiveSignals = signals.filter((s) =>
      ['spf_pass', 'dkim_pass', 'domain_reputation_good'].includes(s.signalType)
    );

    if (positiveSignals.length > 0 && verdict === 'Safe') {
      parts.push('The sender was successfully verified.');
    }

    return parts.join(' ');
  }
}
