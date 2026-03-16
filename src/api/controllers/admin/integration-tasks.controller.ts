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

// Validation schema for adding analyzer to integration
const AddAnalyzerSchema = z.object({
  analyzerName: z.string().min(1),
  executionOrder: z.number().int().optional(),
  analyzerOptions: z.record(z.any()).optional(),
});

// Validation schema for updating analyzer options
const UpdateAnalyzerOptionsSchema = z.object({
  analyzerOptions: z.record(z.any()),
  executionOrder: z.number().int().optional(),
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
            a.analyzer_name as "taskName",
            a.display_name as "displayName",
            a.description,
            a.analyzer_type as "analyzerGroup",
            a.is_active as "isActive",
            ia.execution_order as "executionOrder"
          FROM integration_analyzers ia
          JOIN analyzers a ON ia.analyzer_name = a.analyzer_name
          WHERE ia.integration_name = $1
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
        a.analyzer_name as "taskName",
        a.display_name as "displayName",
        a.description,
        a.analyzer_type as "analyzerGroup",
        a.is_active as "isActive",
        ia.execution_order as "executionOrder"
      FROM integration_analyzers ia
      JOIN analyzers a ON ia.analyzer_name = a.analyzer_name
      WHERE ia.integration_name = $1
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

/**
 * GET /api/admin/integration-tasks/:integrationName/analyzers
 * Get all analyzers configured for an integration
 */
export async function getIntegrationAnalyzers(
  request: FastifyRequest<{ Params: { integrationName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { integrationName } = request.params;

    // Verify integration exists
    const integrationResult = await query(
      'SELECT 1 FROM integration_tasks WHERE integration_name = $1 AND deleted_at IS NULL',
      [integrationName]
    );

    if (integrationResult.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Integration not found',
      });
      return;
    }

    // Get analyzers with their options and task information
    const analyzersResult = await query(`
      SELECT
        ia.analyzer_name as "analyzerName",
        ia.execution_order as "executionOrder",
        ia.analyzer_options as "analyzerOptions",
        a.display_name as "displayName",
        a.description,
        a.analyzer_type as "analyzerType",
        a.is_active as "isActive",
        ta.task_name as "taskName",
        ta.is_long_running as "isLongRunning",
        ta.estimated_duration_ms as "estimatedDurationMs",
        t.display_name as "taskDisplayName",
        t.description as "taskDescription"
      FROM integration_analyzers ia
      LEFT JOIN analyzers a ON ia.analyzer_name = a.analyzer_name
      LEFT JOIN task_analyzers ta ON ia.analyzer_name = ta.analyzer_name
      LEFT JOIN tasks t ON ta.task_name = t.task_name
      WHERE ia.integration_name = $1
      ORDER BY ta.execution_order ASC, ia.execution_order ASC, ia.analyzer_name ASC
    `, [integrationName]);

    reply.send({
      success: true,
      data: {
        integrationName,
        analyzers: analyzersResult.rows,
        count: analyzersResult.rows.length,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get integration analyzers');
    reply.status(500).send({
      success: false,
      error: 'Failed to get integration analyzers',
    });
  }
}

/**
 * POST /api/admin/integration-tasks/:integrationName/analyzers
 * Add analyzer to integration
 */
export async function addIntegrationAnalyzer(
  request: FastifyRequest<{ Params: { integrationName: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { integrationName } = request.params;
    const body = AddAnalyzerSchema.parse(request.body);

    // Verify integration exists
    const integrationResult = await query(
      'SELECT 1 FROM integration_tasks WHERE integration_name = $1 AND deleted_at IS NULL',
      [integrationName]
    );

    if (integrationResult.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Integration not found',
      });
      return;
    }

    // Verify analyzer exists
    const analyzerResult = await query(
      'SELECT 1 FROM analyzers WHERE analyzer_name = $1',
      [body.analyzerName]
    );

    if (analyzerResult.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Analyzer not found',
      });
      return;
    }

    // Check if analyzer already added
    const existsResult = await query(
      'SELECT 1 FROM integration_analyzers WHERE integration_name = $1 AND analyzer_name = $2',
      [integrationName, body.analyzerName]
    );

    if (existsResult.rows.length > 0) {
      reply.status(409).send({
        success: false,
        error: 'Analyzer already added to this integration',
      });
      return;
    }

    // Add analyzer to integration
    const result = await query(`
      INSERT INTO integration_analyzers (integration_name, analyzer_name, execution_order, analyzer_options)
      VALUES ($1, $2, $3, $4)
      RETURNING
        analyzer_name as "analyzerName",
        execution_order as "executionOrder",
        analyzer_options as "analyzerOptions"
    `, [
      integrationName,
      body.analyzerName,
      body.executionOrder ?? 0,
      JSON.stringify(body.analyzerOptions || {}),
    ]);

    logger.info({
      integrationName,
      analyzerName: body.analyzerName,
      userId: request.user?.userId,
    }, 'Analyzer added to integration');

    reply.status(201).send({
      success: true,
      message: 'Analyzer added successfully',
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

    logger.error({ err }, 'Failed to add analyzer to integration');
    reply.status(500).send({
      success: false,
      error: 'Failed to add analyzer',
    });
  }
}

/**
 * PUT /api/admin/integration-tasks/:integrationName/analyzers/:analyzerName
 * Update analyzer options for integration
 */
export async function updateIntegrationAnalyzer(
  request: FastifyRequest<{ Params: { integrationName: string; analyzerName: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { integrationName, analyzerName } = request.params;
    const body = UpdateAnalyzerOptionsSchema.parse(request.body);

    // Verify analyzer is assigned to integration
    const existsResult = await query(
      'SELECT 1 FROM integration_analyzers WHERE integration_name = $1 AND analyzer_name = $2',
      [integrationName, analyzerName]
    );

    if (existsResult.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Analyzer not found for this integration',
      });
      return;
    }

    // Build dynamic update query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.analyzerOptions !== undefined) {
      setClauses.push(`analyzer_options = $${paramIndex}`);
      values.push(JSON.stringify(body.analyzerOptions));
      paramIndex++;
    }

    if (body.executionOrder !== undefined) {
      setClauses.push(`execution_order = $${paramIndex}`);
      values.push(body.executionOrder);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      reply.status(400).send({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    values.push(integrationName);
    values.push(analyzerName);

    const result = await query(`
      UPDATE integration_analyzers
      SET ${setClauses.join(', ')}
      WHERE integration_name = $${paramIndex} AND analyzer_name = $${paramIndex + 1}
      RETURNING
        analyzer_name as "analyzerName",
        execution_order as "executionOrder",
        analyzer_options as "analyzerOptions"
    `, values);

    logger.info({
      integrationName,
      analyzerName,
      updates: body,
      userId: request.user?.userId,
    }, 'Integration analyzer updated');

    reply.send({
      success: true,
      message: 'Analyzer options updated successfully',
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

    logger.error({ err }, 'Failed to update integration analyzer');
    reply.status(500).send({
      success: false,
      error: 'Failed to update analyzer options',
    });
  }
}

/**
 * DELETE /api/admin/integration-tasks/:integrationName/analyzers/:analyzerName
 * Remove analyzer from integration
 */
export async function deleteIntegrationAnalyzer(
  request: FastifyRequest<{ Params: { integrationName: string; analyzerName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { integrationName, analyzerName } = request.params;

    // Verify analyzer is assigned to integration
    const existsResult = await query(
      'SELECT 1 FROM integration_analyzers WHERE integration_name = $1 AND analyzer_name = $2',
      [integrationName, analyzerName]
    );

    if (existsResult.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Analyzer not found for this integration',
      });
      return;
    }

    // Remove analyzer from integration
    await query(
      'DELETE FROM integration_analyzers WHERE integration_name = $1 AND analyzer_name = $2',
      [integrationName, analyzerName]
    );

    logger.info({
      integrationName,
      analyzerName,
      userId: request.user?.userId,
    }, 'Analyzer removed from integration');

    reply.send({
      success: true,
      message: 'Analyzer removed successfully',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to remove analyzer from integration');
    reply.status(500).send({
      success: false,
      error: 'Failed to remove analyzer',
    });
  }
}
