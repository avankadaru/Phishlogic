/**
 * Form Analyzer (Dynamic)
 * Detects forms that collect sensitive information (potential phishing)
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput, isUrlInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import type { Browser, BrowserContext, Page } from 'playwright';
import { getBrowserPool } from '../../../infrastructure/browser/browser-pool.js';
import { loginPageDetectionService } from '../../services/login-page-detection.service.js';

const logger = getLogger();

/**
 * Timeout for page navigation (milliseconds)
 */
const NAVIGATION_TIMEOUT = 10000;

/**
 * Sensitive field types that indicate potential phishing
 */
const SENSITIVE_FIELD_PATTERNS = {
  password: /password|passwd|pwd/i,
  email: /email|e-mail|mail/i,
  credit_card: /card|cc|cvv|cardnumber|credit/i,
  ssn: /ssn|social.?security/i,
  pin: /pin|pincode/i,
  account: /account|acct/i,
  username: /username|user|login/i,
};

/**
 * Form Analyzer
 */
export class FormAnalyzer extends BaseAnalyzer {
  protected browser: Browser | null = null;

  getName(): string {
    return 'FormAnalyzer';
  }

  getWeight(): number {
    return this.config.analysis.analyzerWeights.form; // Configurable from env (default: 1.7)
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
      let page: Page | undefined;
      let context: BrowserContext | undefined;

      try {
        const formInfo = await this.checkForms(url);
        page = formInfo.page;
        context = formInfo.context;

        if (formInfo.hasSensitiveForms) {
          const fieldTypes = formInfo.sensitiveFields.map((f) => f.type);

          // Critical: Password + credit card/SSN (financial fraud)
          if (
            fieldTypes.includes('password') &&
            (fieldTypes.includes('credit_card') || fieldTypes.includes('ssn'))
          ) {
            signals.push(
              this.createSignal({
                signalType: 'form_detected',
                severity: 'critical',
                confidence: 0.95,
                description:
                  'Page contains a form requesting highly sensitive information (password and financial data)',
                evidence: {
                  url,
                  formCount: formInfo.formCount,
                  sensitiveFields: formInfo.sensitiveFields,
                },
              })
            );
          }
          // Detect if this is a legitimate login page using sophisticated detection
          else if (fieldTypes.includes('password')) {
            // Use page reuse optimization - no double navigation
            const loginDetection = await this.detectLoginPageWithPage(page, url, formInfo);

            // Only generate signal if login page detected with sufficient confidence
            if (loginDetection.isLoginPage && loginDetection.confidence >= 0.4) {
              let severity: 'low' | 'medium' | 'high' = 'medium';
              let baseConfidence = loginDetection.confidence;

              // Low: OAuth providers detected (likely legitimate)
              if (loginDetection.evidence.oauthProviders.length > 0) {
                severity = 'low';
                baseConfidence = loginDetection.confidence * 0.5; // Reduce confidence
              }
              // Medium: Standard login form
              else if (fieldTypes.includes('email')) {
                severity = 'medium';
                baseConfidence = loginDetection.confidence * 0.85;
              }

              signals.push(
                this.createSignal({
                  signalType: 'form_detected',
                  severity,
                  confidence: Math.min(baseConfidence, 1.0),
                  description: `Login page detected (confidence: ${(loginDetection.confidence * 100).toFixed(0)}%)`,
                  evidence: {
                    url,
                    formCount: formInfo.formCount,
                    sensitiveFields: formInfo.sensitiveFields,
                    loginDetection: {
                      confidence: loginDetection.confidence,
                      keywords: loginDetection.evidence.keywords,
                      oauthProviders: loginDetection.evidence.oauthProviders,
                      hasMobileInput: loginDetection.evidence.hasMobileInput,
                    },
                  },
                })
              );
            } else {
              // No login detection - treat as generic password form
              signals.push(
                this.createSignal({
                  signalType: 'form_detected',
                  severity: 'medium',
                  confidence: 0.75,
                  description: 'Page contains a form requesting password',
                  evidence: {
                    url,
                    formCount: formInfo.formCount,
                    sensitiveFields: formInfo.sensitiveFields,
                  },
                })
              );
            }
          }
          // Medium: Credit card (no password)
          else if (fieldTypes.includes('credit_card')) {
            signals.push(
              this.createSignal({
                signalType: 'form_detected',
                severity: 'medium',
                confidence: 0.8,
                description: 'Page contains a form requesting credit card information',
                evidence: {
                  url,
                  formCount: formInfo.formCount,
                  sensitiveFields: formInfo.sensitiveFields,
                },
              })
            );
          }
          // Low: Other sensitive fields
          else {
            signals.push(
              this.createSignal({
                signalType: 'form_detected',
                severity: 'low',
                confidence: 0.6,
                description: 'Page contains a form requesting personal information',
                evidence: {
                  url,
                  formCount: formInfo.formCount,
                  sensitiveFields: formInfo.sensitiveFields,
                },
              })
            );
          }
        }
      } catch (error) {
        logger.warn({
          msg: 'Failed to check forms',
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next URL
      } finally {
        // Clean up page and context
        if (page) {
          await page.close().catch(() => {
            // Ignore cleanup errors
          });
        }
        if (context) {
          await context.close().catch(() => {
            // Ignore cleanup errors
          });
        }
      }
    }

    return signals;
  }

  /**
   * Check forms on a page
   * Returns page and context for reuse - caller must close them
   */
  private async checkForms(url: string): Promise<{
    hasSensitiveForms: boolean;
    formCount: number;
    sensitiveFields: Array<{ type: string; name: string; label?: string }>;
    page: Page;
    context: BrowserContext;
  }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Navigate to URL
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT,
    });

    // Find all forms
    const forms = await page.$$('form');
    const formCount = forms.length;

    // Analyze input fields in all forms
    const sensitiveFields: Array<{ type: string; name: string; label?: string }> = [];

    for (const form of forms) {
      const inputs = await form.$$('input, textarea, select');

      for (const input of inputs) {
        const inputType = (await input.getAttribute('type')) ?? 'text';
        const inputName = (await input.getAttribute('name')) ?? '';
        const inputId = (await input.getAttribute('id')) ?? '';
        const inputPlaceholder = (await input.getAttribute('placeholder')) ?? '';

        // Try to find associated label
        let label = '';
        try {
          const labelElement = await form.$(`label[for="${inputId}"]`);
          if (labelElement) {
            label = (await labelElement.textContent()) ?? '';
          }
        } catch {
          // Label not found
        }

        // Check against sensitive patterns
        const combinedText = `${inputType} ${inputName} ${inputId} ${inputPlaceholder} ${label}`;

        for (const [fieldType, pattern] of Object.entries(SENSITIVE_FIELD_PATTERNS)) {
          if (pattern.test(combinedText)) {
            sensitiveFields.push({
              type: fieldType,
              name: inputName || inputId || inputPlaceholder,
              label: label || undefined,
            });
            break; // Only count each field once
          }
        }
      }
    }

    return {
      hasSensitiveForms: sensitiveFields.length > 0,
      formCount,
      sensitiveFields,
      page,
      context,
    };
  }

  /**
   * Detect login page using existing Playwright page (no re-navigation)
   * Uses smart wait strategy for dynamic content (embedded forms, iframes, etc.)
   */
  private async detectLoginPageWithPage(
    page: Page,
    url: string,
    _formInfo: {
      hasSensitiveForms: boolean;
      formCount: number;
      sensitiveFields: Array<{ type: string; name: string; label?: string }>;
    }
  ) {
    try {
      // Use smart wait detection service - handles dynamic content automatically
      const result = await loginPageDetectionService.detectAuthPageWithWait(page, undefined, {
        maxWaitMs: 2500,
        fastCheckMs: 400,
        enableSmartWait: true
      });

      logger.debug({
        msg: 'Login detection completed (page reuse)',
        url,
        isLoginPage: result.isLoginPage,
        authType: result.authType,
        score: result.score,
        confidence: result.confidence,
        waitPhase: result.waitPhase,
      });

      return {
        isLoginPage: result.isLoginPage,
        authType: result.authType,
        confidence: result.confidence,
        evidence: result.evidence,
      };
    } catch (error) {
      logger.warn({
        msg: 'Login detection failed',
        url,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isLoginPage: false,
        authType: 'UNKNOWN',
        confidence: 0,
        evidence: {
          keywords: [],
          oauthProviders: [],
          ssoProviders: [],
          hasMobileInput: false,
          hasPasswordField: false,
          hasEmailField: false,
          hasMFA: false,
          hasCaptcha: false,
          hasCSRF: false,
          detectionMethod: [],
        },
      };
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
   * Get or create browser instance via the shared pool.
   */
  protected async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await getBrowserPool().getBrowser('FormAnalyzer');
    }
    return this.browser;
  }

  /**
   * Clear the cached pool reference; the pool owns the actual browser.
   */
  async cleanup(): Promise<void> {
    this.browser = null;
    logger.debug({ msg: 'FormAnalyzer browser reference cleared' });
  }
}
