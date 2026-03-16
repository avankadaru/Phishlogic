#!/usr/bin/env tsx

/**
 * Check analyzer getName() values
 */

import { SpfAnalyzer, DkimAnalyzer } from '../src/core/analyzers/static/index.js';
import { SenderReputationAnalyzer } from '../src/core/analyzers/reputation/sender-reputation.analyzer.js';
import { getAnalyzerRegistry } from '../src/core/engine/analyzer-registry.js';

// Register analyzers (same as in production)
const analyzerRegistry = getAnalyzerRegistry();
analyzerRegistry.register(new SpfAnalyzer());
analyzerRegistry.register(new DkimAnalyzer());
analyzerRegistry.register(new SenderReputationAnalyzer());

console.log('\n=== Analyzer Names (from getName()) ===\n');
const analyzers = analyzerRegistry.getAnalyzers();
analyzers.forEach((analyzer) => {
  console.log(`${analyzer.getName()} (type: ${analyzer.getType()})`);
});

console.log('\n=== Database Names (from integration_analyzers) ===\n');
console.log('spfAnalyzer');
console.log('dkimAnalyzer');
console.log('headerAnalyzer');
console.log('senderReputationAnalyzer');

console.log('\n=== Name Matching Test ===\n');
const dbNames = ['spfAnalyzer', 'dkimAnalyzer', 'headerAnalyzer', 'senderReputationAnalyzer'];
analyzers.forEach((analyzer) => {
  const analyzerName = analyzer.getName();
  const matches = dbNames.includes(analyzerName);
  console.log(`${analyzerName}: ${matches ? '✓ MATCHES' : '✗ NO MATCH'}`);
});
