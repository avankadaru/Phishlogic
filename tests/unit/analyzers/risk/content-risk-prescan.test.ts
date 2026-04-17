/**
 * Task-specific content prescan (facade + URL strategy).
 */

import { describe, it, expect } from '@jest/globals';
import { ContentRiskAnalyzer } from '../../../../src/core/analyzers/risk/content-risk.analyzer.js';
import type { NormalizedInput } from '../../../../src/core/models/input.js';
import { UrlStaticSignalsExtractor } from '../../../../src/core/analyzers/risk/extractors/url-static-signals.extractor.js';

function urlNormalized(
  url: string,
  context?: { pageHtmlSnippet?: string; referrer?: string; userAgent?: string }
): NormalizedInput {
  return {
    type: 'url',
    id: 't1',
    timestamp: new Date(),
    data: context ? { url, context } : { url },
  };
}

describe('ContentRiskAnalyzer', () => {
  it('runs URL prescan when contentPrescan is url', async () => {
    const analyzer = new ContentRiskAnalyzer();
    const input = urlNormalized('https://example.com/login');
    const profile = await analyzer.analyzeRisk(input, { contentPrescan: 'url' });

    expect(profile.prescanTask).toBe('inspect_url');
    expect(profile.hasLinks).toBe(true);
    expect(profile.linkCount).toBe(1);
    expect(profile.links[0]).toContain('example.com');
    expect(profile.overallRiskScore).toBeGreaterThanOrEqual(0);
  });

  it('flags javascript: URLs in URL prescan', async () => {
    const analyzer = new ContentRiskAnalyzer();
    const input = urlNormalized('javascript:alert(1)');
    const profile = await analyzer.analyzeRisk(input, { contentPrescan: 'url' });

    expect(profile.prescanTask).toBe('inspect_url');
    expect(profile.extractionTimings['UrlStaticSignalsExtractor']).toBeDefined();
    expect(profile.overallRiskScore).toBeGreaterThanOrEqual(4);
  });

  it('uses HTML context snapshot when pageHtmlSnippet is set', async () => {
    const analyzer = new ContentRiskAnalyzer();
    const input = urlNormalized('https://example.com/', {
      pageHtmlSnippet:
        '<html><form><input type="password" name="p"></form><img src="https://i.example/a.png"><script src="https://evil.com/x.js"></script></html>',
    });
    const profile = await analyzer.analyzeRisk(input, { contentPrescan: 'url' });

    expect(profile.htmlStructure.hasForms).toBe(true);
    expect(profile.htmlStructure.hasScripts).toBe(true);
    expect(profile.hasImages).toBe(true);
    expect(profile.imageCount).toBe(1);
  });

  it('infers URL prescan from input type when options omitted', async () => {
    const analyzer = new ContentRiskAnalyzer();
    const input = urlNormalized('https://safe.example/');
    const profile = await analyzer.analyzeRisk(input);

    expect(profile.prescanTask).toBe('inspect_url');
  });
});

describe('UrlStaticSignalsExtractor', () => {
  it('detects download-like path', async () => {
    const ex = new UrlStaticSignalsExtractor();
    const input = urlNormalized('https://cdn.example/files/update.zip');
    const r = await ex.extract(input);
    expect(r.success).toBe(true);
    expect(r.data.downloadLikePath).toBe(true);
    expect(r.data.downloadExtensionsMatched).toContain('.zip');
  });

  it('detects suspicious query keys', async () => {
    const ex = new UrlStaticSignalsExtractor();
    const input = urlNormalized('https://example.com/x?redirect=https://evil.com');
    const r = await ex.extract(input);
    expect(r.data.suspiciousQueryKeys.length).toBeGreaterThan(0);
  });
});
