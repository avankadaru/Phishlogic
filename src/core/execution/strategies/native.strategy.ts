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
import { getLogger } from '../../../infrastructure/logging/index.js';
import { getConfig } from '../../../config/app.config.js';

const logger = getLogger();

export class NativeExecutionStrategy extends BaseExecutionStrategy {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.addExecutionStep(context, 'native_execution_started', 'started');

    // Get analyzers based on trust level and content risk (content-aware bypass)
    const analyzerRegistry = getAnalyzerRegistry();
    let analyzers = (context.trustLevel || context.riskProfile)
      ? analyzerRegistry.getFilteredAnalyzers(context.trustLevel, context.riskProfile)
      : analyzerRegistry.getAnalyzers();

    // Filter analyzers based on integration configuration if analyzerOptions is provided
    if (context.analyzerOptions && Object.keys(context.analyzerOptions).length > 0) {
      const configuredAnalyzerNames = Object.keys(context.analyzerOptions).map((name) =>
        name.toLowerCase()
      );
      analyzers = analyzers.filter((analyzer) =>
        configuredAnalyzerNames.includes(analyzer.getName().toLowerCase())
      );

      logger.debug({
        msg: 'Filtered analyzers based on integration configuration',
        analysisId: context.analysisId,
        configuredAnalyzers: Object.keys(context.analyzerOptions),
        filteredAnalyzers: analyzers.map((a) => a.getName()),
        filteredCount: analyzers.length,
      });
    }

    const config = getConfig();

    // Log trust level decisions for audit trail
    if (config.whitelist.trustLevelLogging && context.trustLevel) {
      logger.info({
        msg: 'Running conditional analysis based on trust level and content risk',
        analysisId: context.analysisId,
        trustLevel: context.trustLevel,
        riskScore: context.riskProfile?.overallRiskScore,
        analyzerCount: analyzers.length,
        analyzersToRun: analyzers.map((a) => a.getName()),
      });
    }

    // Run all analyzers in parallel (Promise.allSettled for independence)
    const { result: analyzerResults, durationMs } = await this.measureTime(async () => {
      return await Promise.allSettled(
        analyzers.map(async (analyzer) => {
          const analyzerStartTime = Date.now();

          try {
            // Configure analyzer-specific options if available (case-insensitive lookup)
            const analyzerName = analyzer.getName();
            if (context.analyzerOptions && 'setOptions' in analyzer) {
              // Find options by case-insensitive name match
              const optionsKey = Object.keys(context.analyzerOptions).find(
                (key) => key.toLowerCase() === analyzerName.toLowerCase()
              );
              if (optionsKey && context.analyzerOptions[optionsKey]) {
                (analyzer as any).setOptions(context.analyzerOptions[optionsKey]);
              }
            }

            const signals = await analyzer.analyze(context.input);
            const analyzerDuration = Date.now() - analyzerStartTime;

            // Track costs based on analyzer type
            this.trackAnalyzerCosts(context, analyzer.getName(), signals);

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
