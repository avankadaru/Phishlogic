import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schema
const UpdateTaskConfigSchema = z.object({
  enabled: z.boolean().optional(),
  executionMode: z.enum(['ai', 'hybrid', 'native']).optional(),
  aiProvider: z.enum(['anthropic', 'openai']).optional(),
  aiModel: z.string().optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
  aiMaxTokens: z.number().positive().optional(),
  aiTimeoutMs: z.number().positive().optional(),
  fallbackToNative: z.boolean().optional(),
  fallbackOnError: z.boolean().optional(),
});

/**
 * GET /api/admin/tasks - Get all task configurations
 */
export async function getAllTasks(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const result = await query(
      `SELECT * FROM task_configs
       WHERE deleted_at IS NULL
       ORDER BY task_name ASC`
    );

    reply.send({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get task configs');
    reply.status(500).send({
      success: false,
      error: 'Failed to get task configurations',
    });
  }
}

/**
 * GET /api/admin/tasks/:taskName - Get specific task configuration
 */
export async function getTask(
  request: FastifyRequest<{ Params: { taskName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { taskName } = request.params;

    const result = await query(
      `SELECT * FROM task_configs
       WHERE task_name = $1 AND deleted_at IS NULL`,
      [taskName]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    reply.send({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get task config');
    reply.status(500).send({
      success: false,
      error: 'Failed to get task configuration',
    });
  }
}

/**
 * PUT /api/admin/tasks/:taskName - Update task configuration
 */
export async function updateTask(
  request: FastifyRequest<{ Params: { taskName: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { taskName } = request.params;
    const updates = UpdateTaskConfigSchema.parse(request.body);

    // Build dynamic UPDATE query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      // Convert camelCase to snake_case
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
    values.push(taskName);

    const result = await query(
      `UPDATE task_configs
       SET ${setClauses.join(', ')}
       WHERE task_name = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Task not found',
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
        'task_config.update',
        'task_config',
        result.rows[0].id,
        'success',
        `Updated task config for ${taskName}`,
        JSON.stringify(updates),
      ]
    );

    logger.info({ taskName, updates, userId: request.user?.userId }, 'Task config updated');

    reply.send({
      success: true,
      message: `Task ${taskName} configuration updated`,
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

    logger.error({ err }, 'Failed to update task config');
    reply.status(500).send({
      success: false,
      error: 'Failed to update task configuration',
    });
  }
}
