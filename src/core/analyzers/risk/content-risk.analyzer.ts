/**
 * Content Risk Analyzer
 * Comprehensive context extraction engine using modular extractors
 * Runs as mandatory pre-scan before all analyzers
 */

import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';

// Import all extractors
import { DomainExtractor, type DomainContext } from './extractors/domain.extractor.js';
import { LinkExtractor, type LinkMetadata } from './extractors/link.extractor.js';
import { ImageExtractor, type ImageMetadata } from './extractors/image.extractor.js';
import { QRCodeExtractor, type QRCodeData } from './extractors/qrcode.extractor.js';
import { AttachmentExtractor, type AttachmentMetadata } from './extractors/attachment.extractor.js';
import { ButtonExtractor, type ButtonMetadata } from './extractors/button.extractor.js';
import { SenderExtractor, type SenderProfile } from './extractors/sender.extractor.js';
import { BodyExtractor, type BodyContentAnalysis } from './extractors/body.extractor.js';
import { HTMLStructureExtractor, type HTMLStructureAnalysis } from './extractors/html-structure.extractor.js';
import type { ContentExtractor, ExtractionResult } from './extractors/base.extractor.js';

const logger = getLogger();

/**
 * Enhanced Content Risk Profile with comprehensive context
 */
export interface EnhancedContentRiskProfile {
  // === Existing Fields (Backward Compatibility) ===
  hasLinks: boolean;
  linkCount: number;
  links: string[];
  hasMaliciousLinks: boolean;

  hasAttachments: boolean;
  attachmentCount: number;
  attachments: string[];
  hasSuspiciousAttachments: boolean;

  hasImages: boolean;
  imageCount: number;
  hasQRCodes: boolean;
  qrCodeCount: number;

  hasUrgencyLanguage: boolean;
  urgencyScore: number;
  urgencyIndicators: string[];

  hasForms: boolean;
  overallRiskScore: number;

  // === NEW: Enhanced Context Extraction ===
  domains: DomainContext;
  linkMetadata: LinkMetadata[];
  images: ImageMetadata[];
  qrCodes: QRCodeData[];
  attachmentMetadata: AttachmentMetadata[];
  buttons: ButtonMetadata[];
  sender: SenderProfile;
  bodyContent: BodyContentAnalysis;
  htmlStructure: HTMLStructureAnalysis;

  // Extraction timing
  extractionTimings: Record<string, number>;
}

/**
 * Legacy interface for backward compatibility
 * @deprecated Use EnhancedContentRiskProfile instead
 */
export type ContentRiskProfile = EnhancedContentRiskProfile;

/**
 * Urgency keywords and phrases (kept for backward compatibility in urgency analysis)
 */
const URGENCY_PATTERNS = [
  // Time pressure
  { pattern: /\b(urgent|immediately|asap|right away|at once)\b/i, weight: 2.0 },
  { pattern: /\b(act now|respond now|click now|verify now)\b/i, weight: 2.5 },
  { pattern: /\b(24 hours?|48 hours?|within \d+ (hours?|days?))\b/i, weight: 2.0 },
  { pattern: /\b(expires? (today|tonight|soon|shortly))\b/i, weight: 1.8 },
  { pattern: /\b(time[- ]sensitive|time is running out)\b/i, weight: 2.2 },
  { pattern: /\b(last chance|final (notice|warning|reminder))\b/i, weight: 2.3 },

  // Threats
  { pattern: /\b(suspend(ed)?|lock(ed)?|block(ed)?|terminat(e|ed)|clos(e|ed))\b.*\baccount\b/i, weight: 3.0 },
  { pattern: /\b(will be (suspended|locked|closed|terminated|deleted))\b/i, weight: 2.8 },
  { pattern: /\b(unauthorized (access|activity|transaction))\b/i, weight: 2.5 },
  { pattern: /\b(security (alert|breach|violation|issue))\b/i, weight: 2.3 },
  { pattern: /\b(unusual activity|suspicious activity)\b/i, weight: 2.2 },

  // Action required
  { pattern: /\b(action required|immediate action|required action)\b/i, weight: 2.5 },
  { pattern: /\b(verify (your )?(account|identity|information))\b/i, weight: 2.3 },
  { pattern: /\b(confirm (your )?(account|identity|information|payment))\b/i, weight: 2.2 },
  { pattern: /\b(update (your )?(account|payment|information))\b/i, weight: 1.8 },
  { pattern: /\b(click (here|below|link) to)\b/i, weight: 1.5 },

  // Authority
  { pattern: /\b(CEO|CFO|executive|president|director)\b/i, weight: 1.8 },
  { pattern: /\b(legal (action|notice|department))\b/i, weight: 2.5 },
  { pattern: /\b(IRS|government|federal|tax authority)\b/i, weight: 2.3 },

  // Consequences
  { pattern: /\b(lose access|permanently (deleted|closed|suspended))\b/i, weight: 2.5 },
  { pattern: /\b(late fee|penalty|fine)\b/i, weight: 1.8 },
  { pattern: /\b(failure to (respond|act|comply))\b/i, weight: 2.2 },
];

/**
 * Content Risk Analyzer
 * Orchestrates modular extractors with 3-second timeout
 */
export class ContentRiskAnalyzer {
  private extractors: ContentExtractor<any>[];
  private readonly EXTRACTION_TIMEOUT_MS = 3000; // 3-second global timeout

  constructor() {
    // Register all extractors (Open/Closed Principle)
    this.extractors = [
      new DomainExtractor(),
      new LinkExtractor(),
      new ImageExtractor(),
      new QRCodeExtractor(),
      new AttachmentExtractor(),
      new ButtonExtractor(),
      new SenderExtractor(),
      new BodyExtractor(),
      new HTMLStructureExtractor(),
    ];
  }

  /**
   * Comprehensive risk assessment with parallel extractor execution
   */
  async analyzeRisk(input: NormalizedInput): Promise<EnhancedContentRiskProfile> {
    // Run all extractors in parallel with timeout
    const extractionPromise = Promise.allSettled(
      this.extractors.map((extractor) => extractor.extract(input))
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Extraction timeout')), this.EXTRACTION_TIMEOUT_MS)
    );

    let extractionResults: PromiseSettledResult<ExtractionResult<any>>[];
    let timedOut = false;

    try {
      extractionResults = await Promise.race([extractionPromise, timeoutPromise]);
    } catch (error) {
      // Timeout occurred - log and use empty data
      timedOut = true;
      logger.warn({
        msg: 'Content extraction timed out',
        timeoutMs: this.EXTRACTION_TIMEOUT_MS,
        error: error instanceof Error ? error.message : String(error),
      });

      // Create empty results for all extractors
      extractionResults = this.extractors.map(() => ({
        status: 'rejected' as const,
        reason: new Error('Extraction timeout'),
      }));
    }

    // Aggregate results
    const timings: Record<string, number> = {};
    const extractedData: any = {};

    extractionResults.forEach((result, index) => {
      const extractor = this.extractors[index];
      if (!extractor) return;

      const name = extractor.getName();

      if (result.status === 'fulfilled') {
        const { data, durationMs, error } = result.value;
        timings[name] = durationMs;
        extractedData[name] = data;

        if (error) {
          logger.warn({
            msg: 'Extractor failed gracefully',
            extractor: name,
            error,
          });
        }
      } else {
        logger.error({
          msg: timedOut ? 'Extractor timed out' : 'Extractor crashed',
          extractor: name,
          error: result.reason,
        });
        timings[name] = 0;
        extractedData[name] = extractor.getEmptyData();
      }
    });

    // Analyze urgency language (kept from original for backward compatibility)
    const urgencyAnalysis = this.analyzeUrgency(input);

    // Build enhanced profile
    const profile: EnhancedContentRiskProfile = {
      // Map extractor results to profile fields
      domains: extractedData['DomainExtractor'] || {
        allDomains: [],
        senderDomain: '',
        linkDomains: [],
        externalDomains: [],
        suspiciousDomains: [],
        domainReputation: {},
      },
      linkMetadata: extractedData['LinkExtractor'] || [],
      images: extractedData['ImageExtractor'] || [],
      qrCodes: extractedData['QRCodeExtractor'] || [],
      attachmentMetadata: extractedData['AttachmentExtractor'] || [],
      buttons: extractedData['ButtonExtractor'] || [],
      sender: extractedData['SenderExtractor'] || {
        email: '',
        domain: '',
        isRole: false,
        isDisposable: false,
        hasAuthentication: {},
      },
      bodyContent: extractedData['BodyExtractor'] || {
        textContent: '',
        htmlContent: '',
        textLength: 0,
        htmlLength: 0,
        hasHTML: false,
        extractedText: [],
      },
      htmlStructure: extractedData['HTMLStructureExtractor'] || {
        hasForms: false,
        formCount: 0,
        forms: [],
        hasIframes: false,
        iframeCount: 0,
        iframeSources: [],
        hasScripts: false,
        scriptCount: 0,
        scriptSources: [],
        hasStylesheets: false,
        stylesheetCount: 0,
        externalResources: [],
      },

      // Maintain backward compatibility
      hasLinks: (extractedData['LinkExtractor'] || []).length > 0,
      linkCount: (extractedData['LinkExtractor'] || []).length,
      links: (extractedData['LinkExtractor'] || []).map((l: LinkMetadata) => l.url),
      hasMaliciousLinks: (extractedData['LinkExtractor'] || []).some((l: LinkMetadata) => l.isSuspicious),

      hasImages: (extractedData['ImageExtractor'] || []).length > 0,
      imageCount: (extractedData['ImageExtractor'] || []).length,
      hasQRCodes: (extractedData['QRCodeExtractor'] || []).length > 0,
      qrCodeCount: (extractedData['QRCodeExtractor'] || []).length,

      hasAttachments: (extractedData['AttachmentExtractor'] || []).length > 0,
      attachmentCount: (extractedData['AttachmentExtractor'] || []).length,
      attachments: (extractedData['AttachmentExtractor'] || []).map((a: AttachmentMetadata) => a.filename),
      hasSuspiciousAttachments: (extractedData['AttachmentExtractor'] || []).some(
        (a: AttachmentMetadata) => a.isSuspicious
      ),

      hasUrgencyLanguage: urgencyAnalysis.hasUrgency,
      urgencyScore: urgencyAnalysis.score,
      urgencyIndicators: urgencyAnalysis.indicators,

      hasForms: extractedData['HTMLStructureExtractor']?.hasForms || false,

      // Extraction timings
      extractionTimings: timings,

      // Calculate overall risk score (enhanced logic)
      overallRiskScore: this.calculateEnhancedRiskScore(extractedData, urgencyAnalysis),
    };

    logger.info({
      msg: 'Content extraction completed',
      totalDuration: Object.values(timings).reduce((a, b) => a + b, 0),
      extractorCount: this.extractors.length,
      successCount: Object.keys(extractedData).length,
      timedOut,
    });

    return profile;
  }

  /**
   * Calculate enhanced risk score based on extracted data
   */
  private calculateEnhancedRiskScore(
    extractedData: any,
    urgencyAnalysis: { hasUrgency: boolean; score: number; indicators: string[] }
  ): number {
    let score = 0;

    // Domain-based scoring (up to 4 points)
    const domains: DomainContext = extractedData['DomainExtractor'];
    if (domains?.suspiciousDomains && domains.suspiciousDomains.length > 0) {
      score += Math.min(domains.suspiciousDomains.length * 2, 4);
    }

    // Link-based scoring (up to 3 points)
    const links: LinkMetadata[] = extractedData['LinkExtractor'];
    if (links && links.length > 0) {
      score += 1;
      if (links.some((l) => l.isSuspicious)) score += 2;
    }

    // QR code scoring (up to 2 points)
    const qrCodes: QRCodeData[] = extractedData['QRCodeExtractor'];
    if (qrCodes && qrCodes.length > 0) {
      score += 2;
    }

    // Attachment scoring (up to 3 points)
    const attachments: AttachmentMetadata[] = extractedData['AttachmentExtractor'];
    if (attachments && attachments.length > 0) {
      score += 1;
      if (attachments.some((a) => a.isSuspicious)) {
        score += 2;
      }
    }

    // Button/CTA scoring (up to 2 points)
    const buttons: ButtonMetadata[] = extractedData['ButtonExtractor'];
    if (buttons && buttons.some((b) => b.isSuspicious)) {
      score += 2;
    }

    // Sender scoring (up to 2 points)
    const sender: SenderProfile = extractedData['SenderExtractor'];
    if (sender?.isDisposable) score += 2;
    if (sender?.isRole && !sender.hasAuthentication.spf) score += 1;

    // Urgency language (up to 4 points)
    if (urgencyAnalysis.hasUrgency) {
      score += Math.min(urgencyAnalysis.score / 2.5, 4);
    }

    // Forms scoring (up to 2 points)
    const htmlStructure: HTMLStructureAnalysis = extractedData['HTMLStructureExtractor'];
    if (htmlStructure?.forms) {
      const hasPasswordForm = htmlStructure.forms.some((f) => f.hasPasswordField);
      if (hasPasswordForm) {
        score += 2;
      }
    }

    return Math.min(score, 10);
  }

  /**
   * Analyze urgency language (email only)
   */
  private analyzeUrgency(input: NormalizedInput): {
    hasUrgency: boolean;
    score: number;
    indicators: string[];
  } {
    if (!isEmailInput(input)) {
      return { hasUrgency: false, score: 0, indicators: [] };
    }

    const text = (input.data.parsed.body.text || input.data.parsed.body.html || '').toLowerCase();
    const subject = (input.data.parsed.subject || '').toLowerCase();
    const combined = `${subject} ${text}`;

    let totalScore = 0;
    const indicators: string[] = [];

    for (const { pattern, weight } of URGENCY_PATTERNS) {
      const matches = combined.match(pattern);
      if (matches) {
        totalScore += weight;
        indicators.push(matches[0]);
      }
    }

    // Normalize score to 0-10 range
    const normalizedScore = Math.min(totalScore, 10);

    return {
      hasUrgency: normalizedScore > 2.0,
      score: normalizedScore,
      indicators,
    };
  }

}
