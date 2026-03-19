/**
 * QR Code Analyzer
 * Decodes QR codes from embedded images and validates extracted URLs
 * against phishing patterns and reputation databases
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';
import type { StepManager } from '../../execution/execution-strategy.js';
import { setStepContext } from '../../../infrastructure/logging/index.js';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import jsQR from 'jsqr';
import Url from 'url-parse';

/**
 * Suspicious TLDs commonly used in phishing
 */
const SUSPICIOUS_TLDS = [
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'xyz',
  'top',
  'work',
  'click',
  'link',
  'loan',
  'bid',
  'racing',
  'review',
];

/**
 * URL shorteners that hide final destination
 */
const URL_SHORTENERS = [
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'bl.ink',
  'lnkd.in',
  'shorturl.at',
  'rb.gy',
];

/**
 * QRCodeAnalyzer
 * Decodes and analyzes QR codes in embedded images
 */
export class QRCodeAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'qrcodeAnalyzer';
  }

  getWeight(): number {
    return 1.0; // High weight - QR codes can hide malicious URLs
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    // Only applicable to email inputs with HTML body (may contain embedded images with QR codes)
    if (!isEmailInput(input)) {
      return false;
    }
    return !!input.data.parsed.body.html;
  }

  async analyze(input: NormalizedInput, stepManager?: StepManager): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    if (!isEmailInput(input)) {
      return signals;
    }

    const html = input.data.parsed.body.html;
    if (!html) {
      return signals;
    }

    try {
      let imageSources: string[];

      // NEW: Check if images already extracted by risk profile
      if (input.riskProfile?.images && input.riskProfile.images.length > 0) {
        // Use pre-extracted images from risk profile (avoids duplicate HTML parsing)
        // Prioritize images flagged as potential QR codes by QRCodeExtractor
        const potentialQRImages = (input.riskProfile.qrCodes || [])
          .filter((qr: any) => qr.isPotentialQRCode)
          .map((qr: any) => qr.imageSource);

        const allImages = input.riskProfile.images.map((img: any) => img.source);

        // Put potential QR images first, then others (avoid duplicates)
        imageSources = [
          ...potentialQRImages,
          ...allImages.filter((src: string) => !potentialQRImages.includes(src)),
        ].slice(0, 10); // Limit to first 10 images
      } else {
        // Fallback: Extract from HTML (for backward compatibility)
        imageSources = this.extractImageSources(html);
        imageSources = imageSources.slice(0, 10);
      }

      if (imageSources.length === 0) {
        return signals;
      }

      // Try to decode QR codes from each image (expensive jsQR operation)
      for (let i = 0; i < imageSources.length; i++) {
        const imgSrc = imageSources[i];
        try {
          const qrSignals = await this.decodeAndAnalyzeQRCode(imgSrc, i + 1, stepManager);
          signals.push(...qrSignals);
        } catch (error) {
          // Failed to decode QR from this image, continue with next
          console.error('QRCodeAnalyzer: Failed to decode QR code', error);
        }
      }
    } catch (error) {
      console.error('QRCodeAnalyzer: Failed to extract images', error);
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
   * Decode QR code from image and analyze the content
   */
  private async decodeAndAnalyzeQRCode(imgSrc: string, imageIndex: number, stepManager?: StepManager): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    // Handle data URLs (base64 embedded images)
    if (!imgSrc.startsWith('data:image/')) {
      return signals; // Skip external URLs for security
    }

    const imageBuffer = this.dataUrlToBuffer(imgSrc);
    if (!imageBuffer) {
      return signals;
    }

    // If stepManager provided, create substep for QR decode operation
    let qrDecodeStepId: string | undefined;
    if (stepManager) {
      qrDecodeStepId = stepManager.startStep({
        name: `qr_decode_image_${imageIndex}`,
        source: {
          file: 'qrcode.analyzer.ts',
          component: 'QRCodeAnalyzer',
          method: 'decodeAndAnalyzeQRCode',
        },
      });
      setStepContext(qrDecodeStepId, (entry) => stepManager.captureLog(entry));
    }

    try {
      // Convert image to raw pixel data for jsQR
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

      // Decode QR code
      const qrCode = jsQR(new Uint8ClampedArray(data), info.width, info.height);

      if (!qrCode || !qrCode.data) {
        // No QR code found - END substep
        if (qrDecodeStepId && stepManager) {
          stepManager.completeStep(qrDecodeStepId, {
            qrCodeFound: false,
            imageIndex,
          });
        }
        return signals; // No QR code found in this image
      }

      const qrData = qrCode.data;

      // Check if QR code contains a URL
      if (this.isUrl(qrData)) {
        const urlSignals = await this.analyzeQRCodeUrl(qrData, imgSrc);
        signals.push(...urlSignals);
      } else {
        // QR code contains non-URL data (text, vCard, etc.)
        // Check if it looks suspicious
        if (this.containsSuspiciousText(qrData)) {
          signals.push(
            this.createSignal({
              signalType: 'qrcode_suspicious_content',
              severity: 'medium',
              confidence: 0.6,
              description: 'QR code contains suspicious text content',
              evidence: {
                imageSrc: imgSrc.substring(0, 100),
                qrData: qrData.substring(0, 200),
              },
            })
          );
        }
      }

      // QR decode substep - END
      if (qrDecodeStepId && stepManager) {
        stepManager.completeStep(qrDecodeStepId, {
          qrCodeFound: true,
          imageIndex,
          qrDataLength: qrData.length,
          containsURL: this.isUrl(qrData),
          signalsGenerated: signals.length,
        });
      }
    } catch (error) {
      // Failed to decode QR code (image may not contain one)
      if (qrDecodeStepId && stepManager) {
        stepManager.completeStep(qrDecodeStepId, {
          qrCodeFound: false,
          imageIndex,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return signals;
  }

  /**
   * Analyze URL extracted from QR code
   */
  private async analyzeQRCodeUrl(qrUrl: string, imgSrc: string): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    try {
      const url = new Url(qrUrl, true);
      const hostname = url.hostname.toLowerCase();
      const pathname = url.pathname;

      // Check for suspicious TLD
      const tld = hostname.split('.').pop();
      if (tld && SUSPICIOUS_TLDS.includes(tld)) {
        signals.push(
          this.createSignal({
            signalType: 'qrcode_malicious_url',
            severity: 'high',
            confidence: 0.85,
            description: `QR code contains URL with suspicious TLD (.${tld}) commonly used in phishing`,
            evidence: {
              imageSrc: imgSrc.substring(0, 100),
              qrUrl,
              hostname,
              tld,
            },
          })
        );
      }

      // Check for URL shorteners
      if (URL_SHORTENERS.some((shortener) => hostname === shortener)) {
        signals.push(
          this.createSignal({
            signalType: 'qrcode_suspicious_url',
            severity: 'medium',
            confidence: 0.75,
            description: 'QR code uses URL shortener that hides the final destination',
            evidence: {
              imageSrc: imgSrc.substring(0, 100),
              qrUrl,
              hostname,
            },
          })
        );
      }

      // Check for HTTP instead of HTTPS
      if (url.protocol === 'http:') {
        signals.push(
          this.createSignal({
            signalType: 'qrcode_suspicious_url',
            severity: 'medium',
            confidence: 0.7,
            description: 'QR code URL does not use secure HTTPS connection',
            evidence: {
              imageSrc: imgSrc.substring(0, 100),
              qrUrl,
              protocol: url.protocol,
            },
          })
        );
      }

      // Check for high entropy (random-looking) URLs
      const hostnameEntropy = this.calculateEntropy(hostname);
      if (hostnameEntropy > 4.5 && hostname.length >= 10) {
        signals.push(
          this.createSignal({
            signalType: 'qrcode_suspicious_url',
            severity: 'medium',
            confidence: 0.8,
            description: 'QR code URL contains random-looking characters',
            evidence: {
              imageSrc: imgSrc.substring(0, 100),
              qrUrl,
              hostname,
              entropy: hostnameEntropy,
            },
          })
        );
      }

      // Check for IP address instead of domain name
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        signals.push(
          this.createSignal({
            signalType: 'qrcode_suspicious_url',
            severity: 'high',
            confidence: 0.85,
            description: 'QR code URL uses IP address instead of domain name',
            evidence: {
              imageSrc: imgSrc.substring(0, 100),
              qrUrl,
              hostname,
            },
          })
        );
      }

      // Check for Unicode/IDN homograph attacks
      if (this.containsHomograph(hostname)) {
        signals.push(
          this.createSignal({
            signalType: 'qrcode_url_obfuscated',
            severity: 'high',
            confidence: 0.9,
            description: 'QR code URL uses Unicode characters that may impersonate legitimate domains',
            evidence: {
              imageSrc: imgSrc.substring(0, 100),
              qrUrl,
              hostname,
            },
          })
        );
      }

      // Check for excessively long pathname (often used to hide tracking)
      if (pathname.length > 100) {
        signals.push(
          this.createSignal({
            signalType: 'qrcode_suspicious_url',
            severity: 'low',
            confidence: 0.6,
            description: 'QR code URL has unusually long path',
            evidence: {
              imageSrc: imgSrc.substring(0, 100),
              qrUrl,
              pathnameLength: pathname.length,
            },
          })
        );
      }
    } catch {
      // Invalid URL format
      signals.push(
        this.createSignal({
          signalType: 'qrcode_suspicious_content',
          severity: 'medium',
          confidence: 0.7,
          description: 'QR code contains invalid or malformed URL',
          evidence: {
            imageSrc: imgSrc.substring(0, 100),
            qrData: qrUrl.substring(0, 200),
          },
        })
      );
    }

    return signals;
  }

  /**
   * Check if string is a valid URL
   */
  private isUrl(str: string): boolean {
    try {
      const url = new Url(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check if text contains suspicious keywords
   */
  private containsSuspiciousText(text: string): boolean {
    const suspiciousKeywords = [
      'verify',
      'urgent',
      'account suspended',
      'click here',
      'claim prize',
      'winner',
      'congratulations',
      'password',
      'security alert',
    ];

    const textLower = text.toLowerCase();
    return suspiciousKeywords.some((keyword) => textLower.includes(keyword));
  }

  /**
   * Calculate Shannon entropy of a string
   */
  private calculateEntropy(str: string): number {
    if (str.length === 0) return 0;

    const freq: Map<string, number> = new Map();

    for (const char of str.toLowerCase()) {
      freq.set(char, (freq.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    const len = str.length;

    for (const count of freq.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Check for Unicode homograph attacks (lookalike characters)
   */
  private containsHomograph(hostname: string): boolean {
    // Check for non-ASCII characters that might be used for impersonation
    const hasNonAscii = /[^\x00-\x7F]/.test(hostname);

    // Common homograph characters
    const homographs = [
      /а/g, // Cyrillic 'a' looks like Latin 'a'
      /е/g, // Cyrillic 'e' looks like Latin 'e'
      /о/g, // Cyrillic 'o' looks like Latin 'o'
      /р/g, // Cyrillic 'p' looks like Latin 'p'
      /с/g, // Cyrillic 'c' looks like Latin 'c'
      /у/g, // Cyrillic 'y' looks like Latin 'y'
      /х/g, // Cyrillic 'x' looks like Latin 'x'
    ];

    return hasNonAscii && homographs.some((pattern) => pattern.test(hostname));
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
