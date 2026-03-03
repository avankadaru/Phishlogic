/**
 * Email Header Analyzer
 * Detects anomalies and suspicious patterns in email headers
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';

/**
 * Header Analyzer
 */
export class HeaderAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'HeaderAnalyzer';
  }

  getWeight(): number {
    return 1.0;
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    // Only applicable to email inputs
    return isEmailInput(input);
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const signals: AnalysisSignal[] = [];
    const headers = input.data.parsed.headers;
    const from = input.data.parsed.from;

    // Check for sender mismatch
    const senderMismatch = this.checkSenderMismatch(headers, from.address);
    if (senderMismatch) {
      signals.push(
        this.createSignal({
          signalType: 'sender_mismatch',
          severity: 'high',
          confidence: 0.85,
          description:
            'The displayed sender name does not match the actual email address - possible impersonation',
          evidence: senderMismatch,
        })
      );
    }

    // Check for missing required headers
    const missingHeaders = this.checkMissingHeaders(headers);
    if (missingHeaders.length > 0) {
      signals.push(
        this.createSignal({
          signalType: 'header_anomaly',
          severity: 'medium',
          confidence: 0.7,
          description: `Email is missing important headers: ${missingHeaders.join(', ')}`,
          evidence: {
            missingHeaders,
          },
        })
      );
    }

    // Check for suspicious return-path
    const returnPathIssue = this.checkReturnPath(headers, from.address);
    if (returnPathIssue) {
      signals.push(
        this.createSignal({
          signalType: 'header_anomaly',
          severity: 'medium',
          confidence: 0.6,
          description: 'The return address does not match the sender - possible spoofing',
          evidence: returnPathIssue,
        })
      );
    }

    // Check for suspicious received headers (email routing)
    const receivedAnomalies = this.checkReceivedHeaders(headers);
    if (receivedAnomalies) {
      signals.push(
        this.createSignal({
          signalType: 'header_anomaly',
          severity: 'low',
          confidence: 0.5,
          description: 'Email routing path contains suspicious patterns',
          evidence: receivedAnomalies,
        })
      );
    }

    // Check for phishing keywords in subject
    const phishingKeywords = this.checkPhishingKeywords(input.data.parsed.subject);
    if (phishingKeywords.length > 0) {
      signals.push(
        this.createSignal({
          signalType: 'phishing_keywords',
          severity: 'medium',
          confidence: 0.7,
          description: `Email subject contains suspicious phrases commonly used in phishing: ${phishingKeywords.join(', ')}`,
          evidence: {
            subject: input.data.parsed.subject,
            keywords: phishingKeywords,
          },
        })
      );
    }

    // Check for urgency keywords
    const urgencyKeywords = this.checkUrgencyKeywords(
      input.data.parsed.subject,
      input.data.parsed.body.text ?? ''
    );
    if (urgencyKeywords.length > 0) {
      signals.push(
        this.createSignal({
          signalType: 'phishing_keywords',
          severity: 'low',
          confidence: 0.6,
          description: `Email uses urgent language to pressure quick action: ${urgencyKeywords.join(', ')}`,
          evidence: {
            keywords: urgencyKeywords,
          },
        })
      );
    }

    return signals;
  }

  /**
   * Check for sender mismatch (display name vs actual email)
   */
  private checkSenderMismatch(
    headers: Map<string, string>,
    fromAddress: string
  ): Record<string, string> | null {
    const fromHeader = headers.get('from');
    if (!fromHeader) return null;

    // Extract display name if present
    const displayNameMatch = fromHeader.match(/^["']?([^"'<]+)["']?\s*</);
    if (!displayNameMatch) return null;

    const displayName = displayNameMatch[1]?.trim();
    if (!displayName) return null;

    // Extract domain from display name if it looks like an email
    const displayDomainMatch = displayName.match(/@([a-zA-Z0-9.-]+)/);
    if (!displayDomainMatch) return null;

    const displayDomain = displayDomainMatch[1]?.toLowerCase();
    const actualDomain = fromAddress.split('@')[1]?.toLowerCase();

    // Check if domains match
    if (displayDomain && actualDomain && displayDomain !== actualDomain) {
      return {
        displayName,
        displayDomain,
        actualAddress: fromAddress,
        actualDomain,
      };
    }

    return null;
  }

  /**
   * Check for missing required headers
   */
  private checkMissingHeaders(headers: Map<string, string>): string[] {
    const requiredHeaders = ['from', 'date', 'message-id'];
    const missing: string[] = [];

    for (const header of requiredHeaders) {
      if (!headers.has(header.toLowerCase())) {
        missing.push(header);
      }
    }

    return missing;
  }

  /**
   * Check return-path vs from address
   */
  private checkReturnPath(
    headers: Map<string, string>,
    fromAddress: string
  ): Record<string, string> | null {
    const returnPath = headers.get('return-path');
    if (!returnPath) return null;

    // Extract email from return-path (might be in <email@domain.com> format)
    const returnPathEmail = returnPath.match(/<([^>]+)>/)?.[1] ?? returnPath.trim();

    // Extract domains
    const returnDomain = returnPathEmail.split('@')[1]?.toLowerCase();
    const fromDomain = fromAddress.split('@')[1]?.toLowerCase();

    if (returnDomain && fromDomain && returnDomain !== fromDomain) {
      return {
        returnPath: returnPathEmail,
        returnDomain,
        fromAddress,
        fromDomain,
      };
    }

    return null;
  }

  /**
   * Check received headers for suspicious patterns
   */
  private checkReceivedHeaders(headers: Map<string, string>): Record<string, unknown> | null {
    const received = headers.get('received');
    if (!received) return null;

    const lowerReceived = received.toLowerCase();

    // Check for known spam/phishing server patterns
    const suspiciousPatterns = [
      'dynamic',
      'dhcp',
      'pool',
      'residential',
      'unknown',
      'localhost',
    ];

    const foundPatterns = suspiciousPatterns.filter((pattern) =>
      lowerReceived.includes(pattern)
    );

    if (foundPatterns.length > 0) {
      return {
        received,
        suspiciousPatterns: foundPatterns,
      };
    }

    return null;
  }

  /**
   * Check for common phishing keywords in subject
   */
  private checkPhishingKeywords(subject: string): string[] {
    const keywords = [
      'verify your account',
      'confirm your identity',
      'suspend',
      'suspended',
      'unusual activity',
      'security alert',
      'update your information',
      'click here immediately',
      'act now',
      'account will be closed',
      'verify your identity',
      'payment failed',
      'invoice attached',
      'tax refund',
      'reset your password',
      'confirm your password',
      'update payment method',
      'billing problem',
      're-verify',
      're-activate',
      'locked account',
      'unauthorized access',
      'unusual sign-in',
    ];

    const lowerSubject = subject.toLowerCase();
    const found: string[] = [];

    for (const keyword of keywords) {
      if (lowerSubject.includes(keyword)) {
        found.push(keyword);
      }
    }

    return found;
  }

  /**
   * Check for urgency keywords that pressure recipients
   */
  private checkUrgencyKeywords(subject: string, body: string): string[] {
    const keywords = [
      'urgent',
      'immediately',
      'asap',
      'right away',
      'within 24 hours',
      'within 48 hours',
      'limited time',
      'expires soon',
      'act fast',
      'act quickly',
      'time sensitive',
      'immediate action required',
      'respond now',
      'expire',
      'last chance',
      'final notice',
      'final warning',
    ];

    const combinedText = `${subject} ${body}`.toLowerCase();
    const found: string[] = [];

    for (const keyword of keywords) {
      if (combinedText.includes(keyword) && !found.includes(keyword)) {
        found.push(keyword);
      }
    }

    return found.slice(0, 3); // Limit to first 3 found
  }
}
