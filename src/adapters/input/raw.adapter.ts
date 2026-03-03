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
      const headers = new Map<string, string>();
      for (const [key, value] of Object.entries(parsed.headers)) {
        if (typeof value === 'string') {
          headers.set(key.toLowerCase(), value);
        } else if (Array.isArray(value)) {
          headers.set(key.toLowerCase(), value.join(', '));
        }
      }

      // Extract URLs from email body
      const textBody = parsed.text && typeof parsed.text === 'string' ? parsed.text : '';
      const htmlBody = parsed.html && typeof parsed.html === 'string' ? parsed.html : '';
      const urls = this.extractUrls(textBody, htmlBody);

      // Extract from address
      const fromAddr = Array.isArray(parsed.from)
        ? parsed.from[0]?.value[0]
        : parsed.from?.value[0];

      // Extract to addresses
      const toAddresses = Array.isArray(parsed.to)
        ? parsed.to.flatMap((addr) => addr.value)
        : (parsed.to?.value ?? []);

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
            text: textBody || undefined,
            html: htmlBody || undefined,
          },
          attachments: parsed.attachments?.map((att) => ({
            filename: att.filename ?? 'unknown',
            contentType: att.contentType,
            size: att.size,
            checksum: att.checksum,
          })),
          urls: urls.length > 0 ? urls : undefined,
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
   * Extract URLs from email body (text and HTML)
   */
  private extractUrls(textBody: string, htmlBody: string): string[] {
    const urls = new Set<string>();

    // URL regex pattern
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

    // Extract from text body
    const textMatches = textBody.match(urlPattern);
    if (textMatches) {
      textMatches.forEach((url) => urls.add(url));
    }

    // Extract from HTML body
    const htmlMatches = htmlBody.match(urlPattern);
    if (htmlMatches) {
      htmlMatches.forEach((url) => urls.add(url));
    }

    // Also extract from href attributes
    const hrefPattern = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = hrefPattern.exec(htmlBody)) !== null) {
      if (match[1] && (match[1].startsWith('http://') || match[1].startsWith('https://'))) {
        urls.add(match[1]);
      }
    }

    return Array.from(urls);
  }
}
