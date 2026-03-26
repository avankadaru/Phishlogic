/**
 * Domain Extractor
 *
 * Extracts all unique domains from sender email and all links.
 * Identifies suspicious domains using heuristics.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput, UrlInput } from '../../../models/input.js';
import { isEmailInput, isUrlInput } from '../../../models/input.js';

export interface DomainContext {
  allDomains: string[];              // Unique domains from sender + all links
  senderDomain: string;               // From email address
  linkDomains: string[];              // Unique domains from links
  externalDomains: string[];          // Domains not matching sender
  suspiciousDomains: string[];        // Flagged by heuristics
  domainReputation: Record<string, {  // Quick reputation flags
    isSuspicious: boolean;
    reasons: string[];
  }>;
}

export class DomainExtractor extends BaseExtractor<DomainContext> {
  getName(): string {
    return 'DomainExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input) || isUrlInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<DomainContext> {
    const domains = new Set<string>();
    let senderDomain = '';
    const linkDomains: string[] = [];

    // Extract sender domain (email only)
    if (isEmailInput(input)) {
      const from = input.data.parsed.from.address;
      senderDomain = this.extractDomainFromEmail(from);
      if (senderDomain) {
        domains.add(senderDomain);
      }
    }

    // Extract domains from links
    const links = this.getLinks(input);
    for (const url of links) {
      const domain = this.extractDomainFromUrl(url);
      if (domain) {
        domains.add(domain);
        linkDomains.push(domain);
      }
    }

    // Identify external domains
    const uniqueLinkDomains = [...new Set(linkDomains)];
    const externalDomains = uniqueLinkDomains.filter((d) => d !== senderDomain);

    // Run heuristic checks
    const domainReputation: Record<string, { isSuspicious: boolean; reasons: string[] }> = {};
    const suspiciousDomains: string[] = [];

    for (const domain of domains) {
      const reputation = this.checkDomainHeuristics(domain);
      domainReputation[domain] = reputation;
      if (reputation.isSuspicious) {
        suspiciousDomains.push(domain);
      }
    }

    return {
      allDomains: Array.from(domains),
      senderDomain,
      linkDomains: uniqueLinkDomains,
      externalDomains,
      suspiciousDomains,
      domainReputation,
    };
  }

  getEmptyData(): DomainContext {
    return {
      allDomains: [],
      senderDomain: '',
      linkDomains: [],
      externalDomains: [],
      suspiciousDomains: [],
      domainReputation: {},
    };
  }

  /**
   * Extract domain from email address
   */
  private extractDomainFromEmail(email: string): string {
    const match = email.match(/@(.+)$/);
    return match?.[1] ?? '';
  }

  /**
   * Extract domain from URL
   */
  private extractDomainFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  /**
   * Get all links from input
   */
  private getLinks(input: NormalizedInput): string[] {
    if (isEmailInput(input)) {
      return input.data.parsed.urls || [];
    } else if (isUrlInput(input)) {
      return [(input.data as UrlInput).url];
    }
    return [];
  }

  /**
   * Check domain for suspicious indicators using heuristics
   */
  private checkDomainHeuristics(domain: string): { isSuspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check for typosquatting patterns (exact typo variants only)
    const typosquattingPatterns = [
      { pattern: /paypa1/i, name: 'paypal typo' },
      { pattern: /g00gle/i, name: 'google typo' },
      { pattern: /amaz0n/i, name: 'amazon typo' },
      { pattern: /faceb00k/i, name: 'facebook typo' },
      { pattern: /appl3/i, name: 'apple typo' },
      { pattern: /micr0s0ft/i, name: 'microsoft typo' },
    ];

    for (const { pattern, name } of typosquattingPatterns) {
      if (pattern.test(domain)) {
        reasons.push(`Typosquatting: ${name}`);
      }
    }

    // Check for IP address as domain
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(domain)) {
      reasons.push('IP address instead of domain name');
    }

    // Check for very long random subdomain
    if (/[a-z0-9]{20,}/i.test(domain)) {
      reasons.push('Very long random subdomain');
    }

    // Check for multiple consecutive hyphens
    if (/-{3,}/.test(domain)) {
      reasons.push('Multiple consecutive hyphens');
    }

    // Check for suspicious TLDs
    const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top'];
    for (const tld of suspiciousTLDs) {
      if (domain.endsWith(tld)) {
        reasons.push(`Suspicious TLD: ${tld}`);
      }
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons,
    };
  }
}
