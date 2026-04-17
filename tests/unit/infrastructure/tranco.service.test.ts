import { TrancoService, getTrancoService, resetTrancoService } from '../../../src/infrastructure/reputation/tranco.service.js';

describe('TrancoService', () => {
  afterEach(() => {
    resetTrancoService();
  });

  it('returns false for empty or missing input', () => {
    const svc = new TrancoService('/tmp/nonexistent-data');
    svc.ensureLoaded();
    expect(svc.has('')).toBe(false);
    expect(svc.rank('')).toBeNull();
  });

  it('falls back to the hardcoded allowlist when no snapshot exists', () => {
    const svc = new TrancoService('/tmp/nonexistent-data-' + Date.now());
    expect(svc.has('google.com')).toBe(true);
    expect(svc.has('definitely-not-a-real-site-xyz.example')).toBe(false);
    const meta = svc.getMeta();
    expect(meta.source).toBe('fallback');
    expect(meta.size).toBeGreaterThan(0);
  });

  it('allows test fixtures to override membership', () => {
    const svc = new TrancoService('/tmp/nonexistent');
    svc.__setForTest(['example.test', 'phish.test']);
    expect(svc.has('example.test')).toBe(true);
    expect(svc.has('PHISH.test')).toBe(true); // case-insensitive
    expect(svc.has('google.com')).toBe(false);
    expect(svc.rank('example.test')).toBe(1);
    expect(svc.rank('phish.test')).toBe(2);
  });

  it('isTop10k only fires for ranks <= 10000', () => {
    const svc = new TrancoService('/tmp/nonexistent');
    const map = new Map<string, number>([
      ['top.test', 100],
      ['mid.test', 9999],
      ['tail.test', 99999],
    ]);
    svc.__setForTest(map);
    expect(svc.isTop10k('top.test')).toBe(true);
    expect(svc.isTop10k('mid.test')).toBe(true);
    expect(svc.isTop10k('tail.test')).toBe(false);
  });

  it('getTrancoService returns a singleton', () => {
    const a = getTrancoService();
    const b = getTrancoService();
    expect(a).toBe(b);
  });
});
