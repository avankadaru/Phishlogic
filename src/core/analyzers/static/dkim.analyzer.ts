/**
 * DKIM (DomainKeys Identified Mail) Analyzer
 * Validates email cryptographic signature
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';

/**
 * DKIM result types
 */
type DkimResult = 'pass' | 'fail' | 'neutral' | 'none' | 'temperror' | 'permerror';

/**
 * DKIM Analyzer
 */
export class DkimAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'DkimAnalyzer';
  }

  getWeight(): number {
    return 1.5;
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

    // Extract DKIM result from email headers
    const dkimResult = this.extractDkimResult(input.data.parsed.headers);

    if (!dkimResult) {
      // No DKIM signature found
      signals.push(
        this.createSignal({
          signalType: 'dkim_fail',
          severity: 'medium',
          confidence: 0.5,
          description: 'Email signature could not be verified - no DKIM signature found',
          evidence: {
            dkimResult: 'none',
            from: input.data.parsed.from.address,
          },
        })
      );
      return signals;
    }

    switch (dkimResult) {
      case 'pass':
        signals.push(
          this.createSignal({
            signalType: 'dkim_pass',
            severity: 'low',
            confidence: 0.95,
            description: 'Email signature successfully verified using DKIM',
            evidence: {
              dkimResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;

      case 'fail':
        signals.push(
          this.createSignal({
            signalType: 'dkim_fail',
            severity: 'high',
            confidence: 0.9,
            description: 'Email signature verification failed - the email may have been tampered with',
            evidence: {
              dkimResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;

      case 'neutral':
        signals.push(
          this.createSignal({
            signalType: 'dkim_fail',
            severity: 'low',
            confidence: 0.4,
            description: 'Email signature verification inconclusive',
            evidence: {
              dkimResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;

      case 'temperror':
      case 'permerror':
        signals.push(
          this.createSignal({
            signalType: 'dkim_fail',
            severity: 'medium',
            confidence: 0.5,
            description: 'Email signature verification failed due to DNS error',
            evidence: {
              dkimResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;
    }

    return signals;
  }

  /**
   * Extract DKIM result from email headers
   */
  private extractDkimResult(headers: Map<string, string>): DkimResult | null {
    // Check common DKIM header names
    const dkimHeaderNames = [
      'dkim-signature',
      'authentication-results',
      'x-authentication-results',
    ];

    for (const headerName of dkimHeaderNames) {
      const headerValue = headers.get(headerName.toLowerCase());
      if (headerValue) {
        const result = this.parseDkimHeader(headerValue);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Parse DKIM result from header value
   */
  private parseDkimHeader(headerValue: string): DkimResult | null {
    const lowerValue = headerValue.toLowerCase();

    // Check for DKIM result keywords in Authentication-Results header
    if (lowerValue.includes('dkim=pass')) {
      return 'pass';
    }
    if (lowerValue.includes('dkim=fail')) {
      return 'fail';
    }
    if (lowerValue.includes('dkim=neutral')) {
      return 'neutral';
    }
    if (lowerValue.includes('dkim=none')) {
      return 'none';
    }
    if (lowerValue.includes('dkim=temperror')) {
      return 'temperror';
    }
    if (lowerValue.includes('dkim=permerror')) {
      return 'permerror';
    }

    // If we see a DKIM-Signature header, assume it exists but we need
    // authentication-results to know if it passed
    if (lowerValue.includes('v=1') && lowerValue.includes('a=')) {
      // DKIM signature exists, but no pass/fail info
      // This will be caught by authentication-results header
      return null;
    }

    return null;
  }
}
