/**
 * AnalysisEngine — URL whitelist short-circuit.
 *
 * Verifies that when a URL input matches a whitelist entry, the engine
 * returns a Safe result immediately:
 *   - verdict 'Safe', alertLevel 'none', score 0
 *   - metadata.whitelisted === true
 *   - no analyzers ran (analyzersRun is empty)
 *   - only the root + whitelist execution steps are recorded
 *
 * Heavy collaborators (persistence, integration config, email, whitelist) are
 * mocked at module scope so the test stays hermetic.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { NormalizedInput } from '../../../src/core/models/input.js';

const mockCheck = jest.fn() as jest.MockedFunction<(...args: unknown[]) => Promise<any>>;
const mockInitializeTracking = jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>;
const mockUpdateResult = jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>;
const mockFlushToDatabase = jest.fn(async () => undefined) as jest.MockedFunction<(...args: unknown[]) => Promise<void>>;
const mockUpdateAIMetadata = jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>;
const mockUpdateErrorDetails = jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>;
const mockSendAlertIfNeeded = jest.fn(async () => undefined) as jest.MockedFunction<(...args: unknown[]) => Promise<void>>;

jest.mock('../../../src/core/services/whitelist.service.js', () => ({
  getWhitelistService: () => ({ check: mockCheck }),
}));

jest.mock('../../../src/core/services/analysis-persistence.service.js', () => ({
  getAnalysisPersistenceService: () => ({
    initializeTracking: mockInitializeTracking,
    updateResult: mockUpdateResult,
    updateAIMetadata: mockUpdateAIMetadata,
    updateErrorDetails: mockUpdateErrorDetails,
    flushToDatabase: mockFlushToDatabase,
  }),
}));

jest.mock('../../../src/core/services/integration-config.service.js', () => ({
  getIntegrationConfigService: () => ({
    getConfig: async () => null,
  }),
}));

jest.mock('../../../src/infrastructure/email/index.js', () => ({
  getEmailService: () => ({
    sendAlertIfNeeded: mockSendAlertIfNeeded,
  }),
}));

jest.mock('../../../src/core/services/ai-execution.service.js', () => ({
  getAIExecutionService: () => ({}),
}));

import { AnalysisEngine } from '../../../src/core/engine/analysis.engine.js';

function urlInput(url: string): NormalizedInput {
  return {
    type: 'url',
    data: { url },
    adapterMetadata: { timestamp: new Date().toISOString() },
  } as unknown as NormalizedInput;
}

describe('AnalysisEngine - URL whitelist short-circuit', () => {
  beforeEach(() => {
    mockCheck.mockReset();
    mockInitializeTracking.mockReset();
    mockUpdateResult.mockReset();
    mockFlushToDatabase.mockReset().mockImplementation(async () => undefined);
    mockUpdateAIMetadata.mockReset();
    mockUpdateErrorDetails.mockReset();
    mockSendAlertIfNeeded.mockReset().mockImplementation(async () => undefined);
  });

  it('returns Safe immediately for a whitelisted URL with metadata.whitelisted=true and no analyzer steps', async () => {
    mockCheck.mockResolvedValueOnce({
      isWhitelisted: true,
      matchReason: 'exact URL match',
      entry: { isTrusted: true },
    });

    const engine = new AnalysisEngine();
    const result = await engine.analyze(urlInput('https://www.example.com/'));

    expect(result.verdict).toBe('Safe');
    expect(result.score).toBe(0);
    expect(result.alertLevel).toBe('none');
    expect(result.metadata.whitelisted).toBe(true);
    expect(result.metadata.trustLevel).toBe('high');
    expect(result.metadata.bypassType).toBe('full');
    expect(result.metadata.analyzersRun).toEqual([]);
    expect(result.signals).toEqual([]);
    expect(result.reasoning).toMatch(/Whitelisted/);

    const stepNames = (result.metadata.executionSteps ?? []).map((s) => s.step);
    expect(stepNames).toContain('analysis_start');
    expect(stepNames).toContain('whitelist_check');
    expect(stepNames).not.toContain('content_risk_pre_scan');
    expect(stepNames).not.toContain('analyzer_filtering');
    expect(stepNames).not.toContain('email_alert_check');

    expect(mockSendAlertIfNeeded).not.toHaveBeenCalled();
    expect(mockUpdateResult).toHaveBeenCalledTimes(1);
    expect(mockFlushToDatabase).toHaveBeenCalledTimes(1);
  });

});
