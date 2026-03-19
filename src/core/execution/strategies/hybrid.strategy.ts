/**
 * Hybrid Execution Strategy
 *
 * Tries AI first with timeout, falls back to native on failure.
 * Best of both worlds: AI accuracy with native reliability.
 *
 * Task Independent: Works with any AI service and analyzer set
 *
 * IMPORTANT: This strategy returns ONLY signals (no verdict calculation).
 * Verdict calculation is done at the engine level after strategy completes.
 */

import { BaseExecutionStrategy, ExecutionContext, ExecutionResult, type StepManager } from '../execution-strategy.js';
import { AIMetadata } from '../../services/analysis-persistence.service.js';
import type { EnhancedContentRiskProfile } from '../../analyzers/risk/content-risk.analyzer.js';
import { NativeExecutionStrategy } from './native.strategy.js';
import { getLogger, setStepContext, clearStepContext } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

/**
 * AI Service Interface (dependency injection)
 * Any AI service that implements this can be used
 */
export interface AIService {
  executeWithAI(
    input: any,
    config: {
      provider: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
      timeout?: number;
    },
    riskProfile?: EnhancedContentRiskProfile
  ): Promise<{
    signals: any[];
    metadata: AIMetadata;
  }>;
}

export class HybridExecutionStrategy extends BaseExecutionStrategy {
  private nativeStrategy: NativeExecutionStrategy;

  constructor(private aiService: AIService) {
    super();
    this.nativeStrategy = new NativeExecutionStrategy();
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const stepManager = context.stepManager!;

    // Root step - START
    const rootStepId = stepManager.startStep({
      name: 'hybrid_execution',
      source: {
        file: 'hybrid.strategy.ts',
        component: 'HybridExecutionStrategy',
        method: 'execute',
      },
    });

    try {
      // Set step context for log capture
      setStepContext(rootStepId, (entry) => stepManager.captureLog(entry));

      logger.info({
        msg: 'Starting hybrid execution strategy',
        analysisId: context.analysisId,
      });

      // Check if AI is configured
      if (!context.config?.aiProvider || !context.config?.aiModel) {
        logger.warn({
          analysisId: context.analysisId,
          msg: 'Hybrid mode requested but AI not configured, falling back to native immediately',
        });

        const configCheckStepId = stepManager.startStep({
          name: 'ai_config_check',
          source: { file: 'hybrid.strategy.ts', method: 'execute' },
        });
        setStepContext(configCheckStepId, (entry) => stepManager.captureLog(entry));

        stepManager.completeStep(configCheckStepId, {
          aiConfigured: false,
          reason: 'AI provider or model not configured',
        });

        stepManager.completeStep(rootStepId, {
          usedAI: false,
          fallbackReason: 'ai_not_configured',
        });

        return await this.executeNativeFallback(context, 'ai_not_configured', stepManager);
      }

      // Try AI execution with timeout - START
      const aiAttemptStepId = stepManager.startStep({
        name: 'ai_execution_attempt',
        source: { file: 'hybrid.strategy.ts', method: 'execute' },
      });
      setStepContext(aiAttemptStepId, (entry) => stepManager.captureLog(entry));

      try {
        logger.info({
          msg: 'Starting AI execution attempt',
          analysisId: context.analysisId,
          provider: context.config.aiProvider,
          model: context.config.aiModel,
        });

        const aiTimeout = context.config.aiTimeout || 30000;
        const aiConfig = {
          provider: context.config.aiProvider,
          model: context.config.aiModel,
          temperature: context.config.aiTemperature,
          maxTokens: context.config.aiMaxTokens,
          timeout: aiTimeout,
        };

        // Execute AI with timeout
        const aiResult = await this.executeWithTimeout(
          () => this.aiService.executeWithAI(context.input, aiConfig, context.riskProfile),
          aiTimeout
        );

        logger.info({
          msg: 'AI execution completed successfully',
          analysisId: context.analysisId,
          tokenCount: aiResult.metadata.tokens.total,
          cost: aiResult.metadata.costUsd,
        });

        // AI attempt step - END
        stepManager.completeStep(aiAttemptStepId, {
          success: true,
          provider: context.config.aiProvider,
          model: context.config.aiModel,
          tokenCount: aiResult.metadata.tokens.total,
          cost: aiResult.metadata.costUsd,
          signalCount: aiResult.signals.length,
        });

        // Root step - END
        stepManager.completeStep(rootStepId, {
          usedAI: true,
          signalCount: aiResult.signals.length,
        });

        // Return signals only - engine will calculate verdict
        return {
          result: {
            verdict: 'Safe', // Placeholder - will be overwritten by engine
            confidence: 0,
            score: 0,
            alertLevel: 'none',
            redFlags: [],
            reasoning: '',
            actions: [],
            signals: aiResult.signals,
            metadata: {
              duration: 0, // Placeholder - will be overridden by engine with actual duration
              timestamp: new Date(),
              analyzersRun: ['AI'],
              analysisId: context.analysisId,
              executionSteps: context.executionSteps,
            },
          },
          aiMetadata: aiResult.metadata,
          actualMode: 'hybrid', // Successfully used hybrid (AI)
        };
      } catch (error) {
        // AI failed - determine if we should fallback
        const errorMessage = error instanceof Error ? error.message : String(error);
        const shouldFallback = context.config.fallbackToNative !== false;

        logger.warn({
          analysisId: context.analysisId,
          msg: 'AI execution failed in hybrid mode',
          error: errorMessage,
          willFallback: shouldFallback,
        });

        // AI attempt step - FAILED
        stepManager.failStep(aiAttemptStepId, {
          error: errorMessage,
          stackTrace: error instanceof Error ? error.stack : undefined,
          errorContext: { willFallback: shouldFallback },
        });

        if (shouldFallback) {
          // Fallback to native
          const fallbackResult = await this.executeNativeFallback(context, errorMessage, stepManager);

          // Root step - END
          stepManager.completeStep(rootStepId, {
            usedAI: false,
            fallbackReason: 'ai_execution_failed',
            fallbackError: errorMessage,
          });

          return fallbackResult;
        } else {
          // No fallback configured - throw error
          stepManager.failStep(rootStepId, {
            error: errorMessage,
            errorContext: { fallbackDisabled: true },
          });
          throw error;
        }
      }
    } catch (error) {
      logger.error({
        msg: 'Hybrid execution strategy failed',
        analysisId: context.analysisId,
        error: error instanceof Error ? error.message : String(error),
      });

      stepManager.failStep(rootStepId, {
        error: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    } finally {
      clearStepContext();
    }
  }

  /**
   * Execute native fallback when AI fails
   */
  private async executeNativeFallback(
    context: ExecutionContext,
    reason: string,
    stepManager: StepManager
  ): Promise<ExecutionResult> {
    const fallbackStepId = stepManager.startStep({
      name: 'fallback_to_native',
      source: { file: 'hybrid.strategy.ts', method: 'executeNativeFallback' },
    });
    setStepContext(fallbackStepId, (entry) => stepManager.captureLog(entry));

    logger.info({
      msg: 'Falling back to native execution',
      analysisId: context.analysisId,
      reason,
    });

    try {
      // Use native strategy for fallback
      const nativeResult = await this.nativeStrategy.execute(context);

      logger.info({
        msg: 'Native fallback completed',
        analysisId: context.analysisId,
        signalCount: nativeResult.result.signals.length,
      });

      stepManager.completeStep(fallbackStepId, {
        signalCount: nativeResult.result.signals.length,
        reason,
      });

      // Return with actualMode 'native' to indicate fallback occurred
      return {
        ...nativeResult,
        actualMode: 'native', // Indicate that we fell back to native
      };
    } catch (error) {
      logger.error({
        msg: 'Native fallback failed',
        analysisId: context.analysisId,
        error: error instanceof Error ? error.message : String(error),
      });

      stepManager.failStep(fallbackStepId, {
        error: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    }
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`AI execution timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  getName(): string {
    return 'HybridStrategy';
  }

  canExecute(_context: ExecutionContext): boolean {
    // Hybrid requires AI service to be available
    return this.aiService !== undefined;
  }
}
