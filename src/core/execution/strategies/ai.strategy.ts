/**
 * AI Execution Strategy
 *
 * Uses AI only, no fallback to native.
 * Pure AI execution for maximum accuracy.
 *
 * Task Independent: Works with any AI service
 *
 * IMPORTANT: This strategy returns ONLY signals (no verdict calculation).
 * Verdict calculation is done at the engine level after strategy completes.
 */

import { BaseExecutionStrategy, ExecutionContext, ExecutionResult } from '../execution-strategy.js';
import { AIMetadata } from '../../services/analysis-persistence.service.js';

import type { EnhancedContentRiskProfile } from '../../analyzers/risk/content-risk.analyzer.js';
import { getLogger, setStepContext, clearStepContext } from '../../../infrastructure/logging/logger.js';

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
      apiKey: string;
      promptTemplateId?: string;
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

export class AIExecutionStrategy extends BaseExecutionStrategy {
  constructor(private aiService: AIService) {
    super();
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const stepManager = context.stepManager!;

    // Root step - START
    const rootStepId = stepManager.startStep({
      name: 'ai_execution',
      source: {
        file: 'ai.strategy.ts',
        component: 'AIExecutionStrategy',
        method: 'execute',
      },
    });

    try {
      // Set step context for log capture
      setStepContext(rootStepId, (entry) => stepManager.captureLog(entry));

      logger.info({
        msg: 'Starting AI execution strategy',
        analysisId: context.analysisId,
      });

      // Validate AI configuration
      if (!context.config?.aiProvider || !context.config?.aiModel || !context.config?.aiApiKey) {
        const error = new Error('AI execution mode requires AI configuration (provider, model, and API key)');

        logger.error({
          msg: 'AI configuration incomplete',
          analysisId: context.analysisId,
          hasProvider: !!context.config?.aiProvider,
          hasModel: !!context.config?.aiModel,
          hasApiKey: !!context.config?.aiApiKey,
          error: error.message,
        });

        stepManager.failStep(rootStepId, {
          error: error.message,
        });

        throw error;
      }

      // AI API call - START
      const aiApiStepId = stepManager.startStep({
        name: 'ai_api_call',
        source: { file: 'ai.strategy.ts', method: 'execute' },
      });
      setStepContext(aiApiStepId, (entry) => stepManager.captureLog(entry));

      try {
        logger.info({
          msg: 'Executing AI API call',
          analysisId: context.analysisId,
          provider: context.config.aiProvider,
          model: context.config.aiModel,
        });

        const aiTimeout = context.config.aiTimeout || 30000;
        const aiConfig = {
          provider: context.config.aiProvider,
          model: context.config.aiModel,
          apiKey: context.config.aiApiKey,
          promptTemplateId: context.config.aiPromptTemplateId,
          temperature: context.config.aiTemperature,
          maxTokens: context.config.aiMaxTokens,
          timeout: aiTimeout,
        };

        const aiResult = await this.executeWithTimeout(
          () => this.aiService.executeWithAI(context.input, aiConfig, context.riskProfile),
          aiTimeout
        );

        logger.info({
          msg: 'AI API call completed',
          analysisId: context.analysisId,
          tokenCount: aiResult.metadata.tokens.total,
          cost: aiResult.metadata.costUsd,
          signalCount: aiResult.signals.length,
        });

        // AI API step - END
        stepManager.completeStep(aiApiStepId, {
          provider: context.config.aiProvider,
          model: context.config.aiModel,
          tokenCount: aiResult.metadata.tokens.total,
          cost: aiResult.metadata.costUsd,
          signalCount: aiResult.signals.length,
        });

        logger.info({
          msg: 'AI execution completed, returning signals to engine',
          analysisId: context.analysisId,
          signalCount: aiResult.signals.length,
        });

        // Root step - END
        stepManager.completeStep(rootStepId, {
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
          actualMode: 'ai',
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error({
          analysisId: context.analysisId,
          msg: 'AI API call failed',
          error: errorMessage,
        });

        stepManager.failStep(aiApiStepId, {
          error: errorMessage,
          stackTrace: error instanceof Error ? error.stack : undefined,
        });

        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({
        analysisId: context.analysisId,
        msg: 'AI execution strategy failed (no fallback)',
        error: errorMessage,
      });

      stepManager.failStep(rootStepId, {
        error: errorMessage,
        stackTrace: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    } finally {
      clearStepContext();
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
    // 2. AI configuration present (provider, model, and API key)
    return (
      this.aiService !== undefined &&
      !!context.config?.aiProvider &&
      !!context.config?.aiModel &&
      !!context.config?.aiApiKey
    );
  }
}
