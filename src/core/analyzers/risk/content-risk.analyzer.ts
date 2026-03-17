/**
 * Content Risk Analyzer
 * Performs fast risk assessment without running full analyzers
 * Used to determine conditional bypass strategy for trusted senders
 */

import type { NormalizedInput, UrlInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';

/**
 * Content risk profile interface
 */
export interface ContentRiskProfile {
  hasLinks: boolean;
  linkCount: number;
  links: string[];
  hasMaliciousLinks: boolean; // Quick heuristic check

  hasAttachments: boolean;
  attachmentCount: number;
  attachments: string[];
  hasSuspiciousAttachments: boolean; // Check extensions

  hasImages: boolean;
  imageCount: number;
  hasQRCodes: boolean;
  qrCodeCount?: number;

  hasUrgencyLanguage: boolean;
  urgencyScore: number; // 0-10 scale
  urgencyIndicators: string[]; // "act now", "24 hours", etc.

  hasForms: boolean; // Renamed from hasCredentialForms for clarity

  overallRiskScore: number; // 0-10 weighted score
}

/**
 * Urgency keywords and phrases
 */
const URGENCY_PATTERNS = [
  // Time pressure
  { pattern: /\b(urgent|immediately|asap|right away|at once)\b/i, weight: 2.0 },
  { pattern: /\b(act now|respond now|click now|verify now)\b/i, weight: 2.5 },
  { pattern: /\b(24 hours?|48 hours?|within \d+ (hours?|days?))\b/i, weight: 2.0 },
  { pattern: /\b(expires? (today|tonight|soon|shortly))\b/i, weight: 1.8 },
  { pattern: /\b(time[- ]sensitive|time is running out)\b/i, weight: 2.2 },
  { pattern: /\b(last chance|final (notice|warning|reminder))\b/i, weight: 2.3 },

  // Threats
  { pattern: /\b(suspend(ed)?|lock(ed)?|block(ed)?|terminat(e|ed)|clos(e|ed))\b.*\baccount\b/i, weight: 3.0 },
  { pattern: /\b(will be (suspended|locked|closed|terminated|deleted))\b/i, weight: 2.8 },
  { pattern: /\b(unauthorized (access|activity|transaction))\b/i, weight: 2.5 },
  { pattern: /\b(security (alert|breach|violation|issue))\b/i, weight: 2.3 },
  { pattern: /\b(unusual activity|suspicious activity)\b/i, weight: 2.2 },

  // Action required
  { pattern: /\b(action required|immediate action|required action)\b/i, weight: 2.5 },
  { pattern: /\b(verify (your )?(account|identity|information))\b/i, weight: 2.3 },
  { pattern: /\b(confirm (your )?(account|identity|information|payment))\b/i, weight: 2.2 },
  { pattern: /\b(update (your )?(account|payment|information))\b/i, weight: 1.8 },
  { pattern: /\b(click (here|below|link) to)\b/i, weight: 1.5 },

  // Authority
  { pattern: /\b(CEO|CFO|executive|president|director)\b/i, weight: 1.8 },
  { pattern: /\b(legal (action|notice|department))\b/i, weight: 2.5 },
  { pattern: /\b(IRS|government|federal|tax authority)\b/i, weight: 2.3 },

  // Consequences
  { pattern: /\b(lose access|permanently (deleted|closed|suspended))\b/i, weight: 2.5 },
  { pattern: /\b(late fee|penalty|fine)\b/i, weight: 1.8 },
  { pattern: /\b(failure to (respond|act|comply))\b/i, weight: 2.2 },
];

/**
 * Suspicious attachment extensions
 */
const SUSPICIOUS_EXTENSIONS = [
  '.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.js',
  '.jar', '.zip', '.rar', '.7z', '.iso', '.dmg',
  '.docm', '.xlsm', '.pptm', // Macro-enabled Office files
  '.pdf.exe', '.doc.exe', '.jpg.exe', // Double extensions
];

/**
 * URL detection regex (simplified)
 */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

/**
 * Content Risk Analyzer
 */
export class ContentRiskAnalyzer {
  /**
   * Quick risk assessment without running full analyzers
   * Used to determine conditional bypass strategy
   */
  async analyzeRisk(input: NormalizedInput): Promise<ContentRiskProfile> {
    const profile: ContentRiskProfile = {
      hasLinks: false,
      linkCount: 0,
      links: [],
      hasMaliciousLinks: false,

      hasAttachments: false,
      attachmentCount: 0,
      attachments: [],
      hasSuspiciousAttachments: false,

      hasImages: false,
      imageCount: 0,
      hasQRCodes: false,
      qrCodeCount: 0,

      hasUrgencyLanguage: false,
      urgencyScore: 0,
      urgencyIndicators: [],

      hasForms: false,

      overallRiskScore: 0,
    };

    // Analyze links
    const linkAnalysis = this.analyzeLinks(input);
    profile.hasLinks = linkAnalysis.hasLinks;
    profile.linkCount = linkAnalysis.linkCount;
    profile.links = linkAnalysis.links;
    profile.hasMaliciousLinks = linkAnalysis.hasMaliciousLinks;

    // Analyze attachments (email only)
    if (isEmailInput(input)) {
      const attachmentAnalysis = this.analyzeAttachments(input);
      profile.hasAttachments = attachmentAnalysis.hasAttachments;
      profile.attachmentCount = attachmentAnalysis.attachmentCount;
      profile.attachments = attachmentAnalysis.attachments;
      profile.hasSuspiciousAttachments = attachmentAnalysis.hasSuspiciousAttachments;

      // Analyze images and QR codes (email only)
      const imageAnalysis = this.analyzeImages(input);
      profile.hasImages = imageAnalysis.hasImages;
      profile.imageCount = imageAnalysis.imageCount;
      profile.hasQRCodes = imageAnalysis.hasQRCodes;
      profile.qrCodeCount = imageAnalysis.qrCodeCount;

      // Analyze forms (email only)
      const formAnalysis = this.analyzeForms(input);
      profile.hasForms = formAnalysis.hasForms;

      // Analyze urgency language (email only)
      const urgencyAnalysis = this.analyzeUrgency(input);
      profile.hasUrgencyLanguage = urgencyAnalysis.hasUrgency;
      profile.urgencyScore = urgencyAnalysis.score;
      profile.urgencyIndicators = urgencyAnalysis.indicators;
    }

    // Calculate overall risk score (0-10)
    profile.overallRiskScore = this.calculateOverallRisk(profile);

    return profile;
  }

  /**
   * Analyze links in content
   */
  private analyzeLinks(input: NormalizedInput): {
    hasLinks: boolean;
    linkCount: number;
    links: string[];
    hasMaliciousLinks: boolean;
  } {
    let links: string[] = [];

    // Extract links from email
    if (isEmailInput(input)) {
      if (input.data.parsed.urls && input.data.parsed.urls.length > 0) {
        links = input.data.parsed.urls;
      } else {
        // Fallback: extract from body
        const text = input.data.parsed.body.text || input.data.parsed.body.html || '';
        const matches = text.match(URL_REGEX);
        links = matches || [];
      }
    } else {
      // For URL input, the URL itself is the link
      const urlInput = input.data as UrlInput;
      links = [urlInput.url];
    }

    // Quick heuristic check for malicious links
    const hasMaliciousLinks = links.some((url) => this.isLinkSuspicious(url));

    return {
      hasLinks: links.length > 0,
      linkCount: links.length,
      links,
      hasMaliciousLinks,
    };
  }

  /**
   * Quick heuristic check for suspicious links
   */
  private isLinkSuspicious(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const path = urlObj.pathname.toLowerCase();

      // Check for typosquatting indicators (exact typo variants only)
      const typosquattingPatterns = [
        /paypa1/i,         // Only matches "paypa1", not "paypal"
        /g00gle/i,         // Only matches "g00gle" (two zeros), not "google"
        /amaz0n/i,         // Only matches "amaz0n" (zero), not "amazon"
        /faceb00k/i,       // Only matches "faceb00k" (two zeros), not "facebook"
        /appl3/i,          // Only matches "appl3", not "apple"
        /micr0s0ft/i,      // Only matches "micr0s0ft", not "microsoft"
        /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // IP address
        /[a-z0-9]{20,}/i,  // Very long random subdomain
        /-{3,}/,           // Multiple consecutive hyphens
      ];

      if (typosquattingPatterns.some((pattern) => pattern.test(hostname))) {
        return true;
      }

      // Check for suspicious TLDs
      const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top'];
      if (suspiciousTLDs.some((tld) => hostname.endsWith(tld))) {
        return true;
      }

      // Check for URL shorteners (could hide destination)
      const shorteners = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly'];
      if (shorteners.some((shortener) => hostname.includes(shortener))) {
        return true;
      }

      // Check for suspicious keywords in path
      const suspiciousKeywords = ['login', 'verify', 'secure', 'account', 'update', 'confirm'];
      if (suspiciousKeywords.some((keyword) => path.includes(keyword))) {
        return true;
      }

      return false;
    } catch (error) {
      // Invalid URL, consider suspicious
      return true;
    }
  }

  /**
   * Analyze attachments (email only)
   */
  private analyzeAttachments(input: NormalizedInput): {
    hasAttachments: boolean;
    attachmentCount: number;
    attachments: string[];
    hasSuspiciousAttachments: boolean;
  } {
    if (!isEmailInput(input)) {
      return {
        hasAttachments: false,
        attachmentCount: 0,
        attachments: [],
        hasSuspiciousAttachments: false,
      };
    }

    const attachments = input.data.parsed.attachments || [];
    const attachmentNames = attachments.map((att) => att.filename);

    // Check for suspicious extensions
    const hasSuspiciousAttachments = attachmentNames.some((name) =>
      SUSPICIOUS_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))
    );

    return {
      hasAttachments: attachments.length > 0,
      attachmentCount: attachments.length,
      attachments: attachmentNames,
      hasSuspiciousAttachments,
    };
  }

  /**
   * Analyze images and QR codes (email only)
   */
  private analyzeImages(input: NormalizedInput): {
    hasImages: boolean;
    imageCount: number;
    hasQRCodes: boolean;
    qrCodeCount: number;
  } {
    if (!isEmailInput(input)) {
      return {
        hasImages: false,
        imageCount: 0,
        hasQRCodes: false,
        qrCodeCount: 0,
      };
    }

    const html = input.data.parsed.body.html || '';
    const text = input.data.parsed.body.text || '';
    const combined = `${html} ${text}`;

    // Image detection (HTML <img> tags and base64 data URIs)
    const imageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const base64ImageRegex = /data:image\/[^;]+;base64,/g;

    const images: string[] = [];
    let match;
    while ((match = imageRegex.exec(combined)) !== null) {
      images.push(match[1]);
    }

    const base64Images = combined.match(base64ImageRegex) || [];
    const hasImages = images.length > 0 || base64Images.length > 0;
    const imageCount = images.length + base64Images.length;

    // QR code detection (heuristic: images with "qr" in filename or alt text)
    const qrCodeHeuristic = /qr[-_]?code|barcode|qrcode/i;
    const hasQRCodes = images.some((img) => qrCodeHeuristic.test(img)) ||
      combined.match(/<img[^>]*alt=["'][^"']*qr[-_]?code[^"']*["'][^>]*>/i) !== null;

    const qrCodeCount = hasQRCodes ? 1 : 0; // Conservative estimate

    return {
      hasImages,
      imageCount,
      hasQRCodes,
      qrCodeCount,
    };
  }

  /**
   * Analyze forms (email only)
   */
  private analyzeForms(input: NormalizedInput): {
    hasForms: boolean;
  } {
    if (!isEmailInput(input)) {
      return { hasForms: false };
    }

    const html = input.data.parsed.body.html || '';

    // Detect HTML forms
    const formRegex = /<form[^>]*>/i;
    const hasForms = formRegex.test(html);

    return { hasForms };
  }

  /**
   * Analyze urgency language (email only)
   */
  private analyzeUrgency(input: NormalizedInput): {
    hasUrgency: boolean;
    score: number;
    indicators: string[];
  } {
    if (!isEmailInput(input)) {
      return { hasUrgency: false, score: 0, indicators: [] };
    }

    const text = (input.data.parsed.body.text || input.data.parsed.body.html || '').toLowerCase();
    const subject = (input.data.parsed.subject || '').toLowerCase();
    const combined = `${subject} ${text}`;

    let totalScore = 0;
    const indicators: string[] = [];

    for (const { pattern, weight } of URGENCY_PATTERNS) {
      const matches = combined.match(pattern);
      if (matches) {
        totalScore += weight;
        indicators.push(matches[0]);
      }
    }

    // Normalize score to 0-10 range
    const normalizedScore = Math.min(totalScore, 10);

    return {
      hasUrgency: normalizedScore > 2.0,
      score: normalizedScore,
      indicators,
    };
  }

  /**
   * Calculate overall risk score (0-10)
   */
  private calculateOverallRisk(profile: ContentRiskProfile): number {
    let score = 0;

    // Links contribute 3 points max
    if (profile.hasLinks) {
      score += 1;
      if (profile.linkCount > 3) {
        score += 1;
      }
      if (profile.hasMaliciousLinks) {
        score += 1;
      }
    }

    // Attachments contribute 3 points max
    if (profile.hasAttachments) {
      score += 1;
      if (profile.attachmentCount > 2) {
        score += 1;
      }
      if (profile.hasSuspiciousAttachments) {
        score += 1;
      }
    }

    // Urgency language contributes 4 points max
    if (profile.hasUrgencyLanguage) {
      score += Math.min(profile.urgencyScore / 2.5, 4);
    }

    return Math.min(score, 10);
  }
}
