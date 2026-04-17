/**
 * Minimal content-risk profile for Inspect URL when full ContentRiskAnalyzer is skipped.
 */

import type { NormalizedInput } from '../models/input.js';
import { isUrlInput } from '../models/input.js';
import type { ContentRiskProfile } from '../analyzers/risk/content-risk.types.js';
import type { LinkMetadata } from '../analyzers/risk/extractors/link.extractor.js';

const emptyDomainContext = {
  allDomains: [] as string[],
  senderDomain: '',
  linkDomains: [] as string[],
  externalDomains: [] as string[],
  suspiciousDomains: [] as string[],
  domainReputation: {} as Record<string, { isSuspicious: boolean; reasons: string[] }>,
};

/**
 * Build a minimal profile so downstream code expecting ContentRiskProfile keeps working.
 * Single URL is treated as one link for analyzer gating.
 */
export function buildMinimalUrlRiskProfile(input: NormalizedInput): ContentRiskProfile {
  if (!isUrlInput(input)) {
    throw new Error('buildMinimalUrlRiskProfile requires URL input');
  }

  const url = input.data.url;
  let host = '';
  let path = '';
  let queryParams: Record<string, string> = {};
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, '');
    path = parsed.pathname;
    for (const [k, v] of parsed.searchParams.entries()) {
      queryParams[k] = v;
    }
  } catch {
    host = '';
    path = '';
    queryParams = {};
  }

  const linkMeta: LinkMetadata[] = [
    {
      url,
      domain: host,
      path,
      queryParams,
      isShortened: false,
      isRedirect: false,
      isSuspicious: false,
      suspicionReasons: [],
    },
  ];

  return {
    domains: {
      ...emptyDomainContext,
      allDomains: host ? [host] : [],
      linkDomains: host ? [host] : [],
    },
    linkMetadata: linkMeta,
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
    htmlStructure: {
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
    hasLinks: true,
    linkCount: 1,
    links: [url],
    hasMaliciousLinks: false,
    hasImages: false,
    imageCount: 0,
    hasQRCodes: false,
    qrCodeCount: 0,
    hasAttachments: false,
    attachmentCount: 0,
    attachments: [],
    hasSuspiciousAttachments: false,
    hasUrgencyLanguage: false,
    urgencyScore: 0,
    urgencyIndicators: [],
    hasForms: false,
    extractionTimings: { inspect_url_minimal: 0 },
    overallRiskScore: 0,
  };
}
