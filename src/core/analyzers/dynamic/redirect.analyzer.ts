/**
 * Redirect Analyzer (Dynamic)
 * Detects suspicious redirects by visiting URLs with Playwright
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput, isUrlInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import type { Browser } from 'playwright';
import { chromium } from 'playwright';

const logger = getLogger();

/**
 * Maximum number of redirects to follow
 */
const MAX_REDIRECTS = 5;

/**
 * Timeout for page navigation (milliseconds)
 */
const NAVIGATION_TIMEOUT = 10000;

/**
 * Redirect Analyzer
 */
export class RedirectAnalyzer extends BaseAnalyzer {
  private browser: Browser | null = null;

  getName(): string {
    return 'RedirectAnalyzer';
  }

  getWeight(): number {
    return 1.3;
  }

  getType(): 'static' | 'dynamic' {
    return 'dynamic';
  }

  override isApplicable(input: NormalizedInput): boolean {
    // Applicable to both URL and Email inputs with URLs
    if (isUrlInput(input)) {
      return true;
    }
    if (isEmailInput(input)) {
      return (input.data.parsed.urls?.length ?? 0) > 0;
    }
    return false;
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];
    const urls = this.extractUrls(input);

    for (const url of urls) {
      try {
        const redirectInfo = await this.checkRedirects(url);

        if (redirectInfo.redirectCount > 0) {
          // Multiple redirects can be suspicious
          if (redirectInfo.redirectCount >= 3) {
            signals.push(
              this.createSignal({
                signalType: 'suspicious_redirect',
                severity: 'high',
                confidence: 0.8,
                description: `URL redirects ${redirectInfo.redirectCount} times before reaching final destination - may be hiding malicious site`,
                evidence: {
                  originalUrl: url,
                  finalUrl: redirectInfo.finalUrl,
                  redirectCount: redirectInfo.redirectCount,
                  redirectChain: redirectInfo.redirectChain,
                },
              })
            );
          } else if (redirectInfo.redirectCount > 0) {
            signals.push(
              this.createSignal({
                signalType: 'suspicious_redirect',
                severity: 'medium',
                confidence: 0.6,
                description: `URL redirects ${redirectInfo.redirectCount} time(s) to another site`,
                evidence: {
                  originalUrl: url,
                  finalUrl: redirectInfo.finalUrl,
                  redirectCount: redirectInfo.redirectCount,
                  redirectChain: redirectInfo.redirectChain,
                },
              })
            );
          }

          // Check if final domain differs from original
          if (redirectInfo.domainChanged) {
            signals.push(
              this.createSignal({
                signalType: 'suspicious_redirect',
                severity: 'medium',
                confidence: 0.7,
                description: 'URL redirects to a different domain than the one shown',
                evidence: {
                  originalUrl: url,
                  originalDomain: redirectInfo.originalDomain,
                  finalUrl: redirectInfo.finalUrl,
                  finalDomain: redirectInfo.finalDomain,
                },
              })
            );
          }
        }
      } catch (error) {
        logger.warn({
          msg: 'Failed to check redirects',
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next URL
      }
    }

    return signals;
  }

  /**
   * Check redirects for a URL
   */
  private async checkRedirects(url: string): Promise<{
    redirectCount: number;
    finalUrl: string;
    redirectChain: string[];
    originalDomain: string;
    finalDomain: string;
    domainChanged: boolean;
  }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const redirectChain: string[] = [url];
    let redirectCount = 0;

    try {
      // Track navigation events
      page.on('response', (response) => {
        const status = response.status();
        if (status >= 300 && status < 400) {
          redirectCount++;
          const location = response.headers()['location'];
          if (location && redirectCount < MAX_REDIRECTS) {
            redirectChain.push(location);
          }
        }
      });

      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT,
      });

      const finalUrl = page.url();
      redirectChain.push(finalUrl);

      const originalDomain = this.extractDomain(url);
      const finalDomain = this.extractDomain(finalUrl);
      const domainChanged = originalDomain !== finalDomain;

      return {
        redirectCount,
        finalUrl,
        redirectChain,
        originalDomain,
        finalDomain,
        domainChanged,
      };
    } finally {
      await page.close();
      await context.close();
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /**
   * Extract URLs from input
   */
  private extractUrls(input: NormalizedInput): string[] {
    if (isUrlInput(input)) {
      return [input.data.url];
    }
    if (isEmailInput(input)) {
      return input.data.parsed.urls ?? [];
    }
    return [];
  }

  /**
   * Get or create browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      logger.info('Playwright browser launched for RedirectAnalyzer');
    }
    return this.browser;
  }

  /**
   * Close browser (cleanup)
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Playwright browser closed for RedirectAnalyzer');
    }
  }
}
