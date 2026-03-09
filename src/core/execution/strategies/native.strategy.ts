/**
 * Native Execution Strategy
 *
 * Runs native analyzers only (SPF, DKIM, URL patterns, etc.)
 * Fast, deterministic, no AI costs.
 *
 * Task Independent: Works with any set of analyzers
 */

import { BaseExecutionStrategy, ExecutionContext, ExecutionResult } from '../execution-strategy.js';
import type { AnalysisResult } from '../../models/analysis-result.js';
import { getAnalyzerRegistry } from '../../engine/analyzer-registry.js';
import { getVerdictService } from '../../services/verdict.service.js';

export class NativeExecutionStrategy extends BaseExecutionStrategy {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.addExecutionStep(context, 'native_execution_started', 'started');

    // Get all registered analyzers
    const analyzerRegistry = getAnalyzerRegistry();
    const analyzers = analyzerRegistry.getAnalyzers();

    // Run all analyzers in parallel (Promise.allSettled for independence)
    const { result: analyzerResults, durationMs } = await this.measureTime(async () => {
      return await Promise.allSettled(
        analyzers.map(async (analyzer) => {
          const analyzerStartTime = Date.now();

          try {
            const signals = await analyzer.analyze(context.input);
            const analyzerDuration = Date.now() - analyzerStartTime;

            this.addExecutionStep(context, `analyzer_${analyzer.getName()}_completed`, 'completed', {
              duration: analyzerDuration,
              signalCount: signals.length,
            });

            return { name: analyzer.getName(), signals };
          } catch (error) {
            const analyzerDuration = Date.now() - analyzerStartTime;

            this.addExecutionStep(context, `analyzer_${analyzer.getName()}_failed`, 'failed', {
              duration: analyzerDuration,
              error: error instanceof Error ? error.message : String(error),
            });

            // Return empty signals for failed analyzer (graceful degradation)
            return { name: analyzer.getName(), signals: [] };
          }
        })
      );
    });

    // Collect all signals from successful analyzers
    const allSignals: any[] = [];
    const analyzersRun: string[] = [];

    for (const result of analyzerResults) {
      if (result.status === 'fulfilled') {
        allSignals.push(...result.value.signals);
        analyzersRun.push(result.value.name);
      }
    }

    // Calculate verdict from signals
    const analyzerWeights = analyzerRegistry.getAnalyzerWeights();
    const verdictService = getVerdictService();
    const verdict = verdictService.calculateVerdict(allSignals, analyzerWeights);

    // Build analysis result
    const analysisResult: AnalysisResult = {
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      score: verdict.score,
      alertLevel: verdict.alertLevel,
      redFlags: verdict.redFlags,
      reasoning: verdict.reasoning,
      signals: allSignals,
      metadata: {
        duration: durationMs,
        timestamp: new Date(),
        analyzersRun,
        analysisId: context.analysisId,
        executionSteps: context.executionSteps,
      },
    };

    this.addExecutionStep(context, 'native_execution_completed', 'completed', {
      duration: durationMs,
      context: {
        verdict: verdict.verdict,
        score: verdict.score,
        signalCount: allSignals.length,
        analyzerCount: analyzersRun.length,
      },
    });

    return {
      result: analysisResult,
      actualMode: 'native',
    };
  }

  getName(): string {
    return 'NativeStrategy';
  }

  canExecute(_context: ExecutionContext): boolean {
    // Native strategy can always execute (no dependencies)
    return true;
  }
}
