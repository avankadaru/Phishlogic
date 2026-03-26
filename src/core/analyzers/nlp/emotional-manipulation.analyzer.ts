/**
 * Emotional Manipulation Analyzer
 * Detects psychological manipulation tactics in email content using NLP
 *
 * Detects:
 * - Fear appeals (account suspension, legal threats)
 * - Urgency pressure (limited time, expires soon)
 * - Authority impersonation (CEO, IT department, bank)
 * - Scarcity tactics (last chance, limited spots)
 * - Social proof manipulation (others have done this)
 * - Reward/greed appeals (prizes, money, inheritance)
 */

import nlp from 'compromise';
import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';

interface ManipulationIndicator {
  type: 'fear' | 'urgency' | 'authority' | 'scarcity' | 'social_proof' | 'greed';
  phrase: string;
  confidence: number;
  context: string;
}

export class EmotionalManipulationAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'EmotionalManipulationAnalyzer';
  }

  getWeight(): number {
    return 1.5; // Higher weight - psychological manipulation is a strong indicator
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const signals: AnalysisSignal[] = [];
    const subject = input.data.parsed.subject;
    const body = input.data.parsed.body.text ?? '';
    const combinedText = `${subject}\n\n${body}`;

    // Process text with NLP
    const doc = nlp(combinedText);

    // Detect fear appeals
    const fearIndicators = this.detectFearAppeals(combinedText, doc);
    if (fearIndicators.length > 0) {
      signals.push(
        this.createSignal({
          signalType: 'fear_manipulation',
          severity: 'high',
          confidence: this.calculateConfidence(fearIndicators),
          description: `Email uses fear-based manipulation tactics: ${fearIndicators.map(i => i.phrase).join(', ')}`,
          evidence: {
            indicators: fearIndicators,
            count: fearIndicators.length,
          },
        })
      );
    }

    // Detect urgency pressure
    const urgencyIndicators = this.detectUrgencyPressure(combinedText, doc);
    if (urgencyIndicators.length > 0) {
      signals.push(
        this.createSignal({
          signalType: 'urgency_manipulation',
          severity: 'high',
          confidence: this.calculateConfidence(urgencyIndicators),
          description: `Email creates artificial urgency: ${urgencyIndicators.map(i => i.phrase).join(', ')}`,
          evidence: {
            indicators: urgencyIndicators,
            count: urgencyIndicators.length,
          },
        })
      );
    }

    // Detect authority impersonation
    const authorityIndicators = this.detectAuthorityImpersonation(combinedText, doc);
    if (authorityIndicators.length > 0) {
      signals.push(
        this.createSignal({
          signalType: 'authority_manipulation',
          severity: 'high',
          confidence: this.calculateConfidence(authorityIndicators),
          description: `Email impersonates authority figures: ${authorityIndicators.map(i => i.phrase).join(', ')}`,
          evidence: {
            indicators: authorityIndicators,
            count: authorityIndicators.length,
          },
        })
      );
    }

    // Detect scarcity tactics
    const scarcityIndicators = this.detectScarcityTactics(combinedText, doc);
    if (scarcityIndicators.length > 0) {
      signals.push(
        this.createSignal({
          signalType: 'scarcity_manipulation',
          severity: 'medium',
          confidence: this.calculateConfidence(scarcityIndicators),
          description: `Email uses scarcity tactics: ${scarcityIndicators.map(i => i.phrase).join(', ')}`,
          evidence: {
            indicators: scarcityIndicators,
            count: scarcityIndicators.length,
          },
        })
      );
    }

    // Detect greed/reward appeals
    const greedIndicators = this.detectGreedAppeals(combinedText, doc);
    if (greedIndicators.length > 0) {
      signals.push(
        this.createSignal({
          signalType: 'greed_manipulation',
          severity: 'high',
          confidence: this.calculateConfidence(greedIndicators),
          description: `Email appeals to greed/reward: ${greedIndicators.map(i => i.phrase).join(', ')}`,
          evidence: {
            indicators: greedIndicators,
            count: greedIndicators.length,
          },
        })
      );
    }

    return signals;
  }

  /**
   * Detect fear-based manipulation (account suspension, legal threats, security warnings)
   */
  private detectFearAppeals(text: string, _doc: any): ManipulationIndicator[] {
    const indicators: ManipulationIndicator[] = [];
    const lowerText = text.toLowerCase();

    const fearPhrases = [
      // Account threats
      { phrase: 'account will be', confidence: 0.85, keywords: ['suspended', 'closed', 'terminated', 'deactivated', 'locked'] },
      { phrase: 'account has been', confidence: 0.85, keywords: ['suspended', 'closed', 'locked', 'compromised', 'breached'] },
      { phrase: 'will lose access', confidence: 0.9, keywords: [] },
      { phrase: 'permanent suspension', confidence: 0.95, keywords: [] },
      { phrase: 'immediate suspension', confidence: 0.9, keywords: [] },

      // Legal threats
      { phrase: 'legal action', confidence: 0.9, keywords: [] },
      { phrase: 'law enforcement', confidence: 0.85, keywords: [] },
      { phrase: 'legal consequences', confidence: 0.9, keywords: [] },
      { phrase: 'court', confidence: 0.7, keywords: ['summons', 'lawsuit', 'legal'] },

      // Security threats
      { phrase: 'unauthorized access', confidence: 0.85, keywords: [] },
      { phrase: 'security breach', confidence: 0.8, keywords: [] },
      { phrase: 'suspicious activity', confidence: 0.75, keywords: [] },
      { phrase: 'your account has been compromised', confidence: 0.95, keywords: [] },

      // Financial threats
      { phrase: 'charges will be', confidence: 0.8, keywords: ['applied', 'incurred', 'made'] },
      { phrase: 'payment failed', confidence: 0.7, keywords: [] },
      { phrase: 'billing problem', confidence: 0.7, keywords: [] },
    ];

    for (const { phrase, confidence, keywords } of fearPhrases) {
      if (lowerText.includes(phrase)) {
        let finalConfidence = confidence;

        // Boost confidence if specific keywords are present
        if (keywords.length > 0) {
          const hasKeyword = keywords.some(kw => lowerText.includes(kw));
          if (hasKeyword) {
            finalConfidence = Math.min(0.98, confidence + 0.1);
          } else {
            finalConfidence = confidence * 0.8; // Lower confidence without keywords
          }
        }

        indicators.push({
          type: 'fear',
          phrase,
          confidence: finalConfidence,
          context: this.extractContext(text, phrase),
        });
      }
    }

    return indicators;
  }

  /**
   * Detect urgency pressure tactics (time-limited offers, immediate action required)
   */
  private detectUrgencyPressure(text: string, _doc: any): ManipulationIndicator[] {
    const indicators: ManipulationIndicator[] = [];
    const lowerText = text.toLowerCase();

    const urgencyPhrases = [
      { phrase: 'immediate action', confidence: 0.9 },
      { phrase: 'act immediately', confidence: 0.9 },
      { phrase: 'urgent action', confidence: 0.85 },
      { phrase: 'respond immediately', confidence: 0.85 },
      { phrase: 'within 24 hours', confidence: 0.8 },
      { phrase: 'within 48 hours', confidence: 0.75 },
      { phrase: 'expires', confidence: 0.7 },
      { phrase: 'expire', confidence: 0.7 },
      { phrase: 'time sensitive', confidence: 0.8 },
      { phrase: 'time-sensitive', confidence: 0.8 },
      { phrase: 'limited time', confidence: 0.75 },
      { phrase: 'last chance', confidence: 0.85 },
      { phrase: 'final warning', confidence: 0.9 },
      { phrase: 'final notice', confidence: 0.9 },
      { phrase: 'today only', confidence: 0.8 },
      { phrase: 'now or never', confidence: 0.9 },
      { phrase: 'don\'t wait', confidence: 0.75 },
      { phrase: 'act now', confidence: 0.8 },
      { phrase: 'act fast', confidence: 0.8 },
    ];

    for (const { phrase, confidence } of urgencyPhrases) {
      if (lowerText.includes(phrase)) {
        indicators.push({
          type: 'urgency',
          phrase,
          confidence,
          context: this.extractContext(text, phrase),
        });
      }
    }

    return indicators;
  }

  /**
   * Detect authority impersonation (CEO, IT department, bank, government)
   */
  private detectAuthorityImpersonation(text: string, _doc: any): ManipulationIndicator[] {
    const indicators: ManipulationIndicator[] = [];
    const lowerText = text.toLowerCase();

    const authorityPhrases = [
      // Corporate authority
      { phrase: 'ceo', confidence: 0.85 },
      { phrase: 'chief executive', confidence: 0.85 },
      { phrase: 'it department', confidence: 0.8 },
      { phrase: 'it team', confidence: 0.8 },
      { phrase: 'security team', confidence: 0.8 },
      { phrase: 'compliance', confidence: 0.7 },
      { phrase: 'hr department', confidence: 0.75 },

      // Financial authority
      { phrase: 'your bank', confidence: 0.75 },
      { phrase: 'bank security', confidence: 0.85 },
      { phrase: 'fraud department', confidence: 0.85 },

      // Government authority
      { phrase: 'irs', confidence: 0.9 },
      { phrase: 'internal revenue', confidence: 0.9 },
      { phrase: 'tax authority', confidence: 0.85 },
      { phrase: 'government', confidence: 0.7 },

      // Tech companies
      { phrase: 'microsoft security', confidence: 0.85 },
      { phrase: 'apple security', confidence: 0.85 },
      { phrase: 'google security', confidence: 0.85 },
    ];

    for (const { phrase, confidence } of authorityPhrases) {
      if (lowerText.includes(phrase)) {
        indicators.push({
          type: 'authority',
          phrase,
          confidence,
          context: this.extractContext(text, phrase),
        });
      }
    }

    return indicators;
  }

  /**
   * Detect scarcity tactics (limited spots, running out, exclusive offer)
   */
  private detectScarcityTactics(text: string, _doc: any): ManipulationIndicator[] {
    const indicators: ManipulationIndicator[] = [];
    const lowerText = text.toLowerCase();

    const scarcityPhrases = [
      { phrase: 'limited spots', confidence: 0.85 },
      { phrase: 'limited availability', confidence: 0.8 },
      { phrase: 'only', confidence: 0.6 }, // Only X left
      { phrase: 'running out', confidence: 0.8 },
      { phrase: 'almost gone', confidence: 0.85 },
      { phrase: 'while supplies last', confidence: 0.75 },
      { phrase: 'exclusive offer', confidence: 0.7 },
      { phrase: 'exclusive opportunity', confidence: 0.75 },
      { phrase: 'limited offer', confidence: 0.75 },
      { phrase: 'one-time', confidence: 0.7 },
    ];

    for (const { phrase, confidence } of scarcityPhrases) {
      if (lowerText.includes(phrase)) {
        indicators.push({
          type: 'scarcity',
          phrase,
          confidence,
          context: this.extractContext(text, phrase),
        });
      }
    }

    return indicators;
  }

  /**
   * Detect greed/reward appeals (prizes, money, inheritance, refunds)
   */
  private detectGreedAppeals(text: string, _doc: any): ManipulationIndicator[] {
    const indicators: ManipulationIndicator[] = [];
    const lowerText = text.toLowerCase();

    const greedPhrases = [
      { phrase: 'you won', confidence: 0.9 },
      { phrase: 'you\'ve won', confidence: 0.9 },
      { phrase: 'congratulations', confidence: 0.75 },
      { phrase: 'winner', confidence: 0.8 },
      { phrase: 'prize', confidence: 0.8 },
      { phrase: 'jackpot', confidence: 0.9 },
      { phrase: 'lottery', confidence: 0.85 },
      { phrase: 'inheritance', confidence: 0.9 },
      { phrase: 'beneficiary', confidence: 0.85 },
      { phrase: 'claim your', confidence: 0.8 },
      { phrase: 'free money', confidence: 0.95 },
      { phrase: 'cash prize', confidence: 0.85 },
      { phrase: 'million', confidence: 0.7 },
      { phrase: 'refund', confidence: 0.6 },
      { phrase: 'tax refund', confidence: 0.8 },
      { phrase: 'bonus', confidence: 0.6 },
    ];

    for (const { phrase, confidence } of greedPhrases) {
      if (lowerText.includes(phrase)) {
        indicators.push({
          type: 'greed',
          phrase,
          confidence,
          context: this.extractContext(text, phrase),
        });
      }
    }

    return indicators;
  }

  /**
   * Extract context around a phrase (50 characters before and after)
   */
  private extractContext(text: string, phrase: string, contextLength: number = 50): string {
    const index = text.toLowerCase().indexOf(phrase.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + phrase.length + contextLength);

    let context = text.substring(start, end);
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context.trim();
  }

  /**
   * Calculate average confidence from indicators
   */
  private calculateConfidence(indicators: ManipulationIndicator[]): number {
    if (indicators.length === 0) return 0;

    const avgConfidence = indicators.reduce((sum, ind) => sum + ind.confidence, 0) / indicators.length;

    // Boost confidence if multiple indicators present
    if (indicators.length >= 3) {
      return Math.min(0.98, avgConfidence + 0.1);
    } else if (indicators.length >= 2) {
      return Math.min(0.95, avgConfidence + 0.05);
    }

    return avgConfidence;
  }
}
