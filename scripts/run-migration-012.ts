import { getDatabaseClient } from '../src/infrastructure/database/client.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const db = getDatabaseClient();

  try {
    console.log('🚀 Running Migration 012: Add Missing Analyzers\n');

    // Read migration file
    const migrationPath = join(__dirname, '../src/infrastructure/database/migrations/012_add_missing_analyzers.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Execute migration
    await db.query(migrationSQL);

    console.log('✅ Migration 012 completed successfully\n');

    // Verify results
    const result = await db.query(`
      SELECT analyzer_name, display_name, category
      FROM analyzers
      WHERE analyzer_name IN (
        'senderReputationAnalyzer',
        'linkReputationAnalyzer',
        'attachmentAnalyzer',
        'contentAnalysisAnalyzer',
        'imageAnalyzer',
        'qrcodeAnalyzer',
        'buttonAnalyzer'
      )
      ORDER BY analyzer_name
    `);

    console.log(`📋 ${result.rows.length} Analyzers Added:\n`);
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.display_name} (${row.analyzer_name})`);
      console.log(`   Category: ${row.category}`);
    });

    // Check total count
    const totalResult = await db.query('SELECT COUNT(*) as count FROM analyzers');
    console.log(`\n✅ Total analyzers in database: ${totalResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await db.end();
  }
}

runMigration();
