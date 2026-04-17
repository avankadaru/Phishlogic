/**
 * Content risk profile types (shared by prescan strategies and consumers).
 */

import type { DomainContext } from './extractors/domain.extractor.js';
import type { LinkMetadata } from './extractors/link.extractor.js';
import type { ImageMetadata } from './extractors/image.extractor.js';
import type { QRCodeData } from './extractors/qrcode.extractor.js';
import type { AttachmentMetadata } from './extractors/attachment.extractor.js';
import type { ButtonMetadata } from './extractors/button.extractor.js';
import type { SenderProfile } from './extractors/sender.extractor.js';
import type { BodyContentAnalysis } from './extractors/body.extractor.js';
import type { HTMLStructureAnalysis } from './extractors/html-structure.extractor.js';

export interface EnhancedContentRiskProfile {
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

  domains: DomainContext;
  linkMetadata: LinkMetadata[];
  images: ImageMetadata[];
  qrCodes: QRCodeData[];
  attachmentMetadata: AttachmentMetadata[];
  buttons: ButtonMetadata[];
  sender: SenderProfile;
  bodyContent: BodyContentAnalysis;
  htmlStructure: HTMLStructureAnalysis;

  extractionTimings: Record<string, number>;

  /** Which logical task produced this prescan (observability). Stable string labels only. */
  prescanTask?: string;

  /**
   * Live URL fetch payload (Playwright), present only when the URL prescan
   * actually navigated to the target. Absent for email prescans. See
   * UrlPlaywrightFetchExtractor for the canonical shape.
   */
  urlFetch?: {
    requestedUrl: string;
    finalUrl: string | null;
    status: number | null;
    redirectChain: string[];
    hasAutomaticDownload: boolean;
    renderedHtmlLength: number;
    renderedHtmlExcerpt: string;
    scriptSources: string[];
    iframeSources: string[];
    hasPasswordField: boolean;
    fetchError: string | null;
  };
}

/**
 * @deprecated Use EnhancedContentRiskProfile instead
 */
export type ContentRiskProfile = EnhancedContentRiskProfile;
