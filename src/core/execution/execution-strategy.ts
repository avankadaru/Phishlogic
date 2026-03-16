/**
 * Abstract Execution Strategy Pattern
 *
 * Task-independent orchestration for Native/Hybrid/AI execution modes.
 * Simple to extend with new strategies or decorators.
 *
 * Design Principles:
 * - Abstract: Strategy interface, not concrete implementations
 * - Task Independent: Works for any analyzer/task
 * - Simple to Extend: Add new strategies without modifying existing code
 * - Decorated: Timing and tracking via decorators
 */

import { NormalizedInput } from '../models/input.js';
import { AnalysisResult, ExecutionStep } from '../models/analysis-result.js';
import { AIMetadata } from '../services/analysis-persistence.service.js';
import type { TrustLevel } from '../models/whitelist.js';
import type { ContentRiskProfile } from '../analyzers/risk/content-risk.analyzer.js';

/**
 * Execution context - all data needed for strategy execution
 */
export interface ExecutionContext {
  /** Unique analysis ID */
  analysisId: string;

  /** Normalized input */
  input: NormalizedInput;

  /** Integration configuration */
  config?: {
    executionMode: 'native' | 'hybrid' | 'ai';
    aiModelId?: string;
    aiProvider?: string;
    aiModel?: string;
    aiTemperature?: number;
    aiMaxTokens?: number;
    aiTimeout?: number;
    fallbackToNative?: boolean;
  };

  /** Integration name (gmail, chrome, etc) */
  integrationName: string;

  /** Execution steps tracking (mutable) */
  executionSteps: ExecutionStep[];

  /** Trust level for whitelist partial bypass (optional) */
  trustLevel?: TrustLevel;

  /** Content risk profile for content-aware filtering (optional) */
  riskProfile?: ContentRiskProfile;

  /** Analyzer-specific options keyed by analyzer name (optional) */
  analyzerOptions?: Record<string, Record<string, any>>;

  /** API credentials for external services (optional) */
  apiCredentials?: Record<string, {
    id: string;
    provider: string;
    apiKey: string;
    endpoint?: string;
  }>;

  /** Cost tracking for operations performed during analysis (mutable) */
  costTracking?: {
    operations: Array<{
      operationType: 'ai_api_call' | 'whois_lookup' | 'browser_automation' | 'dns_lookup' | 'external_api_call';
      description: string;
      count: number;
      costUsd?: number;
      metadata?: Record<string, any>;
    }>;
  };
}

/**
 * Execution result with optional AI metadata
 */
export interface ExecutionResult {
  /** Analysis result */
  result: AnalysisResult;

  /** AI metadata (if AI was used) */
  aiMetadata?: AIMetadata;

  /** Execution mode actually used (may differ from requested in hybrid fallback) */
  actualMode: 'native' | 'hybrid' | 'ai';
}

/**
 * Abstract Execution Strategy
 *
 * Implement this interface to create new execution modes.
 * All strategies are task-independent and work with any analyzer.
 */
export interface ExecutionStrategy {
  /**
   * Execute analysis with this strategy
   *
   * @param context - Execution context with all necessary data
   * @returns Execution result with analysis data and metadata
   */
  execute(context: ExecutionContext): Promise<ExecutionResult>;

  /**
   * Get strategy name (for logging/debugging)
   */
  getName(): string;

  /**
   * Check if strategy can handle this context
   * (optional - for validation/pre-checks)
   */
  canExecute?(context: ExecutionContext): boolean;
}

/**
 * Base class for execution strategies
 * Provides common functionality
 */
export abstract class BaseExecutionStrategy implements ExecutionStrategy {
  abstract execute(context: ExecutionContext): Promise<ExecutionResult>;
  abstract getName(): string;

  /**
   * Add execution step to tracking
   */
  protected addExecutionStep(
    context: ExecutionContext,
    step: string,
    status: 'started' | 'completed' | 'failed' = 'started',
    metadata?: any
  ): void {
    const stepData: any = {
      step,
      status,
    };

    if (status === 'started') {
      stepData.startedAt = new Date();
    } else {
      stepData.completedAt = new Date();
      if (metadata?.duration) {
        stepData.duration = metadata.duration;
      }
      if (metadata?.error) {
        stepData.error = metadata.error;
      }
      if (metadata?.context) {
        stepData.context = metadata.context;
      }
    }

    context.executionSteps.push(stepData);
  }

  /**
   * Measure execution time of a function
   */
  protected async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const startTime = Date.now();
    const result = await fn();
    const durationMs = Date.now() - startTime;
    return { result, durationMs };
  }

  /**
   * Report cost for an operation (AI API call, WHOIS lookup, etc.)
   */
  protected reportCost(
    context: ExecutionContext,
    operationType: 'ai_api_call' | 'whois_lookup' | 'browser_automation' | 'dns_lookup' | 'external_api_call',
    description: string,
    count: number = 1,
    costUsd?: number,
    metadata?: Record<string, any>
  ): void {
    // Initialize cost tracking if not present
    if (!context.costTracking) {
      context.costTracking = { operations: [] };
    }

    // Find existing operation of same type and description
    const existingOp = context.costTracking.operations.find(
      (op) => op.operationType === operationType && op.description === description
    );

    if (existingOp) {
      // Increment existing operation
      existingOp.count += count;
      if (costUsd) {
        existingOp.costUsd = (existingOp.costUsd || 0) + costUsd;
      }
      if (metadata) {
        existingOp.metadata = { ...existingOp.metadata, ...metadata };
      }
    } else {
      // Add new operation
      context.costTracking.operations.push({
        operationType,
        description,
        count,
        costUsd,
        metadata,
      });
    }
  }
}

/**
 * Strategy Decorator for timing
 * Wraps any strategy and automatically tracks execution time
 */
export class TimedExecutionStrategy implements ExecutionStrategy {
  constructor(private strategy: ExecutionStrategy) {}

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const stepName = `${this.strategy.getName()}_execution`;
    const startTime = Date.now();

    // Add start step
    context.executionSteps.push({
      step: `${stepName}_started`,
      startedAt: new Date(startTime),
      status: 'started',
    });

    try {
      const result = await this.strategy.execute(context);

      // Add completion step
      const duration = Date.now() - startTime;
      context.executionSteps.push({
        step: `${stepName}_completed`,
        completedAt: new Date(),
        duration,
        status: 'completed',
        context: {
          verdict: result.result.verdict,
          score: result.result.score,
          actualMode: result.actualMode,
          hasAI: !!result.aiMetadata,
        },
      });

      return result;
    } catch (error) {
      // Add failure step
      const duration = Date.now() - startTime;
      context.executionSteps.push({
        step: `${stepName}_failed`,
        completedAt: new Date(),
        duration,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  getName(): string {
    return `Timed(${this.strategy.getName()})`;
  }

  canExecute?(context: ExecutionContext): boolean {
    return this.strategy.canExecute ? this.strategy.canExecute(context) : true;
  }
}

/**
 * Strategy Decorator for logging
 * Wraps any strategy and logs execution details
 */
export class LoggedExecutionStrategy implements ExecutionStrategy {
  constructor(
    private strategy: ExecutionStrategy,
    private logger: any
  ) {}

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.logger.info({
      analysisId: context.analysisId,
      strategy: this.strategy.getName(),
      msg: 'Strategy execution started',
    });

    try {
      const result = await this.strategy.execute(context);

      this.logger.info({
        analysisId: context.analysisId,
        strategy: this.strategy.getName(),
        verdict: result.result.verdict,
        score: result.result.score,
        actualMode: result.actualMode,
        hasAI: !!result.aiMetadata,
        msg: 'Strategy execution completed',
      });

      return result;
    } catch (error) {
      this.logger.error({
        analysisId: context.analysisId,
        strategy: this.strategy.getName(),
        error: error instanceof Error ? error.message : String(error),
        msg: 'Strategy execution failed',
      });

      throw error;
    }
  }

  getName(): string {
    return `Logged(${this.strategy.getName()})`;
  }

  canExecute?(context: ExecutionContext): boolean {
    return this.strategy.canExecute ? this.strategy.canExecute(context) : true;
  }
}

/**
 * Strategy Factory
 * Creates strategies with optional decorators
 */
export class ExecutionStrategyFactory {
  private strategies: Map<string, ExecutionStrategy> = new Map();

  /**
   * Register a strategy
   */
  register(mode: 'native' | 'hybrid' | 'ai', strategy: ExecutionStrategy): void {
    this.strategies.set(mode, strategy);
  }

  /**
   * Get strategy for execution mode
   * Automatically applies timing decorator
   */
  getStrategy(mode: 'native' | 'hybrid' | 'ai', options?: { enableTiming?: boolean; enableLogging?: boolean; logger?: any }): ExecutionStrategy {
    const baseStrategy = this.strategies.get(mode);

    if (!baseStrategy) {
      throw new Error(`No strategy registered for mode: ${mode}`);
    }

    let strategy: ExecutionStrategy = baseStrategy;

    // Apply decorators (order matters: timing → logging)
    if (options?.enableTiming !== false) {
      strategy = new TimedExecutionStrategy(strategy);
    }

    if (options?.enableLogging && options.logger) {
      strategy = new LoggedExecutionStrategy(strategy, options.logger);
    }

    return strategy;
  }

  /**
   * Check if strategy is registered
   */
  hasStrategy(mode: 'native' | 'hybrid' | 'ai'): boolean {
    return this.strategies.has(mode);
  }
}
