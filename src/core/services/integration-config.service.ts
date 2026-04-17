/**
 * Integration Configuration Service
 *
 * Loads execution mode configuration from database for integrations (Gmail, Chrome).
 * Provides AI model configuration and execution settings.
 *
 * Design:
 * - Repository Pattern (no direct DB access)
 * - Caching for performance
 * - Singleton pattern
 */

import { getLogger } from '../../infrastructure/logging/logger.js';
import { query } from '../../infrastructure/database/client.js';

const logger = getLogger();

/**
 * Analyzer-specific options
 */
export interface AnalyzerOptions {
  analyzerName: string;
  options: Record<string, any>;
}

/**
 * Integration execution configuration
 */
export interface IntegrationConfig {
  integrationId: string;
  integrationName: string;
  executionMode: 'native' | 'hybrid' | 'ai';
  aiModelId?: string;
  aiProvider?: string;
  aiModel?: string;
  aiApiKey?: string;
  aiPromptTemplateId?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  aiTimeout?: number;
  fallbackToNative?: boolean;
  isActive: boolean;
  /**
   * Which content prescan pipeline to run (email / url / none).
   * When undefined, the engine falls back to input type.
   */
  contentPrescan?: 'email' | 'url' | 'none';
  /**
   * How AnalyzerRegistry selects analyzers after whitelist.
   * When undefined, the engine falls back to input type.
   */
  analyzerFilteringMode?: 'email_inbox' | 'inspect_url';
  analyzers: AnalyzerOptions[]; // NEW: Analyzer-specific options
}

/**
 * Integration Config Service
 */
export class IntegrationConfigService {
  private configCache: Map<string, IntegrationConfig> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  /**
   * Get integration configuration by name
   */
  async getConfig(integrationName: string): Promise<IntegrationConfig | null> {
    // Check cache first
    const cached = this.getCachedConfig(integrationName);
    if (cached) {
      return cached;
    }

    try {
      // Load from database
      const config = await this.loadConfigFromDB(integrationName);

      if (config) {
        // Cache the result
        this.setCachedConfig(integrationName, config);
      }

      return config;
    } catch (error) {
      logger.error({
        msg: 'Failed to load integration config',
        integrationName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Load configuration from database
   */
  private async loadConfigFromDB(integrationName: string): Promise<IntegrationConfig | null> {
    const sql = `
      SELECT
        it.id as integration_id,
        i.name as integration_name,
        it.execution_mode,
        it.content_prescan,
        it.analyzer_filtering_mode,
        it.ai_model_id,
        it.fallback_to_native,
        it.enabled,
        am.provider as ai_provider,
        am.model_id as ai_model,
        am.api_key as ai_api_key,
        am.temperature as ai_temperature,
        am.max_tokens as ai_max_tokens,
        am.timeout_ms as ai_timeout,
        am.prompt_template_id as ai_prompt_template_id,
        (
          SELECT json_agg(json_build_object(
            'analyzerName', ia.analyzer_name,
            'options', ia.analyzer_options
          ))
          FROM integration_analyzers ia
          WHERE ia.integration_name = i.name
        ) as analyzers
      FROM integration_tasks it
      INNER JOIN integrations i ON it.integration_id = i.id
      LEFT JOIN ai_model_configs am ON it.ai_model_id = am.id
      WHERE i.name = $1
        AND it.deleted_at IS NULL
        AND i.deleted_at IS NULL
      LIMIT 1
    `;

    const result = await query<any>(sql, [integrationName]);

    if (result.rows.length === 0) {
      logger.debug({
        msg: 'No integration config found',
        integrationName,
      });
      return null;
    }

    const row = result.rows[0];

    const config: IntegrationConfig = {
      integrationId: row.integration_id,
      integrationName: row.integration_name,
      executionMode: row.execution_mode || 'native',
      aiModelId: row.ai_model_id,
      aiProvider: row.ai_provider,
      aiModel: row.ai_model,
      aiApiKey: row.ai_api_key,
      aiPromptTemplateId: row.ai_prompt_template_id,
      // Parse numeric fields (PostgreSQL returns DECIMAL/INTEGER as strings)
      aiTemperature: row.ai_temperature != null ? parseFloat(row.ai_temperature) : undefined,
      aiMaxTokens: row.ai_max_tokens != null ? parseInt(row.ai_max_tokens, 10) : undefined,
      aiTimeout: row.ai_timeout != null ? parseInt(row.ai_timeout, 10) : undefined,
      fallbackToNative: row.fallback_to_native !== false,
      isActive: row.enabled !== false,
      contentPrescan: row.content_prescan ?? undefined,
      analyzerFilteringMode: row.analyzer_filtering_mode ?? undefined,
      analyzers: row.analyzers || [],
    };

    logger.debug({
      msg: 'Integration config loaded',
      integrationName,
      executionMode: config.executionMode,
      hasAI: !!config.aiModelId,
      analyzersConfigured: config.analyzers.length,
    });

    return config;
  }

  /**
   * Get cached configuration if valid
   */
  private getCachedConfig(integrationName: string): IntegrationConfig | null {
    const config = this.configCache.get(integrationName);
    const expiry = this.cacheExpiry.get(integrationName);

    if (config && expiry && Date.now() < expiry) {
      logger.debug({
        msg: 'Integration config retrieved from cache',
        integrationName,
      });
      return config;
    }

    // Cache expired or not found
    return null;
  }

  /**
   * Set cached configuration
   */
  private setCachedConfig(integrationName: string, config: IntegrationConfig): void {
    this.configCache.set(integrationName, config);
    this.cacheExpiry.set(integrationName, Date.now() + this.CACHE_TTL_MS);
  }

  /**
   * Clear cache for specific integration
   */
  clearCache(integrationName?: string): void {
    if (integrationName) {
      this.configCache.delete(integrationName);
      this.cacheExpiry.delete(integrationName);
      logger.debug({
        msg: 'Integration config cache cleared',
        integrationName,
      });
    } else {
      this.configCache.clear();
      this.cacheExpiry.clear();
      logger.debug('All integration config cache cleared');
    }
  }

  /**
   * Get all active integration configurations
   */
  async getAllActiveConfigs(): Promise<IntegrationConfig[]> {
    const sql = `
      SELECT
        it.id as integration_id,
        i.name as integration_name,
        it.execution_mode,
        it.content_prescan,
        it.analyzer_filtering_mode,
        it.ai_model_id,
        it.fallback_to_native,
        it.enabled,
        am.provider as ai_provider,
        am.model_id as ai_model,
        am.api_key as ai_api_key,
        am.prompt_template_id as ai_prompt_template_id,
        am.temperature as ai_temperature,
        am.max_tokens as ai_max_tokens,
        am.timeout_ms as ai_timeout
      FROM integration_tasks it
      INNER JOIN integrations i ON it.integration_id = i.id
      LEFT JOIN ai_model_configs am ON it.ai_model_id = am.id
      WHERE it.enabled = true
        AND it.deleted_at IS NULL
        AND i.deleted_at IS NULL
      ORDER BY i.name
    `;

    const result = await query<any>(sql);

    return result.rows.map((row) => ({
      integrationId: row.integration_id,
      integrationName: row.integration_name,
      executionMode: row.execution_mode || 'native',
      aiModelId: row.ai_model_id,
      aiProvider: row.ai_provider,
      aiModel: row.ai_model,
      aiApiKey: row.ai_api_key,
      aiPromptTemplateId: row.ai_prompt_template_id,
      // Parse numeric fields (PostgreSQL returns DECIMAL/INTEGER as strings)
      aiTemperature: row.ai_temperature != null ? parseFloat(row.ai_temperature) : undefined,
      aiMaxTokens: row.ai_max_tokens != null ? parseInt(row.ai_max_tokens, 10) : undefined,
      aiTimeout: row.ai_timeout != null ? parseInt(row.ai_timeout, 10) : undefined,
      fallbackToNative: row.fallback_to_native !== false,
      isActive: row.enabled !== false,
      contentPrescan: row.content_prescan ?? undefined,
      analyzerFilteringMode: row.analyzer_filtering_mode ?? undefined,
      analyzers: [],
    }));
  }
}

/**
 * Singleton instance
 */
let integrationConfigServiceInstance: IntegrationConfigService | null = null;

/**
 * Get Integration Config Service instance
 */
export function getIntegrationConfigService(): IntegrationConfigService {
  if (!integrationConfigServiceInstance) {
    integrationConfigServiceInstance = new IntegrationConfigService();
  }
  return integrationConfigServiceInstance;
}

/**
 * Reset service (for testing)
 */
export function resetIntegrationConfigService(): void {
  integrationConfigServiceInstance = null;
}
