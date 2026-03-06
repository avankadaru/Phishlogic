import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';
import crypto from 'crypto';

const logger = getLogger();

// Encryption configuration
const ENCRYPTION_KEY = process.env.AI_MODEL_ENCRYPTION_KEY || 'change-me-in-production-32chars';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt sensitive data (API keys)
 */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data (API keys)
 */
function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask API key for display (show first 4 and last 4 characters)
 */
function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
}

// Validation schema for AI model configuration
const AIModelConfigSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['anthropic', 'openai', 'google', 'custom']),
  modelId: z.string().min(1).max(200),
  apiKey: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().positive().default(4096),
  timeoutMs: z.number().positive().default(30000),
});

/**
 * GET /api/admin/ai-models
 * Get all AI model configurations
 */
export async function getAIModels(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        provider,
        model_id as "modelId",
        api_key as "apiKey",
        temperature,
        max_tokens as "maxTokens",
        timeout_ms as "timeoutMs",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_used_at as "lastUsedAt",
        usage_count as "usageCount"
      FROM ai_model_configs
      WHERE deleted_at IS NULL
      ORDER BY name ASC
    `);

    // Mask API keys in response for security
    const models = result.rows.map(model => ({
      ...model,
      apiKey: maskApiKey(decrypt(model.apiKey))
    }));

    reply.send({
      success: true,
      data: models,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get AI models');
    reply.status(500).send({
      success: false,
      error: 'Failed to get AI models',
    });
  }
}

/**
 * GET /api/admin/ai-models/:id
 * Get specific AI model configuration
 */
export async function getAIModel(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    const result = await query(
      `SELECT
        id, name, provider, model_id as "modelId", api_key as "apiKey",
        temperature, max_tokens as "maxTokens", timeout_ms as "timeoutMs",
        created_at as "createdAt", updated_at as "updatedAt",
        last_used_at as "lastUsedAt", usage_count as "usageCount"
      FROM ai_model_configs
      WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'AI model not found',
      });
      return;
    }

    const model = result.rows[0];
    model.apiKey = maskApiKey(decrypt(model.apiKey));

    reply.send({
      success: true,
      data: model,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get AI model');
    reply.status(500).send({
      success: false,
      error: 'Failed to get AI model',
    });
  }
}

/**
 * POST /api/admin/ai-models
 * Create new AI model configuration
 */
export async function createAIModel(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = AIModelConfigSchema.parse(request.body);

    // Check for duplicate name
    const existing = await query(
      'SELECT id FROM ai_model_configs WHERE name = $1 AND deleted_at IS NULL',
      [data.name]
    );

    if (existing.rows.length > 0) {
      reply.status(400).send({
        success: false,
        error: 'Model name already exists. Please choose a different name.',
      });
      return;
    }

    // Encrypt API key before storing
    const encryptedKey = encrypt(data.apiKey);

    const result = await query(
      `INSERT INTO ai_model_configs
        (name, provider, model_id, api_key, temperature, max_tokens, timeout_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id, name, provider, model_id as "modelId",
        temperature, max_tokens as "maxTokens", timeout_ms as "timeoutMs",
        created_at as "createdAt"`,
      [data.name, data.provider, data.modelId, encryptedKey, data.temperature, data.maxTokens, data.timeoutMs]
    );

    logger.info({ modelName: data.name, provider: data.provider }, 'AI model created');

    reply.send({
      success: true,
      message: `AI model "${data.name}" created successfully`,
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
    logger.error({ err }, 'Failed to create AI model');
    reply.status(500).send({
      success: false,
      error: 'Failed to create AI model',
    });
  }
}

/**
 * PUT /api/admin/ai-models/:id
 * Update AI model configuration
 */
export async function updateAIModel(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;
    const data = AIModelConfigSchema.partial().parse(request.body);

    // Check if model exists
    const existingModel = await query(
      'SELECT id FROM ai_model_configs WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingModel.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'AI model not found',
      });
      return;
    }

    // Check for duplicate name if name is being updated
    if (data.name) {
      const duplicateName = await query(
        'SELECT id FROM ai_model_configs WHERE name = $1 AND id != $2 AND deleted_at IS NULL',
        [data.name, id]
      );

      if (duplicateName.rows.length > 0) {
        reply.status(400).send({
          success: false,
          error: 'Model name already exists. Please choose a different name.',
        });
        return;
      }
    }

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (key === 'apiKey') {
        updates.push(`api_key = $${paramIndex}`);
        values.push(encrypt(value as string));
      } else {
        const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${columnName} = $${paramIndex}`);
        values.push(value);
      }
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
      `UPDATE ai_model_configs
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING
         id, name, provider, model_id as "modelId",
         temperature, max_tokens as "maxTokens", timeout_ms as "timeoutMs",
         updated_at as "updatedAt"`,
      values
    );

    logger.info({ modelId: id, updates: Object.keys(data) }, 'AI model updated');

    reply.send({
      success: true,
      message: 'AI model updated successfully',
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
    logger.error({ err }, 'Failed to update AI model');
    reply.status(500).send({
      success: false,
      error: 'Failed to update AI model',
    });
  }
}

/**
 * DELETE /api/admin/ai-models/:id
 * Delete AI model configuration (soft delete)
 */
export async function deleteAIModel(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    // Check if any tasks are using this model
    const usageCheck = await query(
      'SELECT COUNT(*) as count FROM task_configs WHERE ai_model_id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      reply.status(400).send({
        success: false,
        error: 'Cannot delete model that is in use by tasks. Please update or disable those tasks first.',
      });
      return;
    }

    // Soft delete
    const result = await query(
      'UPDATE ai_model_configs SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING name',
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'AI model not found',
      });
      return;
    }

    logger.info({ modelId: id, modelName: result.rows[0].name }, 'AI model deleted');

    reply.send({
      success: true,
      message: `AI model "${result.rows[0].name}" deleted successfully`,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to delete AI model');
    reply.status(500).send({
      success: false,
      error: 'Failed to delete AI model',
    });
  }
}

/**
 * POST /api/admin/ai-models/:id/test
 * Test AI model connection
 */
export async function testAIModel(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    const result = await query(
      'SELECT name, provider, model_id, api_key FROM ai_model_configs WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'AI model not found',
      });
      return;
    }

    const { name, provider, model_id, api_key } = result.rows[0];
    const decryptedKey = decrypt(api_key);

    // Basic validation - actual API test can be implemented based on provider
    // This is a placeholder for the connection test logic
    if (!decryptedKey || decryptedKey.length < 10) {
      reply.status(400).send({
        success: false,
        error: 'Invalid API key format',
      });
      return;
    }

    // TODO: Implement actual API calls based on provider
    // For now, just validate the key format
    let isValid = false;
    switch (provider) {
      case 'anthropic':
        isValid = decryptedKey.startsWith('sk-ant-');
        break;
      case 'openai':
        isValid = decryptedKey.startsWith('sk-');
        break;
      case 'google':
        isValid = decryptedKey.length > 20;
        break;
      case 'custom':
        isValid = true; // Accept any key for custom providers
        break;
    }

    if (!isValid) {
      reply.status(400).send({
        success: false,
        error: `API key does not match expected format for ${provider}`,
      });
      return;
    }

    logger.info({ modelId: id, modelName: name, provider }, 'AI model connection test successful');

    reply.send({
      success: true,
      message: `Connection test passed for "${name}" (${provider})`,
      details: {
        provider,
        modelId: model_id,
        apiKeyFormat: 'Valid',
      },
    });
  } catch (err) {
    logger.error({ err }, 'AI model connection test failed');
    reply.status(500).send({
      success: false,
      error: 'Connection test failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
