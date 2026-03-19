/**
 * Link Extractor
 *
 * Extracts detailed metadata for all links including URL parsing,
 * query parameters, anchor text, and suspicious link detection.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput, EmailInput, UrlInput } from '../../../models/input.js';
import { isEmailInput, isUrlInput } from '../../../models/input.js';
import { load } from 'cheerio';

export interface LinkMetadata {
  url: string;
  domain: string;
  path: string;
  queryParams: Record<string, string>;
  anchorText?: string;                // Link text from HTML
  isShortened: boolean;               // bit.ly, tinyurl, etc.
  isRedirect: boolean;                // Detected redirect patterns
  isSuspicious: boolean;              // Heuristic flag
  suspicionReasons: string[];
}

const URL_SHORTENERS = [
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'ow.ly',
  'short.link',
  'tiny.cc',
  'is.gd',
  'buff.ly',
  'adf.ly',
];

export class LinkExtractor extends BaseExtractor<LinkMetadata[]> {
  getName(): string {
    return 'LinkExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input) || isUrlInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<LinkMetadata[]> {
    const links: LinkMetadata[] = [];

    if (isEmailInput(input)) {
      // Extract links from email
      const parsedLinks = input.data.parsed.urls || [];
      const html = input.data.parsed.body.html || '';

      // Parse HTML to get anchor text
      const linkToAnchorText = this.extractAnchorTextFromHtml(html);

      for (const url of parsedLinks) {
        const metadata = this.parseLink(url, linkToAnchorText.get(url));
        links.push(metadata);
      }
    } else if (isUrlInput(input)) {
      // For URL input, the URL itself is the link
      const urlData = input.data as UrlInput;
      const metadata = this.parseLink(urlData.url);
      links.push(metadata);
    }

    return links;
  }

  getEmptyData(): LinkMetadata[] {
    return [];
  }

  /**
   * Parse link and extract metadata
   */
  private parseLink(url: string, anchorText?: string): LinkMetadata {
    const metadata: LinkMetadata = {
      url,
      domain: '',
      path: '',
      queryParams: {},
      anchorText,
      isShortened: false,
      isRedirect: false,
      isSuspicious: false,
      suspicionReasons: [],
    };

    try {
      const urlObj = new URL(url);

      // Extract domain
      metadata.domain = urlObj.hostname.replace(/^www\./, '');

      // Extract path
      metadata.path = urlObj.pathname;

      // Extract query parameters
      for (const [key, value] of urlObj.searchParams.entries()) {
        metadata.queryParams[key] = value;
      }

      // Check if shortened
      metadata.isShortened = this.isUrlShortener(metadata.domain);

      // Check for redirect patterns
      metadata.isRedirect = this.hasRedirectPattern(url, urlObj);

      // Run suspicious link checks
      const suspicionResults = this.checkSuspiciousIndicators(url, urlObj, anchorText);
      metadata.isSuspicious = suspicionResults.length > 0;
      metadata.suspicionReasons = suspicionResults;
    } catch (error) {
      // Invalid URL
      metadata.isSuspicious = true;
      metadata.suspicionReasons.push('Invalid URL format');
    }

    return metadata;
  }

  /**
   * Extract anchor text from HTML
   */
  private extractAnchorTextFromHtml(html: string): Map<string, string> {
    const linkToText = new Map<string, string>();

    if (!html) {
      return linkToText;
    }

    try {
      const $ = load(html);

      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().trim();

        if (href && text) {
          linkToText.set(href, text);
        }
      });
    } catch (error) {
      // Ignore HTML parsing errors
    }

    return linkToText;
  }

  /**
   * Check if domain is a URL shortener
   */
  private isUrlShortener(domain: string): boolean {
    return URL_SHORTENERS.some((shortener) => domain.includes(shortener));
  }

  /**
   * Check for redirect patterns in URL
   */
  private hasRedirectPattern(url: string, urlObj: URL): boolean {
    // Check query parameters for redirect patterns
    const redirectParams = ['redirect', 'url', 'link', 'goto', 'target', 'next', 'continue'];

    for (const param of redirectParams) {
      if (urlObj.searchParams.has(param)) {
        return true;
      }
    }

    // Check path for redirect patterns
    const redirectPaths = ['/redirect', '/r/', '/link/', '/goto/'];
    if (redirectPaths.some((pattern) => urlObj.pathname.includes(pattern))) {
      return true;
    }

    return false;
  }

  /**
   * Check for suspicious indicators in link
   */
  private checkSuspiciousIndicators(url: string, urlObj: URL, anchorText?: string): string[] {
    const reasons: string[] = [];
    const hostname = urlObj.hostname.toLowerCase();
    const path = urlObj.pathname.toLowerCase();

    // Check for typosquatting indicators
    const typosquattingPatterns = [
      { pattern: /paypa1/i, name: 'paypal typo' },
      { pattern: /g00gle/i, name: 'google typo' },
      { pattern: /amaz0n/i, name: 'amazon typo' },
      { pattern: /faceb00k/i, name: 'facebook typo' },
      { pattern: /appl3/i, name: 'apple typo' },
      { pattern: /micr0s0ft/i, name: 'microsoft typo' },
    ];

    for (const { pattern, name } of typosquattingPatterns) {
      if (pattern.test(hostname)) {
        reasons.push(`Typosquatting: ${name}`);
      }
    }

    // Check for IP address instead of domain
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(hostname)) {
      reasons.push('IP address instead of domain');
    }

    // Check for very long random subdomain
    if (/[a-z0-9]{20,}/i.test(hostname)) {
      reasons.push('Very long random subdomain');
    }

    // Check for multiple consecutive hyphens
    if (/-{3,}/.test(hostname)) {
      reasons.push('Multiple consecutive hyphens');
    }

    // Check for suspicious TLDs
    const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top'];
    for (const tld of suspiciousTLDs) {
      if (hostname.endsWith(tld)) {
        reasons.push(`Suspicious TLD: ${tld}`);
      }
    }

    // Check for suspicious keywords in path
    const suspiciousKeywords = ['login', 'verify', 'secure', 'account', 'update', 'confirm', 'signin', 'password'];
    for (const keyword of suspiciousKeywords) {
      if (path.includes(keyword)) {
        reasons.push(`Suspicious keyword in path: ${keyword}`);
      }
    }

    // Check for anchor text mismatch (phishing indicator)
    if (anchorText && anchorText.toLowerCase().includes('http')) {
      // Anchor text contains a URL - check if it matches
      try {
        const anchorUrl = new URL(anchorText);
        const anchorDomain = anchorUrl.hostname.replace(/^www\./, '');
        const linkDomain = hostname.replace(/^www\./, '');

        if (anchorDomain !== linkDomain) {
          reasons.push('Anchor text URL mismatch');
        }
      } catch {
        // Anchor text is not a valid URL, ignore
      }
    }

    return reasons;
  }
}
