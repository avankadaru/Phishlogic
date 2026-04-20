import { normalizeUrl, normalizeNumericIp } from '../../../src/core/utils/url-normalizer.js';

describe('normalizeUrl', () => {
  it('returns the original URL when no obfuscation is present', () => {
    const result = normalizeUrl('https://www.google.com/search?q=hello');
    expect(result.wasObfuscated).toBe(false);
    expect(result.iterations).toBeLessThanOrEqual(1);
  });

  it('decodes single percent-encoded URL', () => {
    const result = normalizeUrl('https://example.com/%70%61%74%68');
    expect(result.normalized).toContain('/path');
  });

  it('handles double-encoded URLs', () => {
    // %25 = %, so %2570 → %70 → p
    const result = normalizeUrl('https://example.com/%2570%2561%2574%2568');
    expect(result.normalized).toContain('/path');
    expect(result.iterations).toBeGreaterThan(1);
    expect(result.wasObfuscated).toBe(true);
  });

  it('normalizes path traversal sequences', () => {
    const result = normalizeUrl('https://example.com/a/b/../c/./d');
    expect(result.normalized).toBe('https://example.com/a/c/d');
  });

  it('collapses double slashes in path', () => {
    const result = normalizeUrl('https://example.com//a///b');
    expect(result.normalized).toBe('https://example.com/a/b');
  });

  it('returns original for invalid URLs', () => {
    const result = normalizeUrl('not-a-url');
    expect(result.normalized).toBe('not-a-url');
    expect(result.wasObfuscated).toBe(false);
  });

  it('handles URLs with no path', () => {
    const result = normalizeUrl('https://example.com');
    expect(result.wasObfuscated).toBe(false);
  });
});

describe('normalizeNumericIp', () => {
  it('returns null for standard dotted-quad IPs', () => {
    expect(normalizeNumericIp('192.168.1.1')).toBeNull();
    expect(normalizeNumericIp('10.0.0.1')).toBeNull();
  });

  it('converts decimal long-form to dotted-quad', () => {
    // 127.0.0.1 = 2130706433
    expect(normalizeNumericIp('2130706433')).toBe('127.0.0.1');
  });

  it('converts hex to dotted-quad', () => {
    // 127.0.0.1 = 0x7f000001
    expect(normalizeNumericIp('0x7f000001')).toBe('127.0.0.1');
  });

  it('converts dotted hex octets', () => {
    expect(normalizeNumericIp('0x7f.0x0.0x0.0x1')).toBe('127.0.0.1');
  });

  it('converts dotted octal', () => {
    // 127 = 0177, 1 = 01
    expect(normalizeNumericIp('0177.0.0.01')).toBe('127.0.0.1');
  });

  it('returns null for non-IP hostnames', () => {
    expect(normalizeNumericIp('google.com')).toBeNull();
    expect(normalizeNumericIp('not-an-ip')).toBeNull();
  });

  it('returns null for out-of-range values', () => {
    // Larger than 0xffffffff
    expect(normalizeNumericIp('99999999999')).toBeNull();
  });
});
