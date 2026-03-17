/**
 * AI Execution Strategy
 *
 * Uses AI only, no fallback to native.
 * Pure AI execution for maximum accuracy.
 *
 * Task Independent: Works with any AI service
 */

import { BaseExecutionStrategy, ExecutionContext, ExecutionResult } from '../execution-strategy.js';
import { AIMetadata } from '../../services/analysis-persistence.service.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

/**
 * AI Service Interface (dependency injection)
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

export class AIExecutionStrategy extends BaseExecutionStrategy {
  constructor(private aiService: AIService) {
    super();
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.addExecutionStep(context, 'ai_execution_started', 'started');

    // Validate AI configuration
    if (!context.config?.aiProvider || !context.config?.aiModel) {
      const error = new Error('AI execution mode requires AI configuration');
      this.addExecutionStep(context, 'ai_execution_failed', 'failed', {
        error: error.message,
      });
      throw error;
    }

    try {
      // Execute AI analysis
      const aiTimeout = context.config.aiTimeout || 30000;
      const aiConfig = {
        provider: context.config.aiProvider,
        model: context.config.aiModel,
        temperature: context.config.aiTemperature,
        maxTokens: context.config.aiMaxTokens,
        timeout: aiTimeout,
      };

      const { result: aiResult, durationMs: aiDuration } = await this.measureTime(async () => {
        return await this.executeWithTimeout(
          () => this.aiService.executeWithAI(context.input, aiConfig),
          aiTimeout
        );
      });

      this.addExecutionStep(context, 'ai_api_call_completed', 'completed', {
        duration: aiDuration,
        context: {
          provider: context.config.aiProvider,
          model: context.config.aiModel,
          tokenCount: aiResult.metadata.tokens.total,
          cost: aiResult.metadata.costUsd,
        },
      });

      // Calculate verdict from AI signals
      const { result: verdict, durationMs: verdictDuration } = await this.measureTime(async () => {
        const { getVerdictService } = await import('../../services/verdict.service.js');
        const { getAnalyzerRegistry } = await import('../../engine/analyzer-registry.js');
        const verdictService = getVerdictService();
        const analyzerRegistry = getAnalyzerRegistry();
        const analyzerWeights = analyzerRegistry.getAnalyzerWeights();
        return verdictService.calculateVerdict(aiResult.signals, analyzerWeights);
      });

      const totalDuration = aiDuration + verdictDuration;

      this.addExecutionStep(context, 'ai_execution_completed', 'completed', {
        duration: totalDuration,
        context: {
          verdict: verdict.verdict,
          score: verdict.score,
          signalCount: aiResult.signals.length,
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
          actions: verdict.actions,
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
        actualMode: 'ai',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({
        analysisId: context.analysisId,
        msg: 'AI execution failed (no fallback)',
        error: errorMessage,
      });

      this.addExecutionStep(context, 'ai_execution_failed', 'failed', {
        error: errorMessage,
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
    return 'AIStrategy';
  }

  canExecute(context: ExecutionContext): boolean {
    // AI strategy requires:
    // 1. AI service available
    // 2. AI configuration present
    return (
      this.aiService !== undefined &&
      !!context.config?.aiProvider &&
      !!context.config?.aiModel
    );
  }
}
