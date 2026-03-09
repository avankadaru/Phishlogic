/**
 * Debug Service
 *
 * Business logic for debug/monitoring operations.
 * Uses Repository Pattern - no direct DB calls.
 *
 * Design Principles:
 * - Single Responsibility: Debug/monitoring logic only
 * - Dependency Injection: Repository injected for testing
 * - Interface-based: Easy to mock and extend
 * - Reusable: Can be used from HTTP, CLI, scheduled jobs, etc.
 */

import { getAnalysisRepository, AnalysisDomainModel, AnalysisFilters } from '../../infrastructure/database/repositories/analysis.repository.js';
import { getLogger } from '../../infrastructure/logging/logger.js';

const logger = getLogger();

/**
 * Debug query options
 */
export interface DebugQueryOptions {
  limit?: number;
  offset?: number;
  verdict?: 'Safe' | 'Suspicious' | 'Malicious';
  startDate?: Date;
  endDate?: Date;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Verdict statistics
 */
export interface VerdictStats {
  verdict: string;
  count: number;
  avgConfidence: number;
  avgProcessingTime: number;
}

/**
 * Execution mode statistics
 */
export interface ExecutionModeStats {
  executionMode: string;
  count: number;
  avgProcessingTime: number;
  totalCost: number;
}

/**
 * System statistics
 */
export interface SystemStats {
  period: string;
  verdictDistribution: VerdictStats[];
  executionModeDistribution: ExecutionModeStats[];
  errorRate: number;
  whitelistHitRate: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: string;
      responseTime?: number;
      error?: string;
    };
    analyses: {
      status: string;
      recentCount?: number;
      error?: string;
    };
    errors: {
      status: string;
      errorRate?: number;
      error?: string;
    };
  };
}

/**
 * Debug Service Interface
 * Defines contract for debug operations
 */
export interface IDebugService {
  getRecentAnalyses(options: DebugQueryOptions): Promise<PaginatedResponse<AnalysisDomainModel>>;
  getAnalysisById(id: string): Promise<AnalysisDomainModel | null>;
  getRecentErrors(options: DebugQueryOptions): Promise<PaginatedResponse<AnalysisDomainModel>>;
  getSystemStats(periodHours?: number): Promise<SystemStats>;
  getHealthCheck(): Promise<HealthCheckResult>;
}

/**
 * Debug Service Implementation
 */
export class DebugService implements IDebugService {
  constructor(
    private analysisRepository = getAnalysisRepository()
  ) {}

  /**
   * Get recent analyses with filtering and pagination
   */
  async getRecentAnalyses(options: DebugQueryOptions): Promise<PaginatedResponse<AnalysisDomainModel>> {
    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;

      // Build filters
      const filters: AnalysisFilters = {};
      if (options.verdict) filters.verdict = options.verdict;
      if (options.startDate) filters.startDate = options.startDate;
      if (options.endDate) filters.endDate = options.endDate;

      // Query via repository
      const { analyses, total } = await this.analysisRepository.findWithFilters(filters, {
        limit,
        offset,
        orderBy: 'created_at',
        orderDirection: 'DESC',
      });

      return {
        items: analyses,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      logger.error({
        msg: 'Failed to get recent analyses',
        error: error instanceof Error ? error.message : String(error),
        options,
      });
      throw error;
    }
  }

  /**
   * Get single analysis by ID
   */
  async getAnalysisById(id: string): Promise<AnalysisDomainModel | null> {
    try {
      return await this.analysisRepository.findById(id);
    } catch (error) {
      logger.error({
        msg: 'Failed to get analysis by ID',
        error: error instanceof Error ? error.message : String(error),
        id,
      });
      throw error;
    }
  }

  /**
   * Get recent analyses with errors
   */
  async getRecentErrors(options: DebugQueryOptions): Promise<PaginatedResponse<AnalysisDomainModel>> {
    try {
      const limit = options.limit || 20;
      const offset = options.offset || 0;

      // Use repository method for error queries
      const analyses = await this.analysisRepository.findWithErrors({
        limit,
        offset,
        orderBy: 'created_at',
        orderDirection: 'DESC',
      });

      // Get total count of errors
      const filters: AnalysisFilters = {};
      if (options.startDate) filters.startDate = options.startDate;
      if (options.endDate) filters.endDate = options.endDate;

      const { total } = await this.analysisRepository.findWithFilters(filters, { limit: 1 });

      return {
        items: analyses,
        total: analyses.length, // Approximation for errors
        limit,
        offset,
        hasMore: analyses.length === limit,
      };
    } catch (error) {
      logger.error({
        msg: 'Failed to get recent errors',
        error: error instanceof Error ? error.message : String(error),
        options,
      });
      throw error;
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStats(periodHours: number = 24): Promise<SystemStats> {
    try {
      const startDate = new Date(Date.now() - periodHours * 60 * 60 * 1000);

      // Get all analyses in period
      const { analyses } = await this.analysisRepository.findWithFilters(
        { startDate },
        { limit: 10000 } // High limit for stats
      );

      // Calculate verdict distribution
      const verdictMap = new Map<string, { count: number; totalConfidence: number; totalTime: number }>();
      for (const analysis of analyses) {
        const stats = verdictMap.get(analysis.verdict) || { count: 0, totalConfidence: 0, totalTime: 0 };
        stats.count++;
        stats.totalConfidence += analysis.confidence;
        stats.totalTime += analysis.durationMs;
        verdictMap.set(analysis.verdict, stats);
      }

      const verdictDistribution: VerdictStats[] = Array.from(verdictMap.entries()).map(([verdict, stats]) => ({
        verdict,
        count: stats.count,
        avgConfidence: stats.totalConfidence / stats.count,
        avgProcessingTime: stats.totalTime / stats.count,
      }));

      // Calculate execution mode distribution
      const modeMap = new Map<string, { count: number; totalTime: number; totalCost: number }>();
      for (const analysis of analyses) {
        const mode = analysis.executionMode || 'unknown';
        const stats = modeMap.get(mode) || { count: 0, totalTime: 0, totalCost: 0 };
        stats.count++;
        stats.totalTime += analysis.durationMs;
        stats.totalCost += analysis.aiMetadata?.costUsd || 0;
        modeMap.set(mode, stats);
      }

      const executionModeDistribution: ExecutionModeStats[] = Array.from(modeMap.entries()).map(([mode, stats]) => ({
        executionMode: mode,
        count: stats.count,
        avgProcessingTime: stats.totalTime / stats.count,
        totalCost: stats.totalCost,
      }));

      // Calculate error rate
      const errorCount = analyses.filter((a) => a.errorDetails?.message).length;
      const errorRate = analyses.length > 0 ? (errorCount / analyses.length) * 100 : 0;

      // Calculate whitelist hit rate
      const whitelistCount = analyses.filter((a) => a.whitelisted).length;
      const whitelistHitRate = analyses.length > 0 ? (whitelistCount / analyses.length) * 100 : 0;

      return {
        period: `Last ${periodHours} hours`,
        verdictDistribution,
        executionModeDistribution,
        errorRate,
        whitelistHitRate,
      };
    } catch (error) {
      logger.error({
        msg: 'Failed to get system stats',
        error: error instanceof Error ? error.message : String(error),
        periodHours,
      });
      throw error;
    }
  }

  /**
   * Get health check
   */
  async getHealthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {
      database: { status: 'unknown' },
      analyses: { status: 'unknown' },
      errors: { status: 'unknown' },
    };

    // Database check (query via repository)
    const dbStart = Date.now();
    try {
      await this.analysisRepository.count();
      checks.database.status = 'healthy';
      checks.database.responseTime = Date.now() - dbStart;
    } catch (error) {
      checks.database.status = 'unhealthy';
      checks.database.error = error instanceof Error ? error.message : String(error);
    }

    // Recent analyses check
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentCount = await this.analysisRepository.count({
        created_at: fiveMinutesAgo,
      });
      checks.analyses.recentCount = recentCount;
      checks.analyses.status = 'healthy';
    } catch (error) {
      checks.analyses.status = 'unhealthy';
      checks.analyses.error = error instanceof Error ? error.message : String(error);
    }

    // Error rate check (last hour)
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const { analyses } = await this.analysisRepository.findWithFilters(
        { startDate: oneHourAgo },
        { limit: 10000 }
      );

      const errorCount = analyses.filter((a) => a.errorDetails?.message).length;
      const errorRate = analyses.length > 0 ? (errorCount / analyses.length) * 100 : 0;

      checks.errors.errorRate = errorRate;
      checks.errors.status = errorRate < 5 ? 'healthy' : errorRate < 20 ? 'degraded' : 'unhealthy';
    } catch (error) {
      checks.errors.status = 'unhealthy';
      checks.errors.error = error instanceof Error ? error.message : String(error);
    }

    // Overall health
    const allHealthy = Object.values(checks).every((check) => check.status === 'healthy');
    const anyUnhealthy = Object.values(checks).some((check) => check.status === 'unhealthy');

    const overallStatus = anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}

/**
 * Singleton instance
 */
let debugServiceInstance: DebugService | null = null;

/**
 * Get debug service instance
 * Can be overridden with custom instance for testing
 */
export function getDebugService(instance?: DebugService): DebugService {
  if (instance) {
    debugServiceInstance = instance;
    return instance;
  }

  if (!debugServiceInstance) {
    debugServiceInstance = new DebugService();
  }

  return debugServiceInstance;
}
