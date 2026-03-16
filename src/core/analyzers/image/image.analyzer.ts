/**
 * Image Analyzer
 * Scans embedded images for malicious content, OCR text extraction,
 * and EXIF metadata analysis
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import exifParser from 'exif-parser';

/**
 * Phishing keywords commonly found in phishing images
 */
const PHISHING_KEYWORDS = [
  'verify',
  'account',
  'suspended',
  'urgent',
  'click here',
  'confirm',
  'update',
  'security',
  'alert',
  'password',
  'expire',
  'locked',
  'unusual activity',
  'verify identity',
  'claim',
  'prize',
  'winner',
  'congratulations',
  'limited time',
];

/**
 * ImageAnalyzer
 * Analyzes embedded images for phishing indicators
 */
export class ImageAnalyzer extends BaseAnalyzer {
  private ocrWorker: Worker | null = null;

  getName(): string {
    return 'imageAnalyzer';
  }

  getWeight(): number {
    return 0.9; // High weight - images with phishing text are strong indicators
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    // Only applicable to email inputs with HTML body (may contain embedded images)
    if (!isEmailInput(input)) {
      return false;
    }
    return !!input.data.parsed.body.html;
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    if (!isEmailInput(input)) {
      return signals;
    }

    const html = input.data.parsed.body.html;
    if (!html) {
      return signals;
    }

    try {
      // Extract image sources from HTML
      const imageSources = this.extractImageSources(html);

      if (imageSources.length === 0) {
        return signals;
      }

      // Analyze each image
      for (const imgSrc of imageSources.slice(0, 5)) {
        // Limit to first 5 images to avoid excessive processing
        try {
          const imageSignals = await this.analyzeImage(imgSrc);
          signals.push(...imageSignals);
        } catch (error) {
          // Failed to analyze this image, continue with next
          console.error('ImageAnalyzer: Failed to analyze image', error);
        }
      }
    } catch (error) {
      console.error('ImageAnalyzer: Failed to extract images', error);
    } finally {
      // Cleanup OCR worker
      if (this.ocrWorker) {
        await this.ocrWorker.terminate();
        this.ocrWorker = null;
      }
    }

    return signals;
  }

  /**
   * Extract image sources from HTML
   */
  private extractImageSources(html: string): string[] {
    const sources: string[] = [];

    try {
      const $ = cheerio.load(html);
      $('img').each((_, element) => {
        const src = $(element).attr('src');
        if (src) {
          sources.push(src);
        }
      });
    } catch {
      // Failed to parse HTML
    }

    return sources;
  }

  /**
   * Analyze a single image
   */
  private async analyzeImage(imgSrc: string): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    // Handle data URLs (base64 embedded images)
    if (imgSrc.startsWith('data:image/')) {
      const imageBuffer = this.dataUrlToBuffer(imgSrc);
      if (!imageBuffer) {
        return signals;
      }

      // Perform OCR
      const ocrSignals = await this.performOCR(imageBuffer, imgSrc);
      signals.push(...ocrSignals);

      // Analyze EXIF metadata
      const exifSignals = await this.analyzeEXIF(imageBuffer, imgSrc);
      signals.push(...exifSignals);
    }
    // Handle external image URLs (not analyzed in this version for security)
    // Could be extended to fetch and analyze external images with proper validation

    return signals;
  }

  /**
   * Perform OCR on image to extract text
   */
  private async performOCR(imageBuffer: Buffer, imgSrc: string): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    try {
      // Initialize OCR worker if not already initialized
      if (!this.ocrWorker) {
        this.ocrWorker = await createWorker('eng', 1, {
          logger: () => {}, // Disable logging
        });
      }

      // Convert image to grayscale PNG for better OCR accuracy
      const processedImage = await sharp(imageBuffer)
        .greyscale()
        .png()
        .toBuffer();

      // Perform OCR
      const {
        data: { text },
      } = await this.ocrWorker.recognize(processedImage);

      if (!text || text.trim().length === 0) {
        return signals;
      }

      // Check for phishing keywords in extracted text
      const textLower = text.toLowerCase();
      const foundKeywords: string[] = [];

      for (const keyword of PHISHING_KEYWORDS) {
        if (textLower.includes(keyword.toLowerCase())) {
          foundKeywords.push(keyword);
        }
      }

      if (foundKeywords.length > 0) {
        const severity: AnalysisSignal['severity'] =
          foundKeywords.length >= 3 ? 'high' : foundKeywords.length >= 2 ? 'medium' : 'low';

        signals.push(
          this.createSignal({
            signalType: 'image_contains_phishing_text',
            severity,
            confidence: Math.min(0.95, 0.6 + foundKeywords.length * 0.1),
            description: `Embedded image contains phishing-related text: ${foundKeywords.join(', ')}`,
            evidence: {
              imageSrc: imgSrc.substring(0, 100), // Truncate for readability
              extractedText: text.substring(0, 500),
              foundKeywords,
              keywordCount: foundKeywords.length,
            },
          })
        );
      }

      // Check for excessive urgency in text
      const urgencyWords = ['urgent', 'immediate', 'now', 'expire', 'limited', 'act now'];
      const urgencyCount = urgencyWords.filter((word) => textLower.includes(word)).length;

      if (urgencyCount >= 2) {
        signals.push(
          this.createSignal({
            signalType: 'image_contains_phishing_text',
            severity: 'medium',
            confidence: 0.75,
            description: 'Image contains urgent language often used in phishing attacks',
            evidence: {
              imageSrc: imgSrc.substring(0, 100),
              extractedText: text.substring(0, 500),
              urgencyWordCount: urgencyCount,
            },
          })
        );
      }
    } catch (error) {
      // OCR failed, not necessarily a problem
      console.error('ImageAnalyzer: OCR failed', error);
    }

    return signals;
  }

  /**
   * Analyze EXIF metadata for anomalies
   */
  private async analyzeEXIF(imageBuffer: Buffer, imgSrc: string): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    try {
      const parser = exifParser.create(imageBuffer);
      const result = parser.parse();

      if (!result.tags) {
        return signals;
      }

      const { tags } = result;

      // Check for modified date significantly different from creation date
      if (tags.CreateDate && tags.ModifyDate) {
        const createDate = new Date(tags.CreateDate * 1000);
        const modifyDate = new Date(tags.ModifyDate * 1000);
        const daysDiff = Math.abs(modifyDate.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24);

        // If modified more than 30 days after creation, flag as potentially tampered
        if (daysDiff > 30) {
          signals.push(
            this.createSignal({
              signalType: 'image_metadata_suspicious',
              severity: 'low',
              confidence: 0.5,
              description: 'Image metadata shows significant time gap between creation and modification',
              evidence: {
                imageSrc: imgSrc.substring(0, 100),
                createDate: createDate.toISOString(),
                modifyDate: modifyDate.toISOString(),
                daysDifference: Math.round(daysDiff),
              },
            })
          );
        }
      }

      // Check for suspicious software/tool used to create/edit the image
      if (tags.Software) {
        const software = tags.Software.toLowerCase();
        const suspiciousTools = ['photoshop', 'gimp', 'paint.net', 'editor'];

        for (const tool of suspiciousTools) {
          if (software.includes(tool)) {
            signals.push(
              this.createSignal({
                signalType: 'image_metadata_suspicious',
                severity: 'low',
                confidence: 0.4,
                description: 'Image was edited with graphics software, which may indicate manipulation',
                evidence: {
                  imageSrc: imgSrc.substring(0, 100),
                  software: tags.Software,
                },
              })
            );
            break;
          }
        }
      }
    } catch {
      // EXIF data not available or parsing failed (normal for many images)
    }

    return signals;
  }

  /**
   * Convert data URL to buffer
   */
  private dataUrlToBuffer(dataUrl: string): Buffer | null {
    try {
      const matches = dataUrl.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
      if (!matches || matches.length < 2) {
        return null;
      }

      const base64Data = matches[1];
      return Buffer.from(base64Data, 'base64');
    } catch {
      return null;
    }
  }
}
