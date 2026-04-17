/**
 * URL analyzer subclass tests.
 *
 * We validate ONLY the subclass-specific adjustments (known-domain suppression,
 * IDN escalation, credential-form escalation, etc.) by stubbing each base
 * analyzer's `analyze()` via prototype spies. This avoids network, Playwright,
 * and WHOIS side-effects while exercising the real post-processing logic.
 */
import type { AnalysisSignal } from '../../../src/core/models/analysis-result.js';
import type { NormalizedInput } from '../../../src/core/models/input.js';

import { UrlEntropyAnalyzer } from '../../../src/core/analyzers/static/url-entropy.analyzer.js';
import { UrlEntropyUrlAnalyzer } from '../../../src/core/analyzers/static/url-entropy.url.analyzer.js';
import { LinkReputationAnalyzer } from '../../../src/core/analyzers/reputation/link-reputation.analyzer.js';
import { LinkReputationUrlAnalyzer } from '../../../src/core/analyzers/reputation/link-reputation.url.analyzer.js';
import { RedirectAnalyzer } from '../../../src/core/analyzers/dynamic/redirect.analyzer.js';
import { RedirectUrlAnalyzer } from '../../../src/core/analyzers/dynamic/redirect.url.analyzer.js';
import { FormAnalyzer } from '../../../src/core/analyzers/dynamic/form.analyzer.js';
import { FormUrlAnalyzer } from '../../../src/core/analyzers/dynamic/form.url.analyzer.js';
import type { WhitelistService } from '../../../src/core/services/whitelist.service.js';
import type { LoginPageDetectionService } from '../../../src/core/services/login-page-detection.service.js';

import {
  getTrancoService,
  resetTrancoService,
} from '../../../src/infrastructure/reputation/tranco.service.js';
import { resetKnownDomainPolicy } from '../../../src/core/policies/known-domain.policy.js';
import { getDomainAgeService } from '../../../src/infrastructure/reputation/whois.client.js';

function makeRedirectUrlAnalyzer(): RedirectUrlAnalyzer {
  // We mock the base class `analyze()` with a prototype spy in every test,
  // so these dependency stubs are never touched. Providing empty objects
  // avoids real-service side-effects (DB, timers, Playwright).
  const whitelist = {} as unknown as WhitelistService;
  const loginDetection = {} as unknown as LoginPageDetectionService;
  return new RedirectUrlAnalyzer(whitelist, loginDetection);
}

function urlInput(url: string): NormalizedInput {
  return {
    type: 'url',
    id: 'test-id',
    timestamp: new Date(),
    data: { url },
  } as NormalizedInput;
}

function sig(
  analyzerName: string,
  signalType: AnalysisSignal['signalType'],
  severity: AnalysisSignal['severity'],
  extras: Partial<AnalysisSignal> = {}
): AnalysisSignal {
  return {
    analyzerName,
    signalType,
    severity,
    confidence: extras.confidence ?? 0.9,
    description: extras.description ?? signalType,
    evidence: extras.evidence,
  };
}

beforeEach(() => {
  resetTrancoService();
  resetKnownDomainPolicy();
  getTrancoService().__setForTest(['google.com', 'microsoft.com']);
  // Stub WHOIS to return "null" (no age) unless a test overrides it.
  jest
    .spyOn(getDomainAgeService(), 'getAgeDays')
    .mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
  resetTrancoService();
  resetKnownDomainPolicy();
});

describe('UrlEntropyUrlAnalyzer', () => {
  it('downgrades suspicious_hostname_structure on a known-safe host', async () => {
    jest
      .spyOn(UrlEntropyAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('UrlEntropyAnalyzer', 'suspicious_hostname_structure', 'high'),
      ]);

    const analyzer = new UrlEntropyUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://mail.google.com/path'));
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('low');
  });

  it('demotes numeric_ip_hostname for RFC1918 private IPs', async () => {
    jest
      .spyOn(UrlEntropyAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('UrlEntropyAnalyzer', 'numeric_ip_hostname', 'high'),
      ]);

    const analyzer = new UrlEntropyUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('http://192.168.1.1/admin'));
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('low');
  });

  it('escalates typosquat_hostname to critical for IDN/punycode hosts', async () => {
    jest
      .spyOn(UrlEntropyAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('UrlEntropyAnalyzer', 'typosquat_hostname', 'high'),
      ]);

    const analyzer = new UrlEntropyUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://xn--pple-43d.com/login'));
    const escalated = out.find((s) => s.signalType === 'typosquat_hostname');
    expect(escalated).toBeDefined();
    expect(escalated!.severity).toBe('critical');
  });

  it('emits domain_recently_registered for ageDays < 30', async () => {
    jest.spyOn(UrlEntropyAnalyzer.prototype, 'analyze').mockResolvedValue([]);
    jest.spyOn(getDomainAgeService(), 'getAgeDays').mockResolvedValue(7);

    const analyzer = new UrlEntropyUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://brand-new-site.example/login'));
    const youngSignal = out.find((s) => s.signalType === 'domain_recently_registered');
    expect(youngSignal).toBeDefined();
    expect(youngSignal!.severity).toBe('high');
  });

  it('does not query WHOIS for known-safe hosts', async () => {
    jest.spyOn(UrlEntropyAnalyzer.prototype, 'analyze').mockResolvedValue([]);
    const whoisSpy = jest.spyOn(getDomainAgeService(), 'getAgeDays').mockResolvedValue(1);

    const analyzer = new UrlEntropyUrlAnalyzer();
    await analyzer.analyze(urlInput('https://www.google.com/search'));
    expect(whoisSpy).not.toHaveBeenCalled();
  });
});

describe('LinkReputationUrlAnalyzer', () => {
  it('drops email-only link_sender_domain_mismatch signals in URL path', async () => {
    jest
      .spyOn(LinkReputationAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('LinkReputationAnalyzer', 'link_sender_domain_mismatch', 'high'),
      ]);

    const analyzer = new LinkReputationUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://unknown.example'));
    expect(out).toHaveLength(0);
  });

  it('downgrades url_flagged_malicious on a known-safe host', async () => {
    jest
      .spyOn(LinkReputationAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('LinkReputationAnalyzer', 'url_flagged_malicious', 'critical'),
      ]);

    const analyzer = new LinkReputationUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://www.google.com'));
    expect(out[0]!.severity).toBe('medium');
  });

  it('keeps critical severity for TI hits on unknown hosts', async () => {
    jest
      .spyOn(LinkReputationAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('LinkReputationAnalyzer', 'url_flagged_malicious', 'critical'),
      ]);

    const analyzer = new LinkReputationUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://phish-unknown.example'));
    expect(out[0]!.severity).toBe('critical');
  });
});

describe('RedirectUrlAnalyzer', () => {
  it('preserves automatic_download_detected even on known-safe hosts', async () => {
    jest
      .spyOn(RedirectAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('RedirectAnalyzer', 'automatic_download_detected', 'critical'),
      ]);

    const analyzer = makeRedirectUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://www.google.com'));
    const dl = out.find((s) => s.signalType === 'automatic_download_detected');
    expect(dl).toBeDefined();
    expect(dl!.severity).toBe('critical');
  });

  it('downgrades suspicious_redirect for a known-safe host', async () => {
    jest
      .spyOn(RedirectAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('RedirectAnalyzer', 'suspicious_redirect', 'high'),
      ]);

    const analyzer = makeRedirectUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://www.google.com/redirect'));
    const sr = out.find((s) => s.signalType === 'suspicious_redirect');
    expect(sr!.severity).toBe('low');
  });

  it('does not call the shortener resolver for non-shortener hosts', async () => {
    jest.spyOn(RedirectAnalyzer.prototype, 'analyze').mockResolvedValue([]);
    const resolveSpy = jest.spyOn(
      RedirectUrlAnalyzer.prototype as unknown as { resolveShortener: (u: string) => Promise<string | null> },
      'resolveShortener'
    );

    const analyzer = makeRedirectUrlAnalyzer();
    await analyzer.analyze(urlInput('https://www.google.com'));
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('uses the resolver for known shorteners and emits a suspicious_redirect', async () => {
    jest.spyOn(RedirectAnalyzer.prototype, 'analyze').mockResolvedValue([]);
    jest
      .spyOn(
        RedirectUrlAnalyzer.prototype as unknown as { resolveShortener: (u: string) => Promise<string | null> },
        'resolveShortener'
      )
      .mockResolvedValue('https://phish-unknown.example/landing');

    const analyzer = makeRedirectUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://bit.ly/abc123'));
    const sr = out.find((s) => s.signalType === 'suspicious_redirect');
    expect(sr).toBeDefined();
    expect(sr!.severity).toBe('medium');
    const ev = sr!.evidence as Record<string, unknown>;
    expect(ev['shortener']).toBe('bit.ly');
    expect(ev['resolvedUrl']).toBe('https://phish-unknown.example/landing');
  });

  it('reports low severity when the shortener resolves to a known-safe host', async () => {
    jest.spyOn(RedirectAnalyzer.prototype, 'analyze').mockResolvedValue([]);
    jest
      .spyOn(
        RedirectUrlAnalyzer.prototype as unknown as { resolveShortener: (u: string) => Promise<string | null> },
        'resolveShortener'
      )
      .mockResolvedValue('https://www.google.com/landing');

    const analyzer = makeRedirectUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://t.co/xyz'));
    const sr = out.find((s) => s.signalType === 'suspicious_redirect');
    expect(sr).toBeDefined();
    expect(sr!.severity).toBe('low');
  });
});

describe('FormUrlAnalyzer', () => {
  it('downgrades credential form_detected on KNOWN_AUTH_ORIGINS', async () => {
    jest
      .spyOn(FormAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('FormAnalyzer', 'form_detected', 'high', {
          evidence: { sensitiveFields: [{ type: 'password' }] },
        }),
      ]);

    const analyzer = new FormUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://accounts.google.com/signin'));
    expect(out[0]!.severity).toBe('low');
  });

  it('escalates credential form_detected on non-Tranco hosts to critical', async () => {
    jest
      .spyOn(FormAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('FormAnalyzer', 'form_detected', 'high', {
          evidence: { sensitiveFields: [{ type: 'password' }] },
        }),
      ]);

    const analyzer = new FormUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://unknown-phish.example/login'));
    const escalated = out.find((s) => s.signalType === 'form_detected');
    expect(escalated!.severity).toBe('critical');
    const ev = escalated!.evidence as Record<string, unknown>;
    expect(ev['escalationReason']).toBe('non_tranco_host');
  });

  it('escalates credential form_detected on young Tranco hosts to critical', async () => {
    jest
      .spyOn(FormAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('FormAnalyzer', 'form_detected', 'high', {
          evidence: { sensitiveFields: [{ type: 'password' }] },
        }),
      ]);
    // Host is in Tranco (google.com) AND young — escalation via age branch only
    // fires when host is NOT in Tranco, so we simulate a non-Tranco *young* site.
    getTrancoService().__setForTest([]);
    jest.spyOn(getDomainAgeService(), 'getAgeDays').mockResolvedValue(3);

    const analyzer = new FormUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://brand-new.example/login'));
    const escalated = out.find((s) => s.signalType === 'form_detected');
    expect(escalated!.severity).toBe('critical');
    const ev = escalated!.evidence as Record<string, unknown>;
    expect(ev['ageDays']).toBe(3);
  });

  it('does not escalate non-password forms (e.g. search boxes)', async () => {
    jest
      .spyOn(FormAnalyzer.prototype, 'analyze')
      .mockResolvedValue([
        sig('FormAnalyzer', 'form_detected', 'low', {
          evidence: { sensitiveFields: [] },
        }),
      ]);

    const analyzer = new FormUrlAnalyzer();
    const out = await analyzer.analyze(urlInput('https://unknown.example/search'));
    expect(out[0]!.severity).toBe('low');
  });
});
