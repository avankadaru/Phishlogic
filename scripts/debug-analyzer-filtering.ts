#!/usr/bin/env tsx

/**
 * Debug analyzer filtering logic
 */

import { getIntegrationConfigService } from '../src/core/services/integration-config.service.js';
import { getAnalyzerRegistry } from '../src/core/engine/analyzer-registry.js';
import {
  UrlEntropyAnalyzer,
  SpfAnalyzer,
  DkimAnalyzer,
} from '../src/core/analyzers/static/index.js';
import {
  RedirectAnalyzer,
  FormAnalyzer,
} from '../src/core/analyzers/dynamic/index.js';
import { SenderReputationAnalyzer } from '../src/core/analyzers/reputation/sender-reputation.analyzer.js';
import { LinkReputationAnalyzer } from '../src/core/analyzers/reputation/link-reputation.analyzer.js';
import { ContentAnalysisAnalyzer } from '../src/core/analyzers/ml/content-analysis.analyzer.js';
import { AttachmentAnalyzer } from '../src/core/analyzers/attachment/attachment.analyzer.js';

// Register analyzers (same as in production)
const analyzerRegistry = getAnalyzerRegistry();
const staticAnalyzers = [
  new UrlEntropyAnalyzer(),
  new SpfAnalyzer(),
  new DkimAnalyzer(),
  new SenderReputationAnalyzer(),
  new LinkReputationAnalyzer(),
  new AttachmentAnalyzer(),
  new ContentAnalysisAnalyzer(),
];

const dynamicAnalyzers = [
  new RedirectAnalyzer(),
  new FormAnalyzer(),
];

analyzerRegistry.registerMany([...staticAnalyzers, ...dynamicAnalyzers]);

console.log('\n=== Registered Analyzers in Registry ===\n');
const allAnalyzers = analyzerRegistry.getAnalyzers();
allAnalyzers.forEach((analyzer) => {
  console.log(`- ${analyzer.getName()} (${analyzer.getType()})`);
});

// Load integration config
async function debug() {
  const configService = getIntegrationConfigService();
  const gmailConfig = await configService.getConfig('gmail');

  if (!gmailConfig) {
    console.log('\n❌ Gmail config not found!');
    return;
  }

  console.log('\n=== Gmail Integration Configuration ===\n');
  console.log(`Integration: ${gmailConfig.integrationName}`);
  console.log(`Execution Mode: ${gmailConfig.executionMode}`);
  console.log(`Is Active: ${gmailConfig.isActive}`);
  console.log(`Analyzers configured: ${gmailConfig.analyzers.length}`);

  console.log('\n=== Analyzer Options from DB ===\n');
  gmailConfig.analyzers.forEach((analyzerOpt) => {
    console.log(`${analyzerOpt.analyzerName}:`, JSON.stringify(analyzerOpt.options));
  });

  // Transform to map (like AnalysisEngine does)
  const analyzerOptions = gmailConfig.analyzers.reduce<Record<string, Record<string, any>>>(
    (acc, analyzerOpt) => {
      acc[analyzerOpt.analyzerName] = analyzerOpt.options;
      return acc;
    },
    {}
  );

  console.log('\n=== Analyzer Options Map (analyzerOptions) ===\n');
  console.log(JSON.stringify(analyzerOptions, null, 2));

  // Simulate filtering logic
  console.log('\n=== Filtering Logic Simulation ===\n');
  const configuredAnalyzerNames = Object.keys(analyzerOptions).map((name) => name.toLowerCase());
  console.log('Configured analyzer names (lowercase):', configuredAnalyzerNames);

  console.log('\n=== Matching Results ===\n');
  const matchedAnalyzers = allAnalyzers.filter((analyzer) => {
    const analyzerName = analyzer.getName();
    const lowerName = analyzerName.toLowerCase();
    const matches = configuredAnalyzerNames.includes(lowerName);
    console.log(`${analyzerName} → ${lowerName} → ${matches ? '✓ MATCH' : '✗ NO MATCH'}`);
    return matches;
  });

  console.log(`\n=== Filtered Analyzers (${matchedAnalyzers.length}) ===\n`);
  matchedAnalyzers.forEach((analyzer) => {
    console.log(`- ${analyzer.getName()}`);
  });

  process.exit(0);
}

debug();
