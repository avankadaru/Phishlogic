import {
  KnownDomainPolicy,
  KNOWN_AUTH_ORIGINS,
} from '../../../src/core/policies/known-domain.policy.js';
import { getTrancoService, resetTrancoService } from '../../../src/infrastructure/reputation/tranco.service.js';

describe('KnownDomainPolicy', () => {
  beforeEach(() => {
    resetTrancoService();
    // Seed Tranco singleton with controlled fixtures so membership is deterministic.
    getTrancoService().__setForTest(['google.com', 'microsoft.com', 'github.com']);
  });

  afterAll(() => {
    resetTrancoService();
  });

  describe('extractRegistrableDomain', () => {
    const policy = new KnownDomainPolicy();

    it('strips subdomains to eTLD+1', () => {
      expect(policy.extractRegistrableDomain('www.example.com')).toBe('example.com');
      expect(policy.extractRegistrableDomain('a.b.c.example.com')).toBe('example.com');
    });

    it('handles two-label public suffixes', () => {
      expect(policy.extractRegistrableDomain('shop.amazon.co.uk')).toBe('amazon.co.uk');
      expect(policy.extractRegistrableDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
    });

    it('returns null for malformed input', () => {
      expect(policy.extractRegistrableDomain('')).toBeNull();
      expect(policy.extractRegistrableDomain(null)).toBeNull();
      expect(policy.extractRegistrableDomain('localhost')).toBeNull();
    });
  });

  describe('extractHostname', () => {
    const policy = new KnownDomainPolicy();

    it('accepts full URLs and bare hostnames', () => {
      expect(policy.extractHostname('https://www.google.com/path')).toBe('www.google.com');
      expect(policy.extractHostname('example.com')).toBe('example.com');
    });

    it('rejects non-http schemes', () => {
      expect(policy.extractHostname('mailto:a@b.com')).toBeNull();
      expect(policy.extractHostname('javascript:alert(1)')).toBeNull();
    });
  });

  describe('isKnownSafeHost', () => {
    const policy = new KnownDomainPolicy();

    it('returns true for registrables present in Tranco', () => {
      expect(policy.isKnownSafeHost('https://www.google.com')).toBe(true);
      expect(policy.isKnownSafeHost('https://mail.google.com')).toBe(true);
      expect(policy.isKnownSafeHost('https://microsoft.com')).toBe(true);
    });

    it('returns true for KNOWN_AUTH_ORIGINS hosts', () => {
      expect(KNOWN_AUTH_ORIGINS.has('accounts.google.com')).toBe(true);
      expect(policy.isKnownSafeHost('https://accounts.google.com/signin')).toBe(true);
    });

    it('returns false for unknown registrables', () => {
      expect(policy.isKnownSafeHost('https://totally-unknown-phish.example')).toBe(false);
    });
  });

  describe('downgradeSeverityForKnownHost', () => {
    const policy = new KnownDomainPolicy();

    it('downgrades critical->medium on known-safe hosts', () => {
      expect(policy.downgradeSeverityForKnownHost('critical', 'https://google.com')).toBe('medium');
      expect(policy.downgradeSeverityForKnownHost('high', 'https://google.com')).toBe('low');
      expect(policy.downgradeSeverityForKnownHost('medium', 'https://google.com')).toBe('low');
      expect(policy.downgradeSeverityForKnownHost('low', 'https://google.com')).toBe('low');
    });

    it('does not downgrade on unknown hosts', () => {
      expect(policy.downgradeSeverityForKnownHost('critical', 'https://phish.example')).toBe(
        'critical'
      );
      expect(policy.downgradeSeverityForKnownHost('high', 'https://phish.example')).toBe('high');
    });
  });

  describe('evaluate', () => {
    it('returns a structured decision without WHOIS by default', async () => {
      const policy = new KnownDomainPolicy();
      const decision = await policy.evaluate('https://www.google.com/foo');
      expect(decision.host).toBe('www.google.com');
      expect(decision.registrable).toBe('google.com');
      expect(decision.isKnownSafeHost).toBe(true);
      expect(decision.trancoRank).toBe(1);
      expect(decision.ageDays).toBeNull();
      expect(decision.reasons.length).toBeGreaterThan(0);
    });

    it('flags unknown hosts as not-known-safe', async () => {
      const policy = new KnownDomainPolicy();
      const decision = await policy.evaluate('https://unknown-host-xyz.example/foo');
      expect(decision.isKnownSafeHost).toBe(false);
      expect(decision.trancoRank).toBeNull();
    });
  });
});
