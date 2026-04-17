import type { AnalysisSignal } from '../../../src/core/models/analysis-result.js';
import type { AppConfig } from '../../../src/config/app.config.js';
import { UrlVerdictService } from '../../../src/core/services/url-verdict.service.js';
import { createVerdictService } from '../../../src/core/services/verdict.factory.js';
import { VerdictService } from '../../../src/core/services/verdict.service.js';
import type { NormalizedInput } from '../../../src/core/models/input.js';
import {
  getTrancoService,
  resetTrancoService,
} from '../../../src/infrastructure/reputation/tranco.service.js';
import { resetKnownDomainPolicy } from '../../../src/core/policies/known-domain.policy.js';

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

function signal(partial: Partial<AnalysisSignal> & Pick<AnalysisSignal, 'signalType' | 'severity'>): AnalysisSignal {
  return {
    analyzerName: partial.analyzerName ?? 'TestAnalyzer',
    confidence: partial.confidence ?? 0.9,
    description: partial.description ?? partial.signalType,
    evidence: partial.evidence,
    signalType: partial.signalType,
    severity: partial.severity,
  };
}

describe('UrlVerdictService', () => {
  beforeEach(() => {
    resetTrancoService();
    resetKnownDomainPolicy();
    getTrancoService().__setForTest(['google.com', 'microsoft.com']);
  });

  afterAll(() => {
    resetTrancoService();
    resetKnownDomainPolicy();
  });

  it('demotes a critical TI hit on a Tranco-known host', () => {
    const svc = new UrlVerdictService(makeConfig());
    svc.setTargetUrl('https://www.google.com/login');
    const result = svc.calculateVerdict(
      [
        signal({
          analyzerName: 'LinkReputationAnalyzer',
          signalType: 'url_flagged_malicious',
          severity: 'critical',
          confidence: 0.8,
        }),
      ],
      new Map([['LinkReputationAnalyzer', 2.5]])
    );
    expect(result.verdict).not.toBe('Malicious');
  });

  it('preserves automatic_download_detected regardless of known host', () => {
    const svc = new UrlVerdictService(makeConfig());
    svc.setTargetUrl('https://www.google.com/download');
    const result = svc.calculateVerdict(
      [
        signal({
          analyzerName: 'RedirectAnalyzer',
          signalType: 'automatic_download_detected',
          severity: 'critical',
          confidence: 0.98,
        }),
      ],
      new Map([['RedirectAnalyzer', 1.5]])
    );
    expect(result.verdict).toBe('Malicious');
  });

  it('still fires critical for unknown hosts', () => {
    const svc = new UrlVerdictService(makeConfig());
    svc.setTargetUrl('https://phish-unknown.example/login');
    const result = svc.calculateVerdict(
      [
        signal({
          analyzerName: 'LinkReputationAnalyzer',
          signalType: 'url_flagged_malicious',
          severity: 'critical',
          confidence: 0.95,
        }),
      ],
      new Map([['LinkReputationAnalyzer', 2.5]])
    );
    expect(result.verdict).toBe('Malicious');
  });

  it('floors a bare known-safe host to Safe even with medium-noise signals', () => {
    const svc = new UrlVerdictService(makeConfig());
    svc.setTargetUrl('https://www.google.com');
    const result = svc.calculateVerdict(
      [
        signal({
          analyzerName: 'RedirectAnalyzer',
          signalType: 'script_execution_detected',
          severity: 'medium',
          confidence: 0.7,
        }),
        signal({
          analyzerName: 'UrlEntropyAnalyzer',
          signalType: 'high_entropy_url',
          severity: 'medium',
          confidence: 0.6,
        }),
      ],
      new Map([
        ['RedirectAnalyzer', 1.5],
        ['UrlEntropyAnalyzer', 1.2],
      ])
    );
    expect(result.verdict).toBe('Safe');
    expect(result.score).toBeLessThanOrEqual(1.5);
    expect(result.alertLevel).toBe('none');
    expect(result.redFlags[0]?.message).toMatch(/Known brand/);
  });

  it('allows Suspicious on a path of a known-safe host (floor does not over-clamp)', () => {
    const svc = new UrlVerdictService(makeConfig());
    svc.setTargetUrl('https://www.google.com/weird/path?x=1');
    const result = svc.calculateVerdict(
      [
        signal({
          analyzerName: 'RedirectAnalyzer',
          signalType: 'script_execution_detected',
          severity: 'medium',
          confidence: 0.7,
        }),
        signal({
          analyzerName: 'UrlEntropyAnalyzer',
          signalType: 'high_entropy_url',
          severity: 'medium',
          confidence: 0.7,
        }),
        signal({
          analyzerName: 'UrlEntropyAnalyzer',
          signalType: 'suspicious_hostname_structure',
          severity: 'medium',
          confidence: 0.7,
        }),
      ],
      new Map([
        ['RedirectAnalyzer', 1.5],
        ['UrlEntropyAnalyzer', 1.2],
      ])
    );
    expect(['Safe', 'Suspicious']).toContain(result.verdict);
    expect(result.verdict).not.toBe('Malicious');
  });

  it('honors automatic_download_detected even on a bare known-safe host', () => {
    const svc = new UrlVerdictService(makeConfig());
    svc.setTargetUrl('https://www.google.com');
    const result = svc.calculateVerdict(
      [
        signal({
          analyzerName: 'RedirectAnalyzer',
          signalType: 'automatic_download_detected',
          severity: 'critical',
          confidence: 0.95,
        }),
      ],
      new Map([['RedirectAnalyzer', 1.5]])
    );
    expect(result.verdict).toBe('Malicious');
  });

  it('does not apply the floor for unknown hosts (medium signals still scored)', () => {
    const svc = new UrlVerdictService(makeConfig());
    svc.setTargetUrl('https://phish.example/login');
    const result = svc.calculateVerdict(
      [
        signal({
          analyzerName: 'UrlEntropyAnalyzer',
          signalType: 'suspicious_hostname_structure',
          severity: 'medium',
          confidence: 0.8,
        }),
        signal({
          analyzerName: 'UrlEntropyAnalyzer',
          signalType: 'high_entropy_url',
          severity: 'medium',
          confidence: 0.8,
        }),
      ],
      new Map([['UrlEntropyAnalyzer', 1.2]])
    );
    expect(result.verdict).not.toBe('Safe');
  });

  it('short-circuits to the base path when a final_verdict signal is present (AI mode)', () => {
    const svc = new UrlVerdictService(makeConfig());
    svc.setTargetUrl('https://www.google.com');
    const result = svc.calculateVerdict(
      [
        {
          analyzerName: 'AIExecutionService',
          signalType: 'final_verdict' as AnalysisSignal['signalType'],
          severity: 'high',
          confidence: 0.88,
          description: 'VERDICT: Malicious\nTHREAT SUMMARY: AI flagged',
        },
      ],
      new Map()
    );
    expect(result.verdict).toBe('Malicious');
  });
});

describe('VerdictFactory', () => {
  beforeEach(() => {
    resetTrancoService();
    resetKnownDomainPolicy();
    getTrancoService().__setForTest(['google.com']);
  });

  it('returns a UrlVerdictService for URL inputs', () => {
    const urlInput: NormalizedInput = {
      type: 'url',
      data: { url: 'https://example.com' },
      adapterMetadata: { timestamp: new Date().toISOString() },
    } as unknown as NormalizedInput;
    const svc = createVerdictService('url', urlInput, makeConfig());
    expect(svc).toBeInstanceOf(UrlVerdictService);
  });

  it('returns the base VerdictService for email inputs', () => {
    const emailInput: NormalizedInput = {
      type: 'email',
      data: { raw: '', parsed: {} },
      adapterMetadata: { timestamp: new Date().toISOString() },
    } as unknown as NormalizedInput;
    const svc = createVerdictService('email', emailInput, makeConfig());
    expect(svc).toBeInstanceOf(VerdictService);
    expect(svc).not.toBeInstanceOf(UrlVerdictService);
  });
});
