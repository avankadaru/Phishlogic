/**
 * Redirect Analyzer (Dynamic)
 * Detects suspicious redirects by visiting URLs with Playwright
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput, isUrlInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import type { Browser, Page } from 'playwright';
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
    return this.config.analysis.analyzerWeights.redirect; // Configurable from env (default: 1.5)
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

        // Check for malicious behaviors (drive-by downloads, script execution, etc.)
        const maliciousBehaviors = await this.detectMaliciousBehaviors(url);

        // Automatic downloads detected
        if (maliciousBehaviors.automaticDownload) {
          signals.push(
            this.createSignal({
              signalType: 'automatic_download_detected',
              severity: 'critical',
              confidence: 0.95,
              description:
                'Page attempts automatic file download without user interaction',
              evidence: {
                url,
                downloadUrl: maliciousBehaviors.downloadUrl,
                fileName: maliciousBehaviors.fileName,
              },
            })
          );
        }

        // Script execution detected
        if (maliciousBehaviors.scriptExecution) {
          signals.push(
            this.createSignal({
              signalType: 'script_execution_detected',
              severity: 'critical',
              confidence: 0.9,
              description: 'Page attempts to execute JavaScript code automatically',
              evidence: {
                url,
                scriptPatterns: maliciousBehaviors.scriptPatterns,
              },
            })
          );
        }

        // Installation prompt detected
        if (maliciousBehaviors.installationPrompt) {
          signals.push(
            this.createSignal({
              signalType: 'installation_prompt_detected',
              severity: 'high',
              confidence: 0.85,
              description: 'Page prompts for software installation',
              evidence: {
                url,
                promptText: maliciousBehaviors.promptText,
              },
            })
          );
        }

        // Suspicious JavaScript patterns
        if (maliciousBehaviors.suspiciousJavaScript) {
          signals.push(
            this.createSignal({
              signalType: 'suspicious_javascript_detected',
              severity: 'high',
              confidence: 0.8,
              description:
                'Page contains suspicious JavaScript patterns (file system access, memory manipulation)',
              evidence: {
                url,
                patterns: maliciousBehaviors.jsPatterns,
              },
            })
          );
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
   * Detect malicious behaviors on the page
   */
  private async detectMaliciousBehaviors(url: string): Promise<{
    automaticDownload: boolean;
    downloadUrl?: string;
    fileName?: string;
    scriptExecution: boolean;
    scriptPatterns?: string[];
    installationPrompt: boolean;
    promptText?: string;
    suspiciousJavaScript: boolean;
    jsPatterns?: string[];
  }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const result: {
      automaticDownload: boolean;
      downloadUrl?: string;
      fileName?: string;
      scriptExecution: boolean;
      scriptPatterns?: string[];
      installationPrompt: boolean;
      promptText?: string;
      suspiciousJavaScript: boolean;
      jsPatterns?: string[];
    } = {
      automaticDownload: false,
      scriptExecution: false,
      installationPrompt: false,
      suspiciousJavaScript: false,
    };

    try {
      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT,
      });

      // 1. Check for automatic downloads
      const downloadAttempted = await page.evaluate(() => {
        // Check for download-triggering elements
        const downloadLinks = document.querySelectorAll('a[download]');
        if (downloadLinks.length > 0) {
          return {
            detected: true,
            url: (downloadLinks[0] as HTMLAnchorElement).href,
            fileName: (downloadLinks[0] as HTMLAnchorElement).download,
          };
        }

        // Check for iframe downloads
        const iframes = document.querySelectorAll('iframe[src*="download"]');
        if (iframes.length > 0) {
          return {
            detected: true,
            url: (iframes[0] as HTMLIFrameElement).src,
          };
        }

        return { detected: false };
      });

      if (downloadAttempted.detected) {
        result.automaticDownload = true;
        result.downloadUrl = downloadAttempted.url;
        result.fileName = downloadAttempted.fileName;
      }

      // 2. Check for script execution patterns
      const scriptPatterns = await page.evaluate(() => {
        const patterns: string[] = [];
        const scripts = Array.from(document.scripts);

        scripts.forEach((script) => {
          const content = script.textContent || '';

          // Check for eval() usage (code injection)
          if (content.includes('eval(')) patterns.push('eval_detected');

          // Check for document.write() (DOM manipulation)
          if (content.includes('document.write')) patterns.push('document_write');

          // Check for automatic execution
          if (
            content.includes('window.onload') ||
            content.includes('DOMContentLoaded')
          ) {
            patterns.push('auto_execution');
          }
        });

        return patterns;
      });

      if (scriptPatterns.length > 0) {
        result.scriptExecution = true;
        result.scriptPatterns = scriptPatterns;
      }

      // 3. Check for installation prompts
      const installPrompt = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const installKeywords = [
          'install now',
          'download and install',
          'setup.exe',
          'install plugin',
          'install extension',
          'install software',
        ];

        for (const keyword of installKeywords) {
          if (bodyText.toLowerCase().includes(keyword)) {
            return { detected: true, text: keyword };
          }
        }
        return { detected: false };
      });

      if (installPrompt.detected) {
        result.installationPrompt = true;
        result.promptText = installPrompt.text;
      }

      // 4. Check for suspicious JavaScript (file system, memory access)
      const suspiciousJS = await page.evaluate(() => {
        const patterns: string[] = [];
        const scripts = Array.from(document.scripts);

        scripts.forEach((script) => {
          const content = script.textContent || '';

          // File system access attempts
          if (content.includes('FileReader') || content.includes('FileSystem')) {
            patterns.push('file_system_access');
          }

          // Local storage manipulation
          if (content.includes('localStorage') && content.includes('setItem')) {
            patterns.push('local_storage_manipulation');
          }

          // Buffer/memory manipulation
          if (content.includes('ArrayBuffer') || content.includes('SharedArrayBuffer')) {
            patterns.push('memory_manipulation');
          }

          // WebAssembly (can be used for obfuscation)
          if (content.includes('WebAssembly')) {
            patterns.push('webassembly_detected');
          }
        });

        return patterns;
      });

      if (suspiciousJS.length > 0) {
        result.suspiciousJavaScript = true;
        result.jsPatterns = suspiciousJS;
      }
    } catch (error) {
      logger.warn({
        msg: 'Failed to detect malicious behaviors',
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
      await context.close();
    }

    return result;
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
