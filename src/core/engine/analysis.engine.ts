/**
 * Analysis Engine (Refactored with Strategy Pattern)
 *
 * Enterprise-grade orchestration with:
 * - Strategy Pattern for execution modes (native/hybrid/ai)
 * - Repository Pattern for all data access
 * - Finally-block persistence (guaranteed save)
 * - End-to-end ID tracking (UI → Backend → DB)
 * - SOLID principles throughout
 */

import { randomUUID } from 'node:crypto';
import type { NormalizedInput } from '../models/input.js';
import type { AnalysisResult, ExecutionStep } from '../models/analysis-result.js';
import { getWhitelistService } from '../services/whitelist.service.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import { getEmailService } from '../../infrastructure/email/index.js';
import { getConfig } from '../../config/index.js';
import {
  getAnalysisPersistenceService,
  type AnalysisResult as PersistenceAnalysisResult,
} from '../services/analysis-persistence.service.js';
import { getIntegrationConfigService } from '../services/integration-config.service.js';
import { getAIExecutionService } from '../services/ai-execution.service.js';
import {
  ExecutionStrategyFactory,
  type ExecutionContext,
} from '../execution/execution-strategy.js';
import { NativeExecutionStrategy } from '../execution/strategies/native.strategy.js';
import { HybridExecutionStrategy } from '../execution/strategies/hybrid.strategy.js';
import { AIExecutionStrategy } from '../execution/strategies/ai.strategy.js';

const logger = getLogger();

/**
 * Analysis Engine
 */
export class AnalysisEngine {
  private strategyFactory: ExecutionStrategyFactory;
  private whitelistService = getWhitelistService();

  constructor() {
    // Initialize strategy factory with all strategies
    this.strategyFactory = new ExecutionStrategyFactory();

    // Register strategies with dependency injection
    const aiService = getAIExecutionService();
    this.strategyFactory.register('native', new NativeExecutionStrategy());
    this.strategyFactory.register('hybrid', new HybridExecutionStrategy(aiService));
    this.strategyFactory.register('ai', new AIExecutionStrategy(aiService));

    logger.info('AnalysisEngine initialized with execution strategies');
  }

  /**
   * Analyze input and return result
   *
   * Features:
   * - Execution mode routing (native/hybrid/ai)
   * - Guaranteed persistence with finally block
   * - End-to-end ID tracking from UI
   * - Whitelist bypass
   * - Email alerts
   */
  async analyze(input: NormalizedInput): Promise<AnalysisResult> {
    // 1. ID Tracking: Use UI-provided ID or generate fallback
    const analysisId = input.analysisId || randomUUID();
    const backendStartTime = Date.now();
    const networkLatency = input.uiTimestamp ? backendStartTime - input.uiTimestamp : undefined;

    logger.info({
      analysisId,
      msg: 'Analysis request received',
      inputType: input.type,
      uiTimestamp: input.uiTimestamp,
      networkLatency,
    });

    // 2. Determine integration and load configuration
    const integrationName = this.getIntegrationName(input);
    const integrationConfig = await this.loadIntegrationConfig(integrationName);
    const executionMode = integrationConfig?.executionMode || 'native';

    // 3. Initialize persistence tracking (BEFORE any exceptions can occur)
    const persistenceService = getAnalysisPersistenceService();
    persistenceService.initializeTracking(analysisId, input, executionMode, integrationName, {
      analysisId,
      uiTimestamp: input.uiTimestamp,
      backendStartTime,
      networkLatency,
    });

    const executionSteps: ExecutionStep[] = [];

    // Track: Request received
    this.addExecutionStep(executionSteps, 'request_received', {
      inputType: input.type,
      inputId: input.id,
      analysisId,
      networkLatency,
      executionMode,
    });

    // 4. Execute analysis with finally block (GUARANTEES persistence)
    let result: AnalysisResult | undefined;
    let aiMetadata: any = undefined;

    try {
      // Step 1: Check whitelist (early exit for trusted sources)
      this.addExecutionStep(executionSteps, 'whitelist_check_started');

      const whitelistResult = await this.whitelistService.check(input);

      this.completeExecutionStep(executionSteps, 'whitelist_check_started', {
        isWhitelisted: whitelistResult.isWhitelisted,
        matchReason: whitelistResult.matchReason,
      });

      if (whitelistResult.isWhitelisted) {
        logger.info({
          msg: 'Input whitelisted - bypassing analysis',
          analysisId,
          matchReason: whitelistResult.matchReason,
        });

        // Return safe verdict immediately
        const duration = Date.now() - backendStartTime;

        this.addExecutionStep(executionSteps, 'response_sent', {
          verdict: 'Safe',
          whitelisted: true,
        });

        result = {
          verdict: 'Safe',
          confidence: 0.0,
          score: 0.0,
          alertLevel: 'none',
          redFlags: [],
          reasoning: `This is from a trusted source${whitelistResult.matchReason ? ` (${whitelistResult.matchReason})` : ''}.`,
          signals: [],
          metadata: {
            duration,
            timestamp: new Date(),
            analyzersRun: [],
            analysisId,
            executionSteps,
          },
        };

        // Update persistence tracking with result
        persistenceService.updateResult(analysisId, this.mapToPersistenceResult(result));

        return result;
      }

      // Step 2: Load integration config and prepare execution context
      this.addExecutionStep(executionSteps, 'config_loading_started');

      const context: ExecutionContext = {
        analysisId,
        input,
        integrationName,
        executionSteps,
        config: integrationConfig
          ? {
              executionMode: integrationConfig.executionMode,
              aiModelId: integrationConfig.aiModelId,
              aiProvider: integrationConfig.aiProvider,
              aiModel: integrationConfig.aiModel,
              aiTemperature: integrationConfig.aiTemperature,
              aiMaxTokens: integrationConfig.aiMaxTokens,
              aiTimeout: integrationConfig.aiTimeout,
              fallbackToNative: integrationConfig.fallbackToNative,
            }
          : undefined,
      };

      this.completeExecutionStep(executionSteps, 'config_loading_started', {
        executionMode,
        hasAI: !!integrationConfig?.aiModelId,
      });

      // Step 3: Execute via strategy pattern
      this.addExecutionStep(executionSteps, 'strategy_execution_started', {
        executionMode,
      });

      const strategy = this.strategyFactory.getStrategy(executionMode, {
        enableTiming: true,
        enableLogging: true,
        logger,
      });

      const executionResult = await strategy.execute(context);

      aiMetadata = executionResult.aiMetadata;
      result = executionResult.result;

      this.completeExecutionStep(executionSteps, 'strategy_execution_started', {
        verdict: result.verdict,
        score: result.score,
        actualMode: executionResult.actualMode,
        usedAI: !!executionResult.aiMetadata,
      });

      // Update persistence with AI metadata if available
      if (aiMetadata) {
        persistenceService.updateAIMetadata(analysisId, aiMetadata);
      }

      // Update persistence tracking with result
      persistenceService.updateResult(analysisId, this.mapToPersistenceResult(result));

      // Step 4: Send email alert if needed
      this.addExecutionStep(executionSteps, 'email_alert_check');

      try {
        const emailService = getEmailService();
        await emailService.sendAlertIfNeeded(input, result);

        this.completeExecutionStep(executionSteps, 'email_alert_check', {
          alertSent:
            result.score >= getConfig().email.alertThreshold || result.verdict === 'Malicious',
        });
      } catch (error) {
        logger.error({
          msg: 'Failed to send email alert',
          error: error instanceof Error ? error.message : String(error),
        });

        this.failExecutionStep(executionSteps, 'email_alert_check', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Step 5: Send response
      this.addExecutionStep(executionSteps, 'response_sent', {
        verdict: result.verdict,
        duration: result.metadata.duration,
      });

      logger.info({
        analysisId,
        msg: 'Analysis completed successfully',
        verdict: result.verdict,
        score: result.score,
        alertLevel: result.alertLevel,
        executionMode,
        actualMode: executionResult.actualMode,
        duration: result.metadata.duration,
        usedAI: !!aiMetadata,
        aiCost: aiMetadata?.costUsd,
      });
    } catch (error) {
      // Capture error details for debugging
      const errorDetails = {
        message: 'Analysis failed. Please contact support.',
        stackTrace: error instanceof Error ? error.stack || '' : String(error),
        context: {
          file: 'analysis.engine.ts',
          function: 'analyze',
        },
      };

      persistenceService.updateErrorDetails(analysisId, errorDetails);

      logger.error({
        analysisId,
        msg: 'Analysis failed',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Create error result if none exists
      if (!result) {
        result = this.createErrorResult(analysisId, executionSteps);
        persistenceService.updateResult(analysisId, this.mapToPersistenceResult(result));
      }

      throw error;
    } finally {
      // ALWAYS flush to database (success or failure)
      await persistenceService.flushToDatabase(analysisId);
    }

    return result;
  }

  /**
   * Determine integration name from input type
   */
  private getIntegrationName(input: NormalizedInput): string {
    // Map input type to integration source
    // In future, this could come from input.metadata.source
    return input.type === 'email' ? 'gmail' : 'chrome';
  }

  /**
   * Load integration configuration from database
   */
  private async loadIntegrationConfig(integrationName: string) {
    try {
      const configService = getIntegrationConfigService();
      const config = await configService.getConfig(integrationName);

      if (!config || !config.isActive) {
        logger.warn({
          msg: 'Integration config not found or inactive, using defaults',
          integrationName,
        });
        return null;
      }

      return config;
    } catch (error) {
      logger.error({
        msg: 'Failed to load integration config, using defaults',
        integrationName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Map AnalysisResult to PersistenceAnalysisResult
   */
  private mapToPersistenceResult(result: AnalysisResult): PersistenceAnalysisResult {
    return {
      verdict: result.verdict,
      confidence: result.confidence,
      score: result.score,
      alertLevel: result.alertLevel,
      redFlags: result.redFlags,
      reasoning: result.reasoning,
      signals: result.signals,
      analyzersRun: result.metadata.analyzersRun,
      executionSteps: result.metadata.executionSteps || [],
      durationMs: result.metadata.duration,
    };
  }

  /**
   * Create error result when analysis fails
   */
  private createErrorResult(analysisId: string, executionSteps: ExecutionStep[]): AnalysisResult {
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
      metadata: {
        duration: 0,
        timestamp: new Date(),
        analyzersRun: [],
        analysisId,
        executionSteps,
      },
    };
  }

  /**
   * Add execution step
   */
  private addExecutionStep(
    steps: ExecutionStep[],
    stepName: string,
    context?: Record<string, unknown>
  ): void {
    steps.push({
      step: stepName,
      startedAt: new Date(),
      status: 'started',
      context,
    });
  }

  /**
   * Complete execution step
   */
  private completeExecutionStep(
    steps: ExecutionStep[],
    stepName: string,
    context?: Record<string, unknown>
  ): void {
    const step = steps.find((s) => s.step === stepName && s.status === 'started');
    if (step) {
      step.completedAt = new Date();
      step.duration = step.startedAt
        ? step.completedAt.getTime() - step.startedAt.getTime()
        : 0;
      step.status = 'completed';
      if (context) {
        step.context = { ...step.context, ...context };
      }
    }
  }

  /**
   * Fail execution step
   */
  private failExecutionStep(
    steps: ExecutionStep[],
    stepName: string,
    context?: Record<string, unknown>
  ): void {
    const step = steps.find((s) => s.step === stepName && s.status === 'started');
    if (step) {
      step.completedAt = new Date();
      step.duration = step.startedAt
        ? step.completedAt.getTime() - step.startedAt.getTime()
        : 0;
      step.status = 'failed';
      if (context) {
        step.context = { ...step.context, ...context };
      }
    }
  }
}

/**
 * Singleton instance
 */
let analysisEngineInstance: AnalysisEngine | null = null;

/**
 * Get Analysis Engine instance
 */
export function getAnalysisEngine(): AnalysisEngine {
  if (!analysisEngineInstance) {
    analysisEngineInstance = new AnalysisEngine();
  }
  return analysisEngineInstance;
}

/**
 * Reset engine (for testing)
 */
export function resetAnalysisEngine(): void {
  analysisEngineInstance = null;
}
