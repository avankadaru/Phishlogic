/**
 * Tasks Controller
 * Manages task definitions (sender_verification, links, attachments, etc.)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDatabaseClient } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/index.js';

const logger = getLogger();

// Validation schemas
const taskIdParamSchema = z.object({
  taskName: z.string().min(1),
});

const createTaskSchema = z.object({
  taskName: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores allowed'),
  displayName: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  inputType: z.enum(['email', 'url']),
  executionOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateTaskSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  executionOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/admin/tasks/definitions
 * List all task definitions
 */
export async function getAllTasks(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const db = getDatabaseClient();

    const result = await db.query(
      `SELECT
        task_name,
        display_name,
        description,
        input_type,
        execution_order,
        is_active,
        created_at
      FROM tasks
      ORDER BY execution_order, task_name`
    );

    reply.send({
      tasks: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    logger.error({
      msg: 'Failed to list tasks',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to retrieve tasks',
    });
  }
}

/**
 * GET /api/admin/tasks/definitions/:taskName
 * Get single task definition
 */
export async function getTask(
  request: FastifyRequest<{ Params: { taskName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { taskName } = taskIdParamSchema.parse(request.params);

    const db = getDatabaseClient();

    const result = await db.query(
      `SELECT
        task_name,
        display_name,
        description,
        input_type,
        execution_order,
        is_active,
        created_at
      FROM tasks
      WHERE task_name = $1`,
      [taskName]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        error: 'Task not found',
      });
    }

    reply.send(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid task name',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to get task',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to retrieve task',
    });
  }
}

/**
 * POST /api/admin/tasks/definitions
 * Create new task definition
 */
export async function createTask(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate request body
    const body = createTaskSchema.parse(request.body);

    const db = getDatabaseClient();

    // Check if task already exists
    const existsResult = await db.query(
      'SELECT 1 FROM tasks WHERE task_name = $1',
      [body.taskName]
    );

    if (existsResult.rows.length > 0) {
      return reply.status(409).send({
        error: 'Task with this name already exists',
      });
    }

    // Create task
    const result = await db.query(
      `INSERT INTO tasks (
        task_name,
        display_name,
        description,
        input_type,
        execution_order,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        task_name,
        display_name,
        description,
        input_type,
        execution_order,
        is_active,
        created_at`,
      [
        body.taskName,
        body.displayName,
        body.description || null,
        body.inputType,
        body.executionOrder ?? 0,
        body.isActive ?? true,
      ]
    );

    logger.info({
      msg: 'Task created',
      taskName: body.taskName,
      inputType: body.inputType,
    });

    reply.status(201).send(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to create task',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to create task',
    });
  }
}

/**
 * PUT /api/admin/tasks/definitions/:taskName
 * Update existing task definition
 */
export async function updateTask(
  request: FastifyRequest<{ Params: { taskName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params and body
    const { taskName } = taskIdParamSchema.parse(request.params);
    const body = updateTaskSchema.parse(request.body);

    const db = getDatabaseClient();

    // Check if task exists
    const existsResult = await db.query(
      'SELECT 1 FROM tasks WHERE task_name = $1',
      [taskName]
    );

    if (existsResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Task not found',
      });
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(body.displayName);
    }
    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(body.description);
    }
    if (body.executionOrder !== undefined) {
      updates.push(`execution_order = $${paramIndex++}`);
      values.push(body.executionOrder);
    }
    if (body.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(body.isActive);
    }

    if (updates.length === 0) {
      return reply.status(400).send({
        error: 'No fields to update',
      });
    }

    values.push(taskName);

    const result = await db.query(
      `UPDATE tasks
      SET ${updates.join(', ')}
      WHERE task_name = $${paramIndex}
      RETURNING
        task_name,
        display_name,
        description,
        input_type,
        execution_order,
        is_active,
        created_at`,
      values
    );

    logger.info({
      msg: 'Task updated',
      taskName,
    });

    reply.send(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to update task',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to update task',
    });
  }
}

/**
 * DELETE /api/admin/tasks/definitions/:taskName
 * Delete task definition
 */
export async function deleteTask(
  request: FastifyRequest<{ Params: { taskName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { taskName } = taskIdParamSchema.parse(request.params);

    const db = getDatabaseClient();

    // Check if task exists
    const existsResult = await db.query(
      'SELECT 1 FROM tasks WHERE task_name = $1',
      [taskName]
    );

    if (existsResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Task not found',
      });
    }

    // Delete task
    await db.query('DELETE FROM tasks WHERE task_name = $1', [taskName]);

    logger.info({
      msg: 'Task deleted',
      taskName,
    });

    reply.send({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid task name',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to delete task',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to delete task',
    });
  }
}

/**
 * GET /api/admin/tasks/definitions/:taskName/analyzers
 * Get all analyzers assigned to a task
 */
export async function getTaskAnalyzers(
  request: FastifyRequest<{ Params: { taskName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { taskName } = taskIdParamSchema.parse(request.params);

    const db = getDatabaseClient();

    // Check if task exists
    const taskResult = await db.query(
      'SELECT 1 FROM tasks WHERE task_name = $1',
      [taskName]
    );

    if (taskResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Task not found',
      });
    }

    // Get analyzers for this task
    const result = await db.query(
      `SELECT
        ta.id,
        ta.task_name,
        ta.analyzer_name,
        ta.execution_order,
        ta.is_long_running,
        ta.estimated_duration_ms,
        a.display_name as analyzer_display_name,
        a.description as analyzer_description,
        a.analyzer_type
      FROM task_analyzers ta
      LEFT JOIN analyzers a ON ta.analyzer_name = a.analyzer_name
      WHERE ta.task_name = $1
      ORDER BY ta.execution_order, ta.analyzer_name`,
      [taskName]
    );

    reply.send({
      taskName,
      analyzers: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid task name',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to get task analyzers',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to retrieve task analyzers',
    });
  }
}
