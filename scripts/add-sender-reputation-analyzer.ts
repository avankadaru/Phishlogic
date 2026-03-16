#!/usr/bin/env tsx

/**
 * Add SenderReputationAnalyzer to gmail integration
 */

import { initDatabase, closeDatabase } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function addSenderReputationAnalyzer() {
  try {
    const pool = initDatabase();

    logger.info('Adding SenderReputationAnalyzer to gmail integration...');

    const result = await pool.query(`
      INSERT INTO integration_analyzers (integration_name, analyzer_name, execution_order, analyzer_options)
      VALUES (
        'gmail',
        'senderReputationAnalyzer',
        4,  -- After spf, dkim, header
        jsonb_build_object(
          'enableWhois', true,
          'whoisTimeoutMs', 10000,
          'dnsTimeoutMs', 10000
        )
      )
      ON CONFLICT (integration_name, analyzer_name) DO UPDATE
      SET analyzer_options = EXCLUDED.analyzer_options
      RETURNING *;
    `);

    logger.info({
      row: result.rows[0],
    }, '✓ SenderReputationAnalyzer added successfully');

    // Verify configuration
    const verification = await pool.query(`
      SELECT integration_name, analyzer_name, execution_order, analyzer_options
      FROM integration_analyzers
      WHERE integration_name = 'gmail'
      ORDER BY execution_order;
    `);

    console.log('\n=== Gmail Integration Analyzers ===\n');
    verification.rows.forEach((row) => {
      console.log(`${row.execution_order}. ${row.analyzer_name}`);
      console.log(`   Options: ${JSON.stringify(row.analyzer_options, null, 2)}`);
    });

    logger.info('\n✅ Configuration complete!');

    await closeDatabase();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '❌ Failed to add SenderReputationAnalyzer');
    await closeDatabase();
    process.exit(1);
  }
}

addSenderReputationAnalyzer();
