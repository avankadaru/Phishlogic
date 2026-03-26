import { getLogger } from '../../infrastructure/logging/logger.js';
import type { NormalizedInput } from '../models/input.js';
import type { IAIModelService } from '../interfaces/services/ai-model.service.interface.js';
import type { IAIModelRepository } from '../interfaces/repositories/ai-model.repository.interface.js';
import type {
  AIModelConfig,
  CreateAIModelParams,
  UpdateAIModelParams,
} from '../interfaces/repositories/ai-model.repository.interface.js';

const logger = getLogger();

/**
 * AI Model Service
 *
 * SOLID Principles:
 * - SRP: Only handles business logic (no HTTP, no DB)
 * - OCP: Open for extension via composition
 * - LSP: Implements IAIModelService
 * - ISP: Clean interface segregation
 * - DIP: Depends on IAIModelRepository abstraction (not concrete implementation)
 *
 * NO DATABASE CALLS - All data access through repository
 */
export class AIModelService implements IAIModelService {
  constructor(private readonly repository: IAIModelRepository) {
    // Dependency Injection - receives repository through constructor
  }

  /**
   * Get all AI models
   * Business rule: Exclude soft-deleted models
   */
  async getAllModels(): Promise<AIModelConfig[]> {
    try {
      return await this.repository.findAll();
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch all AI models');
      throw error;
    }
  }

  /**
   * Get single AI model by ID
   */
  async getModelById(id: string): Promise<AIModelConfig | null> {
    try {
      return await this.repository.findById(id);
    } catch (error) {
      logger.error({ err: error, id }, 'Failed to fetch AI model by ID');
      throw error;
    }
  }

  /**
   * Create new AI model
   * Business rules:
   * - Name must be unique
   * - API key must be provided
   * - Apply provider defaults if needed
   */
  async createModel(params: CreateAIModelParams): Promise<{ success: boolean; data?: AIModelConfig; error?: string }> {
    try {
      // Business Rule: Check name uniqueness
      const existing = await this.repository.findByName(params.name);
      if (existing) {
        return {
          success: false,
          error: 'AI model with this name already exists',
        };
      }

      // Business Rule: Apply provider defaults
      const enrichedParams = this.applyProviderDefaults(params);

      // Business Rule: Custom provider MUST have explicit modelId
      if (params.provider === 'custom' && (!enrichedParams.modelId || enrichedParams.modelId.trim() === '')) {
        return {
          success: false,
          error: 'Model ID is required for custom providers',
        };
      }

      const model = await this.repository.create(enrichedParams);

      return { success: true, data: model };
    } catch (error) {
      logger.error({ err: error, params }, 'Failed to create AI model');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create AI model',
      };
    }
  }

  /**
   * Update existing AI model
   * Business rules:
   * - Preserve API key if not provided
   * - Validate provider-specific settings
   */
  async updateModel(
    id: string,
    params: UpdateAIModelParams
  ): Promise<{ success: boolean; data?: AIModelConfig; error?: string }> {
    try {
      // Business Rule: Check if model exists
      const existing = await this.repository.findById(id);
      if (!existing) {
        return {
          success: false,
          error: 'AI model not found',
        };
      }

      // Business Rule: If name is changing, check uniqueness
      if (params.name && params.name !== existing.name) {
        const nameExists = await this.repository.findByName(params.name);
        if (nameExists) {
          return {
            success: false,
            error: 'AI model with this name already exists',
          };
        }
      }

      const model = await this.repository.update(id, params);

      if (!model) {
        return {
          success: false,
          error: 'Failed to update AI model',
        };
      }

      return { success: true, data: model };
    } catch (error) {
      logger.error({ err: error, id, params }, 'Failed to update AI model');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update AI model',
      };
    }
  }

  /**
   * Delete AI model
   * Business rule: Cannot delete if in use by integrations
   */
  async deleteModel(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Business Rule: Check if model is in use
      const usageCount = await this.repository.checkUsage(id);

      if (usageCount > 0) {
        return {
          success: false,
          error: `Cannot delete model that is in use by ${usageCount} integration(s). Please update or disable those first.`,
        };
      }

      // Business Rule: Check if model exists
      const existing = await this.repository.findById(id);
      if (!existing) {
        return {
          success: false,
          error: 'AI model not found',
        };
      }

      const deleted = await this.repository.delete(id);

      if (!deleted) {
        return {
          success: false,
          error: 'Failed to delete AI model',
        };
      }

      // ✅ NO logging here - let controller log after successful response
      return { success: true };
    } catch (error) {
      logger.error({ err: error, id }, 'Failed to delete AI model');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete AI model',
      };
    }
  }

  /**
   * Test connection to AI provider
   * Business rule: Validate API key and model ID
   */
  /**
   * Test connection to AI provider
   * Business rule: Validate API key and model ID combo by making actual API call
   */
  async testConnection(id: string): Promise<{ success: boolean; latency?: number; error?: string }> {
    try {
      const model = await this.repository.findById(id);

      if (!model) {
        return {
          success: false,
          error: 'AI model not found',
        };
      }

      // Validate required fields
      if (!model.modelId || model.modelId.trim() === '') {
        return {
          success: false,
          error: 'Model ID is required for testing connection',
        };
      }

      if (!model.apiKey || model.apiKey.trim() === '') {
        return {
          success: false,
          error: 'API key is required for testing connection',
        };
      }

      // Import AIExecutionService for actual test
      const { getAIExecutionService } = await import('./ai-execution.service.js');
      const aiService = getAIExecutionService();

      // Make actual API call with minimal test prompt
      const startTime = Date.now();
      const testConfig = {
        provider: model.provider,
        model: model.modelId,
        apiKey: model.apiKey,
        temperature: model.temperature ?? 0.7,
        maxTokens: 10, // Minimal tokens for test
        timeout: model.timeoutMs,
      };

      const testInput: NormalizedInput = {
        type: 'url',
        id: 'test-connection',
        timestamp: new Date(),
        data: {
          url: 'https://test.example.com',
        },
      };

      try {
        await aiService.executeWithAI(testInput, testConfig, undefined);
        const latency = Date.now() - startTime;

        return {
          success: true,
          latency,
        };
      } catch (error) {
        // Error message is already user-friendly from extractFetchErrorDetails
        const errorMessage = error instanceof Error ? error.message : 'Connection test failed';

        logger.error({
          msg: 'Test connection failed',
          modelId: id,
          provider: model.provider,
          model: model.modelId,
          error: errorMessage,
        });

        return {
          success: false,
          error: errorMessage, // Now contains user-friendly message
        };
      }
    } catch (error) {
      logger.error({ err: error, id }, 'Failed to test AI model connection');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test connection',
      };
    }
  }

  /**
   * Apply provider-specific defaults
   * Business logic for model configuration
   */
  private applyProviderDefaults(params: CreateAIModelParams): CreateAIModelParams {
    const defaults: CreateAIModelParams = { ...params };

    // Apply default model IDs if not provided OR if empty string
    if (!params.modelId || params.modelId.trim() === '') {
      switch (params.provider) {
        case 'anthropic':
          defaults.modelId = 'claude-3-5-sonnet-20241022';
          break;
        case 'openai':
          defaults.modelId = 'gpt-4o';
          break;
        case 'google':
          defaults.modelId = 'gemini-1.5-pro';
          break;
        // custom requires explicit modelId
      }
    }

    // Apply default parameters
    if (defaults.temperature === undefined) {
      defaults.temperature = 0.3;
    }
    if (defaults.maxTokens === undefined) {
      defaults.maxTokens = 4096;
    }
    if (defaults.timeoutMs === undefined) {
      defaults.timeoutMs = 30000;
    }

    return defaults;
  }
}

/**
 * Service factory using Singleton Pattern + Dependency Injection
 */
let serviceInstance: AIModelService | null = null;

export function getAIModelService(repository: IAIModelRepository): IAIModelService {
  if (!serviceInstance) {
    serviceInstance = new AIModelService(repository);
  }
  return serviceInstance;
}
