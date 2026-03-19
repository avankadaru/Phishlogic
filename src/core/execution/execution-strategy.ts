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

import { randomUUID } from 'node:crypto';
import { NormalizedInput } from '../models/input.js';
import { AnalysisResult, ExecutionStep, LogEntry } from '../models/analysis-result.js';
import { AIMetadata } from '../services/analysis-persistence.service.js';
import type { WhitelistEntry } from '../models/whitelist.js';
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

  /** Shared StepManager instance for hierarchical step tracking */
  stepManager?: StepManager;

  /** Whitelist entry for trusted senders (optional) */
  whitelistEntry?: WhitelistEntry;

  /** Content risk profile for content-aware filtering (ALWAYS present) */
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

  /** Pre-filtered analyzers (set by engine before strategy execution) */
  analyzers?: any[];
}

/**
 * StepManager - Hierarchical execution step tracking
 *
 * Manages parent-child step relationships with automatic stack-based context tracking.
 * Supports parallel execution groups and log capture per step.
 */
export class StepManager {
  private steps: Map<string, ExecutionStep>;
  private currentStep: string | null;
  private stepStack: string[];

  constructor(private context: ExecutionContext) {
    this.steps = new Map();
    this.currentStep = null;
    this.stepStack = [];
  }

  /**
   * Start a new step with automatic parent relationship
   *
   * @param options - Step configuration
   * @returns Step ID for reference
   */
  startStep(options: {
    name: string;
    source?: { file?: string; component?: string; method?: string; line?: number };
    isParallel?: boolean;
    parallelGroup?: string;
  }): string {
    const stepId = randomUUID();
    const parentStepId = this.currentStep ?? undefined;
    const depth = this.stepStack.length;

    const step: ExecutionStep = {
      stepId,
      step: options.name,
      parentStepId,
      depth,
      sequence: this.getNextSequence(parentStepId),
      startedAt: new Date(),
      status: 'started',
      source: options.source || {},
      logs: [],
      isParallel: options.isParallel || false,
      parallelGroup: options.parallelGroup,
      context: {},
    };

    this.steps.set(stepId, step);
    this.context.executionSteps.push(step);

    // Push to stack for auto-parenting
    this.stepStack.push(stepId);
    this.currentStep = stepId;

    return stepId;
  }

  /**
   * Complete a step and pop from stack
   *
   * @param stepId - Step ID to complete
   * @param context - Additional context metadata
   */
  completeStep(stepId: string, context?: Record<string, unknown>): void {
    const step = this.steps.get(stepId);
    if (!step) return;

    step.completedAt = new Date();
    step.status = 'completed';
    if (step.startedAt) {
      step.duration = step.completedAt.getTime() - step.startedAt.getTime();
    }
    if (context) {
      step.context = { ...step.context, ...context };
    }

    // Pop from stack
    const index = this.stepStack.indexOf(stepId);
    if (index !== -1) {
      this.stepStack.splice(index, 1);
    }
    this.currentStep = this.stepStack[this.stepStack.length - 1] || null;
  }

  /**
   * Mark a step as failed
   *
   * @param stepId - Step ID to fail
   * @param error - Error information
   */
  failStep(stepId: string, error: { error: string; stackTrace?: string; errorContext?: Record<string, unknown> }): void {
    const step = this.steps.get(stepId);
    if (!step) return;

    step.completedAt = new Date();
    step.status = 'failed';
    if (step.startedAt) {
      step.duration = step.completedAt.getTime() - step.startedAt.getTime();
    }
    step.error = error.error;
    step.stackTrace = error.stackTrace;
    step.errorContext = error.errorContext;

    // Pop from stack
    const index = this.stepStack.indexOf(stepId);
    if (index !== -1) {
      this.stepStack.splice(index, 1);
    }
    this.currentStep = this.stepStack[this.stepStack.length - 1] || null;
  }

  /**
   * Capture a log entry for the current step
   *
   * @param entry - Log entry to capture
   */
  captureLog(entry: LogEntry): void {
    if (!this.currentStep) return;

    const step = this.steps.get(this.currentStep);
    if (step) {
      step.logs.push(entry);
    }
  }

  /**
   * Start a parallel execution group
   *
   * @param groupName - Name for the parallel group
   * @returns Group step ID
   */
  startParallelGroup(groupName: string): string {
    const groupId = randomUUID();
    return this.startStep({
      name: groupName,
      isParallel: true,
      parallelGroup: groupId,
    });
  }

  /**
   * Get the current step ID (for log capture)
   *
   * @returns Current step ID or null
   */
  getCurrentStepId(): string | null {
    return this.currentStep;
  }

  /**
   * Get next sequence number for parent
   *
   * @param parentId - Parent step ID
   * @returns Next sequence number
   */
  private getNextSequence(parentId?: string): number {
    const siblings = Array.from(this.steps.values())
      .filter(s => s.parentStepId === parentId);
    return siblings.length;
  }

  /**
   * Utility: Execute function within a step context
   * Automatically handles startStep/completeStep/failStep
   *
   * @param options - Step options
   * @param fn - Function to execute
   * @returns Result of function
   */
  async withStep<T>(
    options: {
      name: string;
      source?: { file?: string; component?: string; method?: string; line?: number };
    },
    fn: (stepId: string) => Promise<T>
  ): Promise<T> {
    const stepId = this.startStep(options);

    try {
      const result = await fn(stepId);
      this.completeStep(stepId);
      return result;
    } catch (error) {
      this.failStep(stepId, {
        error: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
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
    // DISABLED: StepManager already handles timing and creates proper hierarchical steps
    // if (options?.enableTiming !== false) {
    //   strategy = new TimedExecutionStrategy(strategy);
    // }

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
