import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schema for support request
const SupportRequestSchema = z.object({
  requestType: z.enum(['issue', 'improvement']),
  category: z.string().min(1).max(50),
  description: z.string().min(20),
  email: z.string().email().optional().or(z.literal('')),
  preferredContactTime: z.string().max(50).optional(),
});

/**
 * POST /api/admin/support
 * Submit a new support request
 */
export async function createSupportRequest(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = SupportRequestSchema.parse(request.body);

    const result = await query(
      `INSERT INTO support_requests
        (request_type, category, description, email, preferred_contact_time)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        request_type as "requestType",
        category,
        description,
        email,
        preferred_contact_time as "preferredContactTime",
        status,
        created_at as "createdAt"`,
      [
        data.requestType,
        data.category,
        data.description,
        data.email || null,
        data.preferredContactTime || null,
      ]
    );

    logger.info(
      {
        requestId: result.rows[0].id,
        type: data.requestType,
        category: data.category,
      },
      'Support request created'
    );

    reply.send({
      success: true,
      message: 'Support request submitted successfully. We will review it shortly.',
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
    logger.error({ err }, 'Failed to create support request');
    reply.status(500).send({
      success: false,
      error: 'Failed to submit support request',
    });
  }
}

/**
 * GET /api/admin/support
 * Get all support requests (admin only)
 */
export async function getSupportRequests(
  request: FastifyRequest<{
    Querystring: { status?: string; category?: string; limit?: string; offset?: string };
  }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { status, category, limit = '50', offset = '0' } = request.query;

    let queryText = `
      SELECT
        id,
        request_type as "requestType",
        category,
        description,
        email,
        preferred_contact_time as "preferredContactTime",
        status,
        priority,
        admin_notes as "adminNotes",
        created_at as "createdAt",
        updated_at as "updatedAt",
        resolved_at as "resolvedAt"
      FROM support_requests
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramIndex = 1;

    if (status) {
      queryText += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (category) {
      queryText += ` AND category = $${paramIndex}`;
      values.push(category);
      paramIndex++;
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(parseInt(limit), parseInt(offset));

    const result = await query(queryText, values);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM support_requests WHERE 1=1';
    const countValues: any[] = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countParamIndex}`;
      countValues.push(status);
      countParamIndex++;
    }

    if (category) {
      countQuery += ` AND category = $${countParamIndex}`;
      countValues.push(category);
    }

    const countResult = await query(countQuery, countValues);

    reply.send({
      success: true,
      data: result.rows,
      meta: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get support requests');
    reply.status(500).send({
      success: false,
      error: 'Failed to get support requests',
    });
  }
}

/**
 * GET /api/admin/support/:id
 * Get specific support request
 */
export async function getSupportRequest(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    const result = await query(
      `SELECT
        id,
        request_type as "requestType",
        category,
        description,
        email,
        preferred_contact_time as "preferredContactTime",
        status,
        priority,
        admin_notes as "adminNotes",
        created_at as "createdAt",
        updated_at as "updatedAt",
        resolved_at as "resolvedAt"
      FROM support_requests
      WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Support request not found',
      });
      return;
    }

    reply.send({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get support request');
    reply.status(500).send({
      success: false,
      error: 'Failed to get support request',
    });
  }
}

/**
 * PUT /api/admin/support/:id
 * Update support request (admin only)
 */
export async function updateSupportRequest(
  request: FastifyRequest<{
    Params: { id: string };
    Body: { status?: string; priority?: string; adminNotes?: string };
  }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const { status, priority, adminNotes } = request.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;

      if (status === 'resolved' || status === 'closed') {
        updates.push(`resolved_at = NOW()`);
      }
    }

    if (priority) {
      updates.push(`priority = $${paramIndex}`);
      values.push(priority);
      paramIndex++;
    }

    if (adminNotes !== undefined) {
      updates.push(`admin_notes = $${paramIndex}`);
      values.push(adminNotes);
      paramIndex++;
    }

    if (updates.length === 0) {
      reply.status(400).send({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    values.push(id);

    const result = await query(
      `UPDATE support_requests
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING
         id,
         request_type as "requestType",
         category,
         status,
         priority,
         updated_at as "updatedAt"`,
      values
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Support request not found',
      });
      return;
    }

    logger.info({ requestId: id, updates: Object.keys(request.body) }, 'Support request updated');

    reply.send({
      success: true,
      message: 'Support request updated successfully',
      data: result.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'Failed to update support request');
    reply.status(500).send({
      success: false,
      error: 'Failed to update support request',
    });
  }
}

/**
 * GET /api/admin/support/stats
 * Get support request statistics
 */
export async function getSupportStats(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const statsResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'closed') as closed,
        COUNT(*) FILTER (WHERE request_type = 'issue') as issues,
        COUNT(*) FILTER (WHERE request_type = 'improvement') as improvements
      FROM support_requests
    `);

    const categoryResult = await query(`
      SELECT
        category,
        COUNT(*) as count
      FROM support_requests
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `);

    reply.send({
      success: true,
      data: {
        overview: statsResult.rows[0],
        byCategory: categoryResult.rows,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get support stats');
    reply.status(500).send({
      success: false,
      error: 'Failed to get support statistics',
    });
  }
}
