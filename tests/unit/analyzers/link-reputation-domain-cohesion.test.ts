/**
 * Domain cohesion tests for LinkReputationAnalyzer.
 *
 * Exercises the private helpers (eTLD+1 extraction, sender-vs-link comparison)
 * so we don't have to stub the URLhaus / PhishTank clients. The combo behavior
 * with VerdictService is covered separately.
 */

import { LinkReputationAnalyzer } from '../../../src/core/analyzers/reputation/link-reputation.analyzer.js';
import type { AnalysisSignal } from '../../../src/core/models/analysis-result.js';

describe('LinkReputationAnalyzer - domain cohesion', () => {
  let analyzer: LinkReputationAnalyzer;

  beforeEach(() => {
    analyzer = new LinkReputationAnalyzer();
  });

  describe('extractRegistrableDomain', () => {
    it('returns the eTLD+1 for a normal 2-label host', () => {
      expect((analyzer as any).extractRegistrableDomain('www.example.com')).toBe(
        'example.com'
      );
    });

    it('preserves 3-label public suffixes like co.uk', () => {
      expect((analyzer as any).extractRegistrableDomain('shop.amazon.co.uk')).toBe(
        'amazon.co.uk'
      );
    });

    it('returns null for empty / malformed host', () => {
      expect((analyzer as any).extractRegistrableDomain('')).toBeNull();
      expect((analyzer as any).extractRegistrableDomain('localhost')).toBeNull();
      expect((analyzer as any).extractRegistrableDomain(null)).toBeNull();
    });
  });

  describe('detectSenderDomainMismatch', () => {
    it('emits high-severity signal when link host differs from sender registrable domain', () => {
      const signal: AnalysisSignal | null = (analyzer as any).detectSenderDomainMismatch(
        'security@account-services.net',
        ['http://verify-account-now.com/login']
      );

      expect(signal).not.toBeNull();
      expect(signal?.signalType).toBe('link_sender_domain_mismatch');
      expect(signal?.severity).toBe('high');
      expect(signal?.confidence).toBeGreaterThanOrEqual(0.8);
      expect(signal?.evidence?.['senderDomain']).toBe('account-services.net');
      expect(signal?.evidence?.['mismatchedLinkDomains']).toContain(
        'verify-account-now.com'
      );
    });

    it('does NOT emit when all links share the sender registrable domain', () => {
      const signal = (analyzer as any).detectSenderDomainMismatch(
        'noreply@amazon.com',
        ['https://www.amazon.com/orders', 'https://aws.amazon.com/promo']
      );

      expect(signal).toBeNull();
    });

    it('does NOT emit when the only foreign domain is on the ESP / tracker allow list', () => {
      const signal = (analyzer as any).detectSenderDomainMismatch(
        'news@amazon.com',
        [
          'https://click.list-manage.com/track/abc',
          'https://email.amazon.com/unsub',
        ]
      );

      expect(signal).toBeNull();
    });

    it('does NOT emit when sender address is missing', () => {
      const signal = (analyzer as any).detectSenderDomainMismatch(undefined, [
        'https://example.com',
      ]);
      expect(signal).toBeNull();
    });

    it('ignores mailto / javascript / relative URLs', () => {
      const signal = (analyzer as any).detectSenderDomainMismatch(
        'noreply@amazon.com',
        [
          'mailto:support@amazon.com',
          'javascript:alert(1)',
          '/relative/path',
        ]
      );
      expect(signal).toBeNull();
    });

    it('emits for the malicious-urgency scenario (account-services.net -> verify-account-now.com)', () => {
      const signal = (analyzer as any).detectSenderDomainMismatch(
        'security@account-services.net',
        ['http://verify-account-now.com/login']
      );

      expect(signal?.signalType).toBe('link_sender_domain_mismatch');
      expect(signal?.severity).toBe('high');
    });
  });
});
