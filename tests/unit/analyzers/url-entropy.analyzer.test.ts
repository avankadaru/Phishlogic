/**
 * URL Entropy Analyzer tests
 */

import { UrlEntropyAnalyzer } from '../../../src/core/analyzers/static/url-entropy.analyzer.js';
import type { NormalizedInput } from '../../../src/core/models/input.js';

describe('UrlEntropyAnalyzer', () => {
  let analyzer: UrlEntropyAnalyzer;

  beforeEach(() => {
    analyzer = new UrlEntropyAnalyzer();
  });

  describe('getName', () => {
    it('should return correct analyzer name', () => {
      expect(analyzer.getName()).toBe('UrlEntropyAnalyzer');
    });
  });

  describe('getWeight', () => {
    it('should return weight of 1.0', () => {
      expect(analyzer.getWeight()).toBe(1.0);
    });
  });

  describe('getType', () => {
    it('should return static type', () => {
      expect(analyzer.getType()).toBe('static');
    });
  });

  describe('isApplicable', () => {
    it('should be applicable to URL inputs', () => {
      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'https://example.com',
        },
      };

      expect(analyzer.isApplicable(input)).toBe(true);
    });

    it('should be applicable to email inputs with URLs', () => {
      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'test@example.com' },
            to: [],
            subject: 'Test',
            body: {},
            urls: ['https://example.com'],
          },
        },
      };

      expect(analyzer.isApplicable(input)).toBe(true);
    });

    it('should not be applicable to email inputs without URLs', () => {
      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'test@example.com' },
            to: [],
            subject: 'Test',
            body: {},
          },
        },
      };

      expect(analyzer.isApplicable(input)).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should detect high entropy in hostname', async () => {
      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'https://a8d9f2k3j4h5g6l7m9n0p1q2r3s4t5u6v7w8x9y0.com/page',
        },
      };

      const signals = await analyzer.analyze(input);

      const highEntropySignal = signals.find((s) => s.signalType === 'high_entropy_url');
      expect(highEntropySignal).toBeDefined();
      expect(highEntropySignal?.severity).toBe('medium');
    });

    it('should detect suspicious TLDs', async () => {
      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'https://example.tk/page',
        },
      };

      const signals = await analyzer.analyze(input);

      const tldSignal = signals.find((s) => s.signalType === 'suspicious_tld');
      expect(tldSignal).toBeDefined();
      expect(tldSignal?.description).toContain('.tk');
    });

    it('should detect URL shorteners', async () => {
      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'https://bit.ly/abc123',
        },
      };

      const signals = await analyzer.analyze(input);

      const shortenerSignal = signals.find((s) => s.signalType === 'url_shortener');
      expect(shortenerSignal).toBeDefined();
      expect(shortenerSignal?.description).toContain('shortening service');
    });

    it('should detect missing HTTPS', async () => {
      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'http://example.com/page',
        },
      };

      const signals = await analyzer.analyze(input);

      const httpsSignal = signals.find((s) => s.signalType === 'https_missing');
      expect(httpsSignal).toBeDefined();
      expect(httpsSignal?.severity).toBe('medium');
    });

    it('should not flag legitimate URLs', async () => {
      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'https://www.google.com/search',
        },
      };

      const signals = await analyzer.analyze(input);

      const highEntropySignals = signals.filter((s) => s.signalType === 'high_entropy_url');
      expect(highEntropySignals).toHaveLength(0);
    });

    it('should handle multiple URLs in email', async () => {
      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'test@example.com' },
            to: [],
            subject: 'Test',
            body: {},
            urls: ['http://example.com', 'https://bit.ly/test', 'https://example.tk'],
          },
        },
      };

      const signals = await analyzer.analyze(input);

      // Should find multiple issues across different URLs
      expect(signals.length).toBeGreaterThan(0);

      // Should detect missing HTTPS
      const httpsSignal = signals.find((s) => s.signalType === 'https_missing');
      expect(httpsSignal).toBeDefined();

      // Should detect URL shortener
      const shortenerSignal = signals.find((s) => s.signalType === 'url_shortener');
      expect(shortenerSignal).toBeDefined();

      // Should detect suspicious TLD
      const tldSignal = signals.find((s) => s.signalType === 'suspicious_tld');
      expect(tldSignal).toBeDefined();
    });

    it('should handle invalid URLs gracefully', async () => {
      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'test@example.com' },
            to: [],
            subject: 'Test',
            body: {},
            urls: ['not-a-valid-url', 'https://valid.com'],
          },
        },
      };

      const signals = await analyzer.analyze(input);

      // Should only analyze valid URL
      expect(signals).toBeDefined();
      // Should not throw error
    });
  });
});
