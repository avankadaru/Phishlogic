/**
 * Analyzer Registry
 *
 * Central registry for all analyzers.
 * Allows strategies to access analyzers without tight coupling.
 */

import type { IAnalyzer } from '../analyzers/base/index.js';
import type { WhitelistEntry } from '../models/whitelist.js';
import type { ContentRiskProfile } from '../analyzers/risk/content-risk.analyzer.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import { getConfig } from '../../config/app.config.js';

const logger = getLogger();

/**
 * Analyzer filtering result with detailed reasons
 */
export interface AnalyzerFilteringResult {
  analyzers: IAnalyzer[];
  reasons: Array<{
    analyzerName: string;
    reason: string;
    triggeredBy: string; // Content flag that triggered inclusion
  }>;
  skipped: Array<{
    analyzerName: string;
    reason: string; // Why it was skipped
  }>;
}

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
   * Get filtered analyzers based on whitelist entry AND content profile
   * This is the core of content-based analyzer filtering
   *
   * @param whitelistEntry - Whitelist entry (if whitelisted)
   * @param contentProfile - Content risk profile (ALWAYS required)
   * @returns Array of analyzers to run
   */
  getFilteredAnalyzers(
    whitelistEntry: WhitelistEntry | undefined,
    contentProfile: ContentRiskProfile
  ): IAnalyzer[] {
    const allAnalyzers = this.getAnalyzers();

    // Non-trusted or no whitelist → content-based filtering
    if (!whitelistEntry || !whitelistEntry.isTrusted) {
      return this.filterByContent(allAnalyzers, contentProfile, false);
    }

    // Trusted → conditional filtering based on checkboxes
    return this.filterByContent(allAnalyzers, contentProfile, true, whitelistEntry);
  }

  /**
   * Get filtered analyzers WITH detailed reasoning
   * Shows why each analyzer was included or skipped
   *
   * @param whitelistEntry - Whitelist entry (if whitelisted)
   * @param contentProfile - Content risk profile (ALWAYS required)
   * @returns Filtering result with analyzers and detailed reasons
   */
  getFilteredAnalyzersWithReasons(
    whitelistEntry: WhitelistEntry | undefined,
    contentProfile: ContentRiskProfile
  ): AnalyzerFilteringResult {
    const allAnalyzers = this.getAnalyzers();
    const selected: IAnalyzer[] = [];
    const reasons: Array<{ analyzerName: string; reason: string; triggeredBy: string }> = [];
    const skipped: Array<{ analyzerName: string; reason: string }> = [];

    const isTrusted = whitelistEntry?.isTrusted || false;

    for (const analyzer of allAnalyzers) {
      const name = analyzer.getName();

      // Authentication analyzers - only for non-trusted
      if (['SpfAnalyzer', 'DkimAnalyzer', 'SenderReputationAnalyzer'].includes(name)) {
        if (!isTrusted) {
          selected.push(analyzer);
          reasons.push({
            analyzerName: name,
            reason: `${name} required for non-whitelisted sender`,
            triggeredBy: 'isWhitelisted: false',
          });
        } else {
          skipped.push({
            analyzerName: name,
            reason: 'Sender is whitelisted and trusted',
          });
        }
        continue;
      }

      // Attachment analyzer - content-based
      if (name === 'AttachmentAnalyzer') {
        if (contentProfile.hasAttachments) {
          if (!isTrusted || whitelistEntry?.scanAttachments) {
            selected.push(analyzer);
            reasons.push({
              analyzerName: name,
              reason: 'Attachments detected in email',
              triggeredBy: `attachmentCount: ${contentProfile.attachmentCount}`,
            });
          } else {
            skipped.push({
              analyzerName: name,
              reason: 'Trusted sender with scanAttachments disabled',
            });
          }
        } else {
          skipped.push({
            analyzerName: name,
            reason: 'No attachments detected in email',
          });
        }
        continue;
      }

      // Link analyzers - content-based
      if (name === 'LinkReputationAnalyzer' || name === 'UrlEntropyAnalyzer' || name === 'RedirectAnalyzer') {
        if (contentProfile.hasLinks) {
          if (!isTrusted || whitelistEntry?.scanRichContent) {
            selected.push(analyzer);
            reasons.push({
              analyzerName: name,
              reason: 'Links detected in content',
              triggeredBy: `linkCount: ${contentProfile.linkCount}`,
            });
          } else {
            skipped.push({
              analyzerName: name,
              reason: 'Trusted sender with scanRichContent disabled',
            });
          }
        } else {
          skipped.push({
            analyzerName: name,
            reason: 'No links detected in content',
          });
        }
        continue;
      }

      // Image analyzer - content-based
      if (name === 'ImageAnalyzer') {
        if (contentProfile.hasImages) {
          if (!isTrusted || whitelistEntry?.scanRichContent) {
            selected.push(analyzer);
            reasons.push({
              analyzerName: name,
              reason: 'Images detected in content',
              triggeredBy: `imageCount: ${contentProfile.imageCount}`,
            });
          } else {
            skipped.push({
              analyzerName: name,
              reason: 'Trusted sender with scanRichContent disabled',
            });
          }
        } else {
          skipped.push({
            analyzerName: name,
            reason: 'No images detected in content',
          });
        }
        continue;
      }

      // QR Code analyzer - content-based
      if (name === 'QRCodeAnalyzer') {
        if (contentProfile.hasQRCodes) {
          if (!isTrusted || whitelistEntry?.scanRichContent) {
            selected.push(analyzer);
            reasons.push({
              analyzerName: name,
              reason: 'QR codes detected in images',
              triggeredBy: `qrCodeCount: ${contentProfile.qrCodeCount}`,
            });
          } else {
            skipped.push({
              analyzerName: name,
              reason: 'Trusted sender with scanRichContent disabled',
            });
          }
        } else {
          skipped.push({
            analyzerName: name,
            reason: 'No QR codes found in content',
          });
        }
        continue;
      }

      // Form/Button analyzers - content-based
      if (name === 'FormAnalyzer' || name === 'ButtonAnalyzer') {
        const hasForms = name === 'FormAnalyzer' && contentProfile.hasForms;
        const hasLinks = name === 'ButtonAnalyzer' && contentProfile.hasLinks;

        if (hasForms || hasLinks) {
          if (!isTrusted || whitelistEntry?.scanRichContent) {
            selected.push(analyzer);
            reasons.push({
              analyzerName: name,
              reason: name === 'FormAnalyzer' ? 'Forms detected in HTML' : 'Buttons/CTAs detected',
              triggeredBy: name === 'FormAnalyzer' ? 'hasForms: true' : `linkCount: ${contentProfile.linkCount}`,
            });
          } else {
            skipped.push({
              analyzerName: name,
              reason: 'Trusted sender with scanRichContent disabled',
            });
          }
        } else {
          skipped.push({
            analyzerName: name,
            reason: name === 'FormAnalyzer' ? 'No forms detected in HTML' : 'No buttons/CTAs detected',
          });
        }
        continue;
      }

      // Content/Urgency analyzers - run if urgency detected
      if (name === 'ContentAnalysisAnalyzer' || name === 'EmotionalManipulationAnalyzer') {
        if (contentProfile.hasUrgencyLanguage) {
          selected.push(analyzer);
          reasons.push({
            analyzerName: name,
            reason: 'Urgency language detected',
            triggeredBy: `urgencyScore: ${contentProfile.urgencyScore}`,
          });
        } else {
          skipped.push({
            analyzerName: name,
            reason: 'No urgency language detected',
          });
        }
        continue;
      }

      // Default: include analyzer
      selected.push(analyzer);
      reasons.push({
        analyzerName: name,
        reason: 'Always-on analyzer',
        triggeredBy: 'default',
      });
    }

    logger.info({
      msg: 'Analyzer filtering completed with detailed reasons',
      totalAvailable: allAnalyzers.length,
      selected: selected.length,
      skipped: skipped.length,
      selectedAnalyzers: reasons.map((r) => r.analyzerName),
      skippedAnalyzers: skipped.map((s) => s.analyzerName),
    });

    return { analyzers: selected, reasons, skipped };
  }

  /**
   * Filter analyzers by content presence
   *
   * @param analyzers - All available analyzers
   * @param contentProfile - Content risk profile
   * @param isTrusted - Whether sender is trusted
   * @param whitelistEntry - Whitelist entry (optional, for trusted senders)
   * @returns Filtered analyzers
   */
  private filterByContent(
    analyzers: IAnalyzer[],
    contentProfile: ContentRiskProfile,
    isTrusted: boolean,
    whitelistEntry?: WhitelistEntry
  ): IAnalyzer[] {
    const filtered: IAnalyzer[] = [];

    for (const analyzer of analyzers) {
      const name = analyzer.getName();

      // Authentication analyzers - only for non-trusted
      if (['SpfAnalyzer', 'DkimAnalyzer', 'SenderReputationAnalyzer'].includes(name)) {
        if (!isTrusted) {
          filtered.push(analyzer);
        }
        continue;
      }

      // Attachment analyzer - content-based
      if (name === 'AttachmentAnalyzer') {
        if (contentProfile.hasAttachments) {
          if (!isTrusted || whitelistEntry?.scanAttachments) {
            filtered.push(analyzer);
          }
        }
        continue;
      }

      // Link/Image/QR/Form analyzers - content-based + rich content checkbox
      if ([
        'LinkReputationAnalyzer',
        'UrlEntropyAnalyzer',
        'ImageAnalyzer',
        'QRCodeAnalyzer',
        'FormAnalyzer',
        'RedirectAnalyzer',
        'ButtonAnalyzer',
      ].includes(name)) {
        const hasRelevantContent =
          ((name.includes('Link') ||
            name.includes('Url') ||
            name === 'FormAnalyzer' ||
            name === 'RedirectAnalyzer' ||
            name === 'ButtonAnalyzer') &&
            contentProfile.hasLinks) ||
          (name === 'ImageAnalyzer' && contentProfile.hasImages) ||
          (name === 'QRCodeAnalyzer' && contentProfile.hasQRCodes);

        if (hasRelevantContent) {
          if (!isTrusted || whitelistEntry?.scanRichContent) {
            filtered.push(analyzer);
          }
        }
        continue;
      }

      // Content analysis - run if urgency detected (always, even for trusted)
      if (name === 'ContentAnalysisAnalyzer' || name === 'EmotionalManipulationAnalyzer') {
        if (contentProfile.hasUrgencyLanguage) {
          filtered.push(analyzer);
        }
        continue;
      }

      // Default: include analyzer (for any new analyzers not explicitly handled)
      filtered.push(analyzer);
    }

    logger.debug({
      msg: 'Analyzers filtered by content',
      isTrusted,
      contentProfile: {
        hasLinks: contentProfile.hasLinks,
        hasAttachments: contentProfile.hasAttachments,
        hasImages: contentProfile.hasImages,
        hasQRCodes: contentProfile.hasQRCodes,
        hasUrgency: contentProfile.hasUrgencyLanguage,
      },
      analyzersCount: filtered.length,
      analyzers: filtered.map((a) => a.getName()),
    });

    return filtered;
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
