/**
 * Verify trust_level column in whitelist_entries table
 */

import { randomUUID } from 'node:crypto';
import { query } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/index.js';

const logger = getLogger();

async function verifyTrustLevelSchema() {
  try {
    logger.info('Verifying trust_level column in whitelist_entries...');

    // Check if trust_level column exists
    const columnCheck = await query(
      `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'whitelist_entries' AND column_name = 'trust_level'`
    );

    if (columnCheck.rows.length === 0) {
      logger.error('trust_level column NOT FOUND in whitelist_entries table');
      process.exit(1);
    }

    const column = columnCheck.rows[0];
    logger.info('✓ trust_level column found:', {
      dataType: column.data_type,
      default: column.column_default,
      nullable: column.is_nullable,
    });

    // Check if index exists
    const indexCheck = await query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE tablename = 'whitelist_entries' AND indexname = 'idx_whitelist_trust_level'`
    );

    if (indexCheck.rows.length > 0) {
      logger.info('✓ idx_whitelist_trust_level index found:', {
        indexDef: indexCheck.rows[0].indexdef,
      });
    } else {
      logger.warn('! idx_whitelist_trust_level index not found');
    }

    // Test inserting a whitelist entry with trust level
    const testId = randomUUID();
    const testEntry = await query(
      `INSERT INTO whitelist_entries
       (id, tenant_id, type, value, description, added_by, trust_level)
       VALUES ($1, NULL, 'email', 'test-trust-level@example.com', 'Test entry for trust level', 'system', 'medium')
       RETURNING *`,
      [testId]
    );

    logger.info('✓ Successfully inserted test entry with trust_level:', {
      id: testEntry.rows[0].id,
      trustLevel: testEntry.rows[0].trust_level,
    });

    // Clean up test entry
    await query(`DELETE FROM whitelist_entries WHERE value = 'test-trust-level@example.com'`);
    logger.info('✓ Test entry cleaned up');

    logger.info('\n✅ Trust level schema verification PASSED!');
    process.exit(0);
  } catch (error) {
    logger.error('Schema verification FAILED:', error);
    process.exit(1);
  }
}

verifyTrustLevelSchema();
