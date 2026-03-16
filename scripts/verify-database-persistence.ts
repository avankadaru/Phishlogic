#!/usr/bin/env tsx
/**
 * Verify Database Persistence
 *
 * Checks that analyses are being saved to the database correctly
 * with all JSONB columns properly serialized.
 */

import { query } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function verifyDatabasePersistence() {
  try {
    logger.info('Checking recent analyses in database...');

    const result = await query(`
      SELECT
        id,
        verdict,
        execution_mode,
        (execution_steps IS NOT NULL AND execution_steps != '{}'::jsonb) as has_execution_steps,
        (ai_metadata IS NOT NULL AND ai_metadata != '{}'::jsonb) as has_ai_metadata,
        (timing_metadata IS NOT NULL AND timing_metadata != '{}'::jsonb) as has_timing_metadata,
        (error_details IS NOT NULL AND error_details != '{}'::jsonb) as has_error_details,
        (red_flags IS NOT NULL AND red_flags != '[]'::jsonb) as has_red_flags,
        (signals IS NOT NULL AND signals != '[]'::jsonb) as has_signals,
        created_at
      FROM analyses
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      logger.warn('No analyses found in database');
      return;
    }

    logger.info(`Found ${result.rows.length} recent analyses`);
    logger.info('');
    logger.info('JSONB Column Status:');
    logger.info('='.repeat(80));

    let totalAnalyses = result.rows.length;
    let withExecutionSteps = 0;
    let withAiMetadata = 0;
    let withTimingMetadata = 0;
    let withErrorDetails = 0;
    let withRedFlags = 0;
    let withSignals = 0;

    for (const row of result.rows) {
      if (row.has_execution_steps) withExecutionSteps++;
      if (row.has_ai_metadata) withAiMetadata++;
      if (row.has_timing_metadata) withTimingMetadata++;
      if (row.has_error_details) withErrorDetails++;
      if (row.has_red_flags) withRedFlags++;
      if (row.has_signals) withSignals++;
    }

    logger.info(`execution_steps: ${withExecutionSteps}/${totalAnalyses} (${Math.round(withExecutionSteps/totalAnalyses*100)}%)`);
    logger.info(`ai_metadata: ${withAiMetadata}/${totalAnalyses} (${Math.round(withAiMetadata/totalAnalyses*100)}%)`);
    logger.info(`timing_metadata: ${withTimingMetadata}/${totalAnalyses} (${Math.round(withTimingMetadata/totalAnalyses*100)}%)`);
    logger.info(`error_details: ${withErrorDetails}/${totalAnalyses} (${Math.round(withErrorDetails/totalAnalyses*100)}%)`);
    logger.info(`red_flags: ${withRedFlags}/${totalAnalyses} (${Math.round(withRedFlags/totalAnalyses*100)}%)`);
    logger.info(`signals: ${withSignals}/${totalAnalyses} (${Math.round(withSignals/totalAnalyses*100)}%)`);
    logger.info('');
    logger.info('='.repeat(80));

    // Check for any database errors
    const errorCheck = await query(`
      SELECT COUNT(*) as error_count
      FROM analyses
      WHERE error_details IS NOT NULL
        AND error_details != '{}'::jsonb
        AND created_at > NOW() - INTERVAL '1 hour'
    `);

    const errorCount = parseInt(errorCheck.rows[0]?.error_count || '0', 10);

    if (errorCount > 0) {
      logger.warn(`Found ${errorCount} analyses with errors in the last hour`);
    } else {
      logger.info('✅ No error details found in recent analyses (all successful)');
    }

    logger.info('');
    logger.info('✅ Database persistence verification complete!');
    process.exit(0);

  } catch (error) {
    logger.error({ error }, 'Failed to verify database persistence');
    process.exit(1);
  }
}

verifyDatabasePersistence();
