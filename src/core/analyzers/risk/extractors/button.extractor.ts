/**
 * Button Extractor
 *
 * Extracts buttons and CTAs (Call-to-Action) from HTML content.
 * Checks for suspicious button patterns.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isEmailInput } from '../../../models/input.js';
import { load } from 'cheerio';

export interface ButtonMetadata {
  text: string;
  type: 'button' | 'link' | 'submit' | 'input';
  action?: string;                    // href or formaction
  onclick?: string;                   // JS handler
  formId?: string;                    // Associated form
  isSuspicious: boolean;
  suspicionReasons: string[];
}

export class ButtonExtractor extends BaseExtractor<ButtonMetadata[]> {
  getName(): string {
    return 'ButtonExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<ButtonMetadata[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const buttons: ButtonMetadata[] = [];
    const html = input.data.parsed.body.html || '';

    if (!html) {
      return [];
    }

    try {
      const $ = load(html);

      // Extract <button> elements
      $('button').each((_, element) => {
        const text = $(element).text().trim();
        const onclick = $(element).attr('onclick');
        const formId = $(element).attr('form');
        const type = $(element).attr('type');

        if (text) {
          const suspicionResults = this.checkSuspiciousButton(text, onclick);

          buttons.push({
            text,
            type: type === 'submit' ? 'submit' : 'button',
            onclick,
            formId,
            isSuspicious: suspicionResults.length > 0,
            suspicionReasons: suspicionResults,
          });
        }
      });

      // Extract <a> elements that look like buttons (common CTA pattern)
      $('a[href]').each((_, element) => {
        const text = $(element).text().trim();
        const href = $(element).attr('href');
        const onclick = $(element).attr('onclick');

        // Only include if it has typical button/CTA text
        if (text && this.isButtonLikeText(text)) {
          const suspicionResults = this.checkSuspiciousButton(text, onclick, href);

          buttons.push({
            text,
            type: 'link',
            action: href,
            onclick,
            isSuspicious: suspicionResults.length > 0,
            suspicionReasons: suspicionResults,
          });
        }
      });

      // Extract <input type="submit"> elements
      $('input[type="submit"], input[type="button"]').each((_, element) => {
        const value = $(element).attr('value') || '';
        const onclick = $(element).attr('onclick');
        const formId = $(element).attr('form');

        if (value) {
          const suspicionResults = this.checkSuspiciousButton(value, onclick);

          buttons.push({
            text: value,
            type: 'input',
            onclick,
            formId,
            isSuspicious: suspicionResults.length > 0,
            suspicionReasons: suspicionResults,
          });
        }
      });
    } catch (error) {
      // Ignore errors, return what we have
    }

    return buttons;
  }

  getEmptyData(): ButtonMetadata[] {
    return [];
  }

  /**
   * Check if text looks like a button/CTA
   */
  private isButtonLikeText(text: string): boolean {
    const buttonKeywords = [
      'click',
      'verify',
      'confirm',
      'update',
      'login',
      'sign in',
      'submit',
      'continue',
      'proceed',
      'download',
      'view',
      'accept',
      'activate',
      'reset',
      'unlock',
    ];

    const lowerText = text.toLowerCase();
    return buttonKeywords.some((keyword) => lowerText.includes(keyword));
  }

  /**
   * Check for suspicious button patterns
   */
  private checkSuspiciousButton(text: string, onclick?: string, href?: string): string[] {
    const reasons: string[] = [];
    const lowerText = text.toLowerCase();

    // Check for urgency language
    const urgencyKeywords = ['now', 'immediately', 'urgent', 'asap', 'today', 'expires'];
    if (urgencyKeywords.some((keyword) => lowerText.includes(keyword))) {
      reasons.push('Urgency language in button');
    }

    // Check for credential-related actions
    const credentialKeywords = ['verify', 'confirm', 'update', 'reset', 'password', 'account'];
    if (credentialKeywords.some((keyword) => lowerText.includes(keyword))) {
      reasons.push('Credential-related action');
    }

    // Check for JavaScript in onclick
    if (onclick) {
      reasons.push('JavaScript onclick handler present');
    }

    // Check href for suspicious patterns
    if (href) {
      // Check if href is JavaScript
      if (href.startsWith('javascript:')) {
        reasons.push('JavaScript href detected');
      }

      // Check if href is a shortened URL
      const shorteners = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co'];
      if (shorteners.some((shortener) => href.includes(shortener))) {
        reasons.push('Shortened URL in button link');
      }
    }

    return reasons;
  }
}
