/**
 * Pipeline resolution: integration config (single source of truth) with input-type fallbacks.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { getAnalyzerRegistry, resetAnalyzerRegistry } from '../../../src/core/engine/analyzer-registry.js';
import { buildMinimalUrlRiskProfile } from '../../../src/core/engine/minimal-url-risk-profile.js';
import { resolvePipeline } from '../../../src/core/engine/task-analysis-profile.js';
import type { NormalizedInput } from '../../../src/core/models/input.js';
import type { IntegrationConfig } from '../../../src/core/services/integration-config.service.js';
import { BaseAnalyzer } from '../../../src/core/analyzers/base/index.js';
import type { AnalysisSignal } from '../../../src/core/models/analysis-result.js';

class NamedAnalyzer extends BaseAnalyzer {
  private readonly analyzerNameStr: string;
  private readonly analyzerType: 'static' | 'dynamic';
  private readonly applicableFlag: boolean;

  constructor(
    analyzerNameStr: string,
    analyzerType: 'static' | 'dynamic' = 'static',
    applicableFlag = true
  ) {
    super();
    this.analyzerNameStr = analyzerNameStr;
    this.analyzerType = analyzerType;
    this.applicableFlag = applicableFlag;
  }

  getName(): string {
    return this.analyzerNameStr;
  }

  getWeight(): number {
    return 1;
  }

  getType(): 'static' | 'dynamic' {
    return this.analyzerType;
  }

  override isApplicable(): boolean {
    return this.applicableFlag;
  }

  async analyze(_unused: NormalizedInput): Promise<AnalysisSignal[]> {
    void _unused;
    return [];
  }
}

function urlInput(url: string, overrides: Partial<NormalizedInput> = {}): NormalizedInput {
  return {
    type: 'url',
    id: 'u1',
    timestamp: new Date(),
    data: { url },
    ...overrides,
  };
}

function emailInput(overrides: Partial<NormalizedInput> = {}): NormalizedInput {
  return {
    type: 'email',
    id: 'e1',
    timestamp: new Date(),
    data: {
      raw: '',
      parsed: {
        headers: new Map(),
        from: { address: 'x@y.com' },
        to: [],
        subject: '',
        body: {},
      },
    },
    ...overrides,
  };
}

function buildCfg(overrides: Partial<IntegrationConfig>): IntegrationConfig {
  return {
    integrationId: 'id-1',
    integrationName: 'chrome',
    executionMode: 'native',
    isActive: true,
    analyzers: [],
    ...overrides,
  };
}

describe('resolvePipeline', () => {
  it('falls back to URL defaults when no config is provided (URL input)', () => {
    const r = resolvePipeline(urlInput('https://a.com'), null);
    expect(r.integrationName).toBe('chrome');
    expect(r.contentPrescan).toBe('url');
    expect(r.analyzerFilteringMode).toBe('inspect_url');
    expect(r.executionMode).toBe('native');
  });

  it('falls back to email defaults when no config is provided (email input)', () => {
    const r = resolvePipeline(emailInput(), null);
    expect(r.integrationName).toBe('gmail');
    expect(r.contentPrescan).toBe('email');
    expect(r.analyzerFilteringMode).toBe('email_inbox');
    expect(r.executionMode).toBe('native');
  });

  it('honors input.integrationName when cfg is null', () => {
    const r = resolvePipeline(urlInput('https://a.com', { integrationName: 'chrome_task2' }), null);
    expect(r.integrationName).toBe('chrome_task2');
  });

  it('integration config beats input-type defaults', () => {
    const cfg = buildCfg({
      integrationName: 'chrome_task2',
      contentPrescan: 'none',
      analyzerFilteringMode: 'inspect_url',
      executionMode: 'hybrid',
    });
    const r = resolvePipeline(urlInput('https://a.com'), cfg);
    expect(r.integrationName).toBe('chrome_task2');
    expect(r.contentPrescan).toBe('none');
    expect(r.analyzerFilteringMode).toBe('inspect_url');
    expect(r.executionMode).toBe('hybrid');
  });

  it('executionModeOverride beats config and defaults', () => {
    const cfg = buildCfg({ executionMode: 'hybrid' });
    const r = resolvePipeline(
      urlInput('https://a.com', { executionModeOverride: 'ai' }),
      cfg
    );
    expect(r.executionMode).toBe('ai');
  });

  it('fills missing policy fields from input type when cfg omits them', () => {
    const cfg = buildCfg({
      integrationName: 'gmail_custom',
      contentPrescan: undefined,
      analyzerFilteringMode: undefined,
    });
    const r = resolvePipeline(emailInput(), cfg);
    expect(r.integrationName).toBe('gmail_custom');
    expect(r.contentPrescan).toBe('email');
    expect(r.analyzerFilteringMode).toBe('email_inbox');
  });
});

describe('AnalyzerRegistry Inspect URL mode', () => {
  beforeEach(() => {
    resetAnalyzerRegistry();
    const reg = getAnalyzerRegistry();
    reg.registerMany([
      new NamedAnalyzer('SpfAnalyzer'),
      new NamedAnalyzer('UrlEntropyAnalyzer'),
      new NamedAnalyzer('LinkReputationAnalyzer'),
      new NamedAnalyzer('RedirectAnalyzer', 'dynamic'),
      new NamedAnalyzer('FormAnalyzer', 'dynamic'),
      new NamedAnalyzer('buttonAnalyzer', 'static', false),
    ]);
  });

  it('selects only URL task analyzers that are applicable', () => {
    const input = urlInput('https://paypa1.com');
    const profile = buildMinimalUrlRiskProfile(input);
    const reg = getAnalyzerRegistry();
    const { analyzers, skipped } = reg.getFilteredAnalyzersWithReasons(
      input,
      undefined,
      profile,
      'inspect_url'
    );

    const names = analyzers.map((a) => a.getName()).sort();
    expect(names).toEqual(['FormAnalyzer', 'LinkReputationAnalyzer', 'RedirectAnalyzer', 'UrlEntropyAnalyzer']);
    expect(skipped.some((s) => s.analyzerName === 'SpfAnalyzer')).toBe(true);
  });
});
