/**
 * Analyzers Controller
 * Manages analyzer definitions (spfAnalyzer, linkReputationAnalyzer, etc.)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDatabaseClient } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/index.js';

const logger = getLogger();

// Validation schemas
const analyzerNameParamSchema = z.object({
  analyzerName: z.string().min(1),
});

const createAnalyzerSchema = z.object({
  analyzerName: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  analyzerType: z.enum(['static', 'dynamic']),
  defaultWeight: z.number().min(0).max(5).optional(),
  isActive: z.boolean().optional(),
});

const updateAnalyzerSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  analyzerType: z.enum(['static', 'dynamic']).optional(),
  defaultWeight: z.number().min(0).max(5).optional(),
  isActive: z.boolean().optional(),
});

const assignAnalyzerToTaskSchema = z.object({
  taskName: z.string().min(1),
  executionOrder: z.number().int().optional(),
  isLongRunning: z.boolean().optional(),
  estimatedDurationMs: z.number().int().positive().optional(),
});

/**
 * GET /api/admin/analyzers
 * List all analyzer definitions
 */
export async function getAllAnalyzers(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const db = getDatabaseClient();

    const result = await db.query(
      `SELECT
        analyzer_name,
        display_name,
        description,
        analyzer_type,
        default_weight,
        is_active,
        created_at
      FROM analyzers
      ORDER BY analyzer_name`
    );

    reply.send({
      analyzers: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    logger.error({
      msg: 'Failed to list analyzers',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to retrieve analyzers',
    });
  }
}

/**
 * GET /api/admin/analyzers/:analyzerName
 * Get single analyzer definition
 */
export async function getAnalyzer(
  request: FastifyRequest<{ Params: { analyzerName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { analyzerName } = analyzerNameParamSchema.parse(request.params);

    const db = getDatabaseClient();

    const result = await db.query(
      `SELECT
        analyzer_name,
        display_name,
        description,
        analyzer_type,
        default_weight,
        is_active,
        created_at
      FROM analyzers
      WHERE analyzer_name = $1`,
      [analyzerName]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        error: 'Analyzer not found',
      });
    }

    reply.send(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid analyzer name',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to get analyzer',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to retrieve analyzer',
    });
  }
}

/**
 * POST /api/admin/analyzers
 * Create new analyzer definition
 */
export async function createAnalyzer(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate request body
    const body = createAnalyzerSchema.parse(request.body);

    const db = getDatabaseClient();

    // Check if analyzer already exists
    const existsResult = await db.query(
      'SELECT 1 FROM analyzers WHERE analyzer_name = $1',
      [body.analyzerName]
    );

    if (existsResult.rows.length > 0) {
      return reply.status(409).send({
        error: 'Analyzer with this name already exists',
      });
    }

    // Create analyzer
    const result = await db.query(
      `INSERT INTO analyzers (
        analyzer_name,
        display_name,
        description,
        analyzer_type,
        default_weight,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        analyzer_name,
        display_name,
        description,
        analyzer_type,
        default_weight,
        is_active,
        created_at`,
      [
        body.analyzerName,
        body.displayName,
        body.description || null,
        body.analyzerType,
        body.defaultWeight ?? 1.0,
        body.isActive ?? true,
      ]
    );

    logger.info({
      msg: 'Analyzer created',
      analyzerName: body.analyzerName,
      analyzerType: body.analyzerType,
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
      msg: 'Failed to create analyzer',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to create analyzer',
    });
  }
}

/**
 * PUT /api/admin/analyzers/:analyzerName
 * Update existing analyzer definition
 */
export async function updateAnalyzer(
  request: FastifyRequest<{ Params: { analyzerName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params and body
    const { analyzerName } = analyzerNameParamSchema.parse(request.params);
    const body = updateAnalyzerSchema.parse(request.body);

    const db = getDatabaseClient();

    // Check if analyzer exists
    const existsResult = await db.query(
      'SELECT 1 FROM analyzers WHERE analyzer_name = $1',
      [analyzerName]
    );

    if (existsResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Analyzer not found',
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
    if (body.analyzerType !== undefined) {
      updates.push(`analyzer_type = $${paramIndex++}`);
      values.push(body.analyzerType);
    }
    if (body.defaultWeight !== undefined) {
      updates.push(`default_weight = $${paramIndex++}`);
      values.push(body.defaultWeight);
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

    values.push(analyzerName);

    const result = await db.query(
      `UPDATE analyzers
      SET ${updates.join(', ')}
      WHERE analyzer_name = $${paramIndex}
      RETURNING
        analyzer_name,
        display_name,
        description,
        analyzer_type,
        default_weight,
        is_active,
        created_at`,
      values
    );

    logger.info({
      msg: 'Analyzer updated',
      analyzerName,
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
      msg: 'Failed to update analyzer',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to update analyzer',
    });
  }
}

/**
 * DELETE /api/admin/analyzers/:analyzerName
 * Delete analyzer definition
 */
export async function deleteAnalyzer(
  request: FastifyRequest<{ Params: { analyzerName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { analyzerName } = analyzerNameParamSchema.parse(request.params);

    const db = getDatabaseClient();

    // Check if analyzer exists
    const existsResult = await db.query(
      'SELECT 1 FROM analyzers WHERE analyzer_name = $1',
      [analyzerName]
    );

    if (existsResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Analyzer not found',
      });
    }

    // Delete analyzer
    await db.query('DELETE FROM analyzers WHERE analyzer_name = $1', [analyzerName]);

    logger.info({
      msg: 'Analyzer deleted',
      analyzerName,
    });

    reply.send({
      success: true,
      message: 'Analyzer deleted successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid analyzer name',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to delete analyzer',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to delete analyzer',
    });
  }
}

/**
 * GET /api/admin/analyzers/:analyzerName/tasks
 * Get all tasks that use this analyzer
 */
export async function getAnalyzerTasks(
  request: FastifyRequest<{ Params: { analyzerName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { analyzerName } = analyzerNameParamSchema.parse(request.params);

    const db = getDatabaseClient();

    // Check if analyzer exists
    const analyzerResult = await db.query(
      'SELECT 1 FROM analyzers WHERE analyzer_name = $1',
      [analyzerName]
    );

    if (analyzerResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Analyzer not found',
      });
    }

    // Get tasks that use this analyzer
    const result = await db.query(
      `SELECT
        ta.id,
        ta.task_name,
        ta.analyzer_name,
        ta.execution_order,
        ta.is_long_running,
        ta.estimated_duration_ms,
        t.display_name as task_display_name,
        t.description as task_description,
        t.input_type
      FROM task_analyzers ta
      LEFT JOIN tasks t ON ta.task_name = t.task_name
      WHERE ta.analyzer_name = $1
      ORDER BY ta.task_name, ta.execution_order`,
      [analyzerName]
    );

    reply.send({
      analyzerName,
      tasks: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid analyzer name',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to get analyzer tasks',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to retrieve analyzer tasks',
    });
  }
}

/**
 * POST /api/admin/analyzers/:analyzerName/assign-task
 * Assign analyzer to a task
 */
export async function assignAnalyzerToTask(
  request: FastifyRequest<{ Params: { analyzerName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params and body
    const { analyzerName } = analyzerNameParamSchema.parse(request.params);
    const body = assignAnalyzerToTaskSchema.parse(request.body);

    const db = getDatabaseClient();

    // Check if analyzer exists
    const analyzerResult = await db.query(
      'SELECT 1 FROM analyzers WHERE analyzer_name = $1',
      [analyzerName]
    );

    if (analyzerResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Analyzer not found',
      });
    }

    // Check if task exists
    const taskResult = await db.query(
      'SELECT 1 FROM tasks WHERE task_name = $1',
      [body.taskName]
    );

    if (taskResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Task not found',
      });
    }

    // Check if assignment already exists
    const existsResult = await db.query(
      'SELECT 1 FROM task_analyzers WHERE task_name = $1 AND analyzer_name = $2',
      [body.taskName, analyzerName]
    );

    if (existsResult.rows.length > 0) {
      return reply.status(409).send({
        error: 'Analyzer already assigned to this task',
      });
    }

    // Create assignment
    const result = await db.query(
      `INSERT INTO task_analyzers (
        task_name,
        analyzer_name,
        execution_order,
        is_long_running,
        estimated_duration_ms
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, task_name, analyzer_name, execution_order, is_long_running, estimated_duration_ms`,
      [
        body.taskName,
        analyzerName,
        body.executionOrder ?? 0,
        body.isLongRunning ?? false,
        body.estimatedDurationMs || null,
      ]
    );

    logger.info({
      msg: 'Analyzer assigned to task',
      analyzerName,
      taskName: body.taskName,
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
      msg: 'Failed to assign analyzer to task',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to assign analyzer to task',
    });
  }
}

/**
 * DELETE /api/admin/analyzers/:analyzerName/tasks/:taskName
 * Remove analyzer from a task
 */
export async function removeAnalyzerFromTask(
  request: FastifyRequest<{ Params: { analyzerName: string; taskName: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { analyzerName } = analyzerNameParamSchema.parse(request.params);
    const taskName = request.params.taskName;

    if (!taskName) {
      return reply.status(400).send({
        error: 'Task name is required',
      });
    }

    const db = getDatabaseClient();

    // Check if assignment exists
    const existsResult = await db.query(
      'SELECT 1 FROM task_analyzers WHERE task_name = $1 AND analyzer_name = $2',
      [taskName, analyzerName]
    );

    if (existsResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Assignment not found',
      });
    }

    // Delete assignment
    await db.query(
      'DELETE FROM task_analyzers WHERE task_name = $1 AND analyzer_name = $2',
      [taskName, analyzerName]
    );

    logger.info({
      msg: 'Analyzer removed from task',
      analyzerName,
      taskName,
    });

    reply.send({
      success: true,
      message: 'Analyzer removed from task successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid analyzer name',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to remove analyzer from task',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to remove analyzer from task',
    });
  }
}
