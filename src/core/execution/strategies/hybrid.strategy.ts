/**
 * Hybrid Execution Strategy
 *
 * Tries AI first with timeout, falls back to native on failure.
 * Best of both worlds: AI accuracy with native reliability.
 *
 * Task Independent: Works with any AI service and analyzer set
 */

import { BaseExecutionStrategy, ExecutionContext, ExecutionResult } from '../execution-strategy.js';
import { AIMetadata } from '../../services/analysis-persistence.service.js';
import { NativeExecutionStrategy } from './native.strategy.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

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
    }
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
    this.addExecutionStep(context, 'hybrid_execution_started', 'started');

    // Check if AI is configured
    if (!context.config?.aiProvider || !context.config?.aiModel) {
      logger.warn({
        analysisId: context.analysisId,
        msg: 'Hybrid mode requested but AI not configured, falling back to native immediately',
      });

      this.addExecutionStep(context, 'ai_not_configured_fallback_to_native', 'completed');
      return await this.executeNativeFallback(context, 'ai_not_configured');
    }

    // Try AI execution with timeout
    try {
      this.addExecutionStep(context, 'ai_execution_attempt_started', 'started');

      const aiTimeout = context.config.aiTimeout || 30000;
      const aiConfig = {
        provider: context.config.aiProvider,
        model: context.config.aiModel,
        temperature: context.config.aiTemperature,
        maxTokens: context.config.aiMaxTokens,
        timeout: aiTimeout,
      };

      // Execute AI with timeout
      const aiStartTime = Date.now();
      const aiResult = await this.executeWithTimeout(
        () => this.aiService.executeWithAI(context.input, aiConfig),
        aiTimeout
      );
      const aiDuration = Date.now() - aiStartTime;

      this.addExecutionStep(context, 'ai_execution_completed', 'completed', {
        duration: aiDuration,
        context: {
          provider: context.config.aiProvider,
          model: context.config.aiModel,
          tokenCount: aiResult.metadata.tokens.total,
          cost: aiResult.metadata.costUsd,
        },
      });

      // AI succeeded - use AI signals for verdict
      const { result: verdict, durationMs: verdictDuration } = await this.measureTime(async () => {
        const { getVerdictService } = await import('../../services/verdict.service.js');
        const { getAnalyzerRegistry } = await import('../../engine/analyzer-registry.js');
        const verdictService = getVerdictService();
        const analyzerRegistry = getAnalyzerRegistry();
        const analyzerWeights = analyzerRegistry.getAnalyzerWeights();
        return verdictService.calculateVerdict(aiResult.signals, analyzerWeights);
      });

      const totalDuration = aiDuration + verdictDuration;

      this.addExecutionStep(context, 'hybrid_execution_completed', 'completed', {
        duration: totalDuration,
        context: {
          usedAI: true,
          verdict: verdict.verdict,
          score: verdict.score,
        },
      });

      return {
        result: {
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          score: verdict.score,
          alertLevel: verdict.alertLevel,
          redFlags: verdict.redFlags,
          reasoning: verdict.reasoning,
          signals: aiResult.signals,
          metadata: {
            duration: totalDuration,
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

      this.addExecutionStep(context, 'ai_execution_failed', 'failed', {
        error: errorMessage,
        context: {
          willFallback: shouldFallback,
        },
      });

      if (shouldFallback) {
        // Fallback to native
        return await this.executeNativeFallback(context, errorMessage);
      } else {
        // No fallback configured - throw error
        this.addExecutionStep(context, 'hybrid_execution_failed_no_fallback', 'failed', {
          error: errorMessage,
        });
        throw error;
      }
    }
  }

  /**
   * Execute native fallback when AI fails
   */
  private async executeNativeFallback(
    context: ExecutionContext,
    reason: string
  ): Promise<ExecutionResult> {
    this.addExecutionStep(context, 'fallback_to_native_started', 'started', {
      context: { reason },
    });

    // Use native strategy for fallback
    const nativeResult = await this.nativeStrategy.execute(context);

    this.addExecutionStep(context, 'fallback_to_native_completed', 'completed', {
      context: {
        verdict: nativeResult.result.verdict,
        score: nativeResult.result.score,
      },
    });

    // Return with actualMode 'native' to indicate fallback occurred
    return {
      ...nativeResult,
      actualMode: 'native', // Indicate that we fell back to native
    };
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
