/**
 * Verdict Service — attachment-signal verdict regression tests.
 *
 * Ensures that a critical `attachment_dangerous_type` signal from AttachmentAnalyzer
 * always produces a Malicious verdict via Stage-1 critical-override, both when
 * the signal is registered in signal-config.json and via the defensive fallback.
 */

import { VerdictService } from '../../../src/core/services/verdict.service.js';
import type { AnalysisSignal } from '../../../src/core/models/analysis-result.js';
import type { AppConfig } from '../../../src/config/app.config.js';

function makeConfig(): AppConfig {
  return {
    analysis: {
      thresholds: { malicious: 0.7, suspicious: 0.4 },
      signalAdjustments: {
        positiveSignalValue: 0.2,
        contextPositiveReduction: 0.7,
        contextThreatIntelBoost: 0.2,
        contextCriticalBoost: 0.3,
      },
      analyzerWeights: {
        attachment: 2.3,
        linkReputation: 2.5,
        senderReputation: 1.8,
        contentAnalysis: 1.6,
        redirect: 1.5,
        form: 1.0,
        spf: 1.4,
        dkim: 1.4,
        urlEntropy: 1.2,
      },
    },
  } as unknown as AppConfig;
}

describe('VerdictService - attachment critical override', () => {
  let service: VerdictService;

  beforeEach(() => {
    service = new VerdictService(makeConfig());
  });

  it('returns Malicious for a single critical attachment_dangerous_type signal', () => {
    const signal: AnalysisSignal = {
      analyzerName: 'AttachmentAnalyzer',
      signalType: 'attachment_dangerous_type',
      severity: 'critical',
      confidence: 0.95,
      description: 'Dangerous attachment detected: court_document_2026.pdf.exe',
    };

    const result = service.calculateVerdict(
      [signal],
      new Map([['AttachmentAnalyzer', 2.3]])
    );

    expect(result.verdict).toBe('Malicious');
    expect(result.score).toBeGreaterThanOrEqual(7.0);
    expect(result.alertLevel).toBe('high');
  });

  it('returns Malicious via defensive fallback even if signalType is unregistered', () => {
    // Simulate a future attachment signal not yet registered in signal-config.json
    const signal: AnalysisSignal = {
      analyzerName: 'AttachmentAnalyzer',
      // Cast used intentionally to mimic an unregistered future variant
      signalType: 'attachment_future_variant' as AnalysisSignal['signalType'],
      severity: 'critical',
      confidence: 0.9,
      description: 'Future critical attachment threat',
    };

    const result = service.calculateVerdict(
      [signal],
      new Map([['AttachmentAnalyzer', 2.3]])
    );

    expect(result.verdict).toBe('Malicious');
  });

  it('does not bypass for non-attachment critical signals without config entry', () => {
    const signal: AnalysisSignal = {
      analyzerName: 'SomeOtherAnalyzer',
      signalType: 'unknown_unregistered_signal' as AnalysisSignal['signalType'],
      severity: 'critical',
      confidence: 0.95,
      description: 'Some unregistered critical finding',
    };

    const result = service.calculateVerdict(
      [signal],
      new Map([['SomeOtherAnalyzer', 2.0]])
    );

    expect(result.verdict).not.toBe('Safe');
  });
});

describe('VerdictService - domain cohesion + urgency combo', () => {
  let service: VerdictService;

  beforeEach(() => {
    service = new VerdictService(makeConfig());
  });

  it('escalates to Malicious when high link_sender_domain_mismatch + high urgency_language_detected', () => {
    const signals: AnalysisSignal[] = [
      {
        analyzerName: 'LinkReputationAnalyzer',
        signalType: 'link_sender_domain_mismatch',
        severity: 'high',
        confidence: 0.85,
        description:
          'Body link(s) point to a different domain than the sender (verify-account-now.com)',
      },
      {
        analyzerName: 'ContentAnalysisAnalyzer',
        signalType: 'urgency_language_detected',
        severity: 'high',
        confidence: 0.8,
        description:
          'Email uses high-pressure urgency and action language (subject urgency phrase)',
      },
    ];

    const result = service.calculateVerdict(
      signals,
      new Map([
        ['LinkReputationAnalyzer', 2.5],
        ['ContentAnalysisAnalyzer', 1.6],
      ])
    );

    expect(result.verdict).toBe('Malicious');
  });

  it('escalates to Malicious when brand_impersonation_suspected + urgency_language_detected both high', () => {
    const signals: AnalysisSignal[] = [
      {
        analyzerName: 'ContentAnalysisAnalyzer',
        signalType: 'brand_impersonation_suspected',
        severity: 'high',
        confidence: 0.9,
        description: 'Sender may be impersonating Amazon',
      },
      {
        analyzerName: 'ContentAnalysisAnalyzer',
        signalType: 'urgency_language_detected',
        severity: 'high',
        confidence: 0.8,
        description: 'Urgency and action language',
      },
    ];

    const result = service.calculateVerdict(
      signals,
      new Map([['ContentAnalysisAnalyzer', 1.6]])
    );

    expect(result.verdict).toBe('Malicious');
  });

  it('does NOT escalate to Malicious when ONLY urgency is present without cohesion mismatch', () => {
    const signals: AnalysisSignal[] = [
      {
        analyzerName: 'ContentAnalysisAnalyzer',
        signalType: 'urgency_language_detected',
        severity: 'high',
        confidence: 0.8,
        description: 'Urgency and action language',
      },
    ];

    const result = service.calculateVerdict(
      signals,
      new Map([['ContentAnalysisAnalyzer', 1.6]])
    );

    expect(result.verdict).not.toBe('Malicious');
  });

  it('does NOT escalate to Malicious when ONLY domain mismatch is present without urgency', () => {
    const signals: AnalysisSignal[] = [
      {
        analyzerName: 'LinkReputationAnalyzer',
        signalType: 'link_sender_domain_mismatch',
        severity: 'high',
        confidence: 0.85,
        description: 'Body link(s) point to a different domain than the sender',
      },
    ];

    const result = service.calculateVerdict(
      signals,
      new Map([['LinkReputationAnalyzer', 2.5]])
    );

    expect(result.verdict).not.toBe('Malicious');
  });

  it('does NOT escalate when only medium-severity cohesion/urgency signals are present', () => {
    const signals: AnalysisSignal[] = [
      {
        analyzerName: 'ContentAnalysisAnalyzer',
        signalType: 'emotional_pressure_detected',
        severity: 'medium',
        confidence: 0.7,
        description: 'Emotional manipulation tactics',
      },
      {
        analyzerName: 'LinkReputationAnalyzer',
        signalType: 'link_sender_domain_mismatch',
        severity: 'medium',
        confidence: 0.6,
        description: 'Body links point to different domain (low confidence)',
      },
    ];

    const result = service.calculateVerdict(
      signals,
      new Map([
        ['LinkReputationAnalyzer', 2.5],
        ['ContentAnalysisAnalyzer', 1.6],
      ])
    );

    expect(result.verdict).not.toBe('Malicious');
  });
});
