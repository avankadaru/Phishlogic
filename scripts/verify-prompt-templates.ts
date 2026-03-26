import { query } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function verifyPromptTemplates() {
  try {
    logger.info('Verifying prompt templates...');

    // Check if table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'prompt_templates'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      logger.error('prompt_templates table does not exist!');
      process.exit(1);
    }

    logger.info('✓ prompt_templates table exists');

    // Check if column was added to ai_model_configs
    const columnCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'ai_model_configs' AND column_name = 'prompt_template_id'
      );
    `);

    if (columnCheck.rows[0].exists) {
      logger.info('✓ prompt_template_id column added to ai_model_configs');
    } else {
      logger.warn('⚠ prompt_template_id column NOT found in ai_model_configs');
    }

    // List all templates
    const templates = await query(`
      SELECT id, name, display_name AS "displayName", cost_tier AS "costTier",
             token_estimate AS "tokenEstimate", accuracy_target AS "accuracyTarget",
             is_default AS "isDefault", is_system_template AS "isSystemTemplate"
      FROM prompt_templates
      WHERE deleted_at IS NULL
      ORDER BY cost_tier, name;
    `);

    logger.info(`Found ${templates.rows.length} prompt templates:`);
    templates.rows.forEach((template, index) => {
      logger.info(`\n${index + 1}. ${template.displayName}`);
      logger.info(`   - Name: ${template.name}`);
      logger.info(`   - Cost Tier: ${template.costTier}`);
      logger.info(`   - Token Estimate: ${template.tokenEstimate}`);
      logger.info(`   - Accuracy Target: ${(template.accuracyTarget * 100).toFixed(0)}%`);
      logger.info(`   - Is Default: ${template.isDefault}`);
      logger.info(`   - Is System Template: ${template.isSystemTemplate}`);
    });

    // Check indices
    const indices = await query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'prompt_templates';
    `);

    logger.info(`\n✓ ${indices.rows.length} indices created:`);
    indices.rows.forEach(idx => {
      logger.info(`   - ${idx.indexname}`);
    });

    logger.info('\n✅ Verification complete!');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Verification failed');
    process.exit(1);
  }
}

verifyPromptTemplates();
