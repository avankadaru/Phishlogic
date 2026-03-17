/**
 * Verify Whitelist Migration (012_simplify_whitelist_trust.sql)
 *
 * Checks that:
 * 1. trust_level column is removed
 * 2. New columns (is_trusted, scan_attachments, scan_rich_content) exist
 * 3. New index idx_whitelist_scan_options exists
 */

import { query, closePool } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/index.js';

const logger = getLogger();

async function verifyMigration() {
  try {
    logger.info('Verifying whitelist migration 012...');

    // Check column existence
    const columnCheck = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'whitelist_entries'
        AND column_name IN ('trust_level', 'is_trusted', 'scan_attachments', 'scan_rich_content')
      ORDER BY column_name;
    `);

    logger.info('Column status:', {
      columns: columnCheck.rows,
    });

    // Verify expected state
    const columnNames = columnCheck.rows.map((r: any) => r.column_name);
    const hasOldColumn = columnNames.includes('trust_level');
    const hasNewColumns =
      columnNames.includes('is_trusted') &&
      columnNames.includes('scan_attachments') &&
      columnNames.includes('scan_rich_content');

    if (hasOldColumn) {
      logger.error('❌ Migration incomplete: trust_level column still exists');
      process.exit(1);
    }

    if (!hasNewColumns) {
      logger.error('❌ Migration incomplete: New columns missing');
      process.exit(1);
    }

    // Check index existence
    const indexCheck = await query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'whitelist_entries'
        AND indexname = 'idx_whitelist_scan_options';
    `);

    if (indexCheck.rows.length === 0) {
      logger.error('❌ Migration incomplete: idx_whitelist_scan_options index missing');
      process.exit(1);
    }

    logger.info('Index status:', {
      index: indexCheck.rows[0],
    });

    // Sample data verification
    const dataCheck = await query(`
      SELECT id, type, value, is_trusted, scan_attachments, scan_rich_content
      FROM whitelist_entries
      WHERE deleted_at IS NULL
      LIMIT 5;
    `);

    logger.info('Sample whitelist entries:', {
      count: dataCheck.rows.length,
      entries: dataCheck.rows,
    });

    logger.info('✓ Migration 012 verification successful!');
    logger.info('✓ trust_level column removed');
    logger.info('✓ New columns (is_trusted, scan_attachments, scan_rich_content) added');
    logger.info('✓ New index idx_whitelist_scan_options created');

  } catch (error) {
    logger.error('Migration verification failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run verification
verifyMigration().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
