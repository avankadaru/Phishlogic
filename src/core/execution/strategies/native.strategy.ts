/**
 * Native Execution Strategy
 *
 * Runs native analyzers only (SPF, DKIM, URL patterns, etc.)
 * Fast, deterministic, no AI costs.
 *
 * Task Independent: Works with any set of analyzers
 *
 * IMPORTANT: This strategy receives pre-filtered analyzers from the engine
 * and returns ONLY signals (no verdict calculation).
 * Verdict calculation is done at the engine level after strategy completes.
 */

import { BaseExecutionStrategy, ExecutionContext, ExecutionResult } from '../execution-strategy.js';
import { getLogger, setStepContext, clearStepContext } from '../../../infrastructure/logging/index.js';

const logger = getLogger();

export class NativeExecutionStrategy extends BaseExecutionStrategy {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const stepManager = context.stepManager!;

    // Root step - START
    const rootStepId = stepManager.startStep({
      name: 'native_execution',
      source: {
        file: 'native.strategy.ts',
        component: 'NativeExecutionStrategy',
        method: 'execute',
      },
    });

    try {
      // Set step context for log capture
      setStepContext(rootStepId, (entry) => stepManager.captureLog(entry));

      logger.info({
        msg: 'Starting native execution strategy',
        analysisId: context.analysisId,
      });

      // Use pre-filtered analyzers from context (filtering done by engine)
      const analyzers = context.analyzers || [];

      logger.debug({
        msg: 'Received pre-filtered analyzers from engine',
        analysisId: context.analysisId,
        analyzerCount: analyzers.length,
        analyzersToRun: analyzers.map((a: any) => a.getName()),
      });

      // If no analyzers to run, return empty signals (verdict will be calculated by engine)
      if (analyzers.length === 0) {
        logger.info({
          msg: 'No analyzers to run',
          analysisId: context.analysisId,
        });

        stepManager.completeStep(rootStepId, {
          signalCount: 0,
          analyzersRun: 0,
        });

        // Return signals only - engine will calculate verdict
        return {
          result: {
            verdict: 'Safe', // Placeholder - will be calculated by engine
            confidence: 0,
            score: 0,
            alertLevel: 'none',
            redFlags: [],
            reasoning: '',
            actions: [],
            signals: [],
            metadata: {
              duration: 0, // Placeholder - will be overridden by engine with actual duration
              timestamp: new Date(),
              analyzersRun: [],
              analysisId: context.analysisId,
              executionSteps: context.executionSteps,
            },
          },
          actualMode: 'native',
        };
      }

      // Analyzer execution - parallel group - START
      const analyzerGroupId = stepManager.startParallelGroup('analyzer_parallel_execution');
      setStepContext(analyzerGroupId, (entry) => stepManager.captureLog(entry));

      logger.info({
        msg: 'Starting parallel analyzer execution',
        analysisId: context.analysisId,
        analyzerCount: analyzers.length,
      });

      const analyzerResults = await Promise.allSettled(
        analyzers.map(async (analyzer: any) => {
          // Each analyzer gets its own step - START
          const analyzerStepId = stepManager.startStep({
            name: `analyzer_${analyzer.getName()}`,
            source: {
              file: analyzer.constructor.name + '.ts',
              component: analyzer.getName(),
            },
            parallelGroup: analyzerGroupId,
          });

          // Set step context for this analyzer's logs
          setStepContext(analyzerStepId, (entry) => stepManager.captureLog(entry));

          try {
            logger.info({
              msg: `Starting analyzer ${analyzer.getName()}`,
              analysisId: context.analysisId,
              analyzer: analyzer.getName(),
            });

            // Configure analyzer-specific options if available (case-insensitive lookup)
            const analyzerName = analyzer.getName();
            if (context.analyzerOptions && 'setOptions' in analyzer) {
              const optionsKey = Object.keys(context.analyzerOptions).find(
                (key) => key.toLowerCase() === analyzerName.toLowerCase()
              );
              if (optionsKey && context.analyzerOptions[optionsKey]) {
                (analyzer as any).setOptions(context.analyzerOptions[optionsKey]);
              }
            }

            // Attach risk profile to input for analyzer consumption
            const inputWithRiskProfile = {
              ...context.input,
              riskProfile: context.riskProfile,
            };

            // Pass stepManager to analyzer for substep tracking
            const signals = await analyzer.analyze(inputWithRiskProfile, stepManager);

            // Track costs based on analyzer type
            this.trackAnalyzerCosts(context, analyzer.getName(), signals);

            logger.info({
              msg: `Analyzer ${analyzer.getName()} completed`,
              analysisId: context.analysisId,
              analyzer: analyzer.getName(),
              signalCount: signals.length,
            });

            // Each analyzer step - END
            stepManager.completeStep(analyzerStepId, {
              signalCount: signals.length,
            });

            return { name: analyzer.getName(), signals };
          } catch (error) {
            logger.error({
              msg: `Analyzer ${analyzer.getName()} failed`,
              analysisId: context.analysisId,
              analyzer: analyzer.getName(),
              error: error instanceof Error ? error.message : String(error),
            });

            stepManager.failStep(analyzerStepId, {
              error: error instanceof Error ? error.message : String(error),
              stackTrace: error instanceof Error ? error.stack : undefined,
            });

            return { name: analyzer.getName(), signals: [] };
          }
        })
      );

      // Parallel group - END
      stepManager.completeStep(analyzerGroupId, {
        analyzersRun: analyzerResults.length,
      });

      // Collect all signals
      const allSignals: any[] = [];
      const analyzersRun: string[] = [];

      for (const result of analyzerResults) {
        if (result.status === 'fulfilled') {
          allSignals.push(...result.value.signals);
          analyzersRun.push(result.value.name);
        }
      }

      logger.info({
        msg: 'All analyzers completed, returning signals to engine',
        analysisId: context.analysisId,
        signalCount: allSignals.length,
        analyzersRun: analyzersRun.length,
      });

      // Root step - END
      stepManager.completeStep(rootStepId, {
        signalCount: allSignals.length,
        analyzersRun: analyzersRun.length,
      });

      // Return signals only - engine will calculate verdict from these signals
      return {
        result: {
          verdict: 'Safe', // Placeholder - will be overwritten by engine
          confidence: 0,
          score: 0,
          alertLevel: 'none',
          redFlags: [],
          reasoning: '',
          actions: [],
          signals: allSignals,
          metadata: {
            duration: 0, // Placeholder - will be overridden by engine with actual duration
            timestamp: new Date(),
            analyzersRun,
            analysisId: context.analysisId,
            executionSteps: context.executionSteps,
          },
        },
        actualMode: 'native',
      };
    } catch (error) {
      logger.error({
        msg: 'Native execution strategy failed',
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

  getName(): string {
    return 'NativeStrategy';
  }

  canExecute(_context: ExecutionContext): boolean {
    // Native strategy can always execute (no dependencies)
    return true;
  }

  /**
   * Track costs incurred by an analyzer based on its type and signals
   */
  private trackAnalyzerCosts(context: ExecutionContext, analyzerName: string, signals: any[]): void {
    const name = analyzerName.toLowerCase();

    // SenderReputationAnalyzer: WHOIS + DNS lookups
    if (name === 'senderreputationanalyzer') {
      this.reportCost(context, 'dns_lookup', 'DNS queries for sender domain validation', 4);
      const hasDomainAgeSignal = signals.some((s: any) => s.signalType === 'domain_recently_registered');
      if (hasDomainAgeSignal || signals.length > 0) {
        this.reportCost(context, 'whois_lookup', 'WHOIS lookup for domain age verification', 1);
      }
    }

    // ContentAnalysisAnalyzer: AI API call
    if (name === 'contentanalysisanalyzer' && signals.length > 0) {
      const estimatedTokens = 500;
      const costPer1kTokens = 0.003;
      const estimatedCost = (estimatedTokens / 1000) * costPer1kTokens;
      this.reportCost(context, 'ai_api_call', 'AI-powered content analysis', 1, estimatedCost, {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        tokensUsed: estimatedTokens,
      });
    }

    // FormAnalyzer: Browser automation
    if (name === 'formanalyzer' && signals.length > 0) {
      const urlsChecked = signals.filter((s: any) => s.signalType === 'form_detected').length;
      if (urlsChecked > 0) {
        this.reportCost(context, 'browser_automation', 'Browser automation for form detection', urlsChecked, undefined, {
          browser: 'playwright',
          urlsChecked,
        });
      }
    }

    // RedirectAnalyzer: Browser automation
    if (name === 'redirectanalyzer' && signals.length > 0) {
      const urlsChecked = signals.filter((s: any) => s.signalType === 'suspicious_redirect').length;
      if (urlsChecked > 0) {
        this.reportCost(context, 'browser_automation', 'Browser automation for redirect detection', urlsChecked, undefined, {
          browser: 'playwright',
          urlsChecked,
        });
      }
    }

    // LinkReputationAnalyzer: External API calls
    if (name === 'linkreputationanalyzer' && signals.length > 0) {
      const urlsChecked = signals.filter((s: any) =>
        ['url_flagged_malicious', 'url_flagged_suspicious', 'url_in_phishing_database'].includes(s.signalType)
      ).length;
      if (urlsChecked > 0) {
        this.reportCost(context, 'external_api_call', 'URL reputation check via external API', urlsChecked, undefined, {
          provider: 'virustotal',
          apiKeyUsed: !!context.apiCredentials,
        });
      }
    }
  }
}
