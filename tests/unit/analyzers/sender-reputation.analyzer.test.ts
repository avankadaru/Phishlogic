/**
 * Sender Reputation Analyzer tests - Domain Pattern Matching
 */

import { SenderReputationAnalyzer } from '../../../src/core/analyzers/reputation/sender-reputation.analyzer.js';

describe('SenderReputationAnalyzer - Domain Pattern Matching', () => {
  let analyzer: SenderReputationAnalyzer;

  beforeEach(() => {
    analyzer = new SenderReputationAnalyzer();
  });

  describe('Legitimate Domains (Should NOT Flag)', () => {
    it('should NOT flag paypal.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('paypal.com');
      expect(result).toBe(false);
    });

    it('should NOT flag google.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('google.com');
      expect(result).toBe(false);
    });

    it('should NOT flag amazon.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('amazon.com');
      expect(result).toBe(false);
    });

    it('should NOT flag facebook.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('facebook.com');
      expect(result).toBe(false);
    });

    it('should NOT flag apple.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('apple.com');
      expect(result).toBe(false);
    });

    it('should NOT flag microsoft.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('microsoft.com');
      expect(result).toBe(false);
    });

    it('should NOT flag paypal.org as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('paypal.org');
      expect(result).toBe(false);
    });

    it('should NOT flag subdomain pay.paypal.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('pay.paypal.com');
      expect(result).toBe(false);
    });
  });

  describe('Typosquatting Domains (Should Flag)', () => {
    it('should flag paypa1.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('paypa1.com');
      expect(result).toBe(true);
    });

    it('should flag g00gle.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('g00gle.com');
      expect(result).toBe(true);
    });

    it('should flag amaz0n.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('amaz0n.com');
      expect(result).toBe(true);
    });

    it('should flag faceb00k.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('faceb00k.com');
      expect(result).toBe(true);
    });

    it('should flag appl3.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('appl3.com');
      expect(result).toBe(true);
    });

    it('should flag micr0s0ft.com as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('micr0s0ft.com');
      expect(result).toBe(true);
    });

    it('should flag login.paypa1.com subdomain as suspicious', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('login.paypa1.com');
      expect(result).toBe(true);
    });
  });

  describe('Excessive Hyphens (Should Flag)', () => {
    it('should flag domains with more than 3 hyphens', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('pay-pal-login-secure.com');
      expect(result).toBe(true);
    });

    it('should NOT flag domains with 3 or fewer hyphens', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('pay-pal-login.com');
      expect(result).toBe(false);
    });

    it('should flag domains with exactly 4 hyphens', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('a-b-c-d-e.com');
      expect(result).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle uppercase domains correctly', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('PAYPAL.COM');
      expect(result).toBe(false);
    });

    it('should handle mixed case typosquatting domains', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('PayPa1.COM');
      expect(result).toBe(true);
    });

    it('should NOT flag empty string', () => {
      const result = (analyzer as any).hasSuspiciousDomainPattern('');
      expect(result).toBe(false);
    });
  });
});
