/**
 * Analysis Persistence Service
 *
 * CRITICAL SERVICE: Saves analysis results to database with JSONB metadata.
 * Uses in-memory tracking and finally-block pattern to ensure EVERY analysis
 * is saved, regardless of success or failure.
 *
 * Key Design:
 * - In-memory tracking: Store analysis data as it's generated
 * - Progressive updates: Can update metadata incrementally
 * - Finally-block safe: Always saves what we have, even on exceptions
 */

import { getLogger } from '../../infrastructure/logging/logger.js';
import { getAnalysisRepository, AnalysisDomainModel } from '../../infrastructure/database/repositories/analysis.repository.js';
import type { RedFlag } from '../models/analysis-result.js';

const logger = getLogger();

/**
 * Analysis result structure (subset needed for persistence)
 */
export interface AnalysisResult {
  verdict: 'Safe' | 'Suspicious' | 'Malicious';
  confidence: number;
  score: number;
  alertLevel: string;
  redFlags: RedFlag[];
  reasoning?: string;
  signals: any[];
  analyzersRun: string[];
  executionSteps?: Array<{
    step: string;
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
    status?: string;
    error?: string;
    stackTrace?: string;
    errorContext?: any;
    context?: any;
  }>;
  durationMs: number;
}

/**
 * Normalized input structure
 */
export interface NormalizedInput {
  type: 'url' | 'email';
  id: string;
  timestamp: Date;
  data: any;
  analysisId?: string;
  uiTimestamp?: number;
}

/**
 * Timing data for tracking UI→Backend flow
 */
export interface TimingData {
  analysisId: string;
  uiTimestamp?: number;
  backendStartTime: number;
  networkLatency?: number;
}

/**
 * AI metadata structure
 *
 * Core fields (provider, model, tokens, temperature, latencyMs, costUsd)
 * are required. Debug fields (apiUrl, apiRequest, apiResponse, rawContent,
 * parseError, fallbackReparseUsed) are populated by providers and surfaced
 * in the debug view so QA can inspect the exact round-trip. Debug fields
 * are size-capped before persistence; API keys live in headers or URL
 * query params and are never captured here (see sanitizeApiUrl).
 */
export interface AIMetadata {
  provider: string;
  model: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  temperature: number;
  latencyMs: number;
  costUsd: number;
  apiUrl?: string;
  apiRequest?: unknown;
  apiResponse?: unknown;
  rawContent?: string;
  parseError?: { message: string; position?: number } | null;
  fallbackReparseUsed?: boolean;
  /**
   * Records whether the configured prompt template was honored or we fell
   * back to the legacy hardcoded prompt (and why). Surfaced in Admin Debug UI.
   */
  promptSource?:
    | { type: 'template'; id: string; name: string }
    | {
        type: 'legacy';
        reason: 'no_template_id' | 'template_not_found' | 'load_error';
        templateId?: string;
      };
}

/**
 * Error details structure
 */
export interface ErrorDetails {
  message: string;
  stackTrace: string;
  context: {
    file?: string;
    line?: number;
    function?: string;
  };
}

/**
 * In-memory analysis tracking structure
 */
interface AnalysisTrackingData {
  analysisId: string;
  input?: NormalizedInput;
  result?: AnalysisResult;
  executionMode?: 'native' | 'hybrid' | 'ai';
  integrationName?: string;
  timingData?: TimingData;
  aiMetadata?: AIMetadata;
  errorDetails?: ErrorDetails;
  createdAt: Date;
}

/**
 * Analysis Persistence Service
 *
 * Saves analysis results to database with:
 * - In-memory tracking for progressive updates
 * - Finally-block pattern for guaranteed persistence
 * - Flexible JSONB metadata storage
 */
export class AnalysisPersistenceService {
  /**
   * In-memory tracking map: analysisId → AnalysisTrackingData
   * Stores data as it's collected, allows progressive updates
   */
  private trackingMap: Map<string, AnalysisTrackingData> = new Map();

  /**
   * Initialize tracking for a new analysis
   * Call this at the START of analysis, before any exceptions can occur
   *
   * @param analysisId - Unique analysis ID
   * @param input - Normalized input
   * @param executionMode - Execution mode
   * @param integrationName - Integration source
   * @param timingData - Timing metadata
   */
  initializeTracking(
    analysisId: string,
    input: NormalizedInput,
    executionMode: 'native' | 'hybrid' | 'ai',
    integrationName: string,
    timingData: TimingData
  ): void {
    this.trackingMap.set(analysisId, {
      analysisId,
      input,
      executionMode,
      integrationName,
      timingData,
      createdAt: new Date(),
    });

    logger.debug({
      analysisId,
      msg: 'Analysis tracking initialized',
      executionMode,
      integrationName,
    });
  }

  /**
   * Update AI metadata (called after AI execution completes)
   *
   * @param analysisId - Unique analysis ID
   * @param aiMetadata - AI execution metadata
   */
  updateAIMetadata(analysisId: string, aiMetadata: AIMetadata): void {
    const tracking = this.trackingMap.get(analysisId);
    if (tracking) {
      tracking.aiMetadata = aiMetadata;
      logger.debug({
        analysisId,
        msg: 'AI metadata updated',
        provider: aiMetadata.provider,
        cost: aiMetadata.costUsd,
      });
    }
  }

  /**
   * Update error details (called in catch block)
   *
   * @param analysisId - Unique analysis ID
   * @param errorDetails - Error details
   */
  updateErrorDetails(analysisId: string, errorDetails: ErrorDetails): void {
    const tracking = this.trackingMap.get(analysisId);
    if (tracking) {
      tracking.errorDetails = errorDetails;
      logger.debug({
        analysisId,
        msg: 'Error details captured',
        errorMessage: errorDetails.message,
      });
    }
  }

  /**
   * Update analysis result (called after execution completes)
   *
   * @param analysisId - Unique analysis ID
   * @param result - Analysis result
   */
  updateResult(analysisId: string, result: AnalysisResult): void {
    const tracking = this.trackingMap.get(analysisId);
    if (tracking) {
      tracking.result = result;
      logger.debug({
        analysisId,
        msg: 'Analysis result updated',
        verdict: result.verdict,
        score: result.score,
      });
    }
  }

  /**
   * Flush analysis to database (call in finally block)
   * Saves whatever data we have collected, even if analysis failed
   *
   * @param analysisId - Unique analysis ID
   */
  async flushToDatabase(analysisId: string): Promise<void> {
    const tracking = this.trackingMap.get(analysisId);

    if (!tracking) {
      logger.warn({
        analysisId,
        msg: 'Cannot flush: No tracking data found',
      });
      return;
    }

    try {
      // Use tracking data, falling back to safe defaults if incomplete
      const input = tracking.input!;
      const result = tracking.result || this.createDefaultErrorResult(analysisId);
      const executionMode = tracking.executionMode || 'native';
      const integrationName = tracking.integrationName || 'unknown';
      const timingData = tracking.timingData!;
      const aiMetadata = tracking.aiMetadata;
      const errorDetails = tracking.errorDetails;

      await this.saveAnalysisToDB(
        result,
        input,
        executionMode,
        integrationName,
        timingData,
        aiMetadata,
        errorDetails
      );

      // Clean up tracking data after successful save
      this.trackingMap.delete(analysisId);

      logger.info({
        analysisId,
        msg: 'Analysis flushed to database',
        verdict: result.verdict,
        hasError: !!errorDetails,
      });
    } catch (error) {
      // Log error but don't throw - this is in a finally block
      logger.error({
        analysisId,
        msg: 'Failed to flush analysis to database',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Keep tracking data in case we can retry later
      // In production, you might want to implement a retry queue
    }
  }

  /**
   * Save analysis directly to database (legacy method for backward compatibility)
   * Prefer using initializeTracking() + flushToDatabase() pattern
   */
  async saveAnalysis(
    result: AnalysisResult,
    input: NormalizedInput,
    executionMode: 'native' | 'hybrid' | 'ai',
    integrationName: string,
    timingData: TimingData,
    aiMetadata?: AIMetadata,
    errorDetails?: ErrorDetails
  ): Promise<void> {
    await this.saveAnalysisToDB(
      result,
      input,
      executionMode,
      integrationName,
      timingData,
      aiMetadata,
      errorDetails
    );
  }

  /**
   * Internal method: Save analysis to database using Repository Pattern
   */
  private async saveAnalysisToDB(
    result: AnalysisResult,
    input: NormalizedInput,
    executionMode: 'native' | 'hybrid' | 'ai',
    integrationName: string,
    timingData: TimingData,
    aiMetadata?: AIMetadata,
    errorDetails?: ErrorDetails
  ): Promise<void> {
    try {
      // Get repository instance
      const analysisRepository = getAnalysisRepository();

      // Build timing_metadata JSONB
      const timingMetadata = {
        uiTimestamp: timingData.uiTimestamp
          ? new Date(timingData.uiTimestamp).toISOString()
          : undefined,
        backendStartTimestamp: new Date(timingData.backendStartTime).toISOString(),
        networkLatencyMs: timingData.networkLatency || undefined,
      };

      // Build ai_metadata JSONB (includes debug fields for UI inspection;
      // debug fields are already size-capped upstream by AIExecutionService)
      const aiMetadataJson = aiMetadata
        ? {
            provider: aiMetadata.provider,
            model: aiMetadata.model,
            tokens: {
              prompt: aiMetadata.tokens.prompt,
              completion: aiMetadata.tokens.completion,
              total: aiMetadata.tokens.total,
            },
            temperature: aiMetadata.temperature,
            latencyMs: aiMetadata.latencyMs,
            costUsd: aiMetadata.costUsd,
            apiUrl: aiMetadata.apiUrl,
            apiRequest: aiMetadata.apiRequest,
            apiResponse: aiMetadata.apiResponse,
            rawContent: aiMetadata.rawContent,
            parseError: aiMetadata.parseError ?? null,
            fallbackReparseUsed: aiMetadata.fallbackReparseUsed ?? false,
            promptSource: aiMetadata.promptSource,
          }
        : undefined;

      // Build error_details JSONB
      const errorDetailsJson = errorDetails
        ? {
            message: errorDetails.message,
            stackTrace: errorDetails.stackTrace,
            context: errorDetails.context,
          }
        : undefined;

      // Map to domain model
      const analysisDomain: Partial<AnalysisDomainModel> = {
        id: timingData.analysisId,
        tenantId: null,
        inputType: input.type,
        inputData: input.data,
        verdict: result.verdict,
        confidence: result.confidence,
        score: result.score,
        alertLevel: result.alertLevel,
        redFlags: result.redFlags || [],
        reasoning: result.reasoning,
        signals: result.signals || [],
        analyzersRun: result.analyzersRun || [],
        executionSteps: result.executionSteps || [],
        durationMs: result.durationMs,
        executionMode,
        inputSource: integrationName,
        aiMetadata: aiMetadataJson,
        timingMetadata,
        errorDetails: errorDetailsJson,
        whitelisted: false,
        analyzedAt: new Date(),
        createdAt: new Date(),
      };

      // Use repository to save (handles upsert via BaseRepository)
      await analysisRepository.upsert(analysisDomain);

      logger.info({
        analysisId: timingData.analysisId,
        msg: 'Analysis saved to database via repository',
        verdict: result.verdict,
        score: result.score,
        executionMode,
        integrationName,
        hasTiming: !!timingData.uiTimestamp,
        hasAI: !!aiMetadata,
        hasError: !!errorDetails,
      });
    } catch (error) {
      // Log error but don't throw in finally block context
      logger.error({
        analysisId: timingData.analysisId,
        msg: 'Failed to save analysis to database',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Re-throw in non-finally contexts for visibility
      throw error;
    }
  }

  /**
   * Create a default error result when analysis fails completely
   */
  private createDefaultErrorResult(_analysisId: string): AnalysisResult {
    return {
      verdict: 'Suspicious',
      confidence: 0,
      score: 5.0,
      alertLevel: 'medium',
      redFlags: [
        {
          category: 'suspicious_behavior',
          message: 'Analysis failed - see error details',
          severity: 'medium',
        },
      ],
      reasoning: 'Analysis encountered an unexpected error',
      signals: [],
      analyzersRun: [],
      executionSteps: [],
      durationMs: 0,
    };
  }

  /**
   * Get tracking statistics (for debugging/monitoring)
   */
  getTrackingStats(): { activeCount: number; oldestTimestamp: Date | null } {
    if (this.trackingMap.size === 0) {
      return { activeCount: 0, oldestTimestamp: null };
    }

    const timestamps = Array.from(this.trackingMap.values()).map((t) => t.createdAt);
    const oldest = timestamps.reduce((min, curr) => (curr < min ? curr : min));

    return {
      activeCount: this.trackingMap.size,
      oldestTimestamp: oldest,
    };
  }
}

/**
 * Singleton instance
 */
let persistenceServiceInstance: AnalysisPersistenceService | null = null;

/**
 * Get persistence service instance
 */
export function getAnalysisPersistenceService(): AnalysisPersistenceService {
  if (!persistenceServiceInstance) {
    persistenceServiceInstance = new AnalysisPersistenceService();
  }
  return persistenceServiceInstance;
}
