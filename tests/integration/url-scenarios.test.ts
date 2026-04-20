/**
 * URL verdict pipeline — scenarios sweep.
 *
 * Integration-style test that drives the URL-specific verdict pipeline
 * (VerdictFactory -> UrlVerdictService) through the baseline URL matrix.
 * We construct the analyzer signal mix each scenario is expected to emit,
 * feed it through the same code path `AnalysisEngine` uses, and verify
 * the final verdict/severity falls in the expected bucket.
 *
 * This test intentionally avoids booting the Fastify server (which pulls
 * in ESM-only dependencies that Jest cannot transform today) so the
 * URL verdict surface can be exercised deterministically.
 */
import type { AnalysisSignal } from '../../src/core/models/analysis-result.js';
import type { AppConfig } from '../../src/config/app.config.js';
import type { NormalizedInput } from '../../src/core/models/input.js';
import { createVerdictService } from '../../src/core/services/verdict.factory.js';
import { getTrancoService, resetTrancoService } from '../../src/infrastructure/reputation/tranco.service.js';
import { resetKnownDomainPolicy } from '../../src/core/policies/known-domain.policy.js';

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

function urlInput(url: string): NormalizedInput {
  return {
    type: 'url',
    id: 'scenario-test',
    timestamp: new Date(),
    data: { url },
  } as NormalizedInput;
}

function sig(partial: Partial<AnalysisSignal> & Pick<AnalysisSignal, 'signalType' | 'severity'>): AnalysisSignal {
  return {
    analyzerName: partial.analyzerName ?? 'TestAnalyzer',
    confidence: partial.confidence ?? 0.9,
    description: partial.description ?? partial.signalType,
    evidence: partial.evidence,
    signalType: partial.signalType,
    severity: partial.severity,
  };
}

interface Scenario {
  id: string;
  url: string;
  expected: 'Safe' | 'Suspicious' | 'Malicious';
  signals: AnalysisSignal[];
}

const SCENARIOS: Scenario[] = [
  // SAFE — no TI hits, known-safe hosts
  {
    id: 'safe-google',
    url: 'https://www.google.com',
    expected: 'Safe',
    signals: [],
  },
  {
    id: 'safe-amazon',
    url: 'https://www.amazon.com',
    expected: 'Safe',
    signals: [],
  },
  {
    id: 'safe-microsoft-auth',
    url: 'https://login.microsoftonline.com',
    expected: 'Safe',
    signals: [],
  },
  {
    id: 'safe-github-repo',
    url: 'https://github.com/anthropics/claude-code',
    expected: 'Safe',
    signals: [],
  },
  {
    id: 'safe-google-accounts-signin',
    url: 'https://accounts.google.com/signin',
    expected: 'Safe',
    signals: [],
  },
  // Bare known brand with medium noise — known-host floor must clamp to Safe.
  {
    id: 'safe-google-medium-noise-floored',
    url: 'https://www.google.com',
    expected: 'Safe',
    signals: [
      sig({
        analyzerName: 'RedirectAnalyzer',
        signalType: 'script_execution_detected',
        severity: 'medium',
        confidence: 0.7,
      }),
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'high_entropy_url',
        severity: 'medium',
        confidence: 0.7,
      }),
    ],
  },

  // SUSPICIOUS — a single high-severity signal below the malicious threshold
  {
    id: 'suspicious-hyphens',
    url: 'https://account-verify-security-update.com',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'suspicious_hostname_structure',
        severity: 'medium',
        confidence: 0.8,
      }),
    ],
  },
  {
    id: 'suspicious-tld',
    url: 'https://secure-banking.xyz',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'suspicious_tld',
        severity: 'medium',
        confidence: 0.75,
      }),
    ],
  },
  {
    id: 'suspicious-port',
    url: 'https://login-verify.com:8443/account',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'suspicious_hostname_structure',
        severity: 'medium',
        confidence: 0.75,
      }),
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'high_entropy_url',
        severity: 'medium',
        confidence: 0.7,
      }),
    ],
  },
  {
    id: 'suspicious-http-login',
    url: 'http://example.com/login',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'https_missing',
        severity: 'medium',
        confidence: 0.7,
      }),
    ],
  },
  {
    id: 'suspicious-brand-in-subdomain',
    url: 'https://paypal.secure-verify-account.com',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'suspicious_hostname_structure',
        severity: 'medium',
        confidence: 0.8,
      }),
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'high_entropy_url',
        severity: 'medium',
        confidence: 0.75,
      }),
    ],
  },
  {
    id: 'suspicious-amazon-lookalike',
    url: 'https://amazon-login-verify.com',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'suspicious_hostname_structure',
        severity: 'medium',
        confidence: 0.8,
      }),
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'high_entropy_url',
        severity: 'medium',
        confidence: 0.75,
      }),
    ],
  },

  // MALICIOUS — brand typosquats, TI hits, IDN/unicode, shorteners
  {
    id: 'malicious-paypa1-typo',
    url: 'https://www.paypa1.com/webapps/mpp/home',
    expected: 'Malicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'typosquat_hostname',
        severity: 'critical',
        confidence: 0.95,
      }),
    ],
  },
  {
    id: 'malicious-rnicrosoft-idn',
    url: 'https://www.rnicrosoft.com',
    expected: 'Malicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'typosquat_hostname',
        severity: 'critical',
        confidence: 0.95,
      }),
    ],
  },
  {
    id: 'malicious-google-typo',
    url: 'https://www.g00gle.com',
    expected: 'Malicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'typosquat_hostname',
        severity: 'critical',
        confidence: 0.95,
      }),
    ],
  },
  {
    id: 'malicious-amazon-typo',
    url: 'https://www.amaz0n.com',
    expected: 'Malicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'typosquat_hostname',
        severity: 'critical',
        confidence: 0.95,
      }),
    ],
  },
  {
    id: 'malicious-apple-punycode-idn',
    url: 'https://www.xn--pple-43d.com',
    expected: 'Malicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'typosquat_hostname',
        severity: 'critical',
        confidence: 0.95,
      }),
    ],
  },
  {
    id: 'malicious-public-ip-credential',
    url: 'http://45.33.32.156/login',
    expected: 'Malicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'numeric_ip_hostname',
        severity: 'critical',
        confidence: 0.95,
      }),
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'https_missing',
        severity: 'medium',
        confidence: 0.7,
      }),
    ],
  },
  {
    id: 'malicious-ti-hit-on-unknown-host',
    url: 'https://phish.example/login',
    expected: 'Malicious',
    signals: [
      sig({
        analyzerName: 'LinkReputationAnalyzer',
        signalType: 'url_flagged_malicious',
        severity: 'critical',
        confidence: 0.9,
      }),
    ],
  },
  {
    id: 'malicious-automatic-download',
    url: 'https://phish.example/payload',
    expected: 'Malicious',
    signals: [
      sig({
        analyzerName: 'RedirectAnalyzer',
        signalType: 'automatic_download_detected',
        severity: 'critical',
        confidence: 0.97,
      }),
    ],
  },

  // ── Phase 1 additions ──────────────────────────────────────────────

  // Brand lookalike on unknown host → Suspicious (high signal floor)
  {
    id: 'suspicious-brand-lookalike',
    url: 'https://www.googIe-login.com/signin',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'brand_lookalike_domain',
        severity: 'high',
        confidence: 0.88,
      }),
    ],
  },

  // URL obfuscation signal alone on unknown host → Suspicious (medium url_pattern floor)
  {
    id: 'suspicious-obfuscated-url',
    url: 'https://evil.example/%2568%2574%2574%2570',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'url_obfuscation_detected',
        severity: 'medium',
        confidence: 0.8,
      }),
    ],
  },

  // Multi-hop shortener chain → Suspicious (medium redirect_chain floor)
  {
    id: 'suspicious-shortener-chain',
    url: 'https://bit.ly/xyz123',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'RedirectAnalyzer',
        signalType: 'shortener_chain_detected',
        severity: 'medium',
        confidence: 0.8,
      }),
      sig({
        analyzerName: 'RedirectAnalyzer',
        signalType: 'suspicious_redirect',
        severity: 'medium',
        confidence: 0.75,
      }),
    ],
  },

  // QR code on page with suspicious TLD → Suspicious
  {
    id: 'suspicious-qr-on-page',
    url: 'https://evil-qr-host.xyz/page',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'RedirectAnalyzer',
        signalType: 'qrcode_in_page',
        severity: 'high',
        confidence: 0.8,
      }),
    ],
  },

  // Brand lookalike + suspicious TLD combo → Suspicious with higher score
  {
    id: 'suspicious-lookalike-plus-tld',
    url: 'https://paypa1-verify.xyz',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'brand_lookalike_domain',
        severity: 'high',
        confidence: 0.9,
      }),
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'suspicious_tld',
        severity: 'medium',
        confidence: 0.75,
      }),
    ],
  },

  // Credential form on unknown host → Suspicious (credential_harvesting floor)
  {
    id: 'suspicious-form-unknown-host',
    url: 'https://secure-login-verify.com/account',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'FormAnalyzer',
        signalType: 'form_detected',
        severity: 'medium',
        confidence: 0.7,
      }),
    ],
  },

  // Script execution on unknown host → Suspicious (malicious_behavior floor)
  {
    id: 'suspicious-script-unknown-host',
    url: 'https://evil-scripts.example/page',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'RedirectAnalyzer',
        signalType: 'script_execution_detected',
        severity: 'high',
        confidence: 0.85,
      }),
    ],
  },

  // Domain recently registered (high) → Suspicious
  {
    id: 'suspicious-new-domain',
    url: 'https://brand-new-phish.com/login',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'domain_recently_registered',
        severity: 'high',
        confidence: 0.85,
      }),
    ],
  },

  // Low-severity signal only (high_entropy_url) on unknown host → Safe (low does NOT trigger floor)
  {
    id: 'safe-low-entropy-only',
    url: 'https://random-but-harmless.com/abcdef',
    expected: 'Safe',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'high_entropy_url',
        severity: 'low',
        confidence: 0.5,
      }),
    ],
  },

  // Known-safe host with malicious-level signals (not NEVER_DOWNGRADE) → capped to Suspicious
  {
    id: 'known-host-high-signals-capped',
    url: 'https://www.google.com/suspicious/path?x=evil',
    expected: 'Suspicious',
    signals: [
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'suspicious_hostname_structure',
        severity: 'medium',
        confidence: 0.8,
      }),
      sig({
        analyzerName: 'UrlEntropyAnalyzer',
        signalType: 'high_entropy_url',
        severity: 'medium',
        confidence: 0.8,
      }),
      sig({
        analyzerName: 'RedirectAnalyzer',
        signalType: 'script_execution_detected',
        severity: 'high',
        confidence: 0.85,
      }),
    ],
  },
];

describe('URL verdict pipeline — scenarios sweep', () => {
  beforeEach(() => {
    resetTrancoService();
    resetKnownDomainPolicy();
    // Seed Tranco with canonical safe brands used in the SAFE scenarios.
    getTrancoService().__setForTest([
      'google.com',
      'amazon.com',
      'github.com',
      'microsoft.com',
    ]);
  });

  afterAll(() => {
    resetTrancoService();
    resetKnownDomainPolicy();
  });

  test.each(SCENARIOS.map((s) => [s.id, s]))('%s', (_, scenario) => {
    const s = scenario as Scenario;
    const svc = createVerdictService('url', urlInput(s.url), makeConfig());
    const analyzerWeights = new Map(
      Object.entries(makeConfig().analysis.analyzerWeights ?? {})
    );
    const result = svc.calculateVerdict(s.signals, analyzerWeights);
    expect(result.verdict).toBe(s.expected);
  });

  it('AI final_verdict always short-circuits — even on known-safe hosts', () => {
    const svc = createVerdictService(
      'url',
      urlInput('https://www.google.com'),
      makeConfig()
    );
    const result = svc.calculateVerdict(
      [
        {
          analyzerName: 'AIExecutionService',
          signalType: 'final_verdict' as AnalysisSignal['signalType'],
          severity: 'high',
          confidence: 0.9,
          description: 'VERDICT: Malicious\nTHREAT SUMMARY: Suspicious page',
        },
      ],
      new Map()
    );
    expect(result.verdict).toBe('Malicious');
  });
});
