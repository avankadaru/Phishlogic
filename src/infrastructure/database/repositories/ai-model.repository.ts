import { BaseRepository } from './base.repository.js';
import { getLogger } from '../../logging/logger.js';
import type {
  IAIModelRepository,
  AIModelConfig,
  CreateAIModelParams,
  UpdateAIModelParams,
} from '../../../core/interfaces/repositories/ai-model.repository.interface.js';

const logger = getLogger();

/**
 * AI Model Repository Implementation
 *
 * SOLID Principles:
 * - SRP: Only handles data access (no business logic)
 * - OCP: Extends BaseRepository (open for extension)
 * - LSP: Can substitute BaseRepository
 * - ISP: Implements only IAIModelRepository interface
 * - DIP: Depends on abstractions (BaseRepository)
 */
export class AIModelRepository extends BaseRepository<AIModelConfig, any> implements IAIModelRepository {
  constructor() {
    super('ai_model_configs');
  }

  /**
   * Map database row to domain model
   * Data Mapper Pattern - separates domain from persistence
   *
   * Type Conversions:
   * - DECIMAL/INTEGER columns converted from string to number
   * - NULL values converted to undefined for optional fields
   * - Ensures type compatibility with domain model and Zod validation
   */
  protected mapToDomain(row: any): AIModelConfig {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      modelId: row.model_id,
      apiKey: row.api_key,
      // Parse numeric fields (PostgreSQL returns DECIMAL/INTEGER as strings)
      temperature: row.temperature != null ? parseFloat(row.temperature) : undefined,
      maxTokens: row.max_tokens != null ? parseInt(row.max_tokens, 10) : undefined,
      timeoutMs: parseInt(row.timeout_ms, 10), // Required field, always present
      // Convert null to undefined for optional UUID field
      promptTemplateId: row.prompt_template_id || undefined,
      // Date conversions
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      // Parse integer field
      usageCount: row.usage_count != null ? parseInt(row.usage_count, 10) : undefined,
    };
  }

  /**
   * Map domain model to database row
   * Data Mapper Pattern
   */
  protected mapToDatabase(domain: Partial<AIModelConfig>): Partial<any> {
    const db: any = {};
    if (domain.id !== undefined) db.id = domain.id;
    if (domain.name !== undefined) db.name = domain.name;
    if (domain.provider !== undefined) db.provider = domain.provider;
    if (domain.modelId !== undefined) db.model_id = domain.modelId;
    if (domain.apiKey !== undefined) db.api_key = domain.apiKey;
    if (domain.temperature !== undefined) db.temperature = domain.temperature;
    if (domain.maxTokens !== undefined) db.max_tokens = domain.maxTokens;
    if (domain.timeoutMs !== undefined) db.timeout_ms = domain.timeoutMs;
    if (domain.promptTemplateId !== undefined) db.prompt_template_id = domain.promptTemplateId;
    return db;
  }

  /**
   * Find all AI models (excluding soft-deleted)
   */
  async findAll(): Promise<AIModelConfig[]> {
    return this.findMany({ deleted_at: null });
  }

  /**
   * Find by name
   */
  async findByName(name: string): Promise<AIModelConfig | null> {
    const results = await this.findMany({ name, deleted_at: null });
    return results[0] || null;
  }

  /**
   * Create new AI model
   */
  async create(params: CreateAIModelParams): Promise<AIModelConfig> {
    return this.insert(params as Partial<AIModelConfig>);
  }

  /**
   * Update AI model
   */
  async update(id: string, params: UpdateAIModelParams): Promise<AIModelConfig | null> {
    return super.update(id, params as Partial<AIModelConfig>);
  }

  /**
   * Check if AI model is actively in use by enabled integrations
   * Returns count of ENABLED integrations using this model in AI/Hybrid mode
   *
   * Business Rules:
   * - Only counts integrations that are enabled (enabled = true)
   * - Only counts integrations using 'ai' or 'hybrid' execution mode
   * - Native mode doesn't use AI models, so excluded from count
   *
   * ONLY DATABASE CALL - checks integration_tasks table
   */
  async checkUsage(id: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM integration_tasks
      WHERE ai_model_id = $1
        AND deleted_at IS NULL
        AND enabled = true
        AND execution_mode IN ('ai', 'hybrid')
    `;

    const result = await this.executeQuery<{ count: string }>(sql, [id]);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Hard delete AI model (permanent removal)
   * Overrides base repository's soft delete behavior
   *
   * Business Rule: AI models should be permanently removed, not soft-deleted
   * This ensures deleted models don't appear in any context
   *
   * @param id - The AI model ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = $1`;
    const result = await this.executeQuery(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

/**
 * Repository factory using Singleton Pattern
 * Ensures single instance across application
 */
let repositoryInstance: AIModelRepository | null = null;

export function getAIModelRepository(): IAIModelRepository {
  if (!repositoryInstance) {
    repositoryInstance = new AIModelRepository();
  }
  return repositoryInstance;
}
