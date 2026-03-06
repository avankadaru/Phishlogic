import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schema for updating integration tasks
const UpdateIntegrationSchema = z.object({
  enabled: z.boolean().optional(),
  executionMode: z.enum(['native', 'hybrid', 'ai']).optional(),
  aiModelId: z.string().uuid().optional().nullable(),
  fallbackToNative: z.boolean().optional(),
});

/**
 * GET /api/admin/integration-tasks
 * Get all integration tasks with their analyzers
 */
export async function getAllIntegrationTasks(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get all integrations
    const integrationsResult = await query(`
      SELECT
        it.id,
        it.integration_name as "integrationName",
        it.display_name as "displayName",
        it.description,
        it.input_type as "inputType",
        it.enabled,
        it.execution_mode as "executionMode",
        it.ai_model_id as "aiModelId",
        it.fallback_to_native as "fallbackToNative",
        it.created_at as "createdAt",
        it.updated_at as "updatedAt"
      FROM integration_tasks it
      WHERE it.deleted_at IS NULL
      ORDER BY it.integration_name ASC
    `);

    // Get analyzers for each integration
    const integrations = await Promise.all(
      integrationsResult.rows.map(async (integration) => {
        const analyzersResult = await query(`
          SELECT
            tc.task_name as "taskName",
            tc.display_name as "displayName",
            tc.description,
            tc.analyzer_group as "analyzerGroup",
            tc.is_active as "isActive",
            ia.execution_order as "executionOrder"
          FROM integration_analyzers ia
          JOIN task_configs tc ON ia.analyzer_name = tc.task_name
          WHERE ia.integration_name = $1 AND tc.deleted_at IS NULL
          ORDER BY ia.execution_order ASC
        `, [integration.integrationName]);

        return {
          ...integration,
          analyzers: analyzersResult.rows,
        };
      })
    );

    reply.send({
      success: true,
      data: integrations,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get integration tasks');
    reply.status(500).send({
      success: false,
      error: 'Failed to get integration tasks',
    });
  }
}

/**
 * GET /api/admin/integration-tasks/:integrationName
 * Get specific integration task with its analyzers
 */
export async function getIntegrationTask(
  request: FastifyRequest<{ Params: { integrationName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { integrationName } = request.params;

    const result = await query(`
      SELECT
        it.id,
        it.integration_name as "integrationName",
        it.display_name as "displayName",
        it.description,
        it.input_type as "inputType",
        it.enabled,
        it.execution_mode as "executionMode",
        it.ai_model_id as "aiModelId",
        it.fallback_to_native as "fallbackToNative",
        it.created_at as "createdAt",
        it.updated_at as "updatedAt"
      FROM integration_tasks it
      WHERE it.integration_name = $1 AND it.deleted_at IS NULL
    `, [integrationName]);

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Integration task not found',
      });
      return;
    }

    // Get analyzers for this integration
    const analyzersResult = await query(`
      SELECT
        tc.task_name as "taskName",
        tc.display_name as "displayName",
        tc.description,
        tc.analyzer_group as "analyzerGroup",
        tc.is_active as "isActive",
        ia.execution_order as "executionOrder"
      FROM integration_analyzers ia
      JOIN task_configs tc ON ia.analyzer_name = tc.task_name
      WHERE ia.integration_name = $1 AND tc.deleted_at IS NULL
      ORDER BY ia.execution_order ASC
    `, [integrationName]);

    reply.send({
      success: true,
      data: {
        ...result.rows[0],
        analyzers: analyzersResult.rows,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get integration task');
    reply.status(500).send({
      success: false,
      error: 'Failed to get integration task',
    });
  }
}

/**
 * PUT /api/admin/integration-tasks/:integrationName
 * Update integration task configuration
 */
export async function updateIntegrationTask(
  request: FastifyRequest<{ Params: { integrationName: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { integrationName } = request.params;
    const updates = UpdateIntegrationSchema.parse(request.body);

    // Build dynamic UPDATE query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      setClauses.push(`${columnName} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    });

    if (setClauses.length === 0) {
      reply.status(400).send({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(integrationName);

    const result = await query(`
      UPDATE integration_tasks
      SET ${setClauses.join(', ')}
      WHERE integration_name = $${paramIndex} AND deleted_at IS NULL
      RETURNING
        id,
        integration_name as "integrationName",
        display_name as "displayName",
        execution_mode as "executionMode",
        ai_model_id as "aiModelId",
        enabled,
        updated_at as "updatedAt"
    `, values);

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Integration task not found',
      });
      return;
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'integration_task.update',
        'integration_task',
        result.rows[0].id,
        'success',
        `Updated integration task ${integrationName}`,
        JSON.stringify(updates),
      ]
    );

    logger.info({ integrationName, updates, userId: request.user?.userId }, 'Integration task updated');

    reply.send({
      success: true,
      message: `Integration "${integrationName}" updated successfully`,
      data: result.rows[0],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Failed to update integration task');
    reply.status(500).send({
      success: false,
      error: 'Failed to update integration task',
    });
  }
}
