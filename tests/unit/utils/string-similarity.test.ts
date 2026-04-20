import { jaroWinkler } from '../../../src/core/utils/string-similarity.js';

describe('jaroWinkler', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroWinkler('google', 'google')).toBe(1.0);
  });

  it('returns 0.0 for completely different strings', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0.0);
  });

  it('is case-insensitive', () => {
    expect(jaroWinkler('Google', 'google')).toBe(1.0);
  });

  it('detects high similarity for brand lookalikes', () => {
    // Common phishing typosquats
    expect(jaroWinkler('googIe', 'google')).toBeGreaterThan(0.85);
    expect(jaroWinkler('paypa1', 'paypal')).toBeGreaterThan(0.85);
    expect(jaroWinkler('arnazon', 'amazon')).toBeGreaterThan(0.85);
    expect(jaroWinkler('microsft', 'microsoft')).toBeGreaterThan(0.85);
  });

  it('returns low similarity for unrelated strings', () => {
    expect(jaroWinkler('github', 'paypal')).toBeLessThan(0.7);
    expect(jaroWinkler('netflix', 'amazon')).toBeLessThan(0.7);
  });

  it('handles empty strings', () => {
    expect(jaroWinkler('', 'test')).toBe(0.0);
    expect(jaroWinkler('test', '')).toBe(0.0);
    expect(jaroWinkler('', '')).toBe(1.0);
  });

  it('gives higher weight to prefix matches (Winkler boost)', () => {
    // "goo" prefix match — Winkler should boost this
    const withPrefix = jaroWinkler('google', 'googlx');
    const withoutPrefix = jaroWinkler('google', 'xoogle');
    expect(withPrefix).toBeGreaterThan(withoutPrefix);
  });

  it('returns values in [0, 1] range', () => {
    const pairs = [
      ['a', 'b'],
      ['test', 'testing'],
      ['apple', 'appIe'],
      ['microsoft', 'rnicrosoft'],
    ];
    for (const [a, b] of pairs) {
      const score = jaroWinkler(a!, b!);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
