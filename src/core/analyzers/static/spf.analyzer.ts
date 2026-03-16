/**
 * SPF (Sender Policy Framework) Analyzer
 * Validates email sender using SPF records
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';

/**
 * SPF result types
 */
type SpfResult = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror';

/**
 * SPF Analyzer
 */
export class SpfAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'SpfAnalyzer';
  }

  getWeight(): number {
    return this.config.analysis.analyzerWeights.spf; // Configurable from env (default: 1.4)
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

    // Extract SPF result from email headers
    const spfResult = this.extractSpfResult(input.data.parsed.headers);

    if (!spfResult) {
      // No SPF record found
      signals.push(
        this.createSignal({
          signalType: 'spf_fail',
          severity: 'medium',
          confidence: 0.6,
          description: 'Email sender could not be verified - no SPF record found',
          evidence: {
            spfResult: 'none',
            from: input.data.parsed.from.address,
          },
        })
      );
      return signals;
    }

    switch (spfResult) {
      case 'pass':
        signals.push(
          this.createSignal({
            signalType: 'spf_pass',
            severity: 'low',
            confidence: 0.9,
            description: 'Email sender was successfully verified using SPF',
            evidence: {
              spfResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;

      case 'fail':
        signals.push(
          this.createSignal({
            signalType: 'spf_fail',
            severity: 'high',
            confidence: 0.9,
            description: 'Email sender failed verification - the sender is not authorized',
            evidence: {
              spfResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;

      case 'softfail':
        signals.push(
          this.createSignal({
            signalType: 'spf_fail',
            severity: 'medium',
            confidence: 0.7,
            description: 'Email sender verification questionable - sender may not be authorized',
            evidence: {
              spfResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;

      case 'neutral':
        signals.push(
          this.createSignal({
            signalType: 'spf_fail',
            severity: 'low',
            confidence: 0.4,
            description: 'Email sender verification inconclusive',
            evidence: {
              spfResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;

      case 'temperror':
      case 'permerror':
        signals.push(
          this.createSignal({
            signalType: 'spf_fail',
            severity: 'medium',
            confidence: 0.5,
            description: 'Email sender verification failed due to DNS error',
            evidence: {
              spfResult,
              from: input.data.parsed.from.address,
            },
          })
        );
        break;
    }

    return signals;
  }

  /**
   * Extract SPF result from email headers
   */
  private extractSpfResult(headers: Map<string, string>): SpfResult | null {
    // Check common SPF header names
    const spfHeaderNames = [
      'received-spf',
      'authentication-results',
      'x-authentication-results',
    ];

    for (const headerName of spfHeaderNames) {
      const headerValue = headers.get(headerName.toLowerCase());
      if (headerValue) {
        const result = this.parseSpfHeader(headerValue);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Parse SPF result from header value
   */
  private parseSpfHeader(headerValue: string): SpfResult | null {
    const lowerValue = headerValue.toLowerCase();

    // Check for SPF result keywords
    if (lowerValue.includes('spf=pass')) {
      return 'pass';
    }
    if (lowerValue.includes('spf=fail')) {
      return 'fail';
    }
    if (lowerValue.includes('spf=softfail')) {
      return 'softfail';
    }
    if (lowerValue.includes('spf=neutral')) {
      return 'neutral';
    }
    if (lowerValue.includes('spf=none')) {
      return 'none';
    }
    if (lowerValue.includes('spf=temperror')) {
      return 'temperror';
    }
    if (lowerValue.includes('spf=permerror')) {
      return 'permerror';
    }

    // Also check for "Pass" or "Fail" at the beginning (Received-SPF format)
    if (lowerValue.startsWith('pass')) {
      return 'pass';
    }
    if (lowerValue.startsWith('fail')) {
      return 'fail';
    }
    if (lowerValue.startsWith('softfail')) {
      return 'softfail';
    }
    if (lowerValue.startsWith('neutral')) {
      return 'neutral';
    }
    if (lowerValue.startsWith('none')) {
      return 'none';
    }

    return null;
  }
}
