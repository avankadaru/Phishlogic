/**
 * Image Extractor
 *
 * Catalogs images with basic metadata (source, type, alt text).
 * Does NOT perform expensive operations like OCR or QR decoding.
 * Those are handled by dedicated extractors.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isEmailInput } from '../../../models/input.js';
import { load } from 'cheerio';

export interface ImageMetadata {
  source: string;                     // URL or data URI
  type: 'embedded' | 'external';      // Base64 vs URL
  format?: string;                    // png, jpg, etc.
  altText?: string;                   // HTML alt attribute
  // Note: OCR text and QR detection will be added by specialized extractors
  // dimensions, EXIF data, etc. can be added later if needed
}

export class ImageExtractor extends BaseExtractor<ImageMetadata[]> {
  getName(): string {
    return 'ImageExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    // Only applicable to email inputs
    return isEmailInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<ImageMetadata[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const images: ImageMetadata[] = [];
    const html = input.data.parsed.body.html || '';
    const text = input.data.parsed.body.text || '';
    const combined = `${html} ${text}`;

    if (!combined) {
      return [];
    }

    try {
      const $ = load(html);

      // Extract images from <img> tags
      $('img').each((_, element) => {
        const src = $(element).attr('src');
        const altText = $(element).attr('alt');

        if (src) {
          const imageMetadata = this.parseImageSource(src, altText);
          if (imageMetadata) {
            images.push(imageMetadata);
          }
        }
      });

      // Also check for base64 images in plain text (in case HTML parsing missed them)
      const base64ImageRegex = /data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)/g;
      let match;

      while ((match = base64ImageRegex.exec(combined)) !== null) {
        const format = match[1];
        const fullDataUri = match[0];

        // Check if we already have this image (avoid duplicates)
        if (!images.some((img) => img.source === fullDataUri)) {
          images.push({
            source: fullDataUri,
            type: 'embedded',
            format,
          });
        }
      }
    } catch (error) {
      // Log error but don't fail - return what we have
    }

    return images;
  }

  getEmptyData(): ImageMetadata[] {
    return [];
  }

  /**
   * Parse image source and determine type
   */
  private parseImageSource(src: string, altText?: string): ImageMetadata | null {
    if (!src) {
      return null;
    }

    // Check if it's a data URI (embedded image)
    if (src.startsWith('data:image/')) {
      const formatMatch = src.match(/data:image\/([^;]+);/);
      const format = formatMatch?.[1];

      return {
        source: src,
        type: 'embedded',
        format,
        altText,
      };
    }

    // External image URL
    if (src.startsWith('http://') || src.startsWith('https://')) {
      // Try to extract format from URL
      const urlMatch = src.match(/\.([a-z]{3,4})(?:\?|$)/i);
      const format = urlMatch?.[1];

      return {
        source: src,
        type: 'external',
        format,
        altText,
      };
    }

    // Relative URL or other format
    return {
      source: src,
      type: 'external',
      altText,
    };
  }
}
