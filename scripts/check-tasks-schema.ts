import { getDatabaseClient } from '../src/infrastructure/database/client.js';

async function checkSchema() {
  const db = getDatabaseClient();

  try {
    // Check what tables exist
    const result = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('📋 Database Tables:');
    result.rows.forEach(row => console.log('  -', row.table_name));

    // Check integration_tasks count
    const intResult = await db.query('SELECT COUNT(*) as count FROM integration_tasks WHERE deleted_at IS NULL');
    console.log('\n📊 Integration Tasks Count:', intResult.rows[0].count);

    // Show sample integration_tasks
    const intData = await db.query(`
      SELECT integration_name, display_name, enabled, execution_mode
      FROM integration_tasks
      WHERE deleted_at IS NULL
      LIMIT 5
    `);
    console.log('\n📋 Integration Tasks:');
    intData.rows.forEach(row => {
      console.log(`  - ${row.integration_name} (${row.display_name}) - Mode: ${row.execution_mode}, Enabled: ${row.enabled}`);
    });

    // Check integration_analyzers columns
    const iaColumns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'integration_analyzers'
      ORDER BY ordinal_position
    `);
    console.log('\n📋 integration_analyzers columns:');
    iaColumns.rows.forEach(row => console.log('  -', row.column_name, ':', row.data_type));

    // Check integration_analyzers data
    const iaData = await db.query('SELECT COUNT(*) as count FROM integration_analyzers');
    console.log('\n📊 Integration Analyzers Count:', iaData.rows[0].count);

    // Sample integration_analyzers
    const iaSample = await db.query(`
      SELECT integration_name, analyzer_name, execution_order
      FROM integration_analyzers
      LIMIT 10
    `);
    console.log('\n📋 Sample Integration Analyzers:');
    iaSample.rows.forEach(row => {
      console.log(`  - ${row.integration_name} -> ${row.analyzer_name} (order: ${row.execution_order})`);
    });

    // Check if task_configs table exists
    const tcExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'task_configs'
      ) as exists
    `);
    console.log('\n❓ task_configs table exists:', tcExists.rows[0].exists);

    // Check analyzers table
    const analyzerCount = await db.query('SELECT COUNT(*) as count FROM analyzers');
    console.log('\n📊 Analyzers Count:', analyzerCount.rows[0].count);

    const analyzerSample = await db.query('SELECT analyzer_name, display_name FROM analyzers LIMIT 10');
    console.log('\n📋 Sample Analyzers:');
    analyzerSample.rows.forEach(row => {
      console.log(`  - ${row.analyzer_name} (${row.display_name})`);
    });

  } finally {
    await db.end();
  }
}

checkSchema();
