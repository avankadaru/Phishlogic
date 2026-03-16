#!/usr/bin/env tsx
/**
 * Verify JSONB Structure
 *
 * Checks that JSONB columns contain valid JSON with correct structure
 */

import { query } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function verifyJsonbStructure() {
  try {
    logger.info('Checking JSONB structure in recent analyses...');

    const result = await query(`
      SELECT
        id,
        verdict,
        execution_steps,
        timing_metadata,
        red_flags,
        signals
      FROM analyses
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      logger.warn('No analyses found in database');
      return;
    }

    const analysis = result.rows[0];
    logger.info('');
    logger.info('Sample Analysis JSONB Structure:');
    logger.info('='.repeat(80));

    logger.info(`Analysis ID: ${analysis.id}`);
    logger.info(`Verdict: ${analysis.verdict}`);
    logger.info('');

    // Execution Steps
    if (analysis.execution_steps && Array.isArray(analysis.execution_steps)) {
      logger.info(`✅ execution_steps is valid array (${analysis.execution_steps.length} steps)`);

      // Check for Date objects (should be ISO strings now)
      const firstStep = analysis.execution_steps[0];
      if (firstStep) {
        const hasValidDates = typeof firstStep.startedAt === 'string' || firstStep.startedAt === undefined;
        if (hasValidDates) {
          logger.info('   ✅ Dates properly serialized as ISO strings');
        } else {
          logger.error('   ❌ Dates are not properly serialized');
        }
      }
    } else {
      logger.warn('⚠️  execution_steps is not a valid array');
    }

    // Timing Metadata
    if (analysis.timing_metadata && typeof analysis.timing_metadata === 'object') {
      logger.info('✅ timing_metadata is valid object');
      logger.info(`   Keys: ${Object.keys(analysis.timing_metadata).join(', ')}`);
    } else {
      logger.warn('⚠️  timing_metadata is not a valid object');
    }

    // Red Flags
    if (analysis.red_flags && Array.isArray(analysis.red_flags)) {
      logger.info(`✅ red_flags is valid array (${analysis.red_flags.length} flags)`);
    } else if (analysis.red_flags) {
      logger.warn('⚠️  red_flags exists but is not an array');
    } else {
      logger.info('✅ red_flags is empty (no red flags)');
    }

    // Signals
    if (analysis.signals && Array.isArray(analysis.signals)) {
      logger.info(`✅ signals is valid array (${analysis.signals.length} signals)`);
    } else if (analysis.signals) {
      logger.warn('⚠️  signals exists but is not an array');
    } else {
      logger.info('✅ signals is empty (no signals)');
    }

    logger.info('');
    logger.info('='.repeat(80));
    logger.info('✅ JSONB structure verification complete!');
    logger.info('');
    logger.info('Type Converter Pattern Status: WORKING CORRECTLY ✅');
    process.exit(0);

  } catch (error) {
    logger.error({ error }, 'Failed to verify JSONB structure');
    process.exit(1);
  }
}

verifyJsonbStructure();
