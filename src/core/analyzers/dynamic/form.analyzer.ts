/**
 * Form Analyzer (Dynamic)
 * Detects forms that collect sensitive information (potential phishing)
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
  private browser: Browser | null = null;

  getName(): string {
    return 'FormAnalyzer';
  }

  getWeight(): number {
    return 1.8;
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
        const formInfo = await this.checkForms(url);

        if (formInfo.hasSensitiveForms) {
          const fieldTypes = formInfo.sensitiveFields.map((f) => f.type);

          // Critical: Password + credit card
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
          // High: Password + email (typical login phishing)
          else if (fieldTypes.includes('password') && fieldTypes.includes('email')) {
            signals.push(
              this.createSignal({
                signalType: 'form_detected',
                severity: 'high',
                confidence: 0.85,
                description: 'Page contains a login form requesting password and email',
                evidence: {
                  url,
                  formCount: formInfo.formCount,
                  sensitiveFields: formInfo.sensitiveFields,
                },
              })
            );
          }
          // Medium: Any password field
          else if (fieldTypes.includes('password')) {
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
          // Medium: Credit card
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
      }
    }

    return signals;
  }

  /**
   * Check forms on a page
   */
  private async checkForms(url: string): Promise<{
    hasSensitiveForms: boolean;
    formCount: number;
    sensitiveFields: Array<{ type: string; name: string; label?: string }>;
  }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
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
      };
    } finally {
      await page.close();
      await context.close();
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

      logger.info('Playwright browser launched for FormAnalyzer');
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
      logger.info('Playwright browser closed for FormAnalyzer');
    }
  }
}
