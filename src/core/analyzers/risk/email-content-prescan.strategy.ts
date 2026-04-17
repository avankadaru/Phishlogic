/**
 * Email MIME content prescan — full extractor pipeline (original ContentRiskAnalyzer behavior).
 */

import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';
import type { Logger } from 'pino';
import { DomainExtractor, type DomainContext } from './extractors/domain.extractor.js';
import { LinkExtractor, type LinkMetadata } from './extractors/link.extractor.js';
import { ImageExtractor, type ImageMetadata } from './extractors/image.extractor.js';
import { QRCodeExtractor, type QRCodeData } from './extractors/qrcode.extractor.js';
import { AttachmentExtractor, type AttachmentMetadata } from './extractors/attachment.extractor.js';
import { ButtonExtractor, type ButtonMetadata } from './extractors/button.extractor.js';
import { SenderExtractor, type SenderProfile } from './extractors/sender.extractor.js';
import { BodyExtractor, type BodyContentAnalysis } from './extractors/body.extractor.js';
import { HTMLStructureExtractor, type HTMLStructureAnalysis } from './extractors/html-structure.extractor.js';
import type { ContentExtractor } from './extractors/base.extractor.js';
import { runContentExtractors } from './content-prescan-runner.js';
import type { EnhancedContentRiskProfile } from './content-risk.types.js';

const URGENCY_PATTERNS = [
  { pattern: /\b(urgent|immediately|asap|right away|at once)\b/i, weight: 2.0 },
  { pattern: /\b(act now|respond now|click now|verify now)\b/i, weight: 2.5 },
  { pattern: /\b(24 hours?|48 hours?|within \d+ (hours?|days?))\b/i, weight: 2.0 },
  { pattern: /\b(expires? (today|tonight|soon|shortly))\b/i, weight: 1.8 },
  { pattern: /\b(time[- ]sensitive|time is running out)\b/i, weight: 2.2 },
  { pattern: /\b(last chance|final (notice|warning|reminder))\b/i, weight: 2.3 },
  { pattern: /\b(suspend(ed)?|lock(ed)?|block(ed)?|terminat(e|ed)|clos(e|ed))\b.*\baccount\b/i, weight: 3.0 },
  { pattern: /\b(will be (suspended|locked|closed|terminated|deleted))\b/i, weight: 2.8 },
  { pattern: /\b(unauthorized (access|activity|transaction))\b/i, weight: 2.5 },
  { pattern: /\b(security (alert|breach|violation|issue))\b/i, weight: 2.3 },
  { pattern: /\b(unusual activity|suspicious activity)\b/i, weight: 2.2 },
  { pattern: /\b(action required|immediate action|required action)\b/i, weight: 2.5 },
  { pattern: /\b(verify (your )?(account|identity|information))\b/i, weight: 2.3 },
  { pattern: /\b(confirm (your )?(account|identity|information|payment))\b/i, weight: 2.2 },
  { pattern: /\b(update (your )?(account|payment|information))\b/i, weight: 1.8 },
  { pattern: /\b(click (here|below|link) to)\b/i, weight: 1.5 },
  { pattern: /\b(CEO|CFO|executive|president|director)\b/i, weight: 1.8 },
  { pattern: /\b(legal (action|notice|department))\b/i, weight: 2.5 },
  { pattern: /\b(IRS|government|federal|tax authority)\b/i, weight: 2.3 },
  { pattern: /\b(lose access|permanently (deleted|closed|suspended))\b/i, weight: 2.5 },
  { pattern: /\b(late fee|penalty|fine)\b/i, weight: 1.8 },
  { pattern: /\b(failure to (respond|act|comply))\b/i, weight: 2.2 },
];

function analyzeUrgency(input: NormalizedInput): {
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

  const normalizedScore = Math.min(totalScore, 10);

  return {
    hasUrgency: normalizedScore > 2.0,
    score: normalizedScore,
    indicators,
  };
}

function calculateEnhancedRiskScore(
  extractedData: Record<string, unknown>,
  urgencyAnalysis: { hasUrgency: boolean; score: number; indicators: string[] }
): number {
  let score = 0;

  const domains = extractedData['DomainExtractor'] as DomainContext | undefined;
  if (domains?.suspiciousDomains && domains.suspiciousDomains.length > 0) {
    score += Math.min(domains.suspiciousDomains.length * 2, 4);
  }

  const links = extractedData['LinkExtractor'] as LinkMetadata[] | undefined;
  if (links && links.length > 0) {
    score += 1;
    if (links.some((l) => l.isSuspicious)) score += 2;
  }

  const qrCodes = extractedData['QRCodeExtractor'] as QRCodeData[] | undefined;
  if (qrCodes && qrCodes.length > 0) {
    score += 2;
  }

  const attachments = extractedData['AttachmentExtractor'] as AttachmentMetadata[] | undefined;
  if (attachments && attachments.length > 0) {
    score += 1;
    if (attachments.some((a) => a.isSuspicious)) {
      score += 2;
    }
  }

  const buttons = extractedData['ButtonExtractor'] as ButtonMetadata[] | undefined;
  if (buttons && buttons.some((b) => b.isSuspicious)) {
    score += 2;
  }

  const sender = extractedData['SenderExtractor'] as SenderProfile | undefined;
  if (sender?.isDisposable) score += 2;
  if (sender?.isRole && !sender.hasAuthentication?.spf) score += 1;

  if (urgencyAnalysis.hasUrgency) {
    score += Math.min(urgencyAnalysis.score / 2.5, 4);
  }

  const htmlStructure = extractedData['HTMLStructureExtractor'] as HTMLStructureAnalysis | undefined;
  if (htmlStructure?.forms) {
    const hasPasswordForm = htmlStructure.forms.some((f) => f.hasPasswordField);
    if (hasPasswordForm) {
      score += 2;
    }
  }

  return Math.min(score, 10);
}

function createEmailExtractors(): ContentExtractor<unknown>[] {
  return [
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

export async function runEmailContentPrescan(
  input: NormalizedInput,
  logger: Logger
): Promise<EnhancedContentRiskProfile> {
  const extractors = createEmailExtractors();
  const { extractedData, timings } = await runContentExtractors(extractors, input, logger);

  const urgencyAnalysis = analyzeUrgency(input);

  const profile: EnhancedContentRiskProfile = {
    domains: (extractedData['DomainExtractor'] as DomainContext) || {
      allDomains: [],
      senderDomain: '',
      linkDomains: [],
      externalDomains: [],
      suspiciousDomains: [],
      domainReputation: {},
    },
    linkMetadata: (extractedData['LinkExtractor'] as LinkMetadata[]) || [],
    images: (extractedData['ImageExtractor'] as ImageMetadata[]) || [],
    qrCodes: (extractedData['QRCodeExtractor'] as QRCodeData[]) || [],
    attachmentMetadata: (extractedData['AttachmentExtractor'] as AttachmentMetadata[]) || [],
    buttons: (extractedData['ButtonExtractor'] as ButtonMetadata[]) || [],
    sender: (extractedData['SenderExtractor'] as SenderProfile) || {
      email: '',
      domain: '',
      isRole: false,
      isDisposable: false,
      hasAuthentication: {},
    },
    bodyContent: (extractedData['BodyExtractor'] as BodyContentAnalysis) || {
      textContent: '',
      htmlContent: '',
      textLength: 0,
      htmlLength: 0,
      hasHTML: false,
      extractedText: [],
    },
    htmlStructure: (extractedData['HTMLStructureExtractor'] as HTMLStructureAnalysis) || {
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

    hasLinks: ((extractedData['LinkExtractor'] as LinkMetadata[]) || []).length > 0,
    linkCount: ((extractedData['LinkExtractor'] as LinkMetadata[]) || []).length,
    links: ((extractedData['LinkExtractor'] as LinkMetadata[]) || []).map((l) => l.url),
    hasMaliciousLinks: ((extractedData['LinkExtractor'] as LinkMetadata[]) || []).some((l) => l.isSuspicious),

    hasImages: ((extractedData['ImageExtractor'] as ImageMetadata[]) || []).length > 0,
    imageCount: ((extractedData['ImageExtractor'] as ImageMetadata[]) || []).length,
    hasQRCodes: ((extractedData['QRCodeExtractor'] as QRCodeData[]) || []).length > 0,
    qrCodeCount: ((extractedData['QRCodeExtractor'] as QRCodeData[]) || []).length,

    hasAttachments: ((extractedData['AttachmentExtractor'] as AttachmentMetadata[]) || []).length > 0,
    attachmentCount: ((extractedData['AttachmentExtractor'] as AttachmentMetadata[]) || []).length,
    attachments: ((extractedData['AttachmentExtractor'] as AttachmentMetadata[]) || []).map((a) => a.filename),
    hasSuspiciousAttachments: ((extractedData['AttachmentExtractor'] as AttachmentMetadata[]) || []).some(
      (a) => a.isSuspicious
    ),

    hasUrgencyLanguage: urgencyAnalysis.hasUrgency,
    urgencyScore: urgencyAnalysis.score,
    urgencyIndicators: urgencyAnalysis.indicators,

    hasForms: (extractedData['HTMLStructureExtractor'] as HTMLStructureAnalysis | undefined)?.hasForms || false,

    extractionTimings: timings,
    overallRiskScore: calculateEnhancedRiskScore(extractedData, urgencyAnalysis),
    prescanTask: 'email_gmail',
  };

  return profile;
}
