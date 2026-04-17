/**
 * Analyzer Registry
 *
 * Central registry for all analyzers.
 * Allows strategies to access analyzers without tight coupling.
 */

import type { IAnalyzer } from '../analyzers/base/index.js';
import type { WhitelistEntry } from '../models/whitelist.js';
import type { ContentRiskProfile } from '../analyzers/risk/content-risk.types.js';
import type { ContentPrescanMode } from '../models/content-prescan.js';
import type { NormalizedInput } from '../models/input.js';
import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();

/** How analyzers are chosen after whitelist (email content rules vs Inspect URL allowlist). */
export type AnalyzerFilteringMode = 'email_inbox' | 'inspect_url';

/**
 * Analyzer filtering result with detailed reasoning
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

const INSPECT_URL_ANALYZER_NAMES = new Set([
  'urlentropyanalyzer',
  'linkreputationanalyzer',
  'redirectanalyzer',
  'formanalyzer',
]);

/**
 * Return true if the analyzer variant explicitly supports the given prescan
 * mode. Analyzers without a `getSupportedPrescanModes()` method are treated
 * as universally supported (the historical default).
 */
function analyzerSupports(analyzer: IAnalyzer, mode: ContentPrescanMode): boolean {
  if (typeof analyzer.getSupportedPrescanModes !== 'function') return true;
  const modes = analyzer.getSupportedPrescanModes();
  return modes.includes(mode);
}

/**
 * Return true if this analyzer instance is a url-only specialization (a
 * subclass that declares ONLY 'url' in its supported prescan modes).
 */
function isUrlOnlyVariant(analyzer: IAnalyzer): boolean {
  if (typeof analyzer.getSupportedPrescanModes !== 'function') return false;
  const modes = analyzer.getSupportedPrescanModes();
  return modes.length === 1 && modes[0] === 'url';
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
    const normalizedName = name.toLowerCase();
    return this.analyzers.find((a) => a.getName().toLowerCase() === normalizedName);
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
   * Get filtered analyzers based on whitelist entry AND content profile (email inbox rules).
   * @deprecated Prefer {@link getFilteredAnalyzersWithReasons} with explicit {@link AnalyzerFilteringMode}.
   */
  getFilteredAnalyzers(
    whitelistEntry: WhitelistEntry | undefined,
    contentProfile: ContentRiskProfile,
    input: NormalizedInput,
    filteringMode: AnalyzerFilteringMode
  ): IAnalyzer[] {
    return this.getFilteredAnalyzersWithReasons(
      input,
      whitelistEntry,
      contentProfile,
      filteringMode
    ).analyzers;
  }

  /**
   * Get filtered analyzers WITH detailed reasoning
   */
  getFilteredAnalyzersWithReasons(
    input: NormalizedInput,
    whitelistEntry: WhitelistEntry | undefined,
    contentProfile: ContentRiskProfile,
    filteringMode: AnalyzerFilteringMode
  ): AnalyzerFilteringResult {
    if (filteringMode === 'inspect_url') {
      return this.selectInspectUrlAnalyzers(input, whitelistEntry);
    }
    return this.getEmailInboxFilteredAnalyzersWithReasons(input, whitelistEntry, contentProfile);
  }

  /**
   * Inspect URL: fixed analyzer set + isApplicable + trusted rich-content rules.
   *
   * When multiple registered analyzers share a name (case-insensitive), we
   * prefer the one that explicitly declares 'url' in
   * `getSupportedPrescanModes()`. This allows `UrlEntropyUrlAnalyzer` /
   * `LinkReputationUrlAnalyzer` / `RedirectUrlAnalyzer` / `FormUrlAnalyzer`
   * subclasses to ship URL-specific logic while their email-facing base
   * classes remain the default for the email inbox path.
   */
  private selectInspectUrlAnalyzers(
    input: NormalizedInput,
    whitelistEntry: WhitelistEntry | undefined
  ): AnalyzerFilteringResult {
    const selected: IAnalyzer[] = [];
    const reasons: Array<{ analyzerName: string; reason: string; triggeredBy: string }> = [];
    const skipped: Array<{ analyzerName: string; reason: string }> = [];

    const isTrusted = whitelistEntry?.isTrusted || false;
    const scanRichOk = !isTrusted || whitelistEntry?.scanRichContent !== false;

    // Group analyzers by normalized name so we can prefer url-variant over base.
    const byName = new Map<string, IAnalyzer[]>();
    for (const analyzer of this.getAnalyzers()) {
      const normalizedName = analyzer.getName().toLowerCase();
      if (!INSPECT_URL_ANALYZER_NAMES.has(normalizedName)) continue;
      const bucket = byName.get(normalizedName);
      if (bucket) {
        bucket.push(analyzer);
      } else {
        byName.set(normalizedName, [analyzer]);
      }
    }

    for (const [normalizedName, candidates] of byName) {
      const urlPreferred =
        candidates.find((a) => analyzerSupports(a, 'url') &&
          typeof a.getSupportedPrescanModes === 'function') ??
        candidates.find((a) => analyzerSupports(a, 'url')) ??
        candidates[0];

      if (!urlPreferred) continue;
      const name = urlPreferred.getName();

      if (!urlPreferred.isApplicable(input)) {
        skipped.push({
          analyzerName: name,
          reason: 'Analyzer not applicable to this input',
        });
        continue;
      }

      if (!scanRichOk) {
        skipped.push({
          analyzerName: name,
          reason: 'Trusted allowlist entry with scanRichContent disabled',
        });
        continue;
      }

      selected.push(urlPreferred);
      reasons.push({
        analyzerName: name,
        reason: `Inspect URL task analyzer (${normalizedName}, ${candidates.length} variant(s), url-preferred)`,
        triggeredBy: 'task:inspect_url',
      });
    }

    // Note skipped analyzers that weren't in the INSPECT_URL allowlist at all.
    for (const analyzer of this.getAnalyzers()) {
      const normalizedName = analyzer.getName().toLowerCase();
      if (INSPECT_URL_ANALYZER_NAMES.has(normalizedName)) continue;
      skipped.push({
        analyzerName: analyzer.getName(),
        reason: 'Not used for Inspect URL task',
      });
    }

    logger.info({
      msg: 'Inspect URL analyzer filtering completed',
      selected: selected.length,
      skipped: skipped.length,
      selectedAnalyzers: reasons.map((r) => r.analyzerName),
    });

    return { analyzers: selected, reasons, skipped };
  }

  /**
   * Email inbox: content + whitelist rules, gated by {@link IAnalyzer.isApplicable}.
   */
  private getEmailInboxFilteredAnalyzersWithReasons(
    input: NormalizedInput,
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
      const normalizedName = name.toLowerCase();

      // URL-only variants never participate in the email inbox path.
      if (isUrlOnlyVariant(analyzer)) {
        skipped.push({
          analyzerName: name,
          reason: 'URL-only analyzer variant; not used for email inbox path',
        });
        continue;
      }

      if (!analyzer.isApplicable(input)) {
        skipped.push({
          analyzerName: name,
          reason: 'Analyzer not applicable to this input',
        });
        continue;
      }

      // Authentication analyzers - only for non-trusted
      if (['spfanalyzer', 'dkimanalyzer', 'senderreputationanalyzer'].includes(normalizedName)) {
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
      if (normalizedName === 'attachmentanalyzer') {
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
      if (
        normalizedName === 'linkreputationanalyzer' ||
        normalizedName === 'urlentropyanalyzer' ||
        normalizedName === 'redirectanalyzer'
      ) {
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
      if (normalizedName === 'imageanalyzer') {
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
      if (normalizedName === 'qrcodeanalyzer') {
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
      if (normalizedName === 'formanalyzer' || normalizedName === 'buttonanalyzer') {
        const hasForms = normalizedName === 'formanalyzer' && contentProfile.hasForms;
        const hasLinks = normalizedName === 'buttonanalyzer' && contentProfile.hasLinks;

        if (hasForms || hasLinks) {
          if (!isTrusted || whitelistEntry?.scanRichContent) {
            selected.push(analyzer);
            reasons.push({
              analyzerName: name,
              reason:
                normalizedName === 'formanalyzer' ? 'Forms detected in HTML' : 'Buttons/CTAs detected',
              triggeredBy:
                normalizedName === 'formanalyzer' ? 'hasForms: true' : `linkCount: ${contentProfile.linkCount}`,
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
            reason:
              normalizedName === 'formanalyzer' ? 'No forms detected in HTML' : 'No buttons/CTAs detected',
          });
        }
        continue;
      }

      // Content/Urgency analyzers - run if urgency detected
      if (normalizedName === 'contentanalysisanalyzer' || normalizedName === 'emotionalmanipulationanalyzer') {
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

      // Unknown analyzer: include (same as legacy filterByContent default)
      selected.push(analyzer);
      reasons.push({
        analyzerName: name,
        reason: 'Included by default (no explicit email filter rule)',
        triggeredBy: 'registry_default',
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
