/**
 * Login Page Detection Service
 *
 * Comprehensive authentication page detection using 12 parallel detectors:
 * - URL pattern analysis - Form field analysis (password, email fields)
 * - Keyword detection (sign in, login, register, forgot password)
 * - OAuth provider buttons (Google, Facebook, GitHub, etc.)
 * - SSO provider detection (Okta, Auth0, Azure AD, etc.)
 * - Mobile number login detection
 * - Page context analysis (titles, headings)
 * - MFA/OTP detection
 * - CAPTCHA detection
 * - CSRF protection detection
 * - Shadow DOM scanning
 * - iframe auth provider detection
 * - Hidden form detection
 *
 * Returns weighted score and auth type classification (LOGIN, OAUTH, SSO, MFA).
 *
 * Design: SOLID principles - detector classes for extensibility.
 */

import { Page } from 'playwright';
import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();

export type AuthType = 'LOGIN' | 'OAUTH' | 'SSO' | 'MFA' | 'UNKNOWN';

export interface AuthSignal {
  type: string;
  weight: number;
  source?: string;
}

export interface LoginPageDetectionResult {
  isLoginPage: boolean; // backward compatibility (same as isAuthPage)
  isAuthPage?: boolean; // alias for isLoginPage
  authType: AuthType;
  confidence: number; // 0.0-1.0 (normalized score)
  score: number; // raw weighted score
  signals: AuthSignal[];
  indicators: LoginPageIndicator[]; // backward compatibility
  evidence: {
    keywords: string[];
    oauthProviders: string[];
    ssoProviders: string[];
    hasMobileInput: boolean;
    hasPasswordField: boolean;
    hasEmailField: boolean;
    hasMFA: boolean;
    hasCaptcha: boolean;
    hasCSRF: boolean;
    detectionMethod: string[];
  };
  timingMs?: number;
}

export interface LoginPageIndicator {
  type: 'keyword' | 'oauth_provider' | 'mobile_input' | 'form_field' | 'page_context';
  weight: number; // Contribution to confidence score
  detected: boolean;
  value?: string; // What was detected
}

// Detector interface (Dependency Inversion Principle)
interface AuthDetector {
  detect(page: Page, url: string, html?: string): Promise<AuthSignal[]>;
}

// URL Pattern Detector (Single Responsibility)
class URLPatternDetector implements AuthDetector {
  async detect(_page: Page, url: string): Promise<AuthSignal[]> {
    const patterns = ['login', 'signin', 'auth', 'session', 'password', 'account/login', 'authenticate'];
    const signals: AuthSignal[] = [];

    for (const pattern of patterns) {
      if (url.includes(pattern)) {
        signals.push({ type: 'url_login_pattern', weight: 2, source: 'url' });
        break; // Only count once
      }
    }

    return signals;
  }
}

// OAuth Flow Detector
class OAuthDetector implements AuthDetector {
  async detect(_page: Page, url: string): Promise<AuthSignal[]> {
    const oauthParams = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'code_challenge'];
    const signals: AuthSignal[] = [];

    for (const param of oauthParams) {
      if (url.includes(param)) {
        signals.push({ type: 'oauth_flow', weight: 3, source: 'url' });
        break; // Only count once
      }
    }

    return signals;
  }
}

// SSO Provider Detector
class SSOProviderDetector implements AuthDetector {
  private readonly ssoProviders = [
    'okta', 'auth0', 'onelogin', 'pingidentity', 'adfs', 'saml',
    'login.microsoftonline', 'accounts.google', 'idp'
  ];

  async detect(_page: Page, url: string): Promise<AuthSignal[]> {
    const signals: AuthSignal[] = [];

    for (const provider of this.ssoProviders) {
      if (url.includes(provider)) {
        signals.push({ type: 'sso_provider', weight: 4, source: provider });
        break; // Only count once
      }
    }

    return signals;
  }
}

// DOM Form Detector
class DOMFormDetector implements AuthDetector {
  async detect(page: Page): Promise<AuthSignal[]> {
    try {
      return await page.evaluate(() => {
        const signals: any[] = [];

        if (document.querySelector('input[type="password"]')) {
          signals.push({ type: 'password_input', weight: 5, source: 'dom' });
        }

        if (document.querySelector('input[type="email"],input[name*="user"],input[name*="email"]')) {
          signals.push({ type: 'user_identifier', weight: 2, source: 'dom' });
        }

        const buttons = [...document.querySelectorAll('button,input[type="submit"]')];
        const loginBtn = buttons.find(b => {
          const text = ((b as HTMLElement).innerText || (b as HTMLInputElement).value || '').toLowerCase();
          return text.includes('login') || text.includes('sign in');
        });

        if (loginBtn) {
          signals.push({ type: 'login_button', weight: 1, source: 'dom' });
        }

        return signals;
      });
    } catch (error) {
      return [];
    }
  }
}

// MFA Detector
class MFADetector implements AuthDetector {
  async detect(page: Page): Promise<AuthSignal[]> {
    try {
      return await page.evaluate(() => {
        const signals: any[] = [];

        if (document.querySelector('input[name*="otp"],input[name*="code"],input[name*="token"]')) {
          signals.push({ type: 'mfa_input', weight: 4, source: 'dom' });
        }

        const text = document.body.innerText.toLowerCase();
        if (text.includes('verification code') || text.includes('two-factor') || text.includes('2fa')) {
          signals.push({ type: 'mfa_text', weight: 3, source: 'dom' });
        }

        return signals;
      });
    } catch (error) {
      return [];
    }
  }
}

// CAPTCHA Detector
class CaptchaDetector implements AuthDetector {
  async detect(page: Page): Promise<AuthSignal[]> {
    try {
      return await page.evaluate(() => {
        const signals: any[] = [];

        if (document.querySelector('iframe[src*="captcha"]') ||
            document.querySelector('.g-recaptcha,iframe[src*="recaptcha"],#captcha')) {
          signals.push({ type: 'captcha_widget', weight: 3, source: 'dom' });
        }

        return signals;
      });
    } catch (error) {
      return [];
    }
  }
}

// CSRF Protection Detector
class CSRFDetector implements AuthDetector {
  async detect(page: Page): Promise<AuthSignal[]> {
    try {
      return await page.evaluate(() => {
        const signals: any[] = [];

        if (document.querySelector('input[name*="csrf"]') ||
            document.querySelector('input[name="authenticity_token"]')) {
          signals.push({ type: 'csrf_protection', weight: 2, source: 'dom' });
        }

        return signals;
      });
    } catch (error) {
      return [];
    }
  }
}

// Shadow DOM Detector
class ShadowDOMDetector implements AuthDetector {
  async detect(page: Page): Promise<AuthSignal[]> {
    try {
      return await page.evaluate(() => {
        const signals: any[] = [];
        const elements = document.querySelectorAll('*');

        for (const el of elements) {
          if ((el as any).shadowRoot) {
            if ((el as any).shadowRoot.querySelector('input[type="password"]')) {
              signals.push({ type: 'shadow_dom_password', weight: 5, source: 'shadow_dom' });
              break;
            }
          }
        }

        return signals;
      });
    } catch (error) {
      return [];
    }
  }
}

// iframe Auth Provider Detector
class IframeAuthDetector implements AuthDetector {
  async detect(page: Page): Promise<AuthSignal[]> {
    try {
      return await page.evaluate(() => {
        const signals: any[] = [];
        const iframes = [...document.querySelectorAll('iframe')];

        for (const frame of iframes) {
          const src = (frame.src || '').toLowerCase();
          if (src.includes('login') || src.includes('auth') ||
              src.includes('accounts.google') || src.includes('microsoft')) {
            signals.push({ type: 'iframe_auth_provider', weight: 3, source: 'iframe' });
            break;
          }
        }

        return signals;
      });
    } catch (error) {
      return [];
    }
  }
}

// Hidden Form Detector
class HiddenFormDetector implements AuthDetector {
  async detect(page: Page): Promise<AuthSignal[]> {
    try {
      return await page.evaluate(() => {
        const signals: any[] = [];
        const forms = [...document.querySelectorAll('form')];

        for (const form of forms) {
          const hidden = window.getComputedStyle(form).display === 'none';
          if (hidden && form.querySelector('input[type="password"]')) {
            signals.push({ type: 'hidden_login_form', weight: 3, source: 'dom' });
            break;
          }
        }

        return signals;
      });
    } catch (error) {
      return [];
    }
  }
}

// Pre-render HTML Detector
class PreRenderHTMLDetector implements AuthDetector {
  async detect(_page: Page, _url: string, html?: string): Promise<AuthSignal[]> {
    if (!html) return [];

    const signals: AuthSignal[] = [];

    if (/<input[^>]+type=["']password["']/i.test(html)) {
      signals.push({ type: 'password_input_html', weight: 4, source: 'html' });
    }

    if (/sign\s?in|log\s?in/i.test(html)) {
      signals.push({ type: 'login_text_html', weight: 1, source: 'html' });
    }

    if (/forgot\s+password/i.test(html)) {
      signals.push({ type: 'forgot_password', weight: 1, source: 'html' });
    }

    return signals;
  }
}

// SPA Route Detector
class SPARouteDetector implements AuthDetector {
  async detect(_page: Page, url: string): Promise<AuthSignal[]> {
    const routes = ['/login', '/signin', '/auth', '/account', '/session'];
    const signals: AuthSignal[] = [];

    for (const route of routes) {
      if (url.includes(route)) {
        signals.push({ type: 'spa_login_route', weight: 2, source: 'url' });
        break;
      }
    }

    return signals;
  }
}

export class LoginPageDetectionService {
  private detectors: AuthDetector[];

  constructor() {
    // Initialize all detectors (Open/Closed Principle)
    this.detectors = [
      new URLPatternDetector(),
      new OAuthDetector(),
      new SSOProviderDetector(),
      new DOMFormDetector(),
      new MFADetector(),
      new CaptchaDetector(),
      new CSRFDetector(),
      new ShadowDOMDetector(),
      new IframeAuthDetector(),
      new HiddenFormDetector(),
      new PreRenderHTMLDetector(),
      new SPARouteDetector(),
    ];
  }

  /**
   * Comprehensive authentication page detection using 12 parallel detectors
   *
   * NOTE: This method does NOT wait for dynamic content. For pages with
   * JavaScript-rendered forms, use detectAuthPageWithWait() instead.
   *
   * @param page - Playwright Page object for dynamic detection
   * @param html - Optional pre-rendered HTML for static analysis
   * @returns Detection result with auth type, score, and evidence
   */
  async detectAuthPage(page: Page, html?: string): Promise<LoginPageDetectionResult> {
    const url = page.url().toLowerCase();

    // Use measureTime utility (follows pattern from execution-strategy.ts)
    const { result, durationMs } = await this.measureTime(async () => {
      // Run all detectors in parallel (Interface Segregation)
      const signalArrays = await Promise.all(
        this.detectors.map((detector) =>
          detector.detect(page, url, html).catch((error) => {
            logger.warn({
              msg: 'Detector failed',
              detector: detector.constructor.name,
              error: error instanceof Error ? error.message : String(error),
            });
            return [];
          })
        )
      );

      // Flatten and score
      const signals = signalArrays.flat();
      const score = signals.reduce((sum, s) => sum + s.weight, 0);

      // Classify auth type (as specified by user)
      const authType = this.classifyAuth(signals);

      // Build evidence object
      const evidence = this.buildEvidence(signals);

      const isAuthPage = score >= 5;
      return {
        isLoginPage: isAuthPage, // backward compatibility
        isAuthPage,
        authType,
        score,
        signals,
        confidence: Math.min(score / 20, 1.0), // Normalize to 0-1
        indicators: this.convertToIndicators(signals), // backward compatibility
        evidence,
      };
    });

    logger.info({
      msg: 'Auth detection completed',
      url,
      isAuthPage: result.isAuthPage,
      authType: result.authType,
      score: result.score,
      signalCount: result.signals.length,
      timingMs: durationMs,
    });

    // Return result with timing
    return { ...result, timingMs: durationMs };
  }

  /**
   * Detect authentication page with smart waiting for dynamic content
   *
   * Three-tier strategy:
   * - Tier 1 (0-500ms): Fast check for immediately visible auth elements
   * - Tier 2 (500-3000ms): Wait for JavaScript-rendered content
   * - Tier 3 (3000ms+): Proceed with detection regardless
   *
   * @param page - Playwright Page object for dynamic detection
   * @param html - Optional pre-rendered HTML for static analysis
   * @param options - Configuration options for wait strategy
   * @returns Detection result with auth type, score, evidence, and wait phase
   */
  async detectAuthPageWithWait(
    page: Page,
    html?: string,
    options?: {
      maxWaitMs?: number;      // Default: 3000ms
      fastCheckMs?: number;    // Default: 500ms
      enableSmartWait?: boolean; // Default: true
    }
  ): Promise<LoginPageDetectionResult & { waitPhase: 'fast' | 'dynamic' | 'timeout' }> {
    const config = {
      maxWaitMs: options?.maxWaitMs ?? 3000,
      fastCheckMs: options?.fastCheckMs ?? 500,
      enableSmartWait: options?.enableSmartWait ?? true,
    };

    const startTime = Date.now();
    let waitPhase: 'fast' | 'dynamic' | 'timeout' = 'fast';

    try {
      if (config.enableSmartWait) {
        logger.debug({
          msg: 'Starting smart wait for auth indicators',
          url: page.url(),
          maxWaitMs: config.maxWaitMs,
        });

        // Tier 1: Fast path - check if auth elements visible immediately
        const fastCheckPromise = page.waitForSelector(
          'input[type="password"], form[action*="login"], form[action*="signin"], iframe[src*="auth"], iframe[src*="login"]',
          { timeout: config.fastCheckMs, state: 'attached' }
        );
        const fastCheckTimeout = new Promise((resolve) =>
          setTimeout(() => resolve(null), config.fastCheckMs)
        );
        const fastResult = await Promise.race([fastCheckPromise, fastCheckTimeout]);

        if (fastResult) {
          waitPhase = 'fast';
          logger.info({
            msg: 'Auth indicators found (fast path)',
            url: page.url(),
            waitMs: Date.now() - startTime,
          });
        } else {
          // Tier 2: Dynamic wait - wait longer for JavaScript-rendered content
          waitPhase = 'dynamic';
          const remainingWaitMs = config.maxWaitMs - (Date.now() - startTime);

          if (remainingWaitMs > 0) {
            logger.debug({
              msg: 'Fast path timeout - waiting for dynamic content',
              url: page.url(),
              remainingMs: remainingWaitMs,
            });

            const dynamicCheckPromise = page.waitForSelector(
              'input[type="password"], input[type="email"], input[name*="user"], input[name*="login"], form, iframe',
              { timeout: remainingWaitMs, state: 'attached' }
            );
            const dynamicCheckTimeout = new Promise((resolve) =>
              setTimeout(() => resolve(null), remainingWaitMs)
            );
            const dynamicResult = await Promise.race([dynamicCheckPromise, dynamicCheckTimeout]);

            if (dynamicResult) {
              logger.info({
                msg: 'Auth indicators found (dynamic wait)',
                url: page.url(),
                waitMs: Date.now() - startTime,
              });
            } else {
              // Tier 3: Timeout - proceed anyway
              waitPhase = 'timeout';
              logger.debug({
                msg: 'Dynamic wait timeout - proceeding with detection',
                url: page.url(),
                waitMs: Date.now() - startTime,
              });
            }
          }
        }

        // Small additional delay for Shadow DOM and delayed iframes to settle
        if (waitPhase !== 'timeout') {
          await page.waitForTimeout(200);
        }
      }

      // Run detection with timing
      const detectionStart = Date.now();
      const result = await this.detectAuthPage(page, html);
      const detectionDuration = Date.now() - detectionStart;
      const totalWaitMs = Date.now() - startTime;

      logger.info({
        msg: 'Auth detection with wait completed',
        url: page.url(),
        waitPhase,
        totalWaitMs,
        detectionMs: detectionDuration,
        isAuthPage: result.isAuthPage,
        authType: result.authType,
        score: result.score,
      });

      return {
        ...result,
        waitPhase,
        timingMs: detectionDuration,
      };
    } catch (error) {
      const totalWaitMs = Date.now() - startTime;
      logger.warn({
        msg: 'Smart wait failed - falling back to immediate detection',
        url: page.url(),
        waitMs: totalWaitMs,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to immediate detection
      const result = await this.detectAuthPage(page, html);
      return {
        ...result,
        waitPhase: 'timeout',
      };
    }
  }

  /**
   * Measure execution time (follows pattern from execution-strategy.ts)
   */
  private async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const startTime = Date.now();
    const result = await fn();
    const durationMs = Date.now() - startTime;
    return { result, durationMs };
  }

  /**
   * Classify authentication type based on detected signals
   */
  private classifyAuth(signals: AuthSignal[]): AuthType {
    if (signals.some((s) => s.type === 'oauth_flow')) return 'OAUTH';
    if (signals.some((s) => s.type === 'sso_provider')) return 'SSO';
    if (signals.some((s) => s.type === 'mfa_input' || s.type === 'mfa_text')) return 'MFA';
    if (signals.some((s) => s.type.includes('password'))) return 'LOGIN';
    return 'LOGIN';
  }

  /**
   * Build evidence object from signals
   */
  private buildEvidence(signals: AuthSignal[]): LoginPageDetectionResult['evidence'] {
    return {
      keywords: signals.filter((s) => s.source === 'url' && s.type.includes('login')).map((s) => s.type),
      oauthProviders: signals.filter((s) => s.type === 'oauth_flow').map((s) => s.source || 'oauth'),
      ssoProviders: signals.filter((s) => s.type === 'sso_provider').map((s) => s.source || 'sso'),
      hasPasswordField: signals.some((s) => s.type.includes('password')),
      hasEmailField: signals.some((s) => s.type === 'user_identifier'),
      hasMobileInput: signals.some((s) => s.type === 'mobile_input'),
      hasMFA: signals.some((s) => s.type.includes('mfa')),
      hasCaptcha: signals.some((s) => s.type.includes('captcha')),
      hasCSRF: signals.some((s) => s.type.includes('csrf')),
      detectionMethod: [...new Set(signals.map((s) => s.source).filter(Boolean))] as string[],
    };
  }

  /**
   * Convert new signals format to old indicators format (backward compatibility)
   */
  private convertToIndicators(signals: AuthSignal[]): LoginPageIndicator[] {
    return signals.map((signal) => ({
      type: this.mapSignalTypeToIndicatorType(signal.type),
      weight: signal.weight / 10, // Normalize to old scale
      detected: true,
      value: signal.source,
    }));
  }

  /**
   * Map new signal types to old indicator types
   */
  private mapSignalTypeToIndicatorType(signalType: string): LoginPageIndicator['type'] {
    if (signalType.includes('oauth')) return 'oauth_provider';
    if (signalType.includes('password') || signalType.includes('user')) return 'form_field';
    if (signalType.includes('mobile') || signalType.includes('mfa')) return 'mobile_input';
    if (signalType.includes('url') || signalType.includes('text')) return 'keyword';
    return 'page_context';
  }

  // Login-related keywords with weights (old method compatibility)
  private readonly LOGIN_KEYWORDS: Record<string, number> = {
    // Primary login keywords (high weight)
    'sign in': 0.3,
    'log in': 0.3,
    'login': 0.25,
    'signin': 0.25,
    'log-in': 0.25,

    // Secondary keywords (medium weight)
    'forgot password': 0.15,
    'reset password': 0.15,
    'remember me': 0.1,

    // Registration keywords (lower weight - indicates auth page)
    'sign up': 0.1,
    'register': 0.1,
    'create account': 0.1,
    'new account': 0.1,
  };

  // OAuth provider patterns (high confidence indicators)
  private readonly OAUTH_PROVIDERS: Record<string, string[]> = {
    google: [
      'sign in with google',
      'login with google',
      'continue with google',
      'google login',
    ],
    facebook: [
      'sign in with facebook',
      'login with facebook',
      'continue with facebook',
      'facebook login',
    ],
    microsoft: [
      'sign in with microsoft',
      'login with microsoft',
      'microsoft account',
      'azure ad',
    ],
    apple: ['sign in with apple', 'continue with apple', 'apple id'],
    github: ['sign in with github', 'login with github', 'github login'],
    linkedin: ['sign in with linkedin', 'linkedin login'],
    twitter: ['sign in with twitter', 'twitter login', 'sign in with x'],
  };

  // Mobile login patterns
  private readonly MOBILE_LOGIN_KEYWORDS: string[] = [
    'mobile number',
    'phone number',
    'sms code',
    'otp',
    'verification code',
    'enter your phone',
    'mobile login',
    'phone login',
  ];

  /**
   * Detect if page is a login page with confidence scoring
   *
   * @param pageContent - HTML content and extracted text from page
   * @param formFields - Detected form fields (password, email, etc.)
   * @returns Detection result with confidence score and evidence
   */
  detectLoginPage(pageContent: {
    bodyText: string;
    title: string;
    buttons: string[];
    links: string[];
    headings: string[];
    formFields: { hasPassword: boolean; hasEmail: boolean; hasMobile: boolean };
  }): LoginPageDetectionResult {
    const indicators: LoginPageIndicator[] = [];
    let totalConfidence = 0;

    // Normalize text for case-insensitive matching
    const normalizedText = pageContent.bodyText.toLowerCase();
    const normalizedTitle = pageContent.title.toLowerCase();
    const normalizedButtons = pageContent.buttons.map((b) => b.toLowerCase());
    const normalizedLinks = pageContent.links.map((l) => l.toLowerCase());
    const normalizedHeadings = pageContent.headings.map((h) => h.toLowerCase());

    const combinedText = [
      normalizedText,
      normalizedTitle,
      ...normalizedButtons,
      ...normalizedLinks,
      ...normalizedHeadings,
    ].join(' ');

    const detectedKeywords: string[] = [];
    const detectedOAuthProviders: string[] = [];

    // 1. Keyword Detection
    for (const [keyword, weight] of Object.entries(this.LOGIN_KEYWORDS)) {
      if (combinedText.includes(keyword)) {
        indicators.push({
          type: 'keyword',
          weight,
          detected: true,
          value: keyword,
        });
        totalConfidence += weight;
        detectedKeywords.push(keyword);
      }
    }

    // 2. OAuth Provider Detection (high confidence)
    for (const [provider, patterns] of Object.entries(this.OAUTH_PROVIDERS)) {
      const detected = patterns.some((pattern) => combinedText.includes(pattern));
      if (detected) {
        const oauthWeight = 0.25; // OAuth buttons are strong indicators
        indicators.push({
          type: 'oauth_provider',
          weight: oauthWeight,
          detected: true,
          value: provider,
        });
        totalConfidence += oauthWeight;
        detectedOAuthProviders.push(provider);
      }
    }

    // 3. Mobile Number Login Detection
    const hasMobileLogin = this.MOBILE_LOGIN_KEYWORDS.some((keyword) =>
      combinedText.includes(keyword)
    );
    if (hasMobileLogin || pageContent.formFields.hasMobile) {
      const mobileWeight = 0.2;
      indicators.push({
        type: 'mobile_input',
        weight: mobileWeight,
        detected: true,
      });
      totalConfidence += mobileWeight;
    }

    // 4. Form Field Analysis (traditional detection)
    if (pageContent.formFields.hasPassword && pageContent.formFields.hasEmail) {
      const formWeight = 0.3; // Password + email is strong indicator
      indicators.push({
        type: 'form_field',
        weight: formWeight,
        detected: true,
        value: 'password+email',
      });
      totalConfidence += formWeight;
    } else if (pageContent.formFields.hasPassword) {
      const formWeight = 0.2; // Just password is weaker indicator
      indicators.push({
        type: 'form_field',
        weight: formWeight,
        detected: true,
        value: 'password',
      });
      totalConfidence += formWeight;
    }

    // 5. Page Context (title/headings contain login keywords)
    const contextKeywords = ['login', 'sign in', 'signin', 'log in'];
    const hasLoginContext = contextKeywords.some(
      (keyword) =>
        normalizedTitle.includes(keyword) ||
        normalizedHeadings.some((h) => h.includes(keyword))
    );
    if (hasLoginContext) {
      const contextWeight = 0.15;
      indicators.push({
        type: 'page_context',
        weight: contextWeight,
        detected: true,
        value: 'login_in_title_or_heading',
      });
      totalConfidence += contextWeight;
    }

    // Cap confidence at 1.0
    const finalConfidence = Math.min(totalConfidence, 1.0);

    // Threshold: Consider it a login page if confidence >= 0.4
    const isLoginPage = finalConfidence >= 0.4;

    logger.debug({
      msg: 'Login page detection completed',
      confidence: finalConfidence,
      isLoginPage,
      indicators: indicators.length,
      keywords: detectedKeywords,
      oauthProviders: detectedOAuthProviders,
    });

    // Convert to new format for backward compatibility
    const signals: AuthSignal[] = indicators.map(ind => ({
      type: ind.value || ind.type,
      weight: ind.weight * 10, // Scale back up
      source: ind.type
    }));

    const score = signals.reduce((sum, s) => sum + s.weight, 0);

    return {
      isLoginPage,
      authType: detectedOAuthProviders.length > 0 ? 'OAUTH' : 'LOGIN',
      confidence: finalConfidence,
      score,
      signals,
      indicators,
      evidence: {
        keywords: detectedKeywords,
        oauthProviders: detectedOAuthProviders,
        ssoProviders: [],
        hasMobileInput: hasMobileLogin || pageContent.formFields.hasMobile,
        hasPasswordField: pageContent.formFields.hasPassword,
        hasEmailField: pageContent.formFields.hasEmail,
        hasMFA: false,
        hasCaptcha: false,
        hasCSRF: false,
        detectionMethod: ['legacy_extraction'],
      },
    };
  }

  /**
   * Quick check if page is likely a login page (for performance)
   * Uses only lightweight checks without full analysis
   */
  isLikelyLoginPage(pageTitle: string, bodyText: string): boolean {
    const quickKeywords = ['login', 'sign in', 'signin'];
    const normalized = `${pageTitle} ${bodyText}`.toLowerCase();
    return quickKeywords.some((keyword) => normalized.includes(keyword));
  }
}

// Singleton instance
let serviceInstance: LoginPageDetectionService | null = null;

export function getLoginDetectionService(): LoginPageDetectionService {
  if (!serviceInstance) {
    serviceInstance = new LoginPageDetectionService();
  }
  return serviceInstance;
}

// Export singleton instance for backward compatibility
export const loginPageDetectionService = getLoginDetectionService();
