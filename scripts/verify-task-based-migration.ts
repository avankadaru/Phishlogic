/**
 * Verification Script: Task-Based Architecture Migration
 *
 * Verifies that migration 011 (task-based architecture) completed successfully:
 * - 6 tasks created
 * - 12 analyzers mapped to tasks
 * - api_credentials table exists
 * - All 12 analyzers assigned to Gmail integration
 */

import { getDatabaseClient } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/index.js';

const logger = getLogger();

async function verifyTaskBasedMigration() {
  const db = getDatabaseClient();

  console.log('\n========================================');
  console.log('TASK-BASED ARCHITECTURE VERIFICATION');
  console.log('========================================\n');

  let allChecksPassed = true;

  try {
    // 1. Verify tasks table
    console.log('1. Verifying tasks table...');
    const tasksResult = await db.query(`
      SELECT task_name, display_name, input_type, execution_order, is_active
      FROM tasks
      ORDER BY execution_order
    `);

    if (tasksResult.rows.length === 6) {
      console.log(`   ✓ Found ${tasksResult.rows.length} tasks`);
      tasksResult.rows.forEach((task) => {
        console.log(`     - ${task.task_name} (${task.display_name})`);
      });
    } else {
      console.log(`   ✗ Expected 6 tasks, found ${tasksResult.rows.length}`);
      allChecksPassed = false;
    }

    // 2. Verify task_analyzers mappings
    console.log('\n2. Verifying task_analyzers mappings...');
    const mappingsResult = await db.query(`
      SELECT
        ta.task_name,
        ta.analyzer_name,
        ta.is_long_running,
        ta.estimated_duration_ms
      FROM task_analyzers ta
      ORDER BY ta.task_name, ta.execution_order
    `);

    if (mappingsResult.rows.length >= 12) {
      console.log(`   ✓ Found ${mappingsResult.rows.length} analyzer-task mappings`);

      // Group by task
      const taskGroups: Record<string, number> = {};
      mappingsResult.rows.forEach((mapping) => {
        taskGroups[mapping.task_name] = (taskGroups[mapping.task_name] || 0) + 1;
      });

      Object.entries(taskGroups).forEach(([taskName, count]) => {
        console.log(`     - ${taskName}: ${count} analyzers`);
      });
    } else {
      console.log(`   ✗ Expected at least 12 mappings, found ${mappingsResult.rows.length}`);
      allChecksPassed = false;
    }

    // 3. Verify api_credentials table exists
    console.log('\n3. Verifying api_credentials table...');
    const credentialsResult = await db.query(`
      SELECT credential_name, provider, is_active
      FROM api_credentials
    `);

    console.log(`   ✓ api_credentials table exists (${credentialsResult.rows.length} credentials)`);
    if (credentialsResult.rows.length > 0) {
      credentialsResult.rows.forEach((cred) => {
        console.log(`     - ${cred.credential_name} (${cred.provider}, active: ${cred.is_active})`);
      });
    }

    // 4. Verify analyzers table (renamed from task_configs)
    console.log('\n4. Verifying analyzers table...');
    const analyzersResult = await db.query(`
      SELECT analyzer_name, display_name, analyzer_type, is_active
      FROM analyzers
      ORDER BY analyzer_name
    `);

    if (analyzersResult.rows.length >= 12) {
      console.log(`   ✓ Found ${analyzersResult.rows.length} analyzers`);
      console.log(`     Static: ${analyzersResult.rows.filter(a => a.analyzer_type === 'static').length}`);
      console.log(`     Dynamic: ${analyzersResult.rows.filter(a => a.analyzer_type === 'dynamic').length}`);
    } else {
      console.log(`   ✗ Expected at least 12 analyzers, found ${analyzersResult.rows.length}`);
      allChecksPassed = false;
    }

    // 5. Verify Gmail integration has all analyzers
    console.log('\n5. Verifying Gmail integration analyzer assignments...');
    const gmailAnalyzersResult = await db.query(`
      SELECT ia.analyzer_name, ia.analyzer_options
      FROM integration_analyzers ia
      WHERE ia.integration_name = 'gmail'
      ORDER BY ia.execution_order
    `);

    if (gmailAnalyzersResult.rows.length >= 12) {
      console.log(`   ✓ Gmail has ${gmailAnalyzersResult.rows.length} analyzers configured`);
      gmailAnalyzersResult.rows.forEach((analyzer) => {
        console.log(`     - ${analyzer.analyzer_name}`);
      });
    } else {
      console.log(`   ✗ Expected at least 12 analyzers for Gmail, found ${gmailAnalyzersResult.rows.length}`);
      allChecksPassed = false;
    }

    // 6. Verify new analyzers exist
    console.log('\n6. Verifying new analyzers (Button, Image, QRCode)...');
    const newAnalyzersResult = await db.query(`
      SELECT analyzer_name, display_name
      FROM analyzers
      WHERE LOWER(analyzer_name) IN ('buttonanalyzer', 'imageanalyzer', 'qrcodeanalyzer')
    `);

    if (newAnalyzersResult.rows.length === 3) {
      console.log(`   ✓ All 3 new analyzers found:`);
      newAnalyzersResult.rows.forEach((analyzer) => {
        console.log(`     - ${analyzer.analyzer_name} (${analyzer.display_name})`);
      });
    } else {
      console.log(`   ✗ Expected 3 new analyzers, found ${newAnalyzersResult.rows.length}`);
      allChecksPassed = false;
    }

    // Summary
    console.log('\n========================================');
    if (allChecksPassed) {
      console.log('✓ ALL CHECKS PASSED');
      console.log('Task-based architecture migration successful!');
    } else {
      console.log('✗ SOME CHECKS FAILED');
      console.log('Please review errors above.');
    }
    console.log('========================================\n');

    process.exit(allChecksPassed ? 0 : 1);
  } catch (error) {
    logger.error({
      msg: 'Verification failed',
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('\n✗ VERIFICATION FAILED');
    console.error(error);
    process.exit(1);
  }
}

verifyTaskBasedMigration();
