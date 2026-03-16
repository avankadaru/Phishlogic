/**
 * Login Page Detection Service
 *
 * Determines if a page is a legitimate login page using multiple detection strategies:
 * - Form field analysis (password, email fields)
 * - Keyword detection (sign in, login, register, forgot password)
 * - OAuth provider buttons (Google, Facebook, GitHub, etc.)
 * - Mobile number login detection
 * - Page context analysis (titles, headings)
 *
 * Returns confidence score (0.0-1.0) indicating likelihood page is a login page.
 *
 * Design: Strategy pattern for extensibility - new detection strategies can be added easily.
 */

import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();

export interface LoginPageDetectionResult {
  isLoginPage: boolean;
  confidence: number; // 0.0-1.0
  indicators: LoginPageIndicator[];
  evidence: {
    keywords: string[];
    oauthProviders: string[];
    hasMobileInput: boolean;
    hasPasswordField: boolean;
    hasEmailField: boolean;
  };
}

export interface LoginPageIndicator {
  type: 'keyword' | 'oauth_provider' | 'mobile_input' | 'form_field' | 'page_context';
  weight: number; // Contribution to confidence score
  detected: boolean;
  value?: string; // What was detected
}

export class LoginPageDetectionService {
  // Login-related keywords with weights
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

    return {
      isLoginPage,
      confidence: finalConfidence,
      indicators,
      evidence: {
        keywords: detectedKeywords,
        oauthProviders: detectedOAuthProviders,
        hasMobileInput: hasMobileLogin || pageContent.formFields.hasMobile,
        hasPasswordField: pageContent.formFields.hasPassword,
        hasEmailField: pageContent.formFields.hasEmail,
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
export const loginPageDetectionService = new LoginPageDetectionService();
