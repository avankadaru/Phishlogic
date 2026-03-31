#!/usr/bin/env tsx

/**
 * Verification script for 016_enterprise_features migration
 */

import { initDatabase, closeDatabase } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function verify() {
  try {
    const pool = initDatabase();

    logger.info('Verifying enterprise features migration...');

    // 1. Check tables exist
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('organizations', 'users', 'roles', 'user_roles', 'audit_log')
      ORDER BY table_name;
    `);

    logger.info({ tables: tablesResult.rows.map(r => r.table_name) }, 'Tables created');

    if (tablesResult.rows.length !== 5) {
      throw new Error(`Expected 5 tables, found ${tablesResult.rows.length}`);
    }

    // 2. Check JSONB columns exist
    const jsonbColumnsResult = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND data_type = 'jsonb'
      AND table_name IN ('organizations', 'users', 'roles', 'audit_log')
      ORDER BY table_name, column_name;
    `);

    logger.info({ count: jsonbColumnsResult.rows.length }, 'JSONB columns');
    jsonbColumnsResult.rows.forEach(row => {
      logger.info(`  ${row.table_name}.${row.column_name}`);
    });

    // 3. Check GIN indexes on JSONB columns
    const ginIndexesResult = await pool.query(`
      SELECT schemaname, tablename, indexname
      FROM pg_indexes
      WHERE indexname LIKE '%_gin'
      ORDER BY tablename, indexname;
    `);

    logger.info({ count: ginIndexesResult.rows.length }, 'GIN indexes on JSONB columns');
    ginIndexesResult.rows.forEach(row => {
      logger.info(`  ${row.tablename}: ${row.indexname}`);
    });

    // 4. Check foreign key constraints
    const fkResult = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('users', 'roles', 'user_roles', 'audit_log')
      ORDER BY tc.table_name, kcu.column_name;
    `);

    logger.info({ count: fkResult.rows.length }, 'Foreign key constraints');
    fkResult.rows.forEach(row => {
      logger.info(`  ${row.table_name}.${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`);
    });

    // 5. Check organizations table structure
    const orgColumnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'organizations'
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    logger.info({ count: orgColumnsResult.rows.length }, 'Organizations table columns');
    const requiredOrgColumns = [
      'id', 'domain', 'display_name', 'organization_type',
      'scim_enabled', 'scim_base_url', 'scim_bearer_token',
      'sso_enabled', 'sso_provider', 'sso_entity_id', 'sso_sso_url', 'sso_certificate',
      'sso_metadata', 'organization_attributes'
    ];
    const actualOrgColumns = orgColumnsResult.rows.map(r => r.column_name);
    const missingOrgColumns = requiredOrgColumns.filter(col => !actualOrgColumns.includes(col));

    if (missingOrgColumns.length > 0) {
      throw new Error(`Missing columns in organizations table: ${missingOrgColumns.join(', ')}`);
    }
    logger.info('✓ All required columns exist in organizations table');

    // 6. Check users table structure
    const userColumnsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    logger.info({ count: userColumnsResult.rows.length }, 'Users table columns');
    const requiredUserColumns = [
      'id', 'external_id', 'user_name', 'email', 'given_name', 'family_name', 'display_name',
      'active', 'organization_id', 'user_type', 'google_id', 'api_key', 'user_attributes', 'version'
    ];
    const actualUserColumns = userColumnsResult.rows.map(r => r.column_name);
    const missingUserColumns = requiredUserColumns.filter(col => !actualUserColumns.includes(col));

    if (missingUserColumns.length > 0) {
      throw new Error(`Missing columns in users table: ${missingUserColumns.join(', ')}`);
    }
    logger.info('✓ All required columns exist in users table');

    // 7. Check roles table permissions column
    const rolesResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'roles'
      AND column_name IN ('permissions', 'role_attributes')
      AND table_schema = 'public';
    `);

    logger.info({ count: rolesResult.rows.length }, 'Roles JSONB columns');
    if (rolesResult.rows.length !== 2) {
      throw new Error('Missing JSONB columns in roles table');
    }
    logger.info('✓ Roles table has permissions and role_attributes JSONB columns');

    // 8. Check audit_log table metadata column
    const auditResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'audit_log'
      AND column_name = 'event_metadata'
      AND table_schema = 'public';
    `);

    if (auditResult.rows.length !== 1) {
      throw new Error('Missing event_metadata JSONB column in audit_log table');
    }
    logger.info('✓ Audit_log table has event_metadata JSONB column');

    // 9. Check triggers exist
    const triggersResult = await pool.query(`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      AND trigger_name LIKE '%updated_at%'
      ORDER BY event_object_table, trigger_name;
    `);

    logger.info({ count: triggersResult.rows.length }, 'Updated_at triggers');
    triggersResult.rows.forEach(row => {
      logger.info(`  ${row.event_object_table}: ${row.trigger_name}`);
    });

    logger.info('');
    logger.info('✅ Migration verification PASSED!');
    logger.info('');
    logger.info('Summary:');
    logger.info(`  - Tables created: ${tablesResult.rows.length}`);
    logger.info(`  - JSONB columns: ${jsonbColumnsResult.rows.length}`);
    logger.info(`  - GIN indexes: ${ginIndexesResult.rows.length}`);
    logger.info(`  - Foreign keys: ${fkResult.rows.length}`);
    logger.info(`  - Triggers: ${triggersResult.rows.length}`);

    await closeDatabase();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '❌ Migration verification FAILED');
    await closeDatabase();
    process.exit(1);
  }
}

verify();
