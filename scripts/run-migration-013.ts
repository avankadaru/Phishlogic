import { getDatabaseClient } from '../src/infrastructure/database/client.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const db = getDatabaseClient();
  try {
    console.log('Running migration 013: Update analyzer descriptions...');

    const sql = fs.readFileSync(
      path.join(__dirname, '../src/infrastructure/database/migrations/013_update_analyzer_descriptions.sql'),
      'utf-8'
    );

    await db.query(sql);
    console.log('✅ Migration 013 completed successfully');

    // Verify
    const result = await db.query(`
      SELECT analyzer_name, LEFT(description, 100) as description_preview
      FROM analyzers
      WHERE analyzer_name IN ('formAnalyzer', 'redirectAnalyzer')
    `);

    console.log('\nUpdated descriptions:');
    result.rows.forEach(row => {
      console.log(`${row.analyzer_name}: ${row.description_preview}...`);
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await db.end();
  }
}

runMigration();
