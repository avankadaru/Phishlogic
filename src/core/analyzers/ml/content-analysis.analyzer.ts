/**
 * Content Analysis Analyzer
 * ML/NLP-based content analysis (NO keywords)
 *
 * Replaces keyword-based detection with systematic approaches:
 * - Sentiment analysis (algorithmic)
 * - Language anomaly detection (grammar/spelling patterns)
 * - Brand impersonation detection (entity extraction)
 * - Readability analysis (Flesch reading ease)
 *
 * This analyzer is designed to replace HeaderAnalyzer and EmotionalManipulationAnalyzer
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import * as natural from 'natural';
import Sentiment from 'sentiment';
import { detectUrgencyLanguage as detectUrgencyLanguageImpl } from './urgency-detector.js';

const logger = getLogger();

interface SentimentResult {
  score: number;  // -5 to +5 (negative = threatening/urgent)
  comparative: number;  // Normalized score
  negative: string[];
  positive: string[];
}

interface LanguageAnomalyResult {
  hasAnomalies: boolean;
  anomalies: string[];
  confidence: number;
}

interface BrandImpersonationResult {
  suspected: boolean;
  brands: string[];
  senderDomain: string;
  confidence: number;
}

interface ReadabilityResult {
  fleschScore: number;  // 0-100 (lower = harder to read)
  grade: string;
  suspicious: boolean;
}

/**
 * Content Analysis Analyzer
 * Uses ML/NLP algorithms instead of keyword matching
 */
export class ContentAnalysisAnalyzer extends BaseAnalyzer {
  private sentiment: Sentiment;
  private tokenizer: natural.WordTokenizer;

  // Known major brands (for impersonation detection)
  private readonly majorBrands = new Set([
    'paypal', 'amazon', 'microsoft', 'apple', 'google', 'facebook',
    'netflix', 'adobe', 'linkedin', 'twitter', 'instagram',
    'wells fargo', 'bank of america', 'chase', 'citibank',
    'fedex', 'ups', 'dhl', 'usps',
  ]);

  constructor() {
    super();
    this.sentiment = new Sentiment();
    this.tokenizer = new natural.WordTokenizer();
  }

  getName(): string {
    return 'ContentAnalysisAnalyzer';
  }

  getWeight(): number {
    return this.config.analysis.analyzerWeights.contentAnalysis; // Configurable from env (default: 1.6)
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
    const body = input.data.parsed.body.text || '';
    const fromDomain = input.data.parsed.from.address.split('@')[1] || '';

    logger.debug({
      msg: 'Starting content analysis',
      subjectLength: subject.length,
      bodyLength: body.length,
    });

    // Execute all analyses in parallel
    const [sentimentResult, languageResult, brandResult, readabilityResult] =
      await Promise.allSettled([
        this.analyzeSentiment(subject, body),
        this.detectLanguageAnomalies(body),
        this.detectBrandImpersonation(subject, body, fromDomain),
        this.analyzeReadability(body),
      ]);

    // Process sentiment analysis
    if (sentimentResult.status === 'fulfilled') {
      const sentiment = sentimentResult.value;

      // Negative sentiment (fear, urgency, threats)
      if (sentiment.score < -3) {
        signals.push(
          this.createSignal({
            signalType: 'negative_sentiment_high',
            severity: 'medium',
            confidence: Math.min(0.85, 0.6 + Math.abs(sentiment.score) * 0.05),
            description: `Email uses threatening or urgent language (sentiment score: ${sentiment.score})`,
            evidence: {
              sentimentScore: sentiment.score,
              comparative: sentiment.comparative,
              negativeWords: sentiment.negative.slice(0, 10),
            },
          })
        );
      }

      // Very negative sentiment with many negative words
      if (sentiment.negative.length > 5 && sentiment.score < -2) {
        signals.push(
          this.createSignal({
            signalType: 'emotional_pressure_detected',
            severity: 'medium',
            confidence: 0.7,
            description: `Email uses emotional manipulation tactics (${sentiment.negative.length} negative indicators)`,
            evidence: {
              negativeWordCount: sentiment.negative.length,
              examples: sentiment.negative.slice(0, 10),
            },
          })
        );
      }
    }

    // Process language anomalies
    if (languageResult.status === 'fulfilled' && languageResult.value.hasAnomalies) {
      const language = languageResult.value;

      signals.push(
        this.createSignal({
          signalType: 'language_anomaly_detected',
          severity: 'medium',
          confidence: language.confidence,
          description: `Email contains language anomalies: ${language.anomalies.join(', ')}`,
          evidence: {
            anomalies: language.anomalies,
          },
        })
      );
    }

    // Process brand impersonation
    if (brandResult.status === 'fulfilled' && brandResult.value.suspected) {
      const brand = brandResult.value;

      signals.push(
        this.createSignal({
          signalType: 'brand_impersonation_suspected',
          severity: 'high',
          confidence: brand.confidence,
          description: `Sender may be impersonating ${brand.brands.join(', ')} (domain: ${brand.senderDomain})`,
          evidence: {
            brands: brand.brands,
            senderDomain: brand.senderDomain,
          },
        })
      );
    }

    // Process readability
    if (readabilityResult.status === 'fulfilled' && readabilityResult.value.suspicious) {
      const readability = readabilityResult.value;

      signals.push(
        this.createSignal({
          signalType: 'poor_readability',
          severity: 'low',
          confidence: 0.5,
          description: `Email has poor readability (Flesch score: ${readability.fleschScore.toFixed(1)}, grade: ${readability.grade})`,
          evidence: {
            fleschScore: readability.fleschScore,
            grade: readability.grade,
          },
        })
      );
    }

    // Deterministic urgency-language detector — complements ML sentiment.
    // Fires when subject contains a hard-urgency phrase OR when body combines
    // an urgency token with an action token ("verify now", "reset your password
    // immediately", etc.). Modelled after how an AI prompt treats urgency as
    // a semantic content feature rather than a link property.
    const urgencySignal = this.detectUrgencyLanguage(subject, body);
    if (urgencySignal) {
      signals.push(urgencySignal);
    }

    logger.debug({
      msg: 'Content analysis complete',
      signalsGenerated: signals.length,
    });

    return signals;
  }

  /**
   * Detect medium-scope urgency language. Returns a single high-severity
   * `urgency_language_detected` signal or null. Delegates keyword matching
   * to the pure `urgency-detector` module so it can be unit tested without
   * instantiating the full analyzer (which transitively imports `natural`).
   */
  private detectUrgencyLanguage(
    subject: string,
    body: string
  ): AnalysisSignal | null {
    const result = detectUrgencyLanguageImpl(subject, body);

    if (!result.firesBySubject && !result.firesByBody) {
      return null;
    }

    const triggers: string[] = [];
    if (result.firesBySubject) triggers.push('subject urgency phrase');
    if (result.firesByBody) triggers.push('body urgency + action combo');

    return this.createSignal({
      signalType: 'urgency_language_detected',
      severity: 'high',
      confidence: 0.8,
      description: `Email uses high-pressure urgency and action language (${triggers.join(', ')})`,
      evidence: {
        subjectMatches: result.subjectMatches,
        bodyUrgencyMatches: result.bodyUrgencyMatches,
        bodyActionMatches: result.bodyActionMatches,
      },
    });
  }

  /**
   * Analyze sentiment using sentiment analysis library
   * Returns score from -5 (very negative) to +5 (very positive)
   */
  private async analyzeSentiment(subject: string, body: string): Promise<SentimentResult> {
    const combinedText = `${subject}\n\n${body}`;
    const result = this.sentiment.analyze(combinedText);

    return {
      score: result.score,
      comparative: result.comparative,
      negative: result.negative,
      positive: result.positive,
    };
  }

  /**
   * Detect language anomalies (grammar, spelling, patterns)
   * Uses heuristics rather than keyword matching
   */
  private async detectLanguageAnomalies(body: string): Promise<LanguageAnomalyResult> {
    const anomalies: string[] = [];

    if (body.length < 20) {
      return { hasAnomalies: false, anomalies: [], confidence: 0 };
    }

    // Check for excessive capitalization (>30% of letters)
    const letters = body.replace(/[^a-zA-Z]/g, '');
    const uppercase = body.replace(/[^A-Z]/g, '');
    if (letters.length > 10 && uppercase.length / letters.length > 0.3) {
      anomalies.push('Excessive capitalization');
    }

    // Check for repeated punctuation (!!!, ???, etc.)
    if (/[!?]{3,}/.test(body)) {
      anomalies.push('Excessive punctuation');
    }

    // Check for inconsistent spacing (multiple spaces)
    if (/\s{3,}/.test(body)) {
      anomalies.push('Inconsistent spacing');
    }

    // Check for mixed character sets (potential obfuscation)
    const words = this.tokenizer.tokenize(body) || [];
    const mixedWords = words.filter((word) => /[a-zA-Z]/.test(word) && /[0-9]/.test(word));
    if (mixedWords.length > words.length * 0.15) {
      anomalies.push('Unusual character mixing');
    }

    // Check for very short sentences (average < 5 words = broken grammar)
    const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgWordsPerSentence =
      sentences.reduce((sum, s) => sum + (this.tokenizer.tokenize(s) || []).length, 0) /
      sentences.length;

    if (sentences.length > 2 && avgWordsPerSentence < 5) {
      anomalies.push('Fragmented sentences');
    }

    // Check for very long sentences (average > 40 words = poor quality)
    if (sentences.length > 2 && avgWordsPerSentence > 40) {
      anomalies.push('Run-on sentences');
    }

    const confidence = Math.min(0.8, anomalies.length * 0.2);

    return {
      hasAnomalies: anomalies.length > 0,
      anomalies,
      confidence,
    };
  }

  /**
   * Detect brand impersonation by checking if major brands mentioned
   * but sender domain doesn't match
   */
  private async detectBrandImpersonation(
    subject: string,
    body: string,
    senderDomain: string
  ): Promise<BrandImpersonationResult> {
    const combinedText = `${subject} ${body}`.toLowerCase();
    const senderLower = senderDomain.toLowerCase();

    // Find mentioned brands
    const mentionedBrands: string[] = [];
    const brandsArray = Array.from(this.majorBrands);
    for (const brand of brandsArray) {
      // Check if brand is mentioned
      if (combinedText.includes(brand)) {
        // Check if sender domain matches brand (approximate match)
        const brandWord = brand.replace(/\s+/g, '');
        if (!senderLower.includes(brandWord)) {
          mentionedBrands.push(brand);
        }
      }
    }

    if (mentionedBrands.length === 0) {
      return {
        suspected: false,
        brands: [],
        senderDomain,
        confidence: 0,
      };
    }

    // Higher confidence if multiple brands mentioned or if in subject
    let confidence = 0.75;
    if (mentionedBrands.length > 1) {
      confidence = 0.85;
    }
    if (mentionedBrands.some((brand) => subject.toLowerCase().includes(brand))) {
      confidence += 0.05;
    }

    return {
      suspected: true,
      brands: mentionedBrands,
      senderDomain,
      confidence: Math.min(0.95, confidence),
    };
  }

  /**
   * Analyze readability using Flesch Reading Ease formula
   * Score: 0-100 (higher = easier to read)
   * < 30 = Very difficult (college graduate)
   * 30-50 = Difficult (college)
   * 50-60 = Fairly difficult (high school)
   * 60-70 = Standard (8th-9th grade)
   * 70-80 = Fairly easy (7th grade)
   * 80-90 = Easy (6th grade)
   * 90-100 = Very easy (5th grade)
   */
  private async analyzeReadability(body: string): Promise<ReadabilityResult> {
    if (body.length < 50) {
      return {
        fleschScore: 70,
        grade: 'N/A',
        suspicious: false,
      };
    }

    // Count sentences
    const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const sentenceCount = sentences.length;

    // Count words
    const words = this.tokenizer.tokenize(body) || [];
    const wordCount = words.length;

    // Count syllables (approximate)
    const syllableCount = words.reduce((sum, word) => sum + this.countSyllables(word), 0);

    // Flesch Reading Ease = 206.835 - 1.015 × (words/sentences) - 84.6 × (syllables/words)
    const avgWordsPerSentence = wordCount / sentenceCount;
    const avgSyllablesPerWord = syllableCount / wordCount;

    const fleschScore = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    // Determine grade level
    let grade = 'Unknown';
    if (fleschScore < 30) grade = 'College graduate';
    else if (fleschScore < 50) grade = 'College';
    else if (fleschScore < 60) grade = 'High school';
    else if (fleschScore < 70) grade = '8th-9th grade';
    else if (fleschScore < 80) grade = '7th grade';
    else if (fleschScore < 90) grade = '6th grade';
    else grade = '5th grade';

    // Suspicious if too difficult (< 30) or too easy (> 90)
    // Phishing emails often have poor quality (very low score) or are overly simplistic
    const suspicious = fleschScore < 30 || fleschScore > 95;

    return {
      fleschScore: Math.max(0, Math.min(100, fleschScore)),
      grade,
      suspicious,
    };
  }

  /**
   * Count syllables in a word (approximate)
   */
  private countSyllables(word: string): number {
    word = word.toLowerCase();

    // Remove non-alphabetic characters
    word = word.replace(/[^a-z]/g, '');

    if (word.length <= 3) return 1;

    // Count vowel groups
    let syllables = 0;
    let previousWasVowel = false;

    for (let i = 0; i < word.length; i++) {
      const isVowel = /[aeiouy]/.test(word[i] || '');

      if (isVowel && !previousWasVowel) {
        syllables++;
      }

      previousWasVowel = isVowel;
    }

    // Adjust for silent 'e'
    if (word.endsWith('e')) {
      syllables--;
    }

    // Ensure at least 1 syllable
    return Math.max(1, syllables);
  }
}
