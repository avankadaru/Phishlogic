/**
 * Migration controller - TEMPORARY for initial setup
 * DELETE THIS FILE after migrations are run
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getDatabase } from '../../infrastructure/database/client.js';
import { getLogger } from '../../infrastructure/logging/logger.js';

/**
 * Run a single named migration file
 * POST /api/admin/run-migration
 * Body: { filename: "017_update_auth_guidance_templates.sql" }
 */
export async function runSingleMigration(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { filename } = request.body as { filename?: string };

  if (!filename) {
    reply.status(400).send({ success: false, error: 'filename is required' });
    return;
  }

  // Sanitize: only alphanumeric, underscores, hyphens, .sql extension — no path traversal
  if (!/^[\w-]+\.sql$/.test(filename)) {
    reply.status(400).send({ success: false, error: 'Invalid filename format' });
    return;
  }

  const migrationPath = resolve(
    process.cwd(),
    'dist/infrastructure/database/migrations',
    filename
  );

  try {
    const sql = readFileSync(migrationPath, 'utf-8');
    const db = getDatabase();
    await db.query(sql);
    logger.info({ msg: 'Single migration executed successfully', filename });
    reply.status(200).send({ success: true, filename });
  } catch (err: any) {
    logger.error({ err, filename }, 'Single migration failed');
    reply.status(500).send({ success: false, error: err.message });
  }
}

const logger = getLogger();

/**
 * Run all migrations
 * POST /api/admin/run-migrations
 * WARNING: This is a one-time setup endpoint. Should be deleted after initial deployment.
 */
export async function runMigrations(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    logger.info('Starting database migrations...');

    const db = getDatabase();

    // List of migration files in order
    const migrations = [
      '001_initial_schema.sql',
      '002_add_analyzers_and_settings.sql',
      '003_add_unified_settings.sql',
      '004_enhance_settings_metadata.sql',
      '005_ai_models_and_support.sql',
      '006_restructure_to_integration_tasks.sql',
      '007_add_execution_mode_tracking.sql',
      '008_fix_schema_issues.sql',
      '009_add_whitelist_trust_level.sql',
      '010_add_analyzer_options.sql',
      '011_task_based_architecture.sql',
      '012_add_missing_analyzers.sql',
      '012_simplify_whitelist_trust.sql',
      '013_update_analyzer_descriptions.sql',
      '014_update_chrome_integration.sql',
      '015_prompt_templates.sql',
      '016_enterprise_features.sql',
      '017_update_auth_guidance_templates.sql',
      '018_url_inspection_prompt_template.sql',
      '019_add_integration_pipeline_policy.sql',
    ];

    const results: Array<{ file: string; status: string; error?: string }> = [];

    for (const migrationFile of migrations) {
      try {
        logger.info({ file: migrationFile }, 'Running migration');

        // Read migration file
        const migrationPath = resolve(
          process.cwd(),
          'dist/infrastructure/database/migrations',
          migrationFile
        );
        const sql = readFileSync(migrationPath, 'utf-8');

        // Execute migration
        await db.query(sql);

        results.push({ file: migrationFile, status: 'success' });
        logger.info({ file: migrationFile }, 'Migration completed');
      } catch (err: any) {
        logger.error({ err, file: migrationFile }, 'Migration failed');
        results.push({
          file: migrationFile,
          status: 'failed',
          error: err.message,
        });

        // Continue with other migrations even if one fails
        // (some migrations might be already applied)
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const failCount = results.filter((r) => r.status === 'failed').length;

    reply.status(200).send({
      message: 'Migrations completed',
      total: migrations.length,
      succeeded: successCount,
      failed: failCount,
      results,
    });
  } catch (err: any) {
    logger.error({ err }, 'Migration runner failed');
    reply.status(500).send({
      error: 'Migration failed',
      message: err.message,
    });
  }
}
