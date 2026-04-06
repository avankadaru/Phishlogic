/**
 * Sender Extractor
 *
 * Extracts sender profile information from email headers.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isEmailInput } from '../../../models/input.js';

export interface SenderProfile {
  email: string;
  domain: string;
  displayName?: string;
  isRole: boolean;                    // admin@, noreply@, etc.
  isDisposable: boolean;              // Temp email services
  hasAuthentication: {                // From headers (if available)
    spf?: boolean;
    dkim?: boolean;
    dmarc?: boolean;
  };
  replyTo?: string;                   // Different from sender?
  returnPath?: string;                // Bounce address
}

const ROLE_ACCOUNTS = [
  'admin',
  'administrator',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'info',
  'support',
  'help',
  'service',
  'notification',
  'notifications',
  'alert',
  'alerts',
];

const DISPOSABLE_DOMAINS = [
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'temp-mail.org',
  'throwaway.email',
  'trashmail.com',
  'yopmail.com',
];

export class SenderExtractor extends BaseExtractor<SenderProfile> {
  getName(): string {
    return 'SenderExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<SenderProfile> {
    if (!isEmailInput(input)) {
      return this.getEmptyData();
    }

    const from = input.data.parsed.from;
    const email = from.address;
    const displayName = from.name;

    // Extract domain
    const domainMatch = email.match(/@(.+)$/);
    const domain = domainMatch?.[1] ?? '';

    // Check if role account
    const localPart = email.split('@')[0]?.toLowerCase() ?? '';
    const isRole = ROLE_ACCOUNTS.some((role) => localPart.includes(role));

    // Check if disposable
    const isDisposable = DISPOSABLE_DOMAINS.some((disposable) => domain.includes(disposable));

    // Extract reply-to and return-path from headers
    // headers is Map<string, string> — must use .get() not bracket notation
    const headers = input.data.parsed.headers;
    const replyTo = headers?.get('reply-to') ?? undefined;
    const returnPath = headers?.get('return-path') ?? undefined;

    // Check authentication headers (if available)
    const hasAuthentication = {
      spf: this.checkAuthenticationHeader(headers, 'spf'),
      dkim: this.checkAuthenticationHeader(headers, 'dkim'),
      dmarc: this.checkAuthenticationHeader(headers, 'dmarc'),
    };

    return {
      email,
      domain,
      displayName,
      isRole,
      isDisposable,
      hasAuthentication,
      replyTo,
      returnPath,
    };
  }

  getEmptyData(): SenderProfile {
    return {
      email: '',
      domain: '',
      isRole: false,
      isDisposable: false,
      hasAuthentication: {},
    };
  }

  /**
   * Check authentication header
   */
  private checkAuthenticationHeader(headers: Map<string, string>, type: 'spf' | 'dkim' | 'dmarc'): boolean | undefined {
    if (!headers) {
      return undefined;
    }

    // headers is Map<string, string> — use .get() not bracket notation
    const authResults = headers.get('authentication-results');
    if (authResults && typeof authResults === 'string') {
      const lowerAuth = authResults.toLowerCase();

      switch (type) {
        case 'spf':
          return lowerAuth.includes('spf=pass');
        case 'dkim':
          return lowerAuth.includes('dkim=pass');
        case 'dmarc':
          return lowerAuth.includes('dmarc=pass');
      }
    }

    return undefined;
  }
}
