/**
 * URL / link content prescan — static URL signals, domain/link extractors, optional HTML context snapshot.
 */

import type { NormalizedInput } from '../../models/input.js';
import { isUrlInput } from '../../models/input.js';
import type { Logger } from 'pino';
import { DomainExtractor, type DomainContext } from './extractors/domain.extractor.js';
import { LinkExtractor, type LinkMetadata } from './extractors/link.extractor.js';
import { UrlStaticSignalsExtractor, type UrlStaticRiskSignals } from './extractors/url-static-signals.extractor.js';
import {
  UrlHtmlContextSnapshotExtractor,
  type UrlHtmlContextSnapshot,
} from './extractors/url-html-context-snapshot.extractor.js';
import {
  UrlPlaywrightFetchExtractor,
  type UrlPlaywrightFetchResult,
} from './extractors/url-playwright-fetch.extractor.js';
import type { ContentExtractor } from './extractors/base.extractor.js';
import type { ImageMetadata } from './extractors/image.extractor.js';
import type { HTMLStructureAnalysis } from './extractors/html-structure.extractor.js';
import { runContentExtractors } from './content-prescan-runner.js';
import type { EnhancedContentRiskProfile } from './content-risk.types.js';

function emptyEmailOnlyProfileParts(): Pick<
  EnhancedContentRiskProfile,
  | 'images'
  | 'qrCodes'
  | 'attachmentMetadata'
  | 'buttons'
  | 'sender'
  | 'bodyContent'
  | 'hasAttachments'
  | 'attachmentCount'
  | 'attachments'
  | 'hasSuspiciousAttachments'
  | 'hasUrgencyLanguage'
  | 'urgencyScore'
  | 'urgencyIndicators'
  | 'hasQRCodes'
  | 'qrCodeCount'
> {
  return {
    images: [],
    qrCodes: [],
    attachmentMetadata: [],
    buttons: [],
    sender: {
      email: '',
      domain: '',
      isRole: false,
      isDisposable: false,
      hasAuthentication: {},
    },
    bodyContent: {
      textContent: '',
      htmlContent: '',
      textLength: 0,
      htmlLength: 0,
      hasHTML: false,
      extractedText: [],
    },
    hasAttachments: false,
    attachmentCount: 0,
    attachments: [],
    hasSuspiciousAttachments: false,
    hasUrgencyLanguage: false,
    urgencyScore: 0,
    urgencyIndicators: [],
    hasQRCodes: false,
    qrCodeCount: 0,
  };
}

function calculateUrlRiskScore(
  extractedData: Record<string, unknown>,
  htmlStructure: HTMLStructureAnalysis
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

  const staticSignals = extractedData['UrlStaticSignalsExtractor'] as UrlStaticRiskSignals | undefined;
  if (staticSignals) {
    if (staticSignals.dangerousScheme) {
      score += 4;
    } else if (staticSignals.schemeReasons.length > 0) {
      score += Math.min(staticSignals.schemeReasons.length, 2);
    }
    if (staticSignals.downloadLikePath) {
      score += 2;
    }
    if (staticSignals.suspiciousQueryKeys.length > 0) {
      score += Math.min(staticSignals.suspiciousQueryKeys.length, 2);
    }
    if (staticSignals.nonDefaultPort) {
      score += 1;
    }
    if (staticSignals.encodedPayloadHints.length > 0) {
      score += 1;
    }
  }

  if (htmlStructure.forms?.some((f) => f.hasPasswordField)) {
    score += 2;
  }
  if (htmlStructure.hasScripts) {
    score += 1.5;
  }
  if (htmlStructure.hasIframes) {
    score += 1;
  }
  if (htmlStructure.formCount > 0) {
    score += 0.5;
  }

  return Math.min(Math.round(score * 10) / 10, 10);
}

function buildImagesFromSnapshot(count: number): ImageMetadata[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => ({
    source: `context:img[${i}]`,
    type: 'external' as const,
  }));
}

function createUrlExtractors(): ContentExtractor<unknown>[] {
  return [
    new DomainExtractor(),
    new LinkExtractor(),
    new UrlStaticSignalsExtractor(),
    new UrlHtmlContextSnapshotExtractor(),
    new UrlPlaywrightFetchExtractor(),
  ];
}

const URL_PRESCAN_TIMEOUT_MS = 12_000;

export async function runUrlContentPrescan(
  input: NormalizedInput,
  logger: Logger
): Promise<EnhancedContentRiskProfile> {
  if (!isUrlInput(input)) {
    throw new Error('runUrlContentPrescan requires URL input');
  }

  const extractors = createUrlExtractors();
  const { extractedData, timings } = await runContentExtractors(
    extractors,
    input,
    logger,
    URL_PRESCAN_TIMEOUT_MS
  );

  const linkMetadata = (extractedData['LinkExtractor'] as LinkMetadata[]) || [];
  const snapshot = extractedData['UrlHtmlContextSnapshotExtractor'] as UrlHtmlContextSnapshot | undefined;
  const fetchResult = extractedData['UrlPlaywrightFetchExtractor'] as
    | UrlPlaywrightFetchResult
    | undefined;

  const emptyHtml: HTMLStructureAnalysis = {
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
  };
  // Prefer the live-rendered DOM when we have it, else the client-provided snippet.
  const htmlStructure =
    (fetchResult?.htmlStructure && fetchResult.renderedHtmlLength > 0
      ? fetchResult.htmlStructure
      : snapshot?.htmlStructure) ?? emptyHtml;
  // When the fetch actually ran we trust its image count; otherwise fall
  // back to the client-provided snapshot. `imageTagCount` on the fetch
  // result defaults to 0 even when the extractor was skipped, so we can't
  // rely on `??` alone.
  const fetchDidRun = !!fetchResult && fetchResult.renderedHtmlLength > 0;
  const imageTagCount = fetchDidRun
    ? fetchResult!.imageTagCount
    : snapshot?.imageTagCount ?? 0;
  const images = buildImagesFromSnapshot(imageTagCount);

  const emailEmpty = emptyEmailOnlyProfileParts();

  const profile: EnhancedContentRiskProfile = {
    ...emailEmpty,
    domains: (extractedData['DomainExtractor'] as DomainContext) || {
      allDomains: [],
      senderDomain: '',
      linkDomains: [],
      externalDomains: [],
      suspiciousDomains: [],
      domainReputation: {},
    },
    linkMetadata,
    images,
    htmlStructure,

    hasLinks: linkMetadata.length > 0,
    linkCount: linkMetadata.length,
    links: linkMetadata.map((l) => l.url),
    hasMaliciousLinks: linkMetadata.some((l) => l.isSuspicious),

    hasImages: imageTagCount > 0,
    imageCount: imageTagCount,

    hasForms: htmlStructure.hasForms,

    extractionTimings: timings,
    overallRiskScore: calculateUrlRiskScore(extractedData, htmlStructure),
    prescanTask: 'inspect_url',

    ...(fetchResult && fetchResult.requestedUrl
      ? {
          urlFetch: {
            requestedUrl: fetchResult.requestedUrl,
            finalUrl: fetchResult.finalUrl,
            status: fetchResult.status,
            redirectChain: fetchResult.redirectChain,
            hasAutomaticDownload: fetchResult.hasAutomaticDownload,
            renderedHtmlLength: fetchResult.renderedHtmlLength,
            renderedHtmlExcerpt: fetchResult.renderedHtml.slice(0, 8000),
            scriptSources: fetchResult.scriptSources,
            iframeSources: fetchResult.iframeSources,
            hasPasswordField: fetchResult.hasPasswordField,
            fetchError: fetchResult.fetchError,
          },
        }
      : {}),
  };

  return profile;
}
