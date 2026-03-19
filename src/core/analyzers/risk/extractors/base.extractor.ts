/**
 * Base Extractor Framework
 *
 * Provides abstract base class and interfaces for content extractors.
 * Follows SOLID principles:
 * - Single Responsibility: Each extractor handles one type of extraction
 * - Open/Closed: Easy to add new extractors without modifying existing code
 * - Liskov Substitution: All extractors can be swapped
 * - Interface Segregation: Small, focused interfaces
 * - Dependency Inversion: Depends on abstractions
 */

import type { NormalizedInput } from '../../../models/input.js';

/**
 * Base extractor interface - all extractors implement this
 * Dependency Inversion: Depend on abstraction, not concrete classes
 */
export interface ContentExtractor<T> {
  /**
   * Extract data from input
   * @returns Extraction result with timing
   */
  extract(input: NormalizedInput): Promise<ExtractionResult<T>>;

  /**
   * Extractor name for logging/debugging
   */
  getName(): string;

  /**
   * Check if extractor is applicable to this input
   */
  isApplicable(input: NormalizedInput): boolean;

  /**
   * Get empty data structure when extractor doesn't apply or fails
   */
  getEmptyData(): T;
}

/**
 * Extraction result wrapper
 */
export interface ExtractionResult<T> {
  data: T;
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Base extractor class with common utilities
 * Template Method pattern for timing and error handling
 */
export abstract class BaseExtractor<T> implements ContentExtractor<T> {
  abstract getName(): string;
  abstract isApplicable(input: NormalizedInput): boolean;
  protected abstract extractData(input: NormalizedInput): Promise<T>;
  abstract getEmptyData(): T;

  /**
   * Extract data with automatic timing and error handling
   */
  async extract(input: NormalizedInput): Promise<ExtractionResult<T>> {
    const startTime = Date.now();

    if (!this.isApplicable(input)) {
      return {
        data: this.getEmptyData(),
        success: true,
        durationMs: 0,
      };
    }

    try {
      const data = await this.extractData(input);
      return {
        data,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        data: this.getEmptyData(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }
}
