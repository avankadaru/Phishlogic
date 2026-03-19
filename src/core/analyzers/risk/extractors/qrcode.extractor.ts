/**
 * QR Code Extractor
 *
 * Detects potential QR codes in images (heuristic detection).
 * Actual QR decoding can be added later if needed within timeout constraints.
 * For now, marks images as potential QR codes based on heuristics.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isEmailInput } from '../../../models/input.js';
import { load } from 'cheerio';

export interface QRCodeData {
  imageSource: string;                // Which image contained it
  isPotentialQRCode: boolean;         // Heuristic detection
  // Actual decoded data can be added later:
  // data?: string;
  // type?: 'url' | 'text' | 'contact' | 'unknown';
  // isPhishingRisk?: boolean;
  // riskReasons?: string[];
}

export class QRCodeExtractor extends BaseExtractor<QRCodeData[]> {
  getName(): string {
    return 'QRCodeExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<QRCodeData[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const qrCodes: QRCodeData[] = [];
    const html = input.data.parsed.body.html || '';

    if (!html) {
      return [];
    }

    try {
      const $ = load(html);

      // Heuristic: Look for images with "qr" in filename, alt text, or nearby text
      const qrCodeHeuristic = /qr[-_\s]?code|barcode|qrcode|scan[-_\s]?me/i;

      $('img').each((_, element) => {
        const src = $(element).attr('src');
        const alt = $(element).attr('alt') || '';
        const title = $(element).attr('title') || '';

        if (!src) {
          return;
        }

        // Check alt text, title, or nearby text for QR indicators
        const combined = `${src} ${alt} ${title}`.toLowerCase();

        if (qrCodeHeuristic.test(combined)) {
          qrCodes.push({
            imageSource: src,
            isPotentialQRCode: true,
          });
        }
      });

      // Also check for common QR code patterns in text
      const textContent = $('body').text() || '';
      if (qrCodeHeuristic.test(textContent)) {
        // If QR code is mentioned but no images flagged, mark first image as potential
        if (qrCodes.length === 0) {
          const firstImg = $('img').first().attr('src');
          if (firstImg) {
            qrCodes.push({
              imageSource: firstImg,
              isPotentialQRCode: true,
            });
          }
        }
      }
    } catch (error) {
      // Ignore errors, return what we have
    }

    return qrCodes;
  }

  getEmptyData(): QRCodeData[] {
    return [];
  }
}
