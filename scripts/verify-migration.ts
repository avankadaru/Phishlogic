#!/usr/bin/env tsx

import { query, initDatabase, closeDatabase } from '../src/infrastructure/database/client.js';

async function verifyMigration() {
  try {
    initDatabase();

    // Check for new email settings
    const emailSettings = await query(
      `SELECT key, description FROM system_settings
       WHERE key LIKE 'notifications.email.include%'
       ORDER BY key`
    );

    console.log('\n✓ Email Notification Detail Settings:');
    emailSettings.rows.forEach(row => {
      console.log(`  - ${row.key}`);
      console.log(`    ${row.description}`);
    });

    // Check for webhook event triggers
    const webhookSettings = await query(
      `SELECT key, description FROM system_settings
       WHERE key LIKE 'notifications.webhook.on_%'
       ORDER BY key`
    );

    console.log('\n✓ Webhook Event Trigger Settings:');
    webhookSettings.rows.forEach(row => {
      console.log(`  - ${row.key}`);
      console.log(`    ${row.description}`);
    });

    // Check for Slack event triggers
    const slackSettings = await query(
      `SELECT key, description FROM system_settings
       WHERE key LIKE 'notifications.slack.on_%'
       ORDER BY key`
    );

    console.log('\n✓ Slack Event Trigger Settings:');
    slackSettings.rows.forEach(row => {
      console.log(`  - ${row.key}`);
      console.log(`    ${row.description}`);
    });

    // Check deprecated settings are removed
    const deprecatedCheck = await query(
      `SELECT key FROM system_settings
       WHERE key IN ('notifications.email.include_analysis_ids', 'notifications.email.batch_mode')`
    );

    if (deprecatedCheck.rowCount === 0) {
      console.log('\n✓ Deprecated settings removed successfully');
    } else {
      console.log('\n⚠ Warning: Some deprecated settings still exist:');
      deprecatedCheck.rows.forEach(row => console.log(`  - ${row.key}`));
    }

    console.log('\n✅ Migration verification complete!\n');

    await closeDatabase();
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    await closeDatabase();
    process.exit(1);
  }
}

verifyMigration();
