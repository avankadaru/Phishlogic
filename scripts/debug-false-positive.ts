/**
 * Debug Script: False Positive Analysis
 *
 * Analyzes why legitimate content is being flagged as malicious
 * by examining signals, weights, and verdict calculation
 */

import { getDatabaseClient } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/index.js';

const logger = getLogger();

async function debugFalsePositive() {
  const db = getDatabaseClient();

  console.log('\n========================================');
  console.log('FALSE POSITIVE DIAGNOSTIC');
  console.log('========================================\n');

  try {
    // 1. Get most recent malicious verdicts
    console.log('1. Fetching recent MALICIOUS verdicts...');
    const analysesResult = await db.query(`
      SELECT
        id,
        verdict,
        confidence_score,
        score,
        input_source,
        analyzers_run,
        metadata,
        created_at
      FROM analyses
      WHERE verdict = 'Malicious'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (analysesResult.rows.length === 0) {
      console.log('   ℹ️  No recent malicious verdicts found');
      process.exit(0);
    }

    console.log(`   ✓ Found ${analysesResult.rows.length} recent malicious verdicts\n`);

    // Analyze each verdict
    for (const analysis of analysesResult.rows) {
      console.log('----------------------------------------');
      console.log(`Analysis ID: ${analysis.id}`);
      console.log(`Created: ${analysis.created_at}`);
      console.log(`Score: ${analysis.score}/10`);
      console.log(`Confidence: ${(analysis.confidence_score * 100).toFixed(1)}%`);
      console.log(`Source: ${analysis.input_source || 'unknown'}`);
      console.log(`Analyzers Run: ${analysis.analyzers_run?.length || 0}`);

      // Parse metadata to get signals
      const metadata = analysis.metadata || {};
      const signals = metadata.signals || [];

      console.log(`\nSignals Generated (${signals.length}):`);

      // Group signals by severity
      const signalsBySeverity: Record<string, any[]> = {
        critical: [],
        high: [],
        medium: [],
        low: [],
      };

      signals.forEach((signal: any) => {
        const severity = signal.severity || 'low';
        signalsBySeverity[severity].push(signal);
      });

      // Display signals by severity
      ['critical', 'high', 'medium', 'low'].forEach((severity) => {
        const signalsInCategory = signalsBySeverity[severity];
        if (signalsInCategory.length > 0) {
          console.log(`\n  ${severity.toUpperCase()} (${signalsInCategory.length}):`);
          signalsInCategory.forEach((signal: any) => {
            console.log(`    ✗ [${signal.analyzerName}] ${signal.signalType}`);
            console.log(`      ${signal.description}`);
            console.log(`      Confidence: ${(signal.confidence * 100).toFixed(0)}%`);
            if (signal.evidence) {
              console.log(`      Evidence:`, JSON.stringify(signal.evidence, null, 2).split('\n').slice(0, 3).join('\n'));
            }
          });
        }
      });

      // Check for common false positive patterns
      console.log('\n  False Positive Indicators:');

      const formSignals = signals.filter((s: any) =>
        s.signalType?.includes('form') || s.analyzerName === 'FormAnalyzer'
      );
      if (formSignals.length > 0) {
        console.log(`    ⚠️  ${formSignals.length} form-related signals (may be legitimate login forms)`);
      }

      const redirectSignals = signals.filter((s: any) =>
        s.signalType?.includes('redirect') || s.analyzerName === 'RedirectAnalyzer'
      );
      if (redirectSignals.length > 0) {
        console.log(`    ⚠️  ${redirectSignals.length} redirect signals (may be normal redirects)`);
      }

      const highConfidenceSignals = signals.filter((s: any) => s.confidence > 0.8);
      console.log(`    ℹ️  ${highConfidenceSignals.length} high-confidence signals (>80%)`);

      const lowConfidenceSignals = signals.filter((s: any) => s.confidence < 0.3);
      if (lowConfidenceSignals.length > 0) {
        console.log(`    ⚠️  ${lowConfidenceSignals.length} low-confidence signals (<30%) contributing to verdict`);
      }

      console.log('\n');
    }

    // 2. Check analyzer configuration and weights
    console.log('\n2. Checking analyzer weights...');
    const weightsResult = await db.query(`
      SELECT
        analyzer_name,
        default_weight,
        analyzer_type,
        is_active
      FROM analyzers
      WHERE is_active = true
      ORDER BY default_weight DESC
    `);

    console.log('   Current analyzer weights:');
    weightsResult.rows.forEach((analyzer) => {
      console.log(`     - ${analyzer.analyzer_name}: ${analyzer.default_weight}x (${analyzer.analyzer_type})`);
    });

    // 3. Recommendations
    console.log('\n========================================');
    console.log('RECOMMENDATIONS');
    console.log('========================================\n');

    console.log('Common False Positive Causes:');
    console.log('  1. FormAnalyzer detecting legitimate login forms');
    console.log('     → Solution: Increase confidence threshold or add URL whitelist');
    console.log('');
    console.log('  2. RedirectAnalyzer flagging normal redirects');
    console.log('     → Solution: Only flag suspicious redirect chains (3+ hops)');
    console.log('');
    console.log('  3. Low-confidence signals weighted equally');
    console.log('     → Solution: Weight signals by confidence in verdict calculation');
    console.log('');
    console.log('  4. Aggressive thresholds');
    console.log('     → Solution: Adjust verdict thresholds in VerdictService');
    console.log('');

    console.log('To fix:');
    console.log('  • Check src/core/services/verdict.service.ts threshold values');
    console.log('  • Review FormAnalyzer and RedirectAnalyzer logic');
    console.log('  • Add domain to whitelist if it\'s known legitimate');
    console.log('');

    process.exit(0);
  } catch (error) {
    logger.error({
      msg: 'Debug failed',
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('\n✗ DEBUG FAILED');
    console.error(error);
    process.exit(1);
  }
}

debugFalsePositive();
