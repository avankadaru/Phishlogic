/**
 * Analysis Engine (Refactored with Strategy Pattern)
 *
 * Enterprise-grade orchestration with:
 * - Strategy Pattern for execution modes (native/hybrid/ai)
 * - Repository Pattern for all data access
 * - Finally-block persistence (guaranteed save)
 * - End-to-end ID tracking (UI → Backend → DB)
 * - SOLID principles throughout
 */

import { randomUUID } from 'node:crypto';
import type { NormalizedInput } from '../models/input.js';
import { isEmailInput, isUrlInput } from '../models/input.js';
import type { AnalysisResult, ExecutionStep } from '../models/analysis-result.js';
import { getWhitelistService } from '../services/whitelist.service.js';
import { getLogger, setStepContext, clearStepContext } from '../../infrastructure/logging/index.js';
import { getEmailService } from '../../infrastructure/email/index.js';
import { getConfig } from '../../config/index.js';
import { ContentRiskAnalyzer } from '../analyzers/risk/content-risk.analyzer.js';
import {
  getAnalysisPersistenceService,
  type AnalysisResult as PersistenceAnalysisResult,
} from '../services/analysis-persistence.service.js';
import { getIntegrationConfigService } from '../services/integration-config.service.js';
import { getAIExecutionService } from '../services/ai-execution.service.js';
import {
  ExecutionStrategyFactory,
  StepManager,
  type ExecutionContext,
} from '../execution/execution-strategy.js';
import { NativeExecutionStrategy } from '../execution/strategies/native.strategy.js';
import { HybridExecutionStrategy } from '../execution/strategies/hybrid.strategy.js';
import { AIExecutionStrategy } from '../execution/strategies/ai.strategy.js';
import { getAnalyzerRegistry } from './analyzer-registry.js';
import { createVerdictService } from '../services/verdict.factory.js';
import { resolvePipeline } from './task-analysis-profile.js';
import { buildMinimalUrlRiskProfile } from './minimal-url-risk-profile.js';
import type { ContentRiskProfile } from '../analyzers/risk/content-risk.types.js';

const logger = getLogger();

/**
 * Analysis Engine
 */
export class AnalysisEngine {
  private strategyFactory: ExecutionStrategyFactory;
  private whitelistService = getWhitelistService();

  constructor() {
    // Initialize strategy factory with all strategies
    this.strategyFactory = new ExecutionStrategyFactory();

    // Register strategies with dependency injection
    const aiService = getAIExecutionService();
    this.strategyFactory.register('native', new NativeExecutionStrategy());
    this.strategyFactory.register('hybrid', new HybridExecutionStrategy(aiService));
    this.strategyFactory.register('ai', new AIExecutionStrategy(aiService));

    logger.info('AnalysisEngine initialized with execution strategies');
  }

  /**
   * Analyze input and return result
   *
   * Features:
   * - Execution mode routing (native/hybrid/ai)
   * - Guaranteed persistence with finally block
   * - End-to-end ID tracking from UI
   * - Whitelist bypass
   * - Email alerts
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

    // 2. Determine integration config (single source of truth) and resolve pipeline
    const requestedIntegrationName = this.getIntegrationName(input);
    const integrationConfig = await this.loadIntegrationConfig(requestedIntegrationName);
    const pipeline = resolvePipeline(input, integrationConfig);
    const { integrationName, contentPrescan, analyzerFilteringMode, executionMode } = pipeline;

    // 3. Initialize persistence tracking (BEFORE any exceptions can occur)
    const persistenceService = getAnalysisPersistenceService();
    persistenceService.initializeTracking(analysisId, input, executionMode, integrationName, {
      analysisId,
      uiTimestamp: input.uiTimestamp,
      backendStartTime,
      networkLatency,
    });

    const executionSteps: ExecutionStep[] = [];
    const stepManager = new StepManager({ analysisId, input, integrationName, executionSteps } as ExecutionContext);

    // Root step - START
    const rootStepId = stepManager.startStep({
      name: 'analysis_start',
      source: {
        file: 'analysis.engine.ts',
        component: 'AnalysisEngine',
        method: 'analyze',
      },
    });

    // 4. Execute analysis with finally block (GUARANTEES persistence)
    let result: AnalysisResult | undefined;
    let aiMetadata: any = undefined;

    try {
      // Set step context for log capture
      setStepContext(rootStepId, (entry) => stepManager.captureLog(entry));
      logger.info({ analysisId, inputType: input.type }, 'Analysis request received');

      // Log parsed email summary inside step context so it appears in debug trace
      if (isEmailInput(input)) {
        const ep = input.data.parsed;
        logger.info({ from: ep.from.address, subject: ep.subject, urlCount: ep.urls?.length ?? 0, imageCount: ep.images?.length ?? 0, hasText: !!ep.body.text, hasHtml: !!ep.body.html, attachmentCount: ep.attachments?.length ?? 0 }, 'Email input parsed');
      }

      // Step 1: Check whitelist - START
      const whitelistStepId = stepManager.startStep({
        name: 'whitelist_check',
        source: { file: 'analysis.engine.ts', method: 'analyze' },
      });
      setStepContext(whitelistStepId, (entry) => stepManager.captureLog(entry));

      logger.info({
        msg: 'Checking whitelist',
        analysisId,
      });

      const whitelistResult = await this.whitelistService.check(input);

      logger.info({
        msg: 'Whitelist check completed',
        analysisId,
        isWhitelisted: whitelistResult.isWhitelisted,
        isTrusted: whitelistResult.entry?.isTrusted,
      });

      // Whitelist check - END
      stepManager.completeStep(whitelistStepId, {
        isWhitelisted: whitelistResult.isWhitelisted,
        matchReason: whitelistResult.matchReason,
        isTrusted: whitelistResult.entry?.isTrusted,
      });

      // URL whitelist short-circuit: skip the rest of the pipeline entirely.
      // Email flow is intentionally untouched - it keeps the existing whitelist context
      // passed to analyzers further down.
      if (whitelistResult.isWhitelisted && isUrlInput(input)) {
        const backendEndTime = Date.now();
        const actualDuration = backendEndTime - backendStartTime;

        result = this.buildWhitelistedUrlResult(
          input,
          whitelistResult,
          analysisId,
          executionSteps,
          actualDuration
        );

        stepManager.completeStep(rootStepId, {
          verdict: result.verdict,
          score: result.score,
          signalCount: 0,
          shortCircuit: 'whitelist',
        });

        persistenceService.updateResult(analysisId, this.mapToPersistenceResult(result));

        logger.info({
          analysisId,
          msg: 'URL whitelist short-circuit: returning Safe without running analyzers',
          matchReason: whitelistResult.matchReason,
          duration: actualDuration,
        });

        return result;
      }

      // Step 2: Content risk analysis (pre-scan) — task-specific (email MIME vs URL static / optional HTML context)
      const contentRiskStepId = stepManager.startStep({
        name: 'content_risk_pre_scan',
        source: {
          file: 'content-risk.analyzer.ts',
          component: 'ContentRiskAnalyzer',
        },
      });
      setStepContext(contentRiskStepId, (entry) => stepManager.captureLog(entry));

      let riskProfile: ContentRiskProfile;

      if (contentPrescan === 'none') {
        logger.info({
          msg: 'Skipping content pre-scan (integration policy: none)',
          analysisId,
          integrationName,
        });

        if (isUrlInput(input)) {
          riskProfile = buildMinimalUrlRiskProfile(input);
        } else {
          const contentRiskAnalyzer = new ContentRiskAnalyzer();
          riskProfile = await contentRiskAnalyzer.analyzeRisk(input, { contentPrescan: 'email' });
        }

        stepManager.completeStep(contentRiskStepId, {
          prescanMode: 'none',
          riskScore: riskProfile.overallRiskScore,
          hasLinks: riskProfile.hasLinks,
          hasAttachments: riskProfile.hasAttachments,
          hasImages: riskProfile.hasImages,
          hasQRCodes: riskProfile.hasQRCodes,
          hasForms: riskProfile.hasForms,
          hasUrgency: riskProfile.hasUrgencyLanguage,
          extractionTimings: riskProfile.extractionTimings,
          totalExtractionTimeMs: 0,
          extractedDomains: riskProfile.domains?.allDomains.length || 0,
          extractedLinks: riskProfile.linkMetadata?.length || 0,
          extractedImages: 0,
          extractedQRCodes: 0,
          extractedAttachments: 0,
          extractedButtons: 0,
        });
      } else {
        logger.info({
          msg: 'Starting content risk pre-scan',
          analysisId,
          integrationName,
          contentPrescan,
        });

        const contentRiskAnalyzer = new ContentRiskAnalyzer();
        riskProfile = await contentRiskAnalyzer.analyzeRisk(input, {
          contentPrescan,
        });

        logger.info({
          msg: 'Content risk pre-scan completed',
          analysisId,
          riskScore: riskProfile.overallRiskScore,
          hasLinks: riskProfile.hasLinks,
          hasAttachments: riskProfile.hasAttachments,
          contentPrescan,
        });

        stepManager.completeStep(contentRiskStepId, {
          prescanMode: contentPrescan,
          riskScore: riskProfile.overallRiskScore,
          hasLinks: riskProfile.hasLinks,
          hasAttachments: riskProfile.hasAttachments,
          hasImages: riskProfile.hasImages,
          hasQRCodes: riskProfile.hasQRCodes,
          hasForms: riskProfile.hasForms,
          hasUrgency: riskProfile.hasUrgencyLanguage,
          extractionTimings: riskProfile.extractionTimings,
          totalExtractionTimeMs: Object.values(riskProfile.extractionTimings || {}).reduce(
            (a, b) => a + b,
            0
          ),
          extractedDomains: riskProfile.domains?.allDomains.length || 0,
          extractedLinks: riskProfile.linkMetadata?.length || 0,
          extractedImages: riskProfile.images?.length || 0,
          extractedQRCodes: riskProfile.qrCodes?.length || 0,
          extractedAttachments: riskProfile.attachmentMetadata?.length || 0,
          extractedButtons: riskProfile.buttons?.length || 0,
        });
      }

      input.riskProfile = riskProfile;

      // Step 3: Analyzer filtering (ENGINE LEVEL) - START
      const filteringStepId = stepManager.startStep({
        name: 'analyzer_filtering',
        source: {
          file: 'analyzer-registry.ts',
          component: 'AnalyzerRegistry',
        },
      });
      setStepContext(filteringStepId, (entry) => stepManager.captureLog(entry));

      logger.info({
        msg: 'Filtering analyzers based on content profile and integration policy',
        analysisId,
        integrationName,
        analyzerFilteringMode,
      });

      const analyzerRegistry = getAnalyzerRegistry();
      const filteringResult = analyzerRegistry.getFilteredAnalyzersWithReasons(
        input,
        whitelistResult.isWhitelisted ? whitelistResult.entry : undefined,
        riskProfile,
        analyzerFilteringMode
      );

      logger.info({
        msg: 'Analyzer filtering completed',
        analysisId,
        analyzersSelected: filteringResult.analyzers.length,
        analyzersSkipped: filteringResult.skipped.length,
      });

      // Filtering step - END
      stepManager.completeStep(filteringStepId, {
        totalAnalyzersAvailable: analyzerRegistry.getAnalyzers().length,
        analyzersSelected: filteringResult.analyzers.length,
        analyzersSkipped: filteringResult.skipped.length,
        selectedAnalyzers: filteringResult.reasons.map((r) => ({
          analyzer: r.analyzerName,
          reason: r.reason,
          triggeredBy: r.triggeredBy,
        })),
        skippedAnalyzers: filteringResult.skipped.map((s) => ({
          analyzer: s.analyzerName,
          reason: s.reason,
        })),
      });

      // Step 4: Prepare execution context
      // Transform analyzer options array to keyed map for easy lookup
      const analyzerOptions = integrationConfig?.analyzers?.reduce<Record<string, Record<string, any>>>(
        (acc, analyzerOpt) => {
          acc[analyzerOpt.analyzerName] = analyzerOpt.options;
          return acc;
        },
        {}
      );

      const context: ExecutionContext = {
        analysisId,
        input,
        integrationName,
        executionSteps,
        stepManager,
        config: integrationConfig
          ? {
              executionMode,
              aiModelId: integrationConfig.aiModelId,
              aiProvider: integrationConfig.aiProvider,
              aiModel: integrationConfig.aiModel,
              aiApiKey: integrationConfig.aiApiKey,
              aiPromptTemplateId: integrationConfig.aiPromptTemplateId,
              aiTemperature: integrationConfig.aiTemperature,
              aiMaxTokens: integrationConfig.aiMaxTokens,
              aiTimeout: integrationConfig.aiTimeout,
              fallbackToNative: integrationConfig.fallbackToNative,
            }
          : undefined,
        whitelistEntry: whitelistResult.isWhitelisted ? whitelistResult.entry : undefined,
        riskProfile,
        analyzerOptions,
        // CRITICAL: Pass pre-filtered analyzers to strategy
        analyzers: filteringResult.analyzers,
      };

      // Step 5: Execute via strategy pattern - START
      const strategyStepId = stepManager.startStep({
        name: `${executionMode}_strategy_execution`,
        source: { file: 'analysis.engine.ts', method: 'analyze' },
      });
      setStepContext(strategyStepId, (entry) => stepManager.captureLog(entry));

      logger.info({
        msg: 'Starting strategy execution',
        analysisId,
        executionMode,
      });

      const strategy = this.strategyFactory.getStrategy(executionMode, {
        enableTiming: true,
        enableLogging: true,
        logger,
      });

      const executionResult = await strategy.execute(context);

      aiMetadata = executionResult.aiMetadata;

      logger.info({
        msg: 'Strategy execution completed',
        analysisId,
        signalCount: executionResult.result.signals.length,
        actualMode: executionResult.actualMode,
      });

      // Strategy step - END
      stepManager.completeStep(strategyStepId, {
        signalCount: executionResult.result.signals.length,
        actualMode: executionResult.actualMode,
      });

      // Step 6: Verdict calculation (ENGINE LEVEL - OUTSIDE STRATEGY) - START
      const verdictStepId = stepManager.startStep({
        name: 'verdict_calculation',
        source: {
          file: 'verdict.service.ts',
          component: 'VerdictService',
        },
      });
      setStepContext(verdictStepId, (entry) => stepManager.captureLog(entry));

      logger.info({
        msg: 'Calculating verdict from signals',
        analysisId,
        signalCount: executionResult.result.signals.length,
      });

      const analyzerWeights = analyzerRegistry.getAnalyzerWeights();
      // Route through the factory so URL inputs receive UrlVerdictService
      // while email/none continue to use the base VerdictService exactly as
      // before. `getVerdictService` remains in place for legacy callers.
      const verdictService = createVerdictService(contentPrescan, input);
      const verdict = verdictService.calculateVerdict(executionResult.result.signals, analyzerWeights);

      logger.info({
        msg: 'Verdict calculated',
        analysisId,
        verdict: verdict.verdict,
        score: verdict.score,
        confidence: verdict.confidence,
      });

      // Verdict step - END
      stepManager.completeStep(verdictStepId, {
        verdict: verdict.verdict,
        score: verdict.score,
        confidence: verdict.confidence,
      });

      // Calculate actual duration from backend start time
      const backendEndTime = Date.now();
      const actualDuration = backendEndTime - backendStartTime;

      // Build final result with verdict from engine
      result = {
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        score: verdict.score,
        alertLevel: verdict.alertLevel,
        redFlags: verdict.redFlags,
        reasoning: verdict.reasoning,
        actions: verdict.actions,
        signals: executionResult.result.signals,
        metadata: {
          ...executionResult.result.metadata,
          duration: actualDuration, // Override with actual calculated duration
        },
      };

      // Add content risk to result metadata
      if (riskProfile) {
        result.metadata.contentRisk = {
          hasLinks: riskProfile.hasLinks,
          hasAttachments: riskProfile.hasAttachments,
          hasUrgencyLanguage: riskProfile.hasUrgencyLanguage,
          overallRiskScore: riskProfile.overallRiskScore,
        };
        result.metadata.riskScore = riskProfile.overallRiskScore;
      }

      // Add whitelist info to result metadata
      if (whitelistResult.isWhitelisted && whitelistResult.entry) {
        result.metadata.trustLevel = whitelistResult.entry.isTrusted ? 'high' : undefined;
      }

      // Update persistence with AI metadata if available
      if (aiMetadata) {
        persistenceService.updateAIMetadata(analysisId, aiMetadata);
      }

      // Update persistence tracking with result
      persistenceService.updateResult(analysisId, this.mapToPersistenceResult(result));

      // Step 7: Send email alert if needed - START
      const emailAlertStepId = stepManager.startStep({
        name: 'email_alert_check',
        source: { file: 'analysis.engine.ts', method: 'analyze' },
      });
      setStepContext(emailAlertStepId, (entry) => stepManager.captureLog(entry));

      try {
        const emailService = getEmailService();
        await emailService.sendAlertIfNeeded(input, result);

        const alertSent = result.score >= getConfig().email.alertThreshold || result.verdict === 'Malicious';

        logger.info({
          msg: 'Email alert check completed',
          analysisId,
          alertSent,
        });

        // Email alert step - END
        stepManager.completeStep(emailAlertStepId, {
          alertSent,
        });
      } catch (error) {
        logger.error({
          msg: 'Failed to send email alert',
          analysisId,
          error: error instanceof Error ? error.message : String(error),
        });

        stepManager.failStep(emailAlertStepId, {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Root step - END
      stepManager.completeStep(rootStepId, {
        verdict: result.verdict,
        score: result.score,
        signalCount: result.signals.length,
        actualMode: executionResult.actualMode,
        usedAI: !!aiMetadata,
      });

      logger.info({
        analysisId,
        msg: 'Analysis completed successfully',
        verdict: result.verdict,
        score: result.score,
        alertLevel: result.alertLevel,
        executionMode,
        actualMode: executionResult.actualMode,
        duration: result.metadata.duration,
        usedAI: !!aiMetadata,
        aiCost: aiMetadata?.costUsd,
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

      // Root step - FAILED
      stepManager.failStep(rootStepId, {
        error: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
      });

      // Create error result if none exists
      if (!result) {
        result = this.createErrorResult(analysisId, executionSteps);
        persistenceService.updateResult(analysisId, this.mapToPersistenceResult(result));
      }

      throw error;
    } finally {
      // Clear step context
      clearStepContext();

      // ALWAYS flush to database (success or failure)
      await persistenceService.flushToDatabase(analysisId);
    }

    return result;
  }

  /**
   * Determine integration name from input type
   */
  private getIntegrationName(input: NormalizedInput): string {
    // Clients may pass integrationName explicitly (e.g. `chrome_task2`, `gmail_strict`).
    // When unset we fall back to a default derived from the input type.
    return input.integrationName ?? (input.type === 'email' ? 'gmail' : 'chrome');
  }

  /**
   * Load integration configuration from database
   */
  private async loadIntegrationConfig(integrationName: string) {
    try {
      const configService = getIntegrationConfigService();
      const config = await configService.getConfig(integrationName);

      if (!config || !config.isActive) {
        logger.warn({
          msg: 'Integration config not found or inactive, using defaults',
          integrationName,
        });
        return null;
      }

      return config;
    } catch (error) {
      logger.error({
        msg: 'Failed to load integration config, using defaults',
        integrationName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Map AnalysisResult to PersistenceAnalysisResult
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
      executionSteps: result.metadata.executionSteps || [],
      durationMs: result.metadata.duration,
    };
  }

  /**
   * Build a Safe result for whitelisted URL inputs.
   *
   * Used by the URL-only whitelist short-circuit: bypasses all analyzers and the
   * verdict service so the response clearly says "whitelisted" without spending
   * any budget on extraction or AI calls.
   */
  private buildWhitelistedUrlResult(
    _input: NormalizedInput,
    whitelistResult: { matchReason?: string; entry?: { isTrusted?: boolean } },
    analysisId: string,
    executionSteps: ExecutionStep[],
    durationMs: number
  ): AnalysisResult {
    const matchReason = whitelistResult.matchReason || 'URL is whitelisted';
    const trustLevel = whitelistResult.entry?.isTrusted ? 'high' : undefined;

    return {
      verdict: 'Safe',
      confidence: 1,
      score: 0,
      alertLevel: 'none',
      redFlags: [
        {
          category: 'suspicious_behavior',
          message: 'URL is on the trusted whitelist (analysis bypassed)',
          severity: 'low',
        },
      ],
      reasoning: `Whitelisted: ${matchReason}`,
      actions: ['No action required - URL is on the trusted whitelist.'],
      signals: [],
      metadata: {
        duration: durationMs,
        timestamp: new Date(),
        analyzersRun: [],
        analysisId,
        executionSteps,
        whitelisted: true,
        trustLevel,
        bypassType: 'full',
      },
    };
  }

  /**
   * Create error result when analysis fails
   */
  private createErrorResult(analysisId: string, executionSteps: ExecutionStep[]): AnalysisResult {
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
      actions: [],
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

/**
 * Singleton instance
 */
let analysisEngineInstance: AnalysisEngine | null = null;

/**
 * Get Analysis Engine instance
 */
export function getAnalysisEngine(): AnalysisEngine {
  if (!analysisEngineInstance) {
    analysisEngineInstance = new AnalysisEngine();
  }
  return analysisEngineInstance;
}

/**
 * Reset engine (for testing)
 */
export function resetAnalysisEngine(): void {
  analysisEngineInstance = null;
}
