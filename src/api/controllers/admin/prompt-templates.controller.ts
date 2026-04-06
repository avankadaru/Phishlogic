import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

/**
 * Prompt Templates Controller
 * Manages AI prompt templates for configurable phishing detection
 */

// Base validation schema for prompt template (without .refine() so .partial() works)
const PromptTemplateBaseSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  description: z.string().min(1),
  promptType: z.enum(['system', 'user', 'combined']),
  inputType: z.enum(['email', 'url', 'both']),
  systemPrompt: z.string().optional().nullable(),
  userPrompt: z.string().min(10),
  scenarioTags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().default(false),
});

// Creation schema with validation
const PromptTemplateSchema = PromptTemplateBaseSchema.refine(
  (data) => {
    // If promptType is 'system' or 'combined', systemPrompt is required
    if ((data.promptType === 'system' || data.promptType === 'combined') && !data.systemPrompt) {
      return false;
    }
    return true;
  },
  {
    message: 'systemPrompt is required when promptType is "system" or "combined"',
    path: ['systemPrompt'],
  }
);

// Update schema (uses base without .refine() so .partial() works)
const PromptTemplateUpdateSchema = PromptTemplateBaseSchema.partial();

// List of valid template variables
const VALID_VARIABLES = [
  'sender_email', 'sender_domain', 'display_name', 'reply_to', 'subject', 'body',
  'body_snippet', 'body_preview', 'body_truncated', 'spf_status', 'dkim_status',
  'dmarc_status', 'auth_guidance', 'auth_verification_note', 'is_role_account', 'is_disposable', 'domain_age', 'domain_age_days',
  'urgency_score', 'urgency_indicators', 'urgency_phrases', 'urgency_detected',
  'link_count', 'links', 'top_links', 'suspicious_links', 'suspicious_links_summary',
  'external_domains', 'all_domains', 'suspicious_domains', 'typosquatting_detected',
  'typosquatting_domains', 'attachments', 'attachment_summary', 'attachment_count',
  'qr_codes', 'qr_code_count', 'qr_code_destinations', 'buttons', 'button_count',
  'suspicious_buttons', 'password_forms', 'form_actions', 'form_action_domain',
  'is_internal_domain', 'sender_role', 'has_html', 'brand_mentions', 'brand_list',
  'brand_mismatch', 'claimed_brand', 'actual_domain', 'ceo_keywords',
  'ceo_keywords_found', 'reply_to_mismatch', 'homograph_detected', 'homograph_chars',
];

/**
 * GET /api/admin/prompt-templates
 * List all prompt templates
 */
export async function getPromptTemplates(
  request: FastifyRequest<{ Querystring: { scenario?: string; costTier?: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { scenario, costTier } = request.query;

    let sql = `
      SELECT id, name, display_name AS "displayName", description, prompt_type AS "promptType",
             input_type AS "inputType", token_estimate AS "tokenEstimate",
             cost_tier AS "costTier", accuracy_target AS "accuracyTarget",
             scenario_tags AS "scenarioTags", is_default AS "isDefault",
             is_system_template AS "isSystemTemplate", created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM prompt_templates
      WHERE deleted_at IS NULL
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (scenario) {
      sql += ` AND $${paramIndex} = ANY(scenario_tags)`;
      params.push(scenario);
      paramIndex++;
    }

    if (costTier) {
      sql += ` AND cost_tier = $${paramIndex}`;
      params.push(costTier);
      paramIndex++;
    }

    sql += ` ORDER BY is_default DESC, cost_tier ASC, display_name ASC`;

    const result = await query(sql, params);

    reply.send({
      success: true,
      templates: result.rows,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch prompt templates');
    reply.status(500).send({
      success: false,
      error: 'Failed to fetch prompt templates',
    });
  }
}

/**
 * GET /api/admin/prompt-templates/:id
 * Get single template with full content
 */
export async function getPromptTemplate(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    const result = await query(
      `SELECT id, name, display_name AS "displayName", description, prompt_type AS "promptType",
              input_type AS "inputType", system_prompt AS "systemPrompt",
              user_prompt AS "userPrompt", token_estimate AS "tokenEstimate",
              cost_tier AS "costTier", accuracy_target AS "accuracyTarget",
              scenario_tags AS "scenarioTags", is_default AS "isDefault",
              is_system_template AS "isSystemTemplate", created_by AS "createdBy",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM prompt_templates
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Prompt template not found',
      });
      return;
    }

    reply.send({
      success: true,
      template: result.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch prompt template');
    reply.status(500).send({
      success: false,
      error: 'Failed to fetch prompt template',
    });
  }
}

/**
 * POST /api/admin/prompt-templates
 * Create new prompt template
 */
export async function createPromptTemplate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = PromptTemplateSchema.parse(request.body);

    // Validate template syntax - check for valid variables
    const userPromptVars = data.userPrompt.match(/\{\{(\w+)\}\}/g) || [];
    const systemPromptVars = data.systemPrompt ? data.systemPrompt.match(/\{\{(\w+)\}\}/g) || [] : [];
    const allUsedVars = [...userPromptVars, ...systemPromptVars]
      .map(v => v.replace(/\{\{|\}\}/g, ''));

    const invalidVars = allUsedVars.filter(v => !VALID_VARIABLES.includes(v));

    if (invalidVars.length > 0) {
      reply.status(400).send({
        success: false,
        error: `Invalid template variables: ${invalidVars.join(', ')}`,
        validVariables: VALID_VARIABLES,
      });
      return;
    }

    // Check for duplicate name
    const duplicateName = await query(
      'SELECT id FROM prompt_templates WHERE name = $1 AND deleted_at IS NULL',
      [data.name]
    );

    if (duplicateName.rows.length > 0) {
      reply.status(400).send({
        success: false,
        error: 'Template name already exists. Please choose a different name.',
      });
      return;
    }

    // Estimate token count (rough approximation: ~4 chars per token)
    const systemTokens = data.systemPrompt ? Math.ceil(data.systemPrompt.length / 4) : 0;
    const userTokens = Math.ceil(data.userPrompt.length / 4);
    const tokenEstimate = systemTokens + userTokens;

    // Determine cost tier based on token count
    let costTier: string;
    if (tokenEstimate < 550) {
      costTier = 'cost_efficient';
    } else if (tokenEstimate < 900) {
      costTier = 'balanced';
    } else {
      costTier = 'comprehensive';
    }

    const result = await query(
      `INSERT INTO prompt_templates
       (name, display_name, description, prompt_type, input_type, system_prompt, user_prompt,
        token_estimate, cost_tier, scenario_tags, is_default, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, name, display_name AS "displayName", token_estimate AS "tokenEstimate",
                 cost_tier AS "costTier"`,
      [
        data.name,
        data.displayName,
        data.description,
        data.promptType,
        data.inputType,
        data.systemPrompt,
        data.userPrompt,
        tokenEstimate,
        costTier,
        data.scenarioTags,
        data.isDefault,
        (request as any).user?.email || 'admin',
      ]
    );

    logger.info({
      templateId: result.rows[0].id,
      name: data.name,
      tokenEstimate,
      costTier
    }, 'Prompt template created');

    reply.status(201).send({
      success: true,
      template: result.rows[0],
      message: `Prompt template "${data.displayName}" created successfully`,
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

    logger.error({ err }, 'Failed to create prompt template');
    reply.status(500).send({
      success: false,
      error: 'Failed to create prompt template',
    });
  }
}

/**
 * PUT /api/admin/prompt-templates/:id
 * Update prompt template
 */
export async function updatePromptTemplate(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const data = PromptTemplateUpdateSchema.parse(request.body);

    // Check if template exists and is not a system template
    const existing = await query(
      'SELECT is_system_template FROM prompt_templates WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existing.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Prompt template not found',
      });
      return;
    }

    if (existing.rows[0].is_system_template) {
      reply.status(403).send({
        success: false,
        error: 'Cannot modify system templates. Create a custom template instead.',
      });
      return;
    }

    // Check for duplicate name if name is being updated
    if (data.name) {
      const duplicateName = await query(
        'SELECT id FROM prompt_templates WHERE name = $1 AND id != $2 AND deleted_at IS NULL',
        [data.name, id]
      );

      if (duplicateName.rows.length > 0) {
        reply.status(400).send({
          success: false,
          error: 'Template name already exists. Please choose a different name.',
        });
        return;
      }
    }

    // Validate variables if prompts are being updated
    if (data.userPrompt || data.systemPrompt) {
      const userPromptVars = data.userPrompt ? data.userPrompt.match(/\{\{(\w+)\}\}/g) || [] : [];
      const systemPromptVars = data.systemPrompt ? data.systemPrompt.match(/\{\{(\w+)\}\}/g) || [] : [];
      const allUsedVars = [...userPromptVars, ...systemPromptVars]
        .map(v => v.replace(/\{\{|\}\}/g, ''));

      const invalidVars = allUsedVars.filter(v => !VALID_VARIABLES.includes(v));

      if (invalidVars.length > 0) {
        reply.status(400).send({
          success: false,
          error: `Invalid template variables: ${invalidVars.join(', ')}`,
          validVariables: VALID_VARIABLES,
        });
        return;
      }
    }

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      updates.push(`${columnName} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    });

    if (updates.length === 0) {
      reply.status(400).send({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    values.push(id);

    const result = await query(
      `UPDATE prompt_templates
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING id, name, display_name AS "displayName"`,
      values
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Prompt template not found',
      });
      return;
    }

    logger.info({ templateId: id, name: result.rows[0].name }, 'Prompt template updated');

    reply.send({
      success: true,
      template: result.rows[0],
      message: `Prompt template "${result.rows[0].displayName}" updated successfully`,
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

    logger.error({ err }, 'Failed to update prompt template');
    reply.status(500).send({
      success: false,
      error: 'Failed to update prompt template',
    });
  }
}

/**
 * DELETE /api/admin/prompt-templates/:id
 * Delete prompt template (soft delete)
 */
export async function deletePromptTemplate(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    // Check if template is a system template
    const existing = await query(
      'SELECT is_system_template, name FROM prompt_templates WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existing.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Prompt template not found',
      });
      return;
    }

    if (existing.rows[0].is_system_template) {
      reply.status(403).send({
        success: false,
        error: 'Cannot delete system templates.',
      });
      return;
    }

    // Check if template is in use by any AI models
    const inUse = await query(
      'SELECT COUNT(*) as count FROM ai_model_configs WHERE prompt_template_id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (parseInt(inUse.rows[0].count) > 0) {
      reply.status(400).send({
        success: false,
        error: 'Cannot delete template that is currently in use by AI models. Reassign models first.',
      });
      return;
    }

    // Soft delete
    const result = await query(
      'UPDATE prompt_templates SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING name',
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Prompt template not found',
      });
      return;
    }

    logger.info({ templateId: id, templateName: result.rows[0].name }, 'Prompt template deleted');

    reply.send({
      success: true,
      message: `Prompt template "${result.rows[0].name}" deleted successfully`,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to delete prompt template');
    reply.status(500).send({
      success: false,
      error: 'Failed to delete prompt template',
    });
  }
}

/**
 * POST /api/admin/prompt-templates/:id/preview
 * Preview template with sample data
 */
export async function previewPromptTemplate(
  request: FastifyRequest<{ Params: { id: string }; Body: { sampleData?: any } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const { sampleData } = request.body;

    // Load template
    const result = await query(
      'SELECT system_prompt, user_prompt, token_estimate FROM prompt_templates WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({ success: false, error: 'Template not found' });
      return;
    }

    const { system_prompt, user_prompt, token_estimate } = result.rows[0];

    // Use sample data or defaults
    const data = sampleData || {
      sender_email: 'phishing@suspicious-domain.com',
      sender_domain: 'suspicious-domain.com',
      display_name: 'PayPal Security',
      subject: 'URGENT: Verify your account',
      body_snippet: 'Your account will be suspended. Click here: http://phishing-site.xyz',
      spf_status: 'fail',
      dkim_status: 'fail',
      urgency_score: 9,
      link_count: 1,
      suspicious_links_summary: '1 suspicious link detected',
      password_forms: 1,
      form_action_domain: 'phishing-site.xyz',
    };

    // Simple template interpolation for preview
    let renderedSystem = system_prompt || '';
    let renderedUser = user_prompt;

    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      renderedSystem = renderedSystem.replace(regex, String(value));
      renderedUser = renderedUser.replace(regex, String(value));
    });

    reply.send({
      success: true,
      preview: {
        systemPrompt: renderedSystem || null,
        userPrompt: renderedUser,
        estimatedTokens: token_estimate,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to preview template');
    reply.status(500).send({ success: false, error: 'Failed to preview template' });
  }
}
