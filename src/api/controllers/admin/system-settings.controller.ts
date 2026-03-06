import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schemas
const UpdateSettingSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  description: z.string().optional(),
});

const BulkUpdateSchema = z.object({}).catchall(
  z.union([z.string(), z.number(), z.boolean()])
);

/**
 * Enhance setting with rich metadata for UI display
 */
function enhanceSettingMetadata(
  key: string,
  value: any,
  description: string,
  valueType: string,
  category: string,
  updatedAt?: string
) {
  const base = { key, value, description, valueType, category, updatedAt };

  // Rich metadata by setting key
  const metadata: Record<string, any> = {
    'notifications.email.recipients': {
      ...base,
      helpText: 'PhishLogic sends threat alerts and cost notifications to these addresses. Separate multiple emails with commas.',
      useCases: ['Security team alerts', 'SOC notifications', 'Admin monitoring', 'Cost budget alerts'],
      examples: 'security@company.com, admin@company.com',
      bestPractices: 'Use distribution lists instead of individual addresses. Configure at least 2 recipients for redundancy.',
    },

    'notifications.email.include_email_details': {
      ...base,
      helpText: 'Include the original email subject and sender address in notification messages.',
      useCases: ['Identify threat patterns', 'Track suspicious senders', 'Quick triage without opening dashboard'],
      bestPractices: 'Keep enabled for comprehensive threat intelligence.',
    },

    'notifications.email.include_verdict_score': {
      ...base,
      helpText: 'Show the verdict (Safe/Suspicious/Malicious) and numeric score (0-10) in notifications.',
      useCases: ['Understand severity at a glance', 'Prioritize response actions', 'Track score trends over time'],
      bestPractices: 'Always enable for actionable threat assessment.',
    },

    'notifications.email.include_red_flags': {
      ...base,
      helpText: 'Include the list of detected security issues and suspicious indicators found during analysis.',
      useCases: ['Understand why email was flagged', 'Learn about attack techniques', 'Share threat intelligence with team'],
      examples: 'Suspicious sender domain, Urgency language, Multiple external links, Credential harvesting form',
      bestPractices: 'Enable for security awareness and training opportunities.',
    },

    'notifications.email.send_failures': {
      ...base,
      helpText: 'Sends email for ANY analysis failure - timeouts, service errors, invalid input, service unavailable.',
      useCases: ['Monitor system health', 'Detect service outages', 'Track analysis errors', 'Identify config issues'],
      bestPractices: 'Enable for production monitoring. Review failure patterns to identify recurring issues.',
    },

    'notifications.email.batch_interval': {
      ...base,
      helpText: 'PhishLogic groups multiple alerts and sends them together at this interval instead of individual emails per detection.',
      useCases: ['High-volume environments', 'Reducing email noise', 'Periodic summaries', 'Non-urgent monitoring'],
      examples: '30 minutes for balanced urgency, 60 minutes for summaries',
      bestPractices: 'Use 15-30 min for active monitoring, 60+ min for summary reports.',
    },

    'notifications.webhook.url': {
      ...base,
      helpText: 'Configure webhook endpoint for real-time notifications. PhishLogic sends JSON payload via HTTP POST.',
      useCases: [
        'SIEM integration (Splunk, ELK Stack)',
        'Ticketing systems (Jira, ServiceNow)',
        'Chat platforms (Microsoft Teams, Discord)',
        'Custom automation workflows',
        'Data warehouse integration'
      ],
      examples: 'https://your-siem.com/api/phishlogic-events',
      bestPractices: 'Use HTTPS with authentication. Implement retry logic. Return 200 for success.',
      examplePayload: {
        event: 'malicious_detected',
        timestamp: '2026-03-06T10:30:00Z',
        analysis: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          url: 'https://suspicious-site.com',
          verdict: 'Malicious',
          score: 9,
          reason: 'Phishing indicators detected: fake login form, suspicious domain',
          detectedAt: '2026-03-06T10:29:45Z'
        }
      },
    },

    'notifications.webhook.on_malicious': {
      ...base,
      helpText: 'Trigger webhook when high-threat email detected. Critical alerts for immediate action.',
      useCases: ['Auto-create JIRA ticket', 'Trigger SIEM alert rule', 'Block sender in firewall', 'Page security team'],
      bestPractices: 'Enable for critical threats. Ensure your endpoint handles high-priority alerts quickly.',
    },

    'notifications.webhook.on_suspicious': {
      ...base,
      helpText: 'Trigger webhook for medium-threat emails that may require investigation.',
      useCases: ['Log to security dashboard', 'Queue for manual review', 'Add to watchlist', 'Track suspicious patterns'],
      bestPractices: 'Enable for comprehensive monitoring. Use filtering on your endpoint to reduce noise.',
    },

    'notifications.webhook.on_failed': {
      ...base,
      helpText: 'Trigger webhook when analysis fails (timeouts, errors, service unavailable).',
      useCases: ['Page on-call engineer', 'Create incident ticket', 'Alert DevOps channel', 'Monitor system health'],
      bestPractices: 'Enable for production monitoring. Configure alerting thresholds on your endpoint.',
    },

    'notifications.webhook.on_cost_alert': {
      ...base,
      helpText: 'Trigger webhook when AI cost budget threshold reached or exceeded.',
      useCases: ['Notify finance team', 'Trigger budget review workflow', 'Pause non-critical analysis', 'Track cost trends'],
      bestPractices: 'Enable for cost governance. Set up budget approval workflows on your endpoint.',
    },

    'notifications.slack.webhook_url': {
      ...base,
      helpText: 'Send real-time threat alerts to Slack via Incoming Webhooks. Get URL from Slack App settings.',
      useCases: [
        'Real-time security alerts to #security channel',
        'Daily/weekly summary reports',
        'Budget and cost notifications',
        'System health monitoring'
      ],
      examples: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
      bestPractices: 'Create dedicated Slack app. Use separate channels for different alert types (#security-critical, #security-summary).',
      examplePayload: {
        text: '🚨 Malicious URL Detected',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Malicious URL Detected*\n*URL:* https://suspicious-site.com\n*Score:* 9/10\n*Reason:* Phishing indicators detected'
            }
          }
        ]
      },
    },

    'notifications.slack.on_malicious': {
      ...base,
      helpText: 'Send Slack alert to channel when high-threat email detected (score >= 8).',
      useCases: ['Immediate team visibility', '@channel mention for urgency', 'Red alert notification', 'Quick response trigger'],
      bestPractices: 'Use for critical threats. Consider dedicated #security-critical channel with @here mentions.',
    },

    'notifications.slack.on_suspicious': {
      ...base,
      helpText: 'Send Slack alert when medium-threat email detected (score 5-7).',
      useCases: ['Track suspicious trends', 'Team awareness', 'Pattern recognition', 'Preventive monitoring'],
      bestPractices: 'Useful for broader security awareness. No @channel needed - team can review at convenience.',
    },

    'notifications.slack.on_failed': {
      ...base,
      helpText: 'Send Slack alert when analysis fails (errors, timeouts, service issues).',
      useCases: ['Monitor system health', 'Quick incident awareness', 'DevOps visibility', 'Service reliability tracking'],
      bestPractices: 'Consider separate #ops-alerts channel for failures to avoid alert fatigue in security channel.',
    },

    'notifications.slack.on_cost_alert': {
      ...base,
      helpText: 'Send Slack alert when AI cost budget threshold reached or exceeded.',
      useCases: ['Budget awareness', 'Cost trend visibility', 'Finance team notifications', 'Usage optimization triggers'],
      bestPractices: 'Useful for financial governance. Tag finance/ops teams for budget review.',
    },

    'notifications.smtp.host': {
      ...base,
      helpText: 'SMTP server hostname (e.g., smtp.gmail.com, smtp.office365.com)',
      examples: 'smtp.gmail.com, smtp.sendgrid.net, smtp.office365.com',
    },

    'notifications.smtp.port': {
      ...base,
      helpText: 'SMTP server port (587 for TLS, 465 for SSL, 25 for unencrypted)',
      examples: '587 (TLS recommended), 465 (SSL), 25 (unsecured)',
    },

    'notifications.smtp.user': {
      ...base,
      helpText: 'SMTP authentication username (usually your email address)',
      examples: 'notifications@company.com',
    },

    'notifications.smtp.password': {
      ...base,
      helpText: 'SMTP authentication password or app-specific password',
      examples: 'Use app-specific password for Gmail/Office365 for better security',
    },

    'notifications.smtp.secure': {
      ...base,
      helpText: 'Enable TLS/SSL encryption for secure email transmission',
      examples: 'true (recommended for production), false (for local testing only)',
    },

    'notifications.smtp.from_address': {
      ...base,
      helpText: 'Email address shown as sender in outgoing notifications',
      examples: 'phishlogic@company.com, security-alerts@company.com',
    },

    'cost_tracking.budget_monthly_usd': {
      ...base,
      helpText: 'Monthly budget for AI costs. Alerts sent to email recipients when budget exceeded or threshold reached.',
      useCases: ['Cost control', 'Budget planning', 'Prevent unexpected charges', 'Usage optimization'],
      examples: '$500 small teams, $2000 medium, $5000+ enterprise',
      bestPractices: 'Start conservative. Monitor 1-2 months to establish baseline, then adjust.',
    },

    'cost_tracking.alert_threshold_percent': {
      ...base,
      helpText: 'Send cost warning when costs reach this percentage of monthly budget. Alerts sent to email recipients.',
      useCases: ['Early warning system', 'Proactive budget management', 'Prevent overages', 'Monthly planning'],
      examples: '80% for warnings, 90% for urgent action',
      bestPractices: 'Set at 80% to give time for budget review before exceeding limit.',
    },
  };

  return metadata[key] || base;
}

/**
 * GET /api/admin/settings - Get all system settings
 */
export async function getAllSettings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const result = await query(
      `SELECT key, value, description, value_type, category, updated_at
       FROM system_settings
       ORDER BY key ASC`
    );

    // Enhance all settings with metadata
    const enhancedSettings = result.rows.map((row) =>
      enhanceSettingMetadata(
        row.key,
        parseValue(row.value),
        row.description,
        row.value_type,
        row.category,
        row.updated_at
      )
    );

    // Group settings by category (prefix before first underscore)
    const settings: Record<string, any[]> = {};

    enhancedSettings.forEach((setting) => {
      const category = setting.category || 'general';

      if (!settings[category]) {
        settings[category] = [];
      }

      settings[category].push(setting);
    });

    reply.send({
      success: true,
      data: {
        settings,
        flat: enhancedSettings,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get system settings');
    reply.status(500).send({
      success: false,
      error: 'Failed to get system settings',
    });
  }
}

/**
 * GET /api/admin/settings/:key - Get specific setting
 */
export async function getSetting(
  request: FastifyRequest<{ Params: { key: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { key } = request.params;

    const result = await query(
      `SELECT * FROM system_settings WHERE key = $1`,
      [key]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Setting not found',
      });
      return;
    }

    const row = result.rows[0];

    reply.send({
      success: true,
      data: {
        key: row.key,
        value: parseValue(row.value),
        description: row.description,
        valueType: row.value_type,
        category: row.category,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    logger.error({ err, key: request.params.key }, 'Failed to get setting');
    reply.status(500).send({
      success: false,
      error: 'Failed to get setting',
    });
  }
}

/**
 * PUT /api/admin/settings/:key - Update specific setting
 */
export async function updateSetting(
  request: FastifyRequest<{ Params: { key: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { key } = request.params;
    const { value, description } = UpdateSettingSchema.parse(request.body);

    // Validate setting key format (lowercase with underscores)
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      reply.status(400).send({
        success: false,
        error: 'Invalid setting key format (use lowercase with underscores)',
      });
      return;
    }

    // Convert value to string for storage
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    const valueType = typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : 'boolean';

    // Upsert setting
    const result = await query(
      `INSERT INTO system_settings (key, value, value_type, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key)
       DO UPDATE SET
         value = EXCLUDED.value,
         value_type = EXCLUDED.value_type,
         description = COALESCE(EXCLUDED.description, system_settings.description),
         updated_at = NOW()
       RETURNING *`,
      [
        key,
        valueStr,
        valueType,
        description || null,
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
        'setting.update',
        'system_setting',
        key,
        'success',
        `Updated system setting: ${key}`,
        JSON.stringify({ key, value, description }),
      ]
    );

    logger.info({ key, value, userId: request.user?.userId }, 'System setting updated');

    reply.send({
      success: true,
      message: `Setting '${key}' updated`,
      data: {
        key: row.key,
        value: parseValue(row.value),
        description: row.description,
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

    logger.error({ err, key: request.params.key }, 'Failed to update setting');
    reply.status(500).send({
      success: false,
      error: 'Failed to update setting',
    });
  }
}

/**
 * PUT /api/admin/settings - Bulk update settings
 */
export async function bulkUpdateSettings(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const settings = request.body as Record<string, unknown>;

    // Basic validation
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      reply.status(400).send({
        success: false,
        error: 'Request body must be an object with key-value pairs',
      });
      return;
    }

    const updated: string[] = [];
    const failed: Array<{ key: string; error: string }> = [];

    for (const [key, value] of Object.entries(settings)) {
      try {
        // Validate key format (lowercase letters, numbers, underscores, dots, hyphens)
        if (!/^[a-z][a-z0-9._-]*$/.test(key)) {
          failed.push({ key, error: 'Invalid key format (use lowercase with underscores/dots/hyphens)' });
          continue;
        }

        // Validate value type
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          failed.push({ key, error: 'Value must be string, number, or boolean' });
          continue;
        }

        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        const valueType = typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : 'boolean';

        await query(
          `INSERT INTO system_settings (key, value, value_type)
           VALUES ($1, $2, $3)
           ON CONFLICT (key)
           DO UPDATE SET
             value = EXCLUDED.value,
             value_type = EXCLUDED.value_type,
             updated_at = NOW()`,
          [key, valueStr, valueType]
        );

        updated.push(key);
      } catch (err) {
        failed.push({ key, error: (err as Error).message });
      }
    }

    // Log audit trail for bulk update
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, status, description, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'settings.bulk_update',
        'system_settings',
        failed.length === 0 ? 'success' : 'error',
        `Bulk updated ${updated.length} settings${failed.length > 0 ? ` (${failed.length} failed)` : ''}`,
        JSON.stringify({ updated, failed }),
      ]
    );

    logger.info(
      { updatedCount: updated.length, failedCount: failed.length, userId: request.user?.userId },
      'Bulk settings update completed'
    );

    reply.send({
      success: failed.length === 0,
      message: `Updated ${updated.length} settings${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
      data: {
        updated,
        failed,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to bulk update settings');
    reply.status(500).send({
      success: false,
      error: 'Failed to bulk update settings',
    });
  }
}

/**
 * DELETE /api/admin/settings/:key - Delete setting
 */
export async function deleteSetting(
  request: FastifyRequest<{ Params: { key: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { key } = request.params;

    // Check if setting exists
    const checkResult = await query(
      `SELECT key FROM system_settings WHERE key = $1`,
      [key]
    );

    if (checkResult.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Setting not found',
      });
      return;
    }

    // Delete the setting
    await query(
      `DELETE FROM system_settings WHERE key = $1`,
      [key]
    );

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.user?.type || 'admin',
        request.user?.userId,
        request.user?.username,
        'setting.delete',
        'system_setting',
        key,
        'success',
        `Deleted system setting: ${key}`,
      ]
    );

    logger.info({ key, userId: request.user?.userId }, 'System setting deleted');

    reply.send({
      success: true,
      message: `Setting '${key}' deleted`,
    });
  } catch (err) {
    logger.error({ err, key: request.params.key }, 'Failed to delete setting');
    reply.status(500).send({
      success: false,
      error: 'Failed to delete setting',
    });
  }
}

/**
 * GET /api/admin/settings/categories - Get settings grouped by category
 */
export async function getSettingsByCategory(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const result = await query(
      `SELECT key, value, description, category
       FROM system_settings
       ORDER BY key ASC`
    );

    // Group by category
    const categories: Record<string, any> = {};

    result.rows.forEach((row) => {
      const parts = row.key.split('_');
      const category = parts[0] || 'general';
      const subKey = parts.slice(1).join('_');

      if (!categories[category]) {
        categories[category] = {
          name: category,
          settings: [],
        };
      }

      categories[category].settings.push({
        key: row.key,
        subKey: subKey || row.key,
        value: parseValue(row.value),
        description: row.description,
      });
    });

    reply.send({
      success: true,
      data: Object.values(categories),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get settings by category');
    reply.status(500).send({
      success: false,
      error: 'Failed to get settings by category',
    });
  }
}

/**
 * Helper: Parse stored string value to appropriate type
 */
function parseValue(value: string): string | number | boolean {
  // Try to parse as JSON first
  try {
    return JSON.parse(value);
  } catch {
    // Return as string if not valid JSON
    return value;
  }
}
