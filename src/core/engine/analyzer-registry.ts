/**
 * Analyzer Registry
 *
 * Central registry for all analyzers.
 * Allows strategies to access analyzers without tight coupling.
 */

import type { IAnalyzer } from '../analyzers/base/index.js';
import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();

/**
 * Global analyzer registry
 */
class AnalyzerRegistry {
  private analyzers: IAnalyzer[] = [];

  /**
   * Register an analyzer
   */
  register(analyzer: IAnalyzer): void {
    this.analyzers.push(analyzer);
    logger.debug({
      msg: 'Analyzer registered',
      analyzerName: analyzer.getName(),
      type: analyzer.getType(),
    });
  }

  /**
   * Register multiple analyzers
   */
  registerMany(analyzers: IAnalyzer[]): void {
    for (const analyzer of analyzers) {
      this.register(analyzer);
    }
  }

  /**
   * Get all registered analyzers
   */
  getAnalyzers(): IAnalyzer[] {
    return [...this.analyzers]; // Return copy for immutability
  }

  /**
   * Get analyzers by type
   */
  getAnalyzersByType(type: 'static' | 'dynamic'): IAnalyzer[] {
    return this.analyzers.filter((a) => a.getType() === type);
  }

  /**
   * Get analyzer by name
   */
  getAnalyzerByName(name: string): IAnalyzer | undefined {
    return this.analyzers.find((a) => a.getName() === name);
  }

  /**
   * Get analyzer weights map
   */
  getAnalyzerWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    for (const analyzer of this.analyzers) {
      weights.set(analyzer.getName(), analyzer.getWeight());
    }
    return weights;
  }

  /**
   * Clear all analyzers (useful for testing)
   */
  clear(): void {
    this.analyzers = [];
    logger.debug('Analyzer registry cleared');
  }

  /**
   * Get registry stats
   */
  getStats(): {
    total: number;
    static: number;
    dynamic: number;
  } {
    const staticCount = this.analyzers.filter((a) => a.getType() === 'static').length;
    const dynamicCount = this.analyzers.filter((a) => a.getType() === 'dynamic').length;

    return {
      total: this.analyzers.length,
      static: staticCount,
      dynamic: dynamicCount,
    };
  }
}

/**
 * Singleton instance
 */
let registryInstance: AnalyzerRegistry | null = null;

/**
 * Get analyzer registry instance
 */
export function getAnalyzerRegistry(): AnalyzerRegistry {
  if (!registryInstance) {
    registryInstance = new AnalyzerRegistry();
  }
  return registryInstance;
}

/**
 * Reset registry (for testing)
 */
export function resetAnalyzerRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
  }
  registryInstance = null;
}
