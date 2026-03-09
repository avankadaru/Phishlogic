import { query, closeDatabase } from '../src/infrastructure/database/client.js';

async function checkMigration() {
  try {
    // Check for new columns
    const columnsResult = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'analyses'
      AND column_name IN ('execution_mode', 'ai_metadata', 'timing_metadata', 'error_details', 'input_source')
      ORDER BY column_name
    `);

    console.log('\n✓ New columns in analyses table:');
    columnsResult.rows.forEach((row: any) => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    // Check for new indexes
    const indexesResult = await query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'analyses'
      AND indexname LIKE 'idx_analyses_%'
      AND indexname IN (
        'idx_analyses_execution_mode',
        'idx_analyses_input_source',
        'idx_analyses_ai_metadata_gin',
        'idx_analyses_timing_metadata_gin',
        'idx_analyses_error_details_gin'
      )
      ORDER BY indexname
    `);

    console.log('\n✓ New indexes:');
    indexesResult.rows.forEach((row: any) => {
      console.log(`  - ${row.indexname}`);
    });

    // Check if view exists
    const viewResult = await query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_name = 'analyses_debug_view'
    `);

    console.log('\n✓ Views:');
    if (viewResult.rows.length > 0) {
      console.log('  - analyses_debug_view');
    } else {
      console.log('  ⚠ analyses_debug_view NOT FOUND');
    }

    // Check if schema_migrations table exists and has entry
    const migrationResult = await query(`
      SELECT version, description, applied_at
      FROM schema_migrations
      WHERE version = 7
    `);

    console.log('\n✓ Migration tracking:');
    if (migrationResult.rows.length > 0) {
      const migration = migrationResult.rows[0];
      console.log(`  - Version: ${migration.version}`);
      console.log(`  - Description: ${migration.description}`);
      console.log(`  - Applied at: ${migration.applied_at}`);
    } else {
      console.log('  ⚠ Migration 007 NOT TRACKED');
    }

    console.log('\n✅ Migration 007 verification complete!\n');
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

checkMigration();
