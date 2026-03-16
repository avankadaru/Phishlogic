/**
 * Button/CTA Analyzer
 * Analyzes HTML buttons and call-to-action elements for hidden tracking
 * URLs, malicious redirects in onclick handlers, and text/destination mismatches
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';
import * as cheerio from 'cheerio';
import Url from 'url-parse';

/**
 * Suspicious JavaScript patterns in onclick handlers
 */
const SUSPICIOUS_JS_PATTERNS = [
  /window\.location\s*=/,
  /document\.location\s*=/,
  /location\.href\s*=/,
  /location\.replace/,
  /eval\(/,
  /atob\(/,
  /fromCharCode/,
  /\.submit\(\)/,
];

/**
 * Tracking parameter patterns
 */
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_eid',
  'mc_cid',
  '_hsenc',
  '_hsmi',
];

/**
 * ButtonAnalyzer
 * Analyzes HTML buttons and CTAs for suspicious behavior
 */
export class ButtonAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'buttonAnalyzer';
  }

  getWeight(): number {
    return 0.8; // Medium weight - buttons can indicate phishing intent
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    // Only applicable to email inputs with HTML body
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
      const $ = cheerio.load(html);

      // Analyze all buttons and anchor tags
      const elements = $('button, a[href], input[type="button"], input[type="submit"]');

      elements.each((_, element) => {
        const $el = $(element);
        const onclick = $el.attr('onclick');
        const href = $el.attr('href');
        const text = $el.text().trim();
        const formAction = $el.attr('formaction');

        // Check onclick handlers for suspicious JavaScript
        if (onclick) {
          const jsSignals = this.analyzeOnclickHandler(onclick, text, href);
          signals.push(...jsSignals);
        }

        // Check href for text/destination mismatches
        if (href && text) {
          const mismatchSignals = this.analyzeTextDestinationMismatch(text, href);
          signals.push(...mismatchSignals);
        }

        // Check for tracking parameters
        if (href) {
          const trackingSignals = this.analyzeTrackingParameters(href);
          signals.push(...trackingSignals);
        }

        // Check formaction for suspicious domains
        if (formAction) {
          const formSignals = this.analyzeFormAction(formAction, text);
          signals.push(...formSignals);
        }
      });
    } catch (error) {
      // Failed to parse HTML, skip
      console.error('ButtonAnalyzer: Failed to parse HTML', error);
    }

    return signals;
  }

  /**
   * Analyze onclick handler for suspicious JavaScript
   */
  private analyzeOnclickHandler(
    onclick: string,
    buttonText: string,
    href?: string
  ): AnalysisSignal[] {
    const signals: AnalysisSignal[] = [];

    // Check for suspicious JavaScript patterns
    for (const pattern of SUSPICIOUS_JS_PATTERNS) {
      if (pattern.test(onclick)) {
        let severity: AnalysisSignal['severity'] = 'medium';
        let confidence = 0.7;

        // Higher severity for obfuscation techniques
        if (/eval|atob|fromCharCode/.test(onclick)) {
          severity = 'high';
          confidence = 0.85;
        }

        signals.push(
          this.createSignal({
            signalType: 'button_hidden_redirect',
            severity,
            confidence,
            description: `Button contains suspicious JavaScript that may redirect to a malicious site: "${buttonText}"`,
            evidence: {
              buttonText,
              onclick: onclick.substring(0, 200), // Limit length
              href,
              pattern: pattern.toString(),
            },
          })
        );
        break; // Only report one signal per button
      }
    }

    return signals;
  }

  /**
   * Analyze text vs destination mismatch
   */
  private analyzeTextDestinationMismatch(text: string, href: string): AnalysisSignal[] {
    const signals: AnalysisSignal[] = [];

    try {
      const url = new Url(href, true);
      const hostname = url.hostname.toLowerCase();
      const textLower = text.toLowerCase();

      // Extract brand names from button text
      const brandNames = this.extractBrandNames(text);

      // Check if button text mentions a brand but URL goes elsewhere
      for (const brand of brandNames) {
        if (!hostname.includes(brand)) {
          signals.push(
            this.createSignal({
              signalType: 'button_text_mismatch',
              severity: 'high',
              confidence: 0.9,
              description: `Button text mentions "${brand}" but links to a different domain (${hostname})`,
              evidence: {
                buttonText: text,
                href,
                hostname,
                expectedBrand: brand,
              },
            })
          );
        }
      }

      // Check for generic phishing button text
      const phishingButtons = [
        'verify account',
        'confirm identity',
        'update payment',
        'claim reward',
        'click here to verify',
        'urgent action required',
        'secure your account',
        're-activate',
        'unlock account',
      ];

      for (const phishText of phishingButtons) {
        if (textLower.includes(phishText)) {
          signals.push(
            this.createSignal({
              signalType: 'button_text_mismatch',
              severity: 'high',
              confidence: 0.85,
              description: `Button uses common phishing language: "${text}"`,
              evidence: {
                buttonText: text,
                href,
                phishingPattern: phishText,
              },
            })
          );
          break;
        }
      }
    } catch {
      // Invalid URL, skip
    }

    return signals;
  }

  /**
   * Analyze URL for excessive tracking parameters
   */
  private analyzeTrackingParameters(href: string): AnalysisSignal[] {
    const signals: AnalysisSignal[] = [];

    try {
      const url = new Url(href, true);
      const query = url.query;

      // Count tracking parameters
      const trackingCount = TRACKING_PARAMS.filter((param) => param in query).length;

      if (trackingCount >= 3) {
        signals.push(
          this.createSignal({
            signalType: 'button_tracking_detected',
            severity: 'low',
            confidence: 0.6,
            description: `Button link contains ${trackingCount} tracking parameters`,
            evidence: {
              href,
              trackingCount,
              trackingParams: TRACKING_PARAMS.filter((param) => param in query),
            },
          })
        );
      }
    } catch {
      // Invalid URL, skip
    }

    return signals;
  }

  /**
   * Analyze form action for suspicious domains
   */
  private analyzeFormAction(formAction: string, buttonText: string): AnalysisSignal[] {
    const signals: AnalysisSignal[] = [];

    try {
      const url = new Url(formAction, true);
      const hostname = url.hostname.toLowerCase();

      // Check if form submits to suspicious TLD
      const suspiciousTlds = ['tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top'];
      const tld = hostname.split('.').pop();

      if (tld && suspiciousTlds.includes(tld)) {
        signals.push(
          this.createSignal({
            signalType: 'button_hidden_redirect',
            severity: 'high',
            confidence: 0.8,
            description: `Form submits to suspicious domain with TLD .${tld}`,
            evidence: {
              buttonText,
              formAction,
              hostname,
              tld,
            },
          })
        );
      }

      // Check if form uses HTTP instead of HTTPS
      if (url.protocol === 'http:') {
        signals.push(
          this.createSignal({
            signalType: 'button_hidden_redirect',
            severity: 'medium',
            confidence: 0.7,
            description: 'Form submits data over insecure HTTP connection',
            evidence: {
              buttonText,
              formAction,
              protocol: url.protocol,
            },
          })
        );
      }
    } catch {
      // Invalid URL, skip
    }

    return signals;
  }

  /**
   * Extract brand names from button text
   */
  private extractBrandNames(text: string): string[] {
    const brands: string[] = [];
    const commonBrands = [
      'paypal',
      'amazon',
      'apple',
      'microsoft',
      'google',
      'facebook',
      'netflix',
      'bank',
      'chase',
      'wells fargo',
      'citibank',
      'amex',
      'visa',
      'mastercard',
      'ebay',
      'linkedin',
      'twitter',
      'instagram',
    ];

    const textLower = text.toLowerCase();
    for (const brand of commonBrands) {
      if (textLower.includes(brand)) {
        brands.push(brand.replace(/\s+/g, '')); // Remove spaces for hostname matching
      }
    }

    return brands;
  }
}
