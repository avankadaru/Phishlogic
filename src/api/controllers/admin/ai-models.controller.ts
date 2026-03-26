import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getLogger } from '../../../infrastructure/logging/logger.js';
import { getAIModelRepository } from '../../../infrastructure/database/repositories/ai-model.repository.js';
import { getAIModelService } from '../../../core/services/ai-model.service.js';
import { sanitizeApiKey } from '../../../infrastructure/encryption/api-key-encryption.js';

const logger = getLogger();

// Zod validation schemas
const AIModelConfigCreateSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['anthropic', 'openai', 'google', 'custom']),
  modelId: z.string().optional(),
  apiKey: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  timeoutMs: z.number().positive().optional(),
  promptTemplateId: z.string().uuid().optional(),
});

const AIModelConfigUpdateSchema = AIModelConfigCreateSchema.partial();

/**
 * AI Models Controller
 *
 * SOLID Principles:
 * - SRP: Only handles HTTP (validation, response formatting)
 * - DIP: Depends on IAIModelService abstraction
 *
 * NO DATABASE CALLS
 * NO BUSINESS LOGIC
 *
 * All business logic delegated to service layer
 */

/**
 * GET /api/admin/ai-models
 * Get all AI model configurations
 */
export const getAllAIModels = async (_request: FastifyRequest, reply: FastifyReply) => {
  try {
    const repository = getAIModelRepository();
    const service = getAIModelService(repository);

    const models = await service.getAllModels();

    // Mask API keys before sending to frontend
    const maskedModels = models.map((model) => ({
      ...model,
      apiKey: sanitizeApiKey(model.apiKey),
    }));

    reply.send({
      success: true,
      data: maskedModels,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch AI models');
    reply.status(500).send({
      success: false,
      error: 'Failed to fetch AI models',
    });
  }
};

/**
 * GET /api/admin/ai-models/:id
 * Get specific AI model configuration
 */
export const getAIModelById = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const repository = getAIModelRepository();
    const service = getAIModelService(repository);

    const model = await service.getModelById(id);

    if (!model) {
      reply.status(404).send({
        success: false,
        error: 'AI model not found',
      });
      return;
    }

    // Mask API key before sending to frontend
    const maskedModel = {
      ...model,
      apiKey: sanitizeApiKey(model.apiKey),
    };

    reply.send({
      success: true,
      data: maskedModel,
    });
  } catch (error) {
    logger.error({ err: error, id: (request.params as any).id }, 'Failed to fetch AI model');
    reply.status(500).send({
      success: false,
      error: 'Failed to fetch AI model',
    });
  }
};

/**
 * POST /api/admin/ai-models
 * Create new AI model configuration
 */
export const createAIModel = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // HTTP Layer: Input validation
    const data = AIModelConfigCreateSchema.parse(request.body);

    const repository = getAIModelRepository();
    const service = getAIModelService(repository);

    const result = await service.createModel(data);

    if (!result.success) {
      reply.status(400).send({
        success: false,
        error: result.error,
      });
      return;
    }

    logger.info({ modelId: result.data?.id, name: result.data?.name }, 'AI model created successfully');

    reply.status(201).send({
      success: true,
      data: result.data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ err: error.errors, body: request.body }, 'Create validation failed');
      reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    logger.error({ err: error }, 'Failed to create AI model');
    reply.status(500).send({
      success: false,
      error: 'Failed to create AI model',
    });
  }
};

/**
 * PUT /api/admin/ai-models/:id
 * Update AI model configuration
 */
export const updateAIModel = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    // HTTP Layer: Input validation
    const data = AIModelConfigUpdateSchema.parse(request.body);

    const repository = getAIModelRepository();
    const service = getAIModelService(repository);

    const result = await service.updateModel(id, data);

    if (!result.success) {
      const statusCode = result.error === 'AI model not found' ? 404 : 400;
      reply.status(statusCode).send({
        success: false,
        error: result.error,
      });
      return;
    }

    logger.info({ modelId: id, updates: Object.keys(data) }, 'AI model updated successfully');

    reply.send({
      success: true,
      data: result.data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ err: error.errors, body: request.body }, 'Update validation failed');
      reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    logger.error({ err: error, id: (request.params as any).id }, 'Failed to update AI model');
    reply.status(500).send({
      success: false,
      error: 'Failed to update AI model',
    });
  }
};

/**
 * DELETE /api/admin/ai-models/:id
 * Delete AI model configuration
 * NO DATABASE CALLS - delegates to service
 */
export const deleteAIModel = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const repository = getAIModelRepository();
    const service = getAIModelService(repository);

    const result = await service.deleteModel(id);

    if (!result.success) {
      reply.status(400).send({
        success: false,
        error: result.error,
      });
      return;
    }

    // ✅ Log success ONLY after we know response will succeed
    logger.info({ id }, 'AI model deleted successfully');

    reply.send({
      success: true,
      message: 'AI model deleted successfully',
    });
  } catch (error) {
    logger.error({ err: error, id: (request.params as any).id }, 'Failed to delete AI model');
    reply.status(500).send({
      success: false,
      error: 'Failed to delete AI model',
    });
  }
};

/**
 * POST /api/admin/ai-models/:id/test
 * Test AI model connection
 */
export const testAIModelConnection = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const repository = getAIModelRepository();
    const service = getAIModelService(repository);

    const result = await service.testConnection(id);

    if (!result.success) {
      reply.status(400).send({
        success: false,
        error: result.error,
      });
      return;
    }

    reply.send({
      success: true,
      latency: result.latency,
    });
  } catch (error) {
    logger.error({ err: error, id: (request.params as any).id }, 'Failed to test connection');
    reply.status(500).send({
      success: false,
      error: 'Failed to test connection',
    });
  }
};

// For backward compatibility - export functions with different names
export const getAIModels = getAllAIModels;
export const getAIModel = getAIModelById;
export const testAIModel = testAIModelConnection;
