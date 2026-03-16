/**
 * Diagnostic Script: Check Integration Tasks Setup
 *
 * Verifies integration_tasks table has data and seeds it if missing
 */

import { getDatabaseClient } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/index.js';

const logger = getLogger();

async function checkAndFixIntegrationTasks() {
  const db = getDatabaseClient();

  console.log('\n========================================');
  console.log('INTEGRATION TASKS DIAGNOSTIC');
  console.log('========================================\n');

  try {
    // 1. Check if integration_tasks table exists
    console.log('1. Checking integration_tasks table...');
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'integration_tasks'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('   ✗ integration_tasks table does not exist!');
      console.log('   → Run migration: PGPASSWORD=phishlogic_dev_password psql -h localhost -U phishlogic -d Phishlogic -f src/infrastructure/database/migrations/006_integration_tasks.sql');
      process.exit(1);
    }

    console.log('   ✓ integration_tasks table exists');

    // 2. Check if there are any integration tasks
    console.log('\n2. Checking for integration tasks data...');
    const tasksResult = await db.query(`
      SELECT
        integration_name,
        display_name,
        input_type,
        enabled,
        execution_mode,
        deleted_at
      FROM integration_tasks
      WHERE deleted_at IS NULL
      ORDER BY integration_name
    `);

    if (tasksResult.rows.length === 0) {
      console.log('   ✗ No integration tasks found!');
      console.log('   → Seeding default integration tasks...\n');

      // Seed Gmail and Chrome integration tasks
      await db.query(`
        INSERT INTO integration_tasks (integration_name, display_name, description, input_type, enabled, execution_mode, fallback_to_native)
        VALUES
          ('gmail', 'Gmail Integration', 'Analyze emails from Gmail', 'email', true, 'native', true),
          ('chrome', 'Chrome Extension', 'Analyze URLs from Chrome extension', 'url', true, 'native', true)
        ON CONFLICT (integration_name) DO NOTHING
      `);

      console.log('   ✓ Seeded Gmail and Chrome integration tasks');

      // Verify seeding worked
      const verifyResult = await db.query(`
        SELECT integration_name, display_name FROM integration_tasks WHERE deleted_at IS NULL
      `);

      console.log(`   ✓ Now have ${verifyResult.rows.length} integration tasks:`);
      verifyResult.rows.forEach(task => {
        console.log(`     - ${task.integration_name}: ${task.display_name}`);
      });
    } else {
      console.log(`   ✓ Found ${tasksResult.rows.length} integration tasks:`);
      tasksResult.rows.forEach(task => {
        const status = task.enabled ? 'enabled' : 'disabled';
        console.log(`     - ${task.integration_name}: ${task.display_name} (${status}, mode: ${task.execution_mode})`);
      });
    }

    // 3. Check if analyzers are assigned to integrations
    console.log('\n3. Checking analyzer assignments...');
    const analyzersResult = await db.query(`
      SELECT
        ia.integration_name,
        COUNT(*) as analyzer_count
      FROM integration_analyzers ia
      GROUP BY ia.integration_name
      ORDER BY ia.integration_name
    `);

    if (analyzersResult.rows.length === 0) {
      console.log('   ⚠️  No analyzers assigned to any integration');
      console.log('   → Run migration 011 to assign analyzers: npx tsx src/infrastructure/database/migrations/011_task_based_architecture.sql');
    } else {
      console.log('   ✓ Analyzer assignments:');
      analyzersResult.rows.forEach(row => {
        console.log(`     - ${row.integration_name}: ${row.analyzer_count} analyzers`);
      });
    }

    // 4. Check for soft-deleted tasks
    console.log('\n4. Checking for soft-deleted tasks...');
    const deletedResult = await db.query(`
      SELECT integration_name, deleted_at
      FROM integration_tasks
      WHERE deleted_at IS NOT NULL
    `);

    if (deletedResult.rows.length > 0) {
      console.log(`   ⚠️  Found ${deletedResult.rows.length} soft-deleted tasks:`);
      deletedResult.rows.forEach(task => {
        console.log(`     - ${task.integration_name} (deleted at ${task.deleted_at})`);
      });
    } else {
      console.log('   ✓ No soft-deleted tasks');
    }

    console.log('\n========================================');
    console.log('✓ DIAGNOSTIC COMPLETE');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    logger.error({
      msg: 'Diagnostic failed',
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('\n✗ DIAGNOSTIC FAILED');
    console.error(error);
    process.exit(1);
  }
}

checkAndFixIntegrationTasks();
