#!/usr/bin/env tsx

/**
 * Verify analyzer_options migration
 * Checks schema and data for integration_analyzers table
 */

import { initDatabase, closeDatabase } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function verifyMigration() {
  try {
    const pool = initDatabase();

    // Check if analyzer_options column exists
    logger.info('Checking analyzer_options column...');
    const schemaCheck = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'integration_analyzers'
        AND column_name = 'analyzer_options';
    `);

    if (schemaCheck.rows.length === 0) {
      logger.error('❌ analyzer_options column NOT found');
      await closeDatabase();
      process.exit(1);
    }

    logger.info({
      column: schemaCheck.rows[0].column_name,
      type: schemaCheck.rows[0].data_type,
      default: schemaCheck.rows[0].column_default,
    }, '✓ analyzer_options column exists');

    // Check SenderReputationAnalyzer configuration
    logger.info('Checking SenderReputationAnalyzer configuration...');
    const configCheck = await pool.query(`
      SELECT
        integration_name,
        analyzer_name,
        analyzer_options
      FROM integration_analyzers
      WHERE analyzer_name = 'senderReputationAnalyzer';
    `);

    if (configCheck.rows.length === 0) {
      logger.warn('⚠ No SenderReputationAnalyzer found in integration_analyzers');
    } else {
      logger.info({
        count: configCheck.rows.length,
        configurations: configCheck.rows,
      }, '✓ SenderReputationAnalyzer configurations found');
    }

    // Show all analyzer options
    logger.info('All integration_analyzers with options...');
    const allAnalyzers = await pool.query(`
      SELECT
        integration_name,
        analyzer_name,
        analyzer_options
      FROM integration_analyzers
      ORDER BY integration_name, execution_order;
    `);

    console.log('\n=== Integration Analyzers Configuration ===\n');
    allAnalyzers.rows.forEach((row) => {
      console.log(`${row.integration_name} → ${row.analyzer_name}`);
      console.log(`  Options: ${JSON.stringify(row.analyzer_options, null, 2)}`);
    });

    logger.info('\n✅ Migration verification complete!');

    await closeDatabase();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '❌ Verification failed');
    await closeDatabase();
    process.exit(1);
  }
}

verifyMigration();
