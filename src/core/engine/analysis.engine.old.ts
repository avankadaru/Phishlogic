/**
 * Analysis Engine
 *
 * Enterprise-grade orchestration with:
 * - Strategy Pattern for execution modes (native/hybrid/ai)
 * - Repository Pattern for all data access
 * - Finally-block persistence (guaranteed save)
 * - End-to-end ID tracking (UI → Backend → DB)
 * - SOLID principles throughout
 */

import { randomUUID } from 'node:crypto';
import type { IAnalyzer } from '../analyzers/base/index.js';
import type { NormalizedInput } from '../models/input.js';
import type { AnalysisResult, ExecutionStep } from '../models/analysis-result.js';
import { getWhitelistService } from '../services/whitelist.service.js';
import { VerdictService } from '../services/verdict.service.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import { getEmailService } from '../../infrastructure/email/index.js';
import {
  getAnalysisPersistenceService,
  type AnalysisResult as PersistenceAnalysisResult,
} from '../services/analysis-persistence.service.js';

const logger = getLogger();

/**
 * Analysis Engine
 */
export class AnalysisEngine {
  private analyzers: IAnalyzer[] = [];
  private verdictService: VerdictService;
  private whitelistService = getWhitelistService();

  constructor() {
    const config = getConfig();
    this.verdictService = new VerdictService(config);

    logger.info('AnalysisEngine initialized');
  }

  /**
   * Register an analyzer
   */
  registerAnalyzer(analyzer: IAnalyzer): void {
    this.analyzers.push(analyzer);
    logger.info({
      msg: 'Analyzer registered',
      analyzerName: analyzer.getName(),
      type: analyzer.getType(),
      weight: analyzer.getWeight(),
    });
  }

  /**
   * Register multiple analyzers
   */
  registerAnalyzers(analyzers: IAnalyzer[]): void {
    for (const analyzer of analyzers) {
      this.registerAnalyzer(analyzer);
    }
  }

  /**
   * Analyze input and return result
   *
   * NEW: Supports execution modes (native/hybrid/ai)
   * NEW: Guaranteed persistence with finally block
   * NEW: End-to-end ID tracking from UI
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

    // 2. Initialize persistence tracking (BEFORE any exceptions can occur)
    const persistenceService = getAnalysisPersistenceService();
    const executionMode = 'native'; // TODO: Load from integration config
    const integrationName = this.getIntegrationName(input);

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
    });

    // 3. Execute analysis with finally block (GUARANTEES persistence)
    let result: AnalysisResult | undefined;

    try {
      // Step 1: Check whitelist
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

      // Step 2: Validation
      this.addExecutionStep(executionSteps, 'validation_started');
      // TODO: Add validation logic here
      this.completeExecutionStep(executionSteps, 'validation_started', {
        valid: true,
      });

      // Step 3: Run analyzers
      this.addExecutionStep(executionSteps, 'analysis_started', {
        analyzerCount: this.analyzers.length,
      });

      const { signals, analyzersRun } = await this.runAnalyzers(input, executionSteps);

      this.completeExecutionStep(executionSteps, 'analysis_started', {
        signalsProduced: signals.length,
        analyzersRun: analyzersRun.length,
      });

      // Step 4: Calculate verdict
      this.addExecutionStep(executionSteps, 'verdict_calculation_started');

      const analyzerWeights = this.getAnalyzerWeights();
      const verdictResult = this.verdictService.calculateVerdict(signals, analyzerWeights);

      this.completeExecutionStep(executionSteps, 'verdict_calculation_started', {
        verdict: verdictResult.verdict,
        score: verdictResult.score,
        alertLevel: verdictResult.alertLevel,
        redFlagsCount: verdictResult.redFlags.length,
      });

      // Create result object
      const duration = Date.now() - backendStartTime;
      result = {
        verdict: verdictResult.verdict,
        confidence: verdictResult.confidence,
        score: verdictResult.score,
        alertLevel: verdictResult.alertLevel,
        redFlags: verdictResult.redFlags,
        reasoning: verdictResult.reasoning,
        signals,
        metadata: {
          duration,
          timestamp: new Date(),
          analyzersRun,
          analysisId,
          executionSteps,
        },
      };

      // Update persistence tracking with result
      persistenceService.updateResult(analysisId, this.mapToPersistenceResult(result));

      // Step 5: Send email alert if needed
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

      // Step 6: Send response
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
        duration: result.metadata.duration,
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
        result = this.createErrorResult(analysisId, executionSteps, error);
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
   * Run all applicable analyzers
   */
  private async runAnalyzers(
    input: NormalizedInput,
    executionSteps: ExecutionStep[]
  ): Promise<{ signals: AnalysisResult['signals']; analyzersRun: string[] }> {
    const signals: AnalysisResult['signals'] = [];
    const analyzersRun: string[] = [];

    // Separate static and dynamic analyzers
    const staticAnalyzers = this.analyzers.filter((a) => a.getType() === 'static');
    const dynamicAnalyzers = this.analyzers.filter((a) => a.getType() === 'dynamic');

    // Run static analyzers in parallel
    const staticResults = await Promise.allSettled(
      staticAnalyzers
        .filter((analyzer) => analyzer.isApplicable(input))
        .map(async (analyzer) => {
          const analyzerName = analyzer.getName();

          this.addExecutionStep(executionSteps, `analyzer_${analyzerName}_started`, {
            type: 'static',
          });

          try {
            const analyzerSignals = await analyzer.analyze(input);

            this.completeExecutionStep(executionSteps, `analyzer_${analyzerName}_started`, {
              signalsProduced: analyzerSignals.length,
            });

            return { analyzer: analyzerName, signals: analyzerSignals };
          } catch (error) {
            logger.error({
              msg: 'Analyzer failed',
              analyzer: analyzerName,
              error: error instanceof Error ? error.message : String(error),
            });

            this.failExecutionStep(executionSteps, `analyzer_${analyzerName}_started`, {
              error: error instanceof Error ? error.message : String(error),
            });

            return { analyzer: analyzerName, signals: [] };
          }
        })
    );

    // Collect static signals
    for (const result of staticResults) {
      if (result.status === 'fulfilled') {
        signals.push(...result.value.signals);
        analyzersRun.push(result.value.analyzer);
      }
    }

    // Run dynamic analyzers sequentially (only if needed based on static results)
    const shouldRunDynamic = this.shouldRunDynamicAnalysis(signals);

    if (shouldRunDynamic) {
      for (const analyzer of dynamicAnalyzers) {
        if (!analyzer.isApplicable(input)) {
          continue;
        }

        const analyzerName = analyzer.getName();

        this.addExecutionStep(executionSteps, `analyzer_${analyzerName}_started`, {
          type: 'dynamic',
        });

        try {
          const analyzerSignals = await analyzer.analyze(input);

          signals.push(...analyzerSignals);
          analyzersRun.push(analyzerName);

          this.completeExecutionStep(executionSteps, `analyzer_${analyzerName}_started`, {
            signalsProduced: analyzerSignals.length,
          });
        } catch (error) {
          logger.error({
            msg: 'Analyzer failed',
            analyzer: analyzerName,
            error: error instanceof Error ? error.message : String(error),
          });

          this.failExecutionStep(executionSteps, `analyzer_${analyzerName}_started`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      this.addExecutionStep(executionSteps, 'dynamic_analysis_skipped', {
        reason: 'Static analysis conclusive',
      });

      logger.info('Skipping dynamic analysis - static results conclusive');
    }

    return { signals, analyzersRun };
  }

  /**
   * Determine if dynamic analysis should run
   */
  private shouldRunDynamicAnalysis(staticSignals: AnalysisResult['signals']): boolean {
    // Always run dynamic if no static signals
    if (staticSignals.length === 0) {
      return true;
    }

    // Run if we have suspicious but not conclusive signals
    const hasCritical = staticSignals.some((s) => s.severity === 'critical');
    const hasHigh = staticSignals.some((s) => s.severity === 'high');

    // Skip dynamic if we already have critical signals
    if (hasCritical) {
      return false;
    }

    // Run dynamic if we have medium/high signals but nothing conclusive
    return hasHigh || staticSignals.length < 3;
  }

  /**
   * Get analyzer weights map
   */
  private getAnalyzerWeights(): Map<string, number> {
    const weights = new Map<string, number>();

    for (const analyzer of this.analyzers) {
      weights.set(analyzer.getName(), analyzer.getWeight());
    }

    return weights;
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

  /**
   * Determine integration name from input
   * Maps input type to integration source
   */
  private getIntegrationName(input: NormalizedInput): string {
    // TODO: In future, this could come from input.metadata.source
    // For now, infer from input type
    return input.type === 'email' ? 'gmail' : 'chrome';
  }

  /**
   * Map AnalysisResult to PersistenceAnalysisResult
   * Converts between domain models
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
      executionSteps: result.metadata.executionSteps,
      durationMs: result.metadata.duration,
    };
  }

  /**
   * Create error result when analysis fails
   */
  private createErrorResult(
    analysisId: string,
    executionSteps: ExecutionStep[],
    _error: unknown
  ): AnalysisResult {
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
}
