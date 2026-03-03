/**
 * Base analyzer interface and abstract class
 */

import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';

/**
 * Analyzer interface that all analyzers must implement
 */
export interface IAnalyzer {
  /**
   * Performs analysis on the input and returns signals
   * @param input - Normalized input to analyze
   * @returns Array of analysis signals
   */
  analyze(input: NormalizedInput): Promise<AnalysisSignal[]>;

  /**
   * Gets the name of this analyzer
   * @returns Analyzer name
   */
  getName(): string;

  /**
   * Gets the weight of this analyzer for scoring
   * Higher weight means signals from this analyzer are more important
   * @returns Weight value (typically 0.5 - 2.0)
   */
  getWeight(): number;

  /**
   * Checks if this analyzer is applicable to the given input
   * @param input - Normalized input
   * @returns true if analyzer can process this input
   */
  isApplicable(input: NormalizedInput): boolean;

  /**
   * Gets the type of analyzer (static or dynamic)
   * @returns Analyzer type
   */
  getType(): 'static' | 'dynamic';
}

/**
 * Abstract base analyzer class providing common functionality
 */
export abstract class BaseAnalyzer implements IAnalyzer {
  /**
   * Performs analysis on the input
   * Must be implemented by subclasses
   */
  abstract analyze(input: NormalizedInput): Promise<AnalysisSignal[]>;

  /**
   * Gets the analyzer name
   * Must be implemented by subclasses
   */
  abstract getName(): string;

  /**
   * Gets the analyzer weight
   * Must be implemented by subclasses
   */
  abstract getWeight(): number;

  /**
   * Gets the analyzer type
   * Must be implemented by subclasses
   */
  abstract getType(): 'static' | 'dynamic';

  /**
   * Default implementation returns true (analyzer applies to all inputs)
   * Override in subclasses if needed
   */
  isApplicable(_input: NormalizedInput): boolean {
    return true;
  }

  /**
   * Helper method to create a signal
   */
  protected createSignal(params: {
    signalType: AnalysisSignal['signalType'];
    severity: AnalysisSignal['severity'];
    confidence: number;
    description: string;
    evidence?: Record<string, unknown>;
  }): AnalysisSignal {
    return {
      analyzerName: this.getName(),
      signalType: params.signalType,
      severity: params.severity,
      confidence: Math.max(0, Math.min(1, params.confidence)), // Clamp to [0,1]
      description: params.description,
      evidence: params.evidence,
    };
  }

  /**
   * Helper method to safely execute analysis with error handling
   */
  protected async safeAnalyze(
    input: NormalizedInput,
    analysisFn: (input: NormalizedInput) => Promise<AnalysisSignal[]>
  ): Promise<AnalysisSignal[]> {
    try {
      return await analysisFn(input);
    } catch (error) {
      // Log error but don't fail the entire analysis
      console.error(`Error in analyzer ${this.getName()}:`, error);
      return [];
    }
  }
}
