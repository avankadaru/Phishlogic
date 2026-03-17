import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getWhitelistService } from '../../../core/services/whitelist.service.js';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schemas
const AddWhitelistEntrySchema = z.object({
  type: z.enum(['email', 'domain', 'url']),
  value: z.string().min(1),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  isTrusted: z.boolean().optional().default(true),
  scanAttachments: z.boolean().optional().default(true),
  scanRichContent: z.boolean().optional().default(true),
});

const UpdateWhitelistEntrySchema = z.object({
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  active: z.boolean().optional(),
  isTrusted: z.boolean().optional(),
  scanAttachments: z.boolean().optional(),
  scanRichContent: z.boolean().optional(),
});

/**
 * GET /api/admin/whitelist - Get all whitelist entries
 */
export async function getAllWhitelistEntries(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const QuerySchema = z.object({
      type: z.enum(['email', 'domain', 'url']).optional(),
      active: z.coerce.boolean().optional(),
    });

    const { type, active } = QuerySchema.parse(request.query);

    const whitelistService = getWhitelistService(request.user?.tenantId ?? undefined);

    let entries;

    if (type) {
      entries = await whitelistService.getEntriesByType(type);
    } else if (active !== undefined) {
      entries = active ? await whitelistService.getActiveEntries() : await whitelistService.getAllEntries();
    } else {
      entries = await whitelistService.getAllEntries();
    }

    reply.send({
      success: true,
      data: entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        value: entry.value,
        description: entry.description,
        isTrusted: entry.isTrusted,
        scanAttachments: entry.scanAttachments,
        scanRichContent: entry.scanRichContent,
        addedAt: entry.addedAt,
        expiresAt: entry.expiresAt,
        active: entry.active,
      })),
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

    logger.error({ err }, 'Failed to get whitelist entries');
    reply.status(500).send({
      success: false,
      error: 'Failed to get whitelist entries',
    });
  }
}

/**
 * GET /api/admin/whitelist/:id - Get specific whitelist entry
 */
export async function getWhitelistEntry(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const whitelistService = getWhitelistService(request.user?.tenantId ?? undefined);

    const entry = await whitelistService.getEntry(id);

    if (!entry) {
      reply.status(404).send({
        success: false,
        error: 'Whitelist entry not found',
      });
      return;
    }

    // Get additional stats from database
    const statsResult = await query(
      `SELECT match_count, last_matched_at, added_by, created_at, updated_at
       FROM whitelist_entries
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    const stats = statsResult.rows[0];

    reply.send({
      success: true,
      data: {
        id: entry.id,
        type: entry.type,
        value: entry.value,
        description: entry.description,
        isTrusted: entry.isTrusted,
        scanAttachments: entry.scanAttachments,
        scanRichContent: entry.scanRichContent,
        addedAt: entry.addedAt,
        expiresAt: entry.expiresAt,
        active: entry.active,
        matchCount: stats ? parseInt(stats.match_count || 0, 10) : 0,
        lastMatchedAt: stats?.last_matched_at,
        addedBy: stats?.added_by,
        createdAt: stats?.created_at,
        updatedAt: stats?.updated_at,
      },
    });
  } catch (err) {
    logger.error({ err, entryId: request.params.id }, 'Failed to get whitelist entry');
    reply.status(500).send({
      success: false,
      error: 'Failed to get whitelist entry',
    });
  }
}

/**
 * POST /api/admin/whitelist - Add new whitelist entry
 */
export async function addWhitelistEntry(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const entryData = AddWhitelistEntrySchema.parse(request.body);
    const whitelistService = getWhitelistService(request.user?.tenantId ?? undefined);

    const entry = await whitelistService.addEntry({
      type: entryData.type,
      value: entryData.value,
      description: entryData.description,
      expiresAt: entryData.expiresAt ? new Date(entryData.expiresAt) : undefined,
      isTrusted: entryData.isTrusted,
      scanAttachments: entryData.scanAttachments,
      scanRichContent: entryData.scanRichContent,
    });

    // Update added_by in database
    await query(
      `UPDATE whitelist_entries SET added_by = $1 WHERE id = $2`,
      [request.user?.username || 'admin', entry.id]
    );

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'whitelist.add',
        'whitelist_entry',
        entry.id,
        'success',
        `Added whitelist entry: ${entryData.type} - ${entryData.value}`,
        JSON.stringify(entryData),
      ]
    );

    logger.info(
      { entryId: entry.id, type: entryData.type, value: entryData.value, userId: request.user?.userId },
      'Whitelist entry added'
    );

    reply.status(201).send({
      success: true,
      message: 'Whitelist entry added',
      data: {
        id: entry.id,
        type: entry.type,
        value: entry.value,
        description: entry.description,
        isTrusted: entry.isTrusted,
        scanAttachments: entry.scanAttachments,
        scanRichContent: entry.scanRichContent,
        addedAt: entry.addedAt,
        expiresAt: entry.expiresAt,
        active: entry.active,
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

    logger.error({ err }, 'Failed to add whitelist entry');
    reply.status(500).send({
      success: false,
      error: 'Failed to add whitelist entry',
    });
  }
}

/**
 * PUT /api/admin/whitelist/:id - Update whitelist entry
 */
export async function updateWhitelistEntry(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const updates = UpdateWhitelistEntrySchema.parse(request.body);

    // Build dynamic UPDATE query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      values.push(updates.description);
      paramIndex++;
    }

    if (updates.expiresAt !== undefined) {
      setClauses.push(`expires_at = $${paramIndex}`);
      values.push(updates.expiresAt);
      paramIndex++;
    }

    if (updates.active !== undefined) {
      setClauses.push(`is_active = $${paramIndex}`);
      values.push(updates.active);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      reply.status(400).send({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id, request.user?.tenantId || null);

    const result = await query(
      `UPDATE whitelist_entries
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
         AND tenant_id IS NOT DISTINCT FROM $${paramIndex + 1}
         AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Whitelist entry not found',
      });
      return;
    }

    const entry = result.rows[0];

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'whitelist.update',
        'whitelist_entry',
        entry.id,
        'success',
        `Updated whitelist entry: ${entry.value}`,
        JSON.stringify(updates),
      ]
    );

    logger.info({ entryId: id, updates, userId: request.user?.userId }, 'Whitelist entry updated');

    reply.send({
      success: true,
      message: 'Whitelist entry updated',
      data: {
        id: entry.id,
        type: entry.type,
        value: entry.value,
        description: entry.description,
        addedAt: new Date(entry.created_at),
        expiresAt: entry.expires_at ? new Date(entry.expires_at) : undefined,
        active: entry.is_active,
        updatedAt: entry.updated_at,
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

    logger.error({ err, entryId: request.params.id }, 'Failed to update whitelist entry');
    reply.status(500).send({
      success: false,
      error: 'Failed to update whitelist entry',
    });
  }
}

/**
 * DELETE /api/admin/whitelist/:id - Delete whitelist entry
 */
export async function deleteWhitelistEntry(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const whitelistService = getWhitelistService(request.user?.tenantId ?? undefined);

    // Get entry info before deleting
    const entry = await whitelistService.getEntry(id);

    if (!entry) {
      reply.status(404).send({
        success: false,
        error: 'Whitelist entry not found',
      });
      return;
    }

    const deleted = await whitelistService.removeEntry(id);

    if (!deleted) {
      reply.status(404).send({
        success: false,
        error: 'Whitelist entry not found',
      });
      return;
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'whitelist.delete',
        'whitelist_entry',
        id,
        'success',
        `Deleted whitelist entry: ${entry.type} - ${entry.value}`,
      ]
    );

    logger.info({ entryId: id, type: entry.type, value: entry.value, userId: request.user?.userId }, 'Whitelist entry deleted');

    reply.send({
      success: true,
      message: 'Whitelist entry deleted',
    });
  } catch (err) {
    logger.error({ err, entryId: request.params.id }, 'Failed to delete whitelist entry');
    reply.status(500).send({
      success: false,
      error: 'Failed to delete whitelist entry',
    });
  }
}

/**
 * POST /api/admin/whitelist/:id/activate - Activate whitelist entry
 */
export async function activateWhitelistEntry(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const whitelistService = getWhitelistService(request.user?.tenantId ?? undefined);

    const activated = await whitelistService.activateEntry(id);

    if (!activated) {
      reply.status(404).send({
        success: false,
        error: 'Whitelist entry not found',
      });
      return;
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'whitelist.activate',
        'whitelist_entry',
        id,
        'success',
        'Activated whitelist entry',
      ]
    );

    logger.info({ entryId: id, userId: request.user?.userId }, 'Whitelist entry activated');

    reply.send({
      success: true,
      message: 'Whitelist entry activated',
    });
  } catch (err) {
    logger.error({ err, entryId: request.params.id }, 'Failed to activate whitelist entry');
    reply.status(500).send({
      success: false,
      error: 'Failed to activate whitelist entry',
    });
  }
}

/**
 * POST /api/admin/whitelist/:id/deactivate - Deactivate whitelist entry
 */
export async function deactivateWhitelistEntry(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const whitelistService = getWhitelistService(request.user?.tenantId ?? undefined);

    const deactivated = await whitelistService.deactivateEntry(id);

    if (!deactivated) {
      reply.status(404).send({
        success: false,
        error: 'Whitelist entry not found',
      });
      return;
    }

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'whitelist.deactivate',
        'whitelist_entry',
        id,
        'success',
        'Deactivated whitelist entry',
      ]
    );

    logger.info({ entryId: id, userId: request.user?.userId }, 'Whitelist entry deactivated');

    reply.send({
      success: true,
      message: 'Whitelist entry deactivated',
    });
  } catch (err) {
    logger.error({ err, entryId: request.params.id }, 'Failed to deactivate whitelist entry');
    reply.status(500).send({
      success: false,
      error: 'Failed to deactivate whitelist entry',
    });
  }
}

/**
 * GET /api/admin/whitelist/stats - Get whitelist statistics
 */
export async function getWhitelistStats(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const whitelistService = getWhitelistService(request.user?.tenantId ?? undefined);
    const stats = await whitelistService.getStats();

    // Get top matched entries
    const topMatched = await query(
      `SELECT id, type, value, match_count, last_matched_at
       FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND deleted_at IS NULL
         AND match_count > 0
       ORDER BY match_count DESC
       LIMIT 10`,
      [request.user?.tenantId || null]
    );

    reply.send({
      success: true,
      data: {
        total: stats.total,
        active: stats.active,
        byType: stats.byType,
        topMatched: topMatched.rows.map((row) => ({
          id: row.id,
          type: row.type,
          value: row.value,
          matchCount: parseInt(row.match_count, 10),
          lastMatchedAt: row.last_matched_at,
        })),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get whitelist stats');
    reply.status(500).send({
      success: false,
      error: 'Failed to get whitelist statistics',
    });
  }
}
