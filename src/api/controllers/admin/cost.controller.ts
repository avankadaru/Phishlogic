import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schemas
const CostQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  taskName: z.string().optional(),
  provider: z.enum(['anthropic', 'openai']).optional(),
});

/**
 * GET /api/admin/costs/summary - Get monthly cost summary with budget tracking
 */
export async function getCostSummary(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { startDate, endDate } = CostQuerySchema.parse(request.query);

    // Default to current month if no dates provided
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const end = endDate || new Date().toISOString();

    // Get total costs by provider
    const providerCosts = await query(
      `SELECT
         ai_provider as provider,
         COUNT(*) as request_count,
         SUM(cost_usd) as total_cost,
         AVG(cost_usd) as avg_cost_per_request,
         SUM(tokens_used) as total_tokens
       FROM analyses
       WHERE created_at >= $1 AND created_at <= $2
         AND ai_provider IS NOT NULL
         AND deleted_at IS NULL
       GROUP BY ai_provider
       ORDER BY total_cost DESC`,
      [start, end]
    );

    // Get total costs by task
    const taskCosts = await query(
      `SELECT
         task_name,
         COUNT(*) as request_count,
         SUM(cost_usd) as total_cost,
         AVG(cost_usd) as avg_cost_per_request
       FROM analyses
       WHERE created_at >= $1 AND created_at <= $2
         AND task_name IS NOT NULL
         AND deleted_at IS NULL
       GROUP BY task_name
       ORDER BY total_cost DESC`,
      [start, end]
    );

    // Get daily trend
    const dailyTrend = await query(
      `SELECT
         DATE(created_at) as date,
         COUNT(*) as request_count,
         SUM(cost_usd) as total_cost
       FROM analyses
       WHERE created_at >= $1 AND created_at <= $2
         AND cost_usd IS NOT NULL
         AND deleted_at IS NULL
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [start, end]
    );

    // Calculate totals
    const totalCost = providerCosts.rows.reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0);
    const totalRequests = providerCosts.rows.reduce((sum, row) => sum + parseInt(row.request_count || 0, 10), 0);

    // Get budget from system_settings (if exists)
    const budgetResult = await query(
      `SELECT value FROM system_settings WHERE key = 'monthly_budget_usd' AND deleted_at IS NULL`
    );
    const monthlyBudget = budgetResult.rows.length > 0 ? parseFloat(budgetResult.rows[0].value) : null;

    // Calculate budget utilization
    let budgetUtilization = null;
    let budgetRemaining = null;
    if (monthlyBudget) {
      budgetUtilization = (totalCost / monthlyBudget) * 100;
      budgetRemaining = monthlyBudget - totalCost;
    }

    reply.send({
      success: true,
      data: {
        period: {
          startDate: start,
          endDate: end,
        },
        summary: {
          totalCost: parseFloat(totalCost.toFixed(4)),
          totalRequests,
          avgCostPerRequest: totalRequests > 0 ? parseFloat((totalCost / totalRequests).toFixed(4)) : 0,
          monthlyBudget,
          budgetUtilization: budgetUtilization ? parseFloat(budgetUtilization.toFixed(2)) : null,
          budgetRemaining: budgetRemaining ? parseFloat(budgetRemaining.toFixed(4)) : null,
        },
        byProvider: providerCosts.rows.map((row) => ({
          provider: row.provider,
          requestCount: parseInt(row.request_count, 10),
          totalCost: parseFloat(parseFloat(row.total_cost).toFixed(4)),
          avgCostPerRequest: parseFloat(parseFloat(row.avg_cost_per_request).toFixed(4)),
          totalTokens: parseInt(row.total_tokens || 0, 10),
        })),
        byTask: taskCosts.rows.map((row) => ({
          taskName: row.task_name,
          requestCount: parseInt(row.request_count, 10),
          totalCost: parseFloat(parseFloat(row.total_cost).toFixed(4)),
          avgCostPerRequest: parseFloat(parseFloat(row.avg_cost_per_request).toFixed(4)),
        })),
        dailyTrend: dailyTrend.rows.map((row) => ({
          date: row.date,
          requestCount: parseInt(row.request_count, 10),
          totalCost: parseFloat(parseFloat(row.total_cost).toFixed(4)),
        })),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid query parameters',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Failed to get cost summary');
    reply.status(500).send({
      success: false,
      error: 'Failed to get cost summary',
    });
  }
}

/**
 * GET /api/admin/costs/breakdown - Detailed cost breakdown
 */
export async function getCostBreakdown(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { startDate, endDate, taskName, provider } = CostQuerySchema.parse(request.query);

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const end = endDate || new Date().toISOString();

    // Build dynamic WHERE clause
    const conditions: string[] = [
      'created_at >= $1',
      'created_at <= $2',
      'deleted_at IS NULL',
    ];
    const values: any[] = [start, end];
    let paramIndex = 3;

    if (taskName) {
      conditions.push(`task_name = $${paramIndex}`);
      values.push(taskName);
      paramIndex++;
    }

    if (provider) {
      conditions.push(`ai_provider = $${paramIndex}`);
      values.push(provider);
      paramIndex++;
    }

    // Get detailed breakdown by model
    const modelBreakdown = await query(
      `SELECT
         ai_provider as provider,
         ai_model as model,
         task_name,
         COUNT(*) as request_count,
         SUM(cost_usd) as total_cost,
         AVG(cost_usd) as avg_cost,
         MIN(cost_usd) as min_cost,
         MAX(cost_usd) as max_cost,
         SUM(tokens_used) as total_tokens,
         AVG(tokens_used) as avg_tokens
       FROM analyses
       WHERE ${conditions.join(' AND ')}
         AND ai_provider IS NOT NULL
       GROUP BY ai_provider, ai_model, task_name
       ORDER BY total_cost DESC`,
      values
    );

    // Get execution mode breakdown
    const modeBreakdown = await query(
      `SELECT
         execution_mode,
         COUNT(*) as request_count,
         SUM(cost_usd) as total_cost,
         AVG(processing_time_ms) as avg_processing_time
       FROM analyses
       WHERE ${conditions.join(' AND ')}
       GROUP BY execution_mode
       ORDER BY total_cost DESC`,
      values
    );

    // Calculate totals
    const totalCost = modelBreakdown.rows.reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0);
    const totalRequests = modelBreakdown.rows.reduce((sum, row) => sum + parseInt(row.request_count || 0, 10), 0);

    reply.send({
      success: true,
      data: {
        period: {
          startDate: start,
          endDate: end,
        },
        filters: {
          taskName: taskName || null,
          provider: provider || null,
        },
        summary: {
          totalCost: parseFloat(totalCost.toFixed(4)),
          totalRequests,
          avgCostPerRequest: totalRequests > 0 ? parseFloat((totalCost / totalRequests).toFixed(4)) : 0,
        },
        byModel: modelBreakdown.rows.map((row) => ({
          provider: row.provider,
          model: row.model,
          taskName: row.task_name,
          requestCount: parseInt(row.request_count, 10),
          totalCost: parseFloat(parseFloat(row.total_cost).toFixed(4)),
          avgCost: parseFloat(parseFloat(row.avg_cost).toFixed(4)),
          minCost: parseFloat(parseFloat(row.min_cost).toFixed(4)),
          maxCost: parseFloat(parseFloat(row.max_cost).toFixed(4)),
          totalTokens: parseInt(row.total_tokens || 0, 10),
          avgTokens: parseFloat(parseFloat(row.avg_tokens || 0).toFixed(2)),
        })),
        byExecutionMode: modeBreakdown.rows.map((row) => ({
          executionMode: row.execution_mode,
          requestCount: parseInt(row.request_count, 10),
          totalCost: parseFloat(parseFloat(row.total_cost || 0).toFixed(4)),
          avgProcessingTime: parseFloat(parseFloat(row.avg_processing_time || 0).toFixed(2)),
        })),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid query parameters',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Failed to get cost breakdown');
    reply.status(500).send({
      success: false,
      error: 'Failed to get cost breakdown',
    });
  }
}

/**
 * GET /api/admin/costs/top-consumers - Get top cost consumers
 */
export async function getTopConsumers(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { startDate, endDate } = CostQuerySchema.parse(request.query);

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const end = endDate || new Date().toISOString();

    // Get top consumers by tenant (for multi-tenant future)
    const topByTenant = await query(
      `SELECT
         tenant_id,
         COUNT(*) as request_count,
         SUM(cost_usd) as total_cost,
         AVG(cost_usd) as avg_cost
       FROM analyses
       WHERE created_at >= $1 AND created_at <= $2
         AND deleted_at IS NULL
       GROUP BY tenant_id
       ORDER BY total_cost DESC
       LIMIT 10`,
      [start, end]
    );

    // Get top consumers by input source
    const topBySource = await query(
      `SELECT
         input_type,
         COUNT(*) as request_count,
         SUM(cost_usd) as total_cost,
         AVG(cost_usd) as avg_cost
       FROM analyses
       WHERE created_at >= $1 AND created_at <= $2
         AND deleted_at IS NULL
       GROUP BY input_type
       ORDER BY total_cost DESC`,
      [start, end]
    );

    reply.send({
      success: true,
      data: {
        period: {
          startDate: start,
          endDate: end,
        },
        topByTenant: topByTenant.rows.map((row) => ({
          tenantId: row.tenant_id || 'default',
          requestCount: parseInt(row.request_count, 10),
          totalCost: parseFloat(parseFloat(row.total_cost || 0).toFixed(4)),
          avgCost: parseFloat(parseFloat(row.avg_cost || 0).toFixed(4)),
        })),
        topBySource: topBySource.rows.map((row) => ({
          inputType: row.input_type,
          requestCount: parseInt(row.request_count, 10),
          totalCost: parseFloat(parseFloat(row.total_cost || 0).toFixed(4)),
          avgCost: parseFloat(parseFloat(row.avg_cost || 0).toFixed(4)),
        })),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid query parameters',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Failed to get top consumers');
    reply.status(500).send({
      success: false,
      error: 'Failed to get top consumers',
    });
  }
}

/**
 * PUT /api/admin/costs/budget - Update monthly budget
 */
export async function updateBudget(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const BudgetSchema = z.object({
      monthlyBudgetUsd: z.number().positive(),
    });

    const { monthlyBudgetUsd } = BudgetSchema.parse(request.body);

    // Upsert budget setting
    await query(
      `INSERT INTO system_settings (key, value, description, updated_by)
       VALUES ('monthly_budget_usd', $1, 'Monthly AI cost budget in USD', $2)
       ON CONFLICT (key)
       DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
      [monthlyBudgetUsd.toString(), request.user?.username || 'admin']
    );

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, status, description, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'budget.update',
        'system_settings',
        'success',
        'Updated monthly budget',
        JSON.stringify({ monthlyBudgetUsd }),
      ]
    );

    logger.info({ monthlyBudgetUsd, userId: request.user?.userId }, 'Monthly budget updated');

    reply.send({
      success: true,
      message: 'Monthly budget updated',
      data: {
        monthlyBudgetUsd,
      },
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

    logger.error({ err }, 'Failed to update budget');
    reply.status(500).send({
      success: false,
      error: 'Failed to update budget',
    });
  }
}
