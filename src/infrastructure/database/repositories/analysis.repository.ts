/**
 * Analysis Repository
 *
 * Single source of truth for all analysis data access.
 * Demonstrates JSONB-first approach for schema stability.
 */

import { BaseRepository, QueryOptions } from './base.repository.js';

/**
 * RedFlag type from domain models
 */
export interface RedFlag {
  category: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Domain Model - What the application works with
 * Clean, business-focused structure
 */
export interface AnalysisDomainModel {
  id: string;
  tenantId: string | null;
  inputType: 'url' | 'email';
  inputData: any;
  verdict: 'Safe' | 'Suspicious' | 'Malicious';
  confidence: number;
  score: number;
  alertLevel: string;
  redFlags: RedFlag[] | string[];
  reasoning?: string;
  signals: any[];
  analyzersRun: string[];
  executionSteps: any[];
  durationMs: number;

  // Execution tracking
  executionMode?: 'native' | 'hybrid' | 'ai';
  inputSource?: string;

  // AI metadata (from JSONB)
  aiMetadata?: {
    provider?: string;
    model?: string;
    tokens?: {
      prompt: number;
      completion: number;
      total: number;
    };
    temperature?: number;
    latencyMs?: number;
    costUsd?: number;
  };

  // Timing metadata (from JSONB)
  timingMetadata?: {
    uiTimestamp?: string;
    backendStartTimestamp?: string;
    networkLatencyMs?: number;
  };

  // Error details (from JSONB)
  errorDetails?: {
    message?: string;
    stackTrace?: string;
    context?: any;
  };

  whitelisted: boolean;
  whitelistReason?: string;
  analyzedAt: Date;
  createdAt: Date;
}

/**
 * Database Model - Direct mapping to table structure
 * Matches database column names exactly
 */
interface AnalysisDatabaseModel {
  id: string;
  tenant_id: string | null;
  input_type: string;
  input_data: any;
  input_hash: string;
  verdict: string;
  confidence: number;
  score: number;
  alert_level: string;
  red_flags: any;
  reasoning: string | null;
  signals: any;
  analyzers_run: string[];
  execution_steps: any;
  duration_ms: number;
  ai_cost_usd: number;
  ai_tokens_input: number;
  ai_tokens_output: number;

  // New columns from migration 007
  execution_mode: string | null;
  input_source: string | null;
  ai_metadata: any; // JSONB
  timing_metadata: any; // JSONB
  error_details: any; // JSONB

  whitelisted: boolean;
  whitelist_reason: string | null;
  analyzed_at: Date;
  created_at: Date;
}

/**
 * Query filters for analyses
 */
export interface AnalysisFilters {
  verdict?: 'Safe' | 'Suspicious' | 'Malicious';
  executionMode?: 'native' | 'hybrid' | 'ai';
  inputSource?: string;
  startDate?: Date;
  endDate?: Date;
  whitelisted?: boolean;
}

/**
 * Analysis Repository
 * All database access for analyses goes through here
 */
export class AnalysisRepository extends BaseRepository<
  AnalysisDomainModel,
  AnalysisDatabaseModel
> {
  constructor() {
    super('analyses');
  }

  /**
   * Find analyses with complex filtering
   * Uses JSONB queries efficiently with GIN indexes
   */
  async findWithFilters(
    filters: AnalysisFilters,
    options?: QueryOptions
  ): Promise<{ analyses: AnalysisDomainModel[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Simple column filters
    if (filters.verdict) {
      conditions.push(`verdict = $${paramIndex}`);
      values.push(filters.verdict);
      paramIndex++;
    }

    if (filters.executionMode) {
      conditions.push(`execution_mode = $${paramIndex}`);
      values.push(filters.executionMode);
      paramIndex++;
    }

    if (filters.inputSource) {
      conditions.push(`input_source = $${paramIndex}`);
      values.push(filters.inputSource);
      paramIndex++;
    }

    if (filters.whitelisted !== undefined) {
      conditions.push(`whitelisted = $${paramIndex}`);
      values.push(filters.whitelisted);
      paramIndex++;
    }

    // Date range filters
    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(filters.endDate);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = `ORDER BY ${options?.orderBy || 'created_at'} ${
      options?.orderDirection || 'DESC'
    }`;
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';
    const offsetClause = options?.offset ? `OFFSET ${options.offset}` : '';

    // Get analyses
    const analysesSql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
      ${offsetClause}
    `;

    const analysesResult = await this.executeQuery<AnalysisDatabaseModel>(
      analysesSql,
      values
    );

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const countResult = await this.executeQuery<{ count: string }>(countSql, values);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    return {
      analyses: analysesResult.rows.map((row) => this.mapToDomain(row)),
      total,
    };
  }

  /**
   * Find analyses by AI provider (JSONB query with GIN index)
   * Example: Query JSONB without adding column
   */
  async findByAIProvider(
    provider: string,
    options?: QueryOptions
  ): Promise<AnalysisDomainModel[]> {
    // Uses GIN index on ai_metadata column
    return await this.queryJsonbContains('ai_metadata', { provider }, options);
  }

  /**
   * Find analyses with network latency > threshold (JSONB query)
   * Example: Complex JSONB query without adding column
   */
  async findWithHighNetworkLatency(
    thresholdMs: number,
    options?: QueryOptions
  ): Promise<AnalysisDomainModel[]> {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE (timing_metadata->>'network_latency_ms')::INTEGER > $1
      ORDER BY ${options?.orderBy || 'created_at'} ${options?.orderDirection || 'DESC'}
      ${options?.limit ? `LIMIT ${options.limit}` : ''}
    `;

    const result = await this.executeQuery<AnalysisDatabaseModel>(sql, [thresholdMs]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Find analyses with errors (JSONB query)
   * Example: Check if JSONB field exists
   */
  async findWithErrors(options?: QueryOptions): Promise<AnalysisDomainModel[]> {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE error_details != '{}'::jsonb
      AND error_details->>'message' IS NOT NULL
      ORDER BY ${options?.orderBy || 'created_at'} ${options?.orderDirection || 'DESC'}
      ${options?.limit ? `LIMIT ${options.limit}` : ''}
    `;

    const result = await this.executeQuery<AnalysisDatabaseModel>(sql);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Get AI cost by provider (JSONB aggregation)
   * Example: Aggregate JSONB data without adding columns
   */
  async getAICostByProvider(startDate?: Date, endDate?: Date): Promise<
    Array<{ provider: string; totalCost: number; count: number }>
  > {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(endDate);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        ai_metadata->>'provider' as provider,
        SUM((ai_metadata->>'cost_usd')::DECIMAL) as total_cost,
        COUNT(*) as count
      FROM ${this.tableName}
      ${whereClause}
      AND ai_metadata->>'provider' IS NOT NULL
      GROUP BY ai_metadata->>'provider'
      ORDER BY total_cost DESC
    `;

    const result = await this.executeQuery<{
      provider: string;
      total_cost: string;
      count: string;
    }>(sql, values);

    return result.rows.map((row) => ({
      provider: row.provider,
      totalCost: parseFloat(row.total_cost),
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Query using view (for specific format needs)
   * Example: When you need aliased column names
   */
  async findFromDebugView(
    filters: AnalysisFilters,
    options?: QueryOptions
  ): Promise<AnalysisDomainModel[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.verdict) {
      conditions.push(`verdict = $${paramIndex}`);
      values.push(filters.verdict);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = `ORDER BY ${options?.orderBy || 'created_at'} ${
      options?.orderDirection || 'DESC'
    }`;

    // Query view instead of table (gets aliased columns)
    const sql = `
      SELECT * FROM analyses_debug_view
      ${whereClause}
      ${orderClause}
      ${options?.limit ? `LIMIT ${options.limit}` : ''}
    `;

    const result = await this.executeQuery<AnalysisDatabaseModel>(sql, values);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Map database row to domain model
   * Handles JSONB parsing and column name mapping
   */
  protected mapToDomain(row: AnalysisDatabaseModel): AnalysisDomainModel {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      inputType: row.input_type as 'url' | 'email',
      inputData: row.input_data,
      verdict: row.verdict as 'Safe' | 'Suspicious' | 'Malicious',
      confidence: row.confidence,
      score: row.score,
      alertLevel: row.alert_level,
      redFlags: Array.isArray(row.red_flags) ? row.red_flags : JSON.parse(row.red_flags || '[]'),
      reasoning: row.reasoning || undefined,
      signals: Array.isArray(row.signals) ? row.signals : JSON.parse(row.signals || '[]'),
      analyzersRun: row.analyzers_run || [],
      executionSteps: Array.isArray(row.execution_steps)
        ? row.execution_steps
        : JSON.parse(row.execution_steps || '[]'),
      durationMs: row.duration_ms,

      // Execution tracking
      executionMode: row.execution_mode as 'native' | 'hybrid' | 'ai' | undefined,
      inputSource: row.input_source || undefined,

      // Parse JSONB columns
      aiMetadata: row.ai_metadata || undefined,
      timingMetadata: row.timing_metadata || undefined,
      errorDetails: row.error_details || undefined,

      whitelisted: row.whitelisted,
      whitelistReason: row.whitelist_reason || undefined,
      analyzedAt: row.analyzed_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Map domain model to database row
   * Column name mapping only - JSONB serialization handled by BaseRepository
   */
  protected mapToDatabase(
    domain: Partial<AnalysisDomainModel>
  ): Partial<AnalysisDatabaseModel> {
    const dbModel: Partial<AnalysisDatabaseModel> = {};

    if (domain.id) dbModel.id = domain.id;
    if (domain.tenantId !== undefined) dbModel.tenant_id = domain.tenantId;
    if (domain.inputType) dbModel.input_type = domain.inputType;
    if (domain.inputData) {
      // BaseRepository automatically handles JSONB serialization via Type Converter Pattern
      dbModel.input_data = domain.inputData;
    }

    // Generate input_hash if inputData is provided
    if (domain.inputData) {
      const crypto = require('crypto');
      const data = typeof domain.inputData === 'string'
        ? domain.inputData
        : JSON.stringify(domain.inputData);
      dbModel.input_hash = crypto.createHash('sha256').update(data).digest('hex');
    }

    if (domain.verdict) dbModel.verdict = domain.verdict;
    if (domain.confidence !== undefined) dbModel.confidence = domain.confidence;
    if (domain.score !== undefined) dbModel.score = domain.score;
    if (domain.alertLevel) dbModel.alert_level = domain.alertLevel;
    if (domain.redFlags) {
      // BaseRepository automatically handles JSONB serialization
      dbModel.red_flags = domain.redFlags;
    }
    if (domain.reasoning !== undefined) dbModel.reasoning = domain.reasoning || null;
    if (domain.signals) {
      // BaseRepository automatically handles JSONB serialization
      dbModel.signals = domain.signals;
    }
    if (domain.analyzersRun) dbModel.analyzers_run = domain.analyzersRun;
    if (domain.executionSteps) {
      // BaseRepository automatically handles JSONB serialization
      dbModel.execution_steps = domain.executionSteps;
    }
    if (domain.durationMs !== undefined) dbModel.duration_ms = domain.durationMs;

    // AI cost tracking (extracted from JSONB for quick access)
    if (domain.aiMetadata?.costUsd !== undefined) {
      dbModel.ai_cost_usd = domain.aiMetadata.costUsd;
    }
    if (domain.aiMetadata?.tokens?.prompt !== undefined) {
      dbModel.ai_tokens_input = domain.aiMetadata.tokens.prompt;
    }
    if (domain.aiMetadata?.tokens?.completion !== undefined) {
      dbModel.ai_tokens_output = domain.aiMetadata.tokens.completion;
    }

    // Execution tracking
    if (domain.executionMode !== undefined)
      dbModel.execution_mode = domain.executionMode || null;
    if (domain.inputSource !== undefined) dbModel.input_source = domain.inputSource || null;

    // JSONB columns - BaseRepository automatically handles serialization
    if (domain.aiMetadata !== undefined) {
      dbModel.ai_metadata = domain.aiMetadata;
    }
    if (domain.timingMetadata !== undefined) {
      dbModel.timing_metadata = domain.timingMetadata;
    }
    if (domain.errorDetails !== undefined) {
      dbModel.error_details = domain.errorDetails;
    }

    if (domain.whitelisted !== undefined) dbModel.whitelisted = domain.whitelisted;
    if (domain.whitelistReason !== undefined)
      dbModel.whitelist_reason = domain.whitelistReason || null;

    // Timestamps
    if (domain.analyzedAt) dbModel.analyzed_at = domain.analyzedAt;
    if (domain.createdAt) dbModel.created_at = domain.createdAt;

    return dbModel;
  }
}

/**
 * Singleton instance
 */
let analysisRepositoryInstance: AnalysisRepository | null = null;

/**
 * Get analysis repository instance
 */
export function getAnalysisRepository(): AnalysisRepository {
  if (!analysisRepositoryInstance) {
    analysisRepositoryInstance = new AnalysisRepository();
  }
  return analysisRepositoryInstance;
}
