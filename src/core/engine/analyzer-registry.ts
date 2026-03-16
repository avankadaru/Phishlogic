/**
 * Analyzer Registry
 *
 * Central registry for all analyzers.
 * Allows strategies to access analyzers without tight coupling.
 */

import type { IAnalyzer } from '../analyzers/base/index.js';
import type { TrustLevel } from '../models/whitelist.js';
import type { ContentRiskProfile } from '../analyzers/risk/content-risk.analyzer.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import { getConfig } from '../../config/app.config.js';

const logger = getLogger();

/**
 * Global analyzer registry
 */
class AnalyzerRegistry {
  private analyzers: IAnalyzer[] = [];

  /**
   * Register an analyzer
   */
  register(analyzer: IAnalyzer): void {
    this.analyzers.push(analyzer);
    logger.debug({
      msg: 'Analyzer registered',
      analyzerName: analyzer.getName(),
      type: analyzer.getType(),
    });
  }

  /**
   * Register multiple analyzers
   */
  registerMany(analyzers: IAnalyzer[]): void {
    for (const analyzer of analyzers) {
      this.register(analyzer);
    }
  }

  /**
   * Get all registered analyzers
   */
  getAnalyzers(): IAnalyzer[] {
    return [...this.analyzers]; // Return copy for immutability
  }

  /**
   * Get analyzers by type
   */
  getAnalyzersByType(type: 'static' | 'dynamic'): IAnalyzer[] {
    return this.analyzers.filter((a) => a.getType() === type);
  }

  /**
   * Get analyzer by name
   */
  getAnalyzerByName(name: string): IAnalyzer | undefined {
    return this.analyzers.find((a) => a.getName() === name);
  }

  /**
   * Get analyzer weights map
   */
  getAnalyzerWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    for (const analyzer of this.analyzers) {
      weights.set(analyzer.getName(), analyzer.getWeight());
    }
    return weights;
  }

  /**
   * Clear all analyzers (useful for testing)
   */
  clear(): void {
    this.analyzers = [];
    logger.debug('Analyzer registry cleared');
  }

  /**
   * Get registry stats
   */
  getStats(): {
    total: number;
    static: number;
    dynamic: number;
  } {
    const staticCount = this.analyzers.filter((a) => a.getType() === 'static').length;
    const dynamicCount = this.analyzers.filter((a) => a.getType() === 'dynamic').length;

    return {
      total: this.analyzers.length,
      static: staticCount,
      dynamic: dynamicCount,
    };
  }

  /**
   * Get link/URL analyzers
   * Used for HIGH trust when links are present
   */
  getLinkAnalyzers(): IAnalyzer[] {
    const linkAnalyzerNames = [
      'LinkReputationAnalyzer',
      'UrlEntropyAnalyzer',
      'FormAnalyzer',
      'RedirectAnalyzer',
    ];
    return this.analyzers.filter((a) => linkAnalyzerNames.includes(a.getName()));
  }

  /**
   * Get attachment analyzers
   * Used for HIGH trust when attachments are present
   */
  getAttachmentAnalyzers(): IAnalyzer[] {
    const attachmentAnalyzerNames = ['AttachmentAnalyzer'];
    return this.analyzers.filter((a) => attachmentAnalyzerNames.includes(a.getName()));
  }

  /**
   * Get content/NLP analyzers
   * Used for HIGH trust when urgency language is detected
   */
  getContentAnalyzers(): IAnalyzer[] {
    const contentAnalyzerNames = ['EmotionalManipulationAnalyzer', 'ContentAnalysisAnalyzer'];
    return this.analyzers.filter((a) => contentAnalyzerNames.includes(a.getName()));
  }

  /**
   * Get authentication analyzers (SPF, DKIM, SenderReputation)
   * Skipped for MEDIUM/HIGH trust
   */
  getAuthenticationAnalyzers(): IAnalyzer[] {
    const authAnalyzerNames = ['SPFAnalyzer', 'DKIMAnalyzer', 'SenderReputationAnalyzer'];
    return this.analyzers.filter((a) => authAnalyzerNames.includes(a.getName()));
  }

  /**
   * Get filtered analyzers based on trust level AND content risk
   * This is the core of content-aware conditional bypass
   */
  getFilteredAnalyzers(
    trustLevel?: TrustLevel,
    riskProfile?: ContentRiskProfile
  ): IAnalyzer[] {
    const config = getConfig();

    // If trust level is not defined or feature is disabled, run all analyzers (backward compatible)
    if (!trustLevel || !config.whitelist.trustLevelEnabled) {
      return this.getAnalyzers();
    }

    // HIGH trust: Conditional bypass based on content risk
    if (trustLevel === 'high') {
      if (!riskProfile) {
        // No risk profile provided, run all analyzers (safe default)
        return this.getAnalyzers();
      }

      // If no risk indicators at all, return empty array (full bypass)
      if (riskProfile.overallRiskScore === 0) {
        if (config.whitelist.trustLevelLogging) {
          logger.info({
            msg: 'HIGH trust with no risk indicators - full bypass',
            trustLevel: 'high',
            riskScore: 0,
          });
        }
        return [];
      }

      // Selective analysis based on risk indicators
      const analyzersToRun: IAnalyzer[] = [];

      if (riskProfile.hasLinks) {
        analyzersToRun.push(...this.getLinkAnalyzers());
      }

      if (riskProfile.hasAttachments) {
        analyzersToRun.push(...this.getAttachmentAnalyzers());
      }

      if (riskProfile.hasUrgencyLanguage) {
        analyzersToRun.push(...this.getContentAnalyzers());
      }

      // Remove duplicates
      const uniqueAnalyzers = Array.from(new Set(analyzersToRun));

      if (config.whitelist.trustLevelLogging) {
        logger.info({
          msg: 'HIGH trust with risk indicators - selective analysis',
          trustLevel: 'high',
          riskScore: riskProfile.overallRiskScore,
          analyzersToRun: uniqueAnalyzers.map((a) => a.getName()),
          analyzersCount: uniqueAnalyzers.length,
        });
      }

      return uniqueAnalyzers;
    }

    // MEDIUM trust: Always verify links/attachments/content, skip authentication
    if (trustLevel === 'medium') {
      const allAnalyzers = this.getAnalyzers();
      const authAnalyzers = this.getAuthenticationAnalyzers();
      const authNames = new Set(authAnalyzers.map((a) => a.getName()));

      const analyzersToRun = allAnalyzers.filter((a) => !authNames.has(a.getName()));

      if (config.whitelist.trustLevelLogging) {
        logger.info({
          msg: 'MEDIUM trust - verify content, skip authentication',
          trustLevel: 'medium',
          analyzersToRun: analyzersToRun.map((a) => a.getName()),
          analyzersCount: analyzersToRun.length,
        });
      }

      return analyzersToRun;
    }

    // LOW trust: Run all except expensive browser-based analyzers (Form, Redirect)
    if (trustLevel === 'low') {
      const expensiveAnalyzerNames = ['FormAnalyzer', 'RedirectAnalyzer'];
      const analyzersToRun = this.analyzers.filter(
        (a) => !expensiveAnalyzerNames.includes(a.getName())
      );

      if (config.whitelist.trustLevelLogging) {
        logger.info({
          msg: 'LOW trust - full analysis, skip expensive browser checks',
          trustLevel: 'low',
          analyzersToRun: analyzersToRun.map((a) => a.getName()),
          analyzersCount: analyzersToRun.length,
        });
      }

      return analyzersToRun;
    }

    // Default: run all analyzers
    return this.getAnalyzers();
  }
}

/**
 * Singleton instance
 */
let registryInstance: AnalyzerRegistry | null = null;

/**
 * Get analyzer registry instance
 */
export function getAnalyzerRegistry(): AnalyzerRegistry {
  if (!registryInstance) {
    registryInstance = new AnalyzerRegistry();
  }
  return registryInstance;
}

/**
 * Reset registry (for testing)
 */
export function resetAnalyzerRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
  }
  registryInstance = null;
}
