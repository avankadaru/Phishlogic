/**
 * Body Extractor
 *
 * Extracts body content metadata (text, HTML, lengths).
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isEmailInput } from '../../../models/input.js';

export interface BodyContentAnalysis {
  textContent: string;                // Plain text
  htmlContent: string;                // HTML source
  textLength: number;
  htmlLength: number;
  hasHTML: boolean;
  // extractedText from images (OCR) would be added by ImageAnalyzer later
  extractedText: string[];
  language?: string;                  // Detected language (optional)
  charset?: string;
}

export class BodyExtractor extends BaseExtractor<BodyContentAnalysis> {
  getName(): string {
    return 'BodyExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<BodyContentAnalysis> {
    if (!isEmailInput(input)) {
      return this.getEmptyData();
    }

    const body = input.data.parsed.body;
    const textContent = body.text || '';
    const htmlContent = body.html || '';

    return {
      textContent,
      htmlContent,
      textLength: textContent.length,
      htmlLength: htmlContent.length,
      hasHTML: htmlContent.length > 0,
      extractedText: [], // Will be populated by OCR if needed
    };
  }

  getEmptyData(): BodyContentAnalysis {
    return {
      textContent: '',
      htmlContent: '',
      textLength: 0,
      htmlLength: 0,
      hasHTML: false,
      extractedText: [],
    };
  }
}
