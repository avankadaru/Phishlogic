import { getDatabaseClient } from '../src/infrastructure/database/client.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const db = getDatabaseClient();
  try {
    console.log('Running migration 014: Update Chrome integration...');

    const sql = fs.readFileSync(
      path.join(__dirname, '../src/infrastructure/database/migrations/014_update_chrome_integration.sql'),
      'utf-8'
    );

    await db.query(sql);
    console.log('✅ Migration 014 completed successfully');

    // Verify
    const result = await db.query(`
      SELECT
        ia.analyzer_name,
        ia.execution_order,
        COALESCE(ta.estimated_duration_ms, 0) as duration_ms,
        ta.is_long_running
      FROM integration_analyzers ia
      LEFT JOIN task_analyzers ta ON ia.analyzer_name = ta.analyzer_name
      WHERE ia.integration_name = 'chrome'
      ORDER BY ia.execution_order
    `);

    console.log('\nChrome Integration Analyzers:');
    let totalDuration = 0;
    result.rows.forEach(row => {
      console.log(`${row.execution_order}. ${row.analyzer_name} (~${row.duration_ms}ms)${row.is_long_running ? ' [LONG-RUNNING]' : ''}`);
      totalDuration += row.duration_ms || 0;
    });
    console.log(`\nTotal estimated time: ~${(totalDuration / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await db.end();
  }
}

runMigration();
