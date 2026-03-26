import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schemas
const CreateNotificationSchema = z.object({
  type: z.enum(['webhook', 'email', 'slack']),
  name: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
  config: z.object({
    url: z.string().url().optional(),
    email: z.string().email().optional(),
    slackChannel: z.string().optional(),
    slackToken: z.string().optional(),
  }),
  triggers: z.array(z.enum(['malicious_detected', 'suspicious_detected', 'error', 'high_cost'])),
  filters: z.object({
    minConfidence: z.number().min(0).max(1).optional(),
    verdicts: z.array(z.enum(['Safe', 'Suspicious', 'Malicious'])).optional(),
  }).optional(),
});

const UpdateNotificationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  config: z.object({
    url: z.string().url().optional(),
    email: z.string().email().optional(),
    slackChannel: z.string().optional(),
    slackToken: z.string().optional(),
  }).optional(),
  triggers: z.array(z.enum(['malicious_detected', 'suspicious_detected', 'error', 'high_cost'])).optional(),
  filters: z.object({
    minConfidence: z.number().min(0).max(1).optional(),
    verdicts: z.array(z.enum(['Safe', 'Suspicious', 'Malicious'])).optional(),
  }).optional(),
});

/**
 * GET /api/admin/notifications - Get all notification configurations
 */
export async function getAllNotifications(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const result = await query(
      `SELECT
         id, type, name, enabled, config, triggers, filters,
         last_triggered_at, error_count, created_at, updated_at
       FROM notification_configs
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    reply.send({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        enabled: row.enabled,
        config: row.config,
        triggers: row.triggers || [],
        filters: row.filters || {},
        lastTriggeredAt: row.last_triggered_at,
        errorCount: parseInt(row.error_count || 0, 10),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get notification configs');
    reply.status(500).send({
      success: false,
      error: 'Failed to get notification configurations',
    });
  }
}

/**
 * GET /api/admin/notifications/:id - Get specific notification configuration
 */
export async function getNotification(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    const result = await query(
      `SELECT * FROM notification_configs WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Notification configuration not found',
      });
      return;
    }

    const row = result.rows[0];

    reply.send({
      success: true,
      data: {
        id: row.id,
        type: row.type,
        name: row.name,
        enabled: row.enabled,
        config: row.config,
        triggers: row.triggers || [],
        filters: row.filters || {},
        lastTriggeredAt: row.last_triggered_at,
        errorCount: parseInt(row.error_count || 0, 10),
        lastError: row.last_error,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tenantId: row.tenant_id,
      },
    });
  } catch (err) {
    logger.error({ err, notificationId: request.params.id }, 'Failed to get notification config');
    reply.status(500).send({
      success: false,
      error: 'Failed to get notification configuration',
    });
  }
}

/**
 * POST /api/admin/notifications - Create new notification configuration
 */
export async function createNotification(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const notificationData = CreateNotificationSchema.parse(request.body);

    // Insert notification config
    const result = await query(
      `INSERT INTO notification_configs
       (type, name, enabled, config, triggers, filters, created_by, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        notificationData.type,
        notificationData.name,
        notificationData.enabled,
        JSON.stringify(notificationData.config),
        JSON.stringify(notificationData.triggers),
        JSON.stringify(notificationData.filters || {}),
        request.user?.username || 'admin',
        request.user?.tenantId || null,
      ]
    );

    const row = result.rows[0];

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'notification.create',
        'notification_config',
        row.id,
        'success',
        `Created notification config: ${notificationData.name}`,
        JSON.stringify(notificationData),
      ]
    );

    logger.info(
      { notificationId: row.id, name: notificationData.name, userId: request.user?.userId },
      'Notification config created'
    );

    reply.status(201).send({
      success: true,
      message: 'Notification configuration created',
      data: {
        id: row.id,
        type: row.type,
        name: row.name,
        enabled: row.enabled,
        config: row.config,
        triggers: row.triggers,
        filters: row.filters,
        createdAt: row.created_at,
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

    logger.error({ err }, 'Failed to create notification config');
    reply.status(500).send({
      success: false,
      error: 'Failed to create notification configuration',
    });
  }
}

/**
 * PUT /api/admin/notifications/:id - Update notification configuration
 */
export async function updateNotification(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const updates = UpdateNotificationSchema.parse(request.body);

    // Build dynamic UPDATE query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      values.push(updates.name);
      paramIndex++;
    }

    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIndex}`);
      values.push(updates.enabled);
      paramIndex++;
    }

    if (updates.config !== undefined) {
      setClauses.push(`config = $${paramIndex}`);
      values.push(JSON.stringify(updates.config));
      paramIndex++;
    }

    if (updates.triggers !== undefined) {
      setClauses.push(`triggers = $${paramIndex}`);
      values.push(JSON.stringify(updates.triggers));
      paramIndex++;
    }

    if (updates.filters !== undefined) {
      setClauses.push(`filters = $${paramIndex}`);
      values.push(JSON.stringify(updates.filters));
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
    values.push(id);

    const result = await query(
      `UPDATE notification_configs
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Notification configuration not found',
      });
      return;
    }

    const row = result.rows[0];

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'notification.update',
        'notification_config',
        row.id,
        'success',
        `Updated notification config: ${row.name}`,
        JSON.stringify(updates),
      ]
    );

    logger.info({ notificationId: id, updates, userId: request.user?.userId }, 'Notification config updated');

    reply.send({
      success: true,
      message: 'Notification configuration updated',
      data: {
        id: row.id,
        type: row.type,
        name: row.name,
        enabled: row.enabled,
        config: row.config,
        triggers: row.triggers,
        filters: row.filters,
        updatedAt: row.updated_at,
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

    logger.error({ err, notificationId: request.params.id }, 'Failed to update notification config');
    reply.status(500).send({
      success: false,
      error: 'Failed to update notification configuration',
    });
  }
}

/**
 * DELETE /api/admin/notifications/:id - Delete notification configuration
 */
export async function deleteNotification(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    // Get notification info before deleting
    const notificationResult = await query(
      `SELECT name FROM notification_configs WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (notificationResult.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Notification configuration not found',
      });
      return;
    }

    const notificationName = notificationResult.rows[0].name;

    // Soft delete
    await query(
      `UPDATE notification_configs
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'notification.delete',
        'notification_config',
        id,
        'success',
        `Deleted notification config: ${notificationName}`,
      ]
    );

    logger.info({ notificationId: id, name: notificationName, userId: request.user?.userId }, 'Notification config deleted');

    reply.send({
      success: true,
      message: 'Notification configuration deleted',
    });
  } catch (err) {
    logger.error({ err, notificationId: request.params.id }, 'Failed to delete notification config');
    reply.status(500).send({
      success: false,
      error: 'Failed to delete notification configuration',
    });
  }
}

/**
 * POST /api/admin/notifications/:id/test - Test notification configuration
 */
export async function testNotification(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    // Get notification config
    const result = await query(
      `SELECT * FROM notification_configs WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Notification configuration not found',
      });
      return;
    }

    const notification = result.rows[0];

    if (!notification.enabled) {
      reply.status(400).send({
        success: false,
        error: 'Cannot test disabled notification',
      });
      return;
    }

    // Build test payload
    const testPayload = {
      type: 'test',
      message: `Test notification from PhishLogic (${notification.name})`,
      timestamp: new Date().toISOString(),
      data: {
        verdict: 'Malicious',
        confidence: 0.95,
        url: 'https://example-phishing-site.com',
      },
    };

    // Send test notification based on type
    let testResult: any = { sent: false };

    try {
      switch (notification.type) {
        case 'webhook':
          // Send HTTP POST to webhook URL
          if (notification.config.url) {
            const response = await fetch(notification.config.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(testPayload),
            });
            testResult = {
              sent: response.ok,
              status: response.status,
              statusText: response.statusText,
            };
          } else {
            testResult = { sent: false, error: 'No webhook URL configured' };
          }
          break;

        case 'email':
          // Would send via SMTP (not implemented in this controller)
          testResult = { sent: false, error: 'Email testing not yet implemented' };
          break;

        case 'slack':
          // Would send via Slack API (not implemented in this controller)
          testResult = { sent: false, error: 'Slack testing not yet implemented' };
          break;

        default:
          testResult = { sent: false, error: 'Unknown notification type' };
      }

      // Update last_triggered_at if successful
      if (testResult.sent) {
        await query(
          `UPDATE notification_configs
           SET last_triggered_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [id]
        );
      } else {
        // Increment error count
        await query(
          `UPDATE notification_configs
           SET error_count = error_count + 1,
               last_error = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [id, testResult.error || 'Test failed']
        );
      }

      logger.info(
        { notificationId: id, type: notification.type, result: testResult },
        'Notification test completed'
      );

      reply.send({
        success: testResult.sent,
        message: testResult.sent ? 'Test notification sent successfully' : 'Test notification failed',
        data: testResult,
      });
    } catch (testErr) {
      logger.error({ err: testErr, notificationId: id }, 'Notification test failed');

      // Update error count
      await query(
        `UPDATE notification_configs
         SET error_count = error_count + 1,
             last_error = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [id, (testErr as Error).message]
      );

      reply.status(500).send({
        success: false,
        error: 'Failed to send test notification',
        details: (testErr as Error).message,
      });
    }
  } catch (err) {
    logger.error({ err, notificationId: request.params.id }, 'Failed to test notification');
    reply.status(500).send({
      success: false,
      error: 'Failed to test notification',
    });
  }
}
