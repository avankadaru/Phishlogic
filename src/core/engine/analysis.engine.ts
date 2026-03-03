/**
 * Analysis Engine
 * Orchestrates whitelist checking, analyzer execution, and verdict calculation
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
   */
  async analyze(input: NormalizedInput): Promise<AnalysisResult> {
    const analysisId = randomUUID();
    const startTime = Date.now();
    const executionSteps: ExecutionStep[] = [];

    // Track: Request received
    this.addExecutionStep(executionSteps, 'request_received', {
      inputType: input.type,
      inputId: input.id,
    });

    // Step 1: Check whitelist
    this.addExecutionStep(executionSteps, 'whitelist_check_started');

    const whitelistResult = this.whitelistService.check(input);

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
      const duration = Date.now() - startTime;

      this.addExecutionStep(executionSteps, 'response_sent', {
        verdict: 'Safe',
        whitelisted: true,
      });

      return {
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

    // Create result object for email alert
    const duration = Date.now() - startTime;
    const result: AnalysisResult = {
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

    // Step 5: Send email alert if needed
    this.addExecutionStep(executionSteps, 'email_alert_check');

    try {
      const emailService = getEmailService();
      await emailService.sendAlertIfNeeded(input, result);

      this.completeExecutionStep(executionSteps, 'email_alert_check', {
        alertSent: result.score >= getConfig().email.alertThreshold || result.verdict === 'Malicious',
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
      verdict: verdictResult.verdict,
      duration,
    });

    logger.info({
      msg: 'Analysis completed',
      analysisId,
      verdict: verdictResult.verdict,
      score: verdictResult.score,
      alertLevel: verdictResult.alertLevel,
      duration,
    });

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
      step.duration = step.completedAt.getTime() - step.startedAt.getTime();
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
      step.duration = step.completedAt.getTime() - step.startedAt.getTime();
      step.status = 'failed';
      if (context) {
        step.context = { ...step.context, ...context };
      }
    }
  }
}
