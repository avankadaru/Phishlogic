/**
 * Raw Input Adapter
 * Handles direct URL and email input
 */

import { randomUUID } from 'node:crypto';
import type {
  NormalizedInput,
  UrlInput,
  EmailInput,
  InputType,
} from '../../core/models/input.js';
import type { ValidationResult } from '../../core/models/analysis-result.js';
import { simpleParser } from 'mailparser';
import { load } from 'cheerio';
import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();

/**
 * Raw URL request
 */
export interface RawUrlRequest {
  url: string;
  context?: {
    referrer?: string;
    userAgent?: string;
  };
}

/**
 * Raw Email request
 */
export interface RawEmailRequest {
  /** Raw email content in MIME format */
  rawEmail: string;
}

/**
 * Input Adapter interface
 */
export interface InputAdapter<T> {
  adapt(input: T): Promise<NormalizedInput>;
  validate(input: T): Promise<ValidationResult>;
  getType(): InputType;
}

/**
 * Raw URL Input Adapter
 */
export class RawUrlAdapter implements InputAdapter<RawUrlRequest> {
  getType(): InputType {
    return 'url';
  }

  async validate(input: RawUrlRequest): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!input.url) {
      errors.push('URL is required');
    } else {
      // Validate URL format
      try {
        new URL(input.url);
      } catch {
        errors.push('Invalid URL format');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async adapt(input: RawUrlRequest): Promise<NormalizedInput> {
    const urlData: UrlInput = {
      url: input.url,
      context: input.context,
    };

    return {
      type: 'url',
      id: randomUUID(),
      timestamp: new Date(),
      data: urlData,
    };
  }
}

/**
 * Raw Email Input Adapter
 */
export class RawEmailAdapter implements InputAdapter<RawEmailRequest> {
  getType(): InputType {
    return 'email';
  }

  async validate(input: RawEmailRequest): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!input.rawEmail) {
      errors.push('Email content is required');
    } else if (input.rawEmail.length === 0) {
      errors.push('Email content cannot be empty');
    } else if (input.rawEmail.length > 10 * 1024 * 1024) {
      // 10MB limit
      errors.push('Email content too large (max 10MB)');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async adapt(input: RawEmailRequest): Promise<NormalizedInput> {
    try {
      // Parse email using mailparser
      const parsed = await simpleParser(input.rawEmail);

      // Extract headers
      // mailparser returns headers as an ES6 Map — Object.entries() returns [] on a Map,
      // so we must iterate with .entries() to get actual header values.
      // Keys are already lowercased by mailparser.
      const headers = new Map<string, string>();
      for (const [key, value] of parsed.headers.entries()) {
        if (typeof value === 'string') {
          headers.set(key, value);
        } else if (Array.isArray(value)) {
          headers.set(key, value.join(', '));
        }
        // Skip complex objects (AddressObject, Date, etc.) — accessed via parsed.from/to directly
      }

      // Extract body parts
      const textBody = typeof parsed.text === 'string' ? parsed.text : '';
      const htmlBody = typeof parsed.html === 'string' ? parsed.html : '';

      // Parse HTML with cheerio — production-grade extraction of all links, images, text
      const { urls: htmlUrls, images, derivedText } = this.parseHtmlContent(htmlBody);

      // Also capture bare URLs from plain text (unsubscribe links, text-only emails)
      const TEXT_URL_PATTERN = /https?:\/\/[^\s<>"'{}|\\^`\[\]]+/gi;
      const textUrls = (textBody.match(TEXT_URL_PATTERN) || [])
        .map((u) => u.replace(/[\r\n\t]/g, '').replace(/[);,.\s'"]+$/, ''))
        .filter((u) => u.startsWith('http'));
      const allUrls = Array.from(new Set([...htmlUrls, ...textUrls]));

      // Use meaningful text body — fall back to HTML-derived when plain text is sparse
      const effectiveText = this.extractTextBody(textBody, derivedText);

      // Extract from address
      const fromAddr = Array.isArray(parsed.from)
        ? parsed.from[0]?.value[0]
        : parsed.from?.value[0];

      // Extract to addresses
      const toAddresses = Array.isArray(parsed.to)
        ? parsed.to.flatMap((addr) => addr.value)
        : (parsed.to?.value ?? []);

      logger.info({ from: fromAddr?.address, subject: parsed.subject, hasText: !!textBody, hasHtml: !!htmlBody, urlCount: allUrls.length, imageCount: images.length, attachmentCount: parsed.attachments?.length ?? 0 }, 'Email parsed successfully');

      const emailData: EmailInput = {
        raw: input.rawEmail,
        parsed: {
          headers,
          from: {
            address: fromAddr?.address ?? '',
            name: fromAddr?.name,
          },
          to: toAddresses.map((addr) => ({
            address: addr.address ?? '',
            name: addr.name,
          })),
          subject: parsed.subject ?? '',
          body: {
            text: effectiveText || undefined,
            html: htmlBody || undefined,
          },
          attachments: parsed.attachments?.map((att) => ({
            filename: att.filename ?? 'unknown',
            contentType: att.contentType,
            size: att.size,
            checksum: att.checksum,
          })),
          urls: allUrls.length > 0 ? allUrls : undefined,
          images: images.length > 0 ? images : undefined,
        },
      };

      return {
        type: 'email',
        id: randomUUID(),
        timestamp: new Date(),
        data: emailData,
      };
    } catch (error) {
      logger.error({
        msg: 'Failed to parse email',
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error('Failed to parse email content');
    }
  }

  /**
   * Parse HTML body using cheerio for production-grade extraction.
   * Handles quoted/unquoted href attrs, multiline attrs (8bit encoding),
   * CSS background-image tracking pixels, and derives plain text.
   * SRP: focused solely on extracting structured data from HTML.
   */
  private parseHtmlContent(
    html: string
  ): { urls: string[]; images: string[]; derivedText: string } {
    if (!html) {
      return { urls: [], images: [], derivedText: '' };
    }

    const $ = load(html);
    const urls = new Set<string>();
    const images = new Set<string>();

    // Normalize: strip embedded newlines (multiline attrs in 8bit emails), trailing garbage
    const normalize = (url: string | undefined): string | null => {
      if (!url) return null;
      const clean = url.replace(/[\r\n\t]/g, '').replace(/[);,.\s'"]+$/, '').trim();
      return clean.startsWith('http://') || clean.startsWith('https://') ? clean : null;
    };

    // All anchor hrefs — cheerio handles quoted/unquoted/multiline natively
    // Covers: text links, icon links (<a><img></a>), button links, app store links
    $('a[href]').each((_, el) => {
      const url = normalize($(el).attr('href'));
      if (url) urls.add(url);
    });

    // All image sources — separated from navigation links
    $('img[src]').each((_, el) => {
      const url = normalize($(el).attr('src'));
      if (url) {
        images.add(url);
        urls.add(url); // also in urls[] for LinkExtractor backward compat
      }
    });

    // CSS background-image tracking pixels (common in marketing/phishing emails)
    $('[style]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const match = style.match(/background(?:-image)?\s*:\s*url\s*\(\s*["']?([^"')]+)/i);
      if (match) {
        const url = normalize(match[1]);
        if (url) images.add(url); // tracking pixels — images only, not navigation
      }
    });

    // Derive plain text from HTML body (used as fallback when text/plain is sparse)
    // Strip <style>, <script>, <title> (often contains SEO spam in marketing emails)
    $('style, script, title').remove();
    const derivedText = ($('body').text() || $.root().text())
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 3000);

    logger.info({ htmlLinks: urls.size, htmlImages: images.size, derivedTextLength: derivedText.length }, 'HTML content parsed');

    return { urls: Array.from(urls), images: Array.from(images), derivedText };
  }

  /**
   * Returns meaningful plain text for AI analysis.
   * Falls back to HTML-derived text when text/plain part is missing or sparse.
   * SRP: decides which text representation is most useful for downstream analysis.
   */
  private extractTextBody(plainText: string, derivedText: string): string {
    const wordCount = plainText
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((w) => w.length > 2).length;

    if (wordCount >= 20) {
      return plainText;
    }

    if (derivedText.length > 100) {
      logger.info({ plainTextWords: wordCount, derivedTextLength: derivedText.length }, 'Sparse text/plain part — using HTML-derived text for analysis');
      return derivedText;
    }

    return plainText;
  }
}
