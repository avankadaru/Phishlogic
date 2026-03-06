#!/usr/bin/env tsx

/**
 * Simple migration runner script
 * Usage: tsx scripts/run-migration.ts <migration-file.sql>
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initDatabase, closeDatabase } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function runMigration(filePath: string) {
  try {
    // Read the SQL file
    const migrationPath = resolve(process.cwd(), filePath);
    logger.info({ path: migrationPath }, 'Reading migration file');

    const sql = readFileSync(migrationPath, 'utf-8');

    // Initialize database connection
    const pool = initDatabase();

    // Execute the migration
    logger.info('Executing migration...');
    await pool.query(sql);

    logger.info('✓ Migration completed successfully!');

    // Close connection
    await closeDatabase();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '✗ Migration failed');
    await closeDatabase();
    process.exit(1);
  }
}

// Get migration file from command line args
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: tsx scripts/run-migration.ts <migration-file.sql>');
  process.exit(1);
}

runMigration(migrationFile);
