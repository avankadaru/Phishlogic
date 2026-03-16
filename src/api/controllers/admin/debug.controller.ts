import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDebugService, DebugQueryOptions } from '../../../core/services/debug.service.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schemas
const DebugQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  verdict: z.enum(['Safe', 'Suspicious', 'Malicious']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /api/admin/debug/analyses - Get recent analyses with full debug info
 */
export async function getRecentAnalyses(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { limit, offset, verdict, startDate, endDate } = DebugQuerySchema.parse(request.query);

    // Build query options
    const options: DebugQueryOptions = {
      limit,
      offset,
      verdict,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    // Get data from service
    const debugService = getDebugService();
    const result = await debugService.getRecentAnalyses(options);

    // Transform domain models to API response
    reply.send({
      success: true,
      data: {
        analyses: result.items.map((analysis) => {
          // Extract trustLevel and contentRisk from execution steps if available
          const whitelistCheckStep = analysis.executionSteps?.find(
            (step: any) => step.step === 'whitelist_check_started' && step.status === 'completed'
          );
          const contentRiskStep = analysis.executionSteps?.find(
            (step: any) => step.step === 'content_risk_analysis_started' && step.status === 'completed'
          );

          const trustLevel = whitelistCheckStep?.context?.trustLevel;
          const contentRisk = contentRiskStep?.context
            ? {
                hasLinks: contentRiskStep.context.hasLinks || false,
                hasAttachments: contentRiskStep.context.hasAttachments || false,
                hasUrgencyLanguage: contentRiskStep.context.hasUrgency || false,
                overallRiskScore: contentRiskStep.context.riskScore || 0,
              }
            : undefined;

          return {
            id: analysis.id,
            inputType: analysis.inputType,
            inputSource: analysis.inputSource,
            verdict: analysis.verdict,
            confidenceScore: analysis.confidence,
            riskFactors: analysis.redFlags,
            executionMode: analysis.executionMode,
            aiProvider: analysis.aiMetadata?.provider,
            aiModel: analysis.aiMetadata?.model,
            processingTimeMs: analysis.durationMs,
            costUsd: analysis.aiMetadata?.costUsd,
            tokensUsed: analysis.aiMetadata?.tokens?.total,
            whitelisted: analysis.whitelisted,
            whitelistReason: analysis.whitelistReason,
            trustLevel,
            analyzersRun: analysis.analyzersRun || [],
            executionSteps: analysis.executionSteps || [],
            contentRisk,
            errorMessage: analysis.errorDetails?.message,
            createdAt: analysis.createdAt,
            tenantId: analysis.tenantId,
          };
        }),
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid query parameters',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Failed to get recent analyses');
    reply.status(500).send({
      success: false,
      error: 'Failed to get recent analyses',
    });
  }
}

/**
 * GET /api/admin/debug/analyses/:id - Get single analysis with full details
 */
export async function getAnalysisById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { id } = request.params;

    // Get analysis from service
    const debugService = getDebugService();
    const analysis = await debugService.getAnalysisById(id);

    if (!analysis) {
      reply.status(404).send({
        success: false,
        error: 'Analysis not found',
      });
      return;
    }

    // Extract trustLevel and contentRisk from execution steps if available
    const whitelistCheckStep = analysis.executionSteps?.find(
      (step: any) => step.step === 'whitelist_check_started' && step.status === 'completed'
    );
    const contentRiskStep = analysis.executionSteps?.find(
      (step: any) => step.step === 'content_risk_analysis_started' && step.status === 'completed'
    );

    const trustLevel = whitelistCheckStep?.context?.trustLevel;
    const contentRisk = contentRiskStep?.context
      ? {
          hasLinks: contentRiskStep.context.hasLinks || false,
          hasAttachments: contentRiskStep.context.hasAttachments || false,
          hasUrgencyLanguage: contentRiskStep.context.hasUrgency || false,
          overallRiskScore: contentRiskStep.context.riskScore || 0,
        }
      : undefined;

    // Transform domain model to API response
    reply.send({
      success: true,
      data: {
        id: analysis.id,
        inputType: analysis.inputType,
        inputSource: analysis.inputSource,
        inputData: analysis.inputData,
        verdict: analysis.verdict,
        confidenceScore: analysis.confidence,
        score: analysis.score,
        riskFactors: analysis.redFlags,
        signals: analysis.signals,
        analyzersRun: analysis.analyzersRun,
        executionSteps: analysis.executionSteps,
        executionMode: analysis.executionMode,
        aiProvider: analysis.aiMetadata?.provider,
        aiModel: analysis.aiMetadata?.model,
        aiMetadata: analysis.aiMetadata, // Full AI metadata
        timingMetadata: analysis.timingMetadata, // Full timing metadata
        processingTimeMs: analysis.durationMs,
        costUsd: analysis.aiMetadata?.costUsd,
        tokensUsed: analysis.aiMetadata?.tokens?.total,
        whitelisted: analysis.whitelisted,
        whitelistReason: analysis.whitelistReason,
        trustLevel,
        contentRisk,
        errorMessage: analysis.errorDetails?.message,
        errorDetails: analysis.errorDetails, // Full error details
        createdAt: analysis.createdAt,
        analyzedAt: analysis.analyzedAt,
        tenantId: analysis.tenantId,
      },
    });
  } catch (err) {
    logger.error({ err, analysisId: request.params.id }, 'Failed to get analysis by ID');
    reply.status(500).send({
      success: false,
      error: 'Failed to get analysis details',
    });
  }
}

/**
 * GET /api/admin/debug/errors - Get recent error logs
 */
export async function getRecentErrors(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { limit, offset, startDate, endDate } = DebugQuerySchema.parse(request.query);

    // Build query options
    const options: DebugQueryOptions = {
      limit,
      offset,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    // Get errors from service
    const debugService = getDebugService();
    const result = await debugService.getRecentErrors(options);

    // Transform domain models to API response
    reply.send({
      success: true,
      data: {
        errors: result.items.map((analysis) => ({
          id: analysis.id,
          inputType: analysis.inputType,
          inputSource: analysis.inputSource,
          verdict: analysis.verdict,
          executionMode: analysis.executionMode,
          errorMessage: analysis.errorDetails?.message,
          errorStackTrace: analysis.errorDetails?.stackTrace,
          errorContext: analysis.errorDetails?.context,
          processingTimeMs: analysis.durationMs,
          createdAt: analysis.createdAt,
        })),
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid query parameters',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Failed to get recent errors');
    reply.status(500).send({
      success: false,
      error: 'Failed to get recent errors',
    });
  }
}

/**
 * GET /api/admin/debug/stats - Get system statistics
 */
export async function getSystemStats(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get stats from service
    const debugService = getDebugService();
    const stats = await debugService.getSystemStats(24); // Last 24 hours

    // Transform to API response
    reply.send({
      success: true,
      data: {
        period: stats.period,
        verdictDistribution: stats.verdictDistribution.map((item) => ({
          verdict: item.verdict,
          count: item.count,
          avgConfidence: parseFloat(item.avgConfidence.toFixed(2)),
          avgProcessingTime: parseFloat(item.avgProcessingTime.toFixed(2)),
        })),
        executionModeDistribution: stats.executionModeDistribution.map((item) => ({
          executionMode: item.executionMode,
          count: item.count,
          avgProcessingTime: parseFloat(item.avgProcessingTime.toFixed(2)),
          totalCost: parseFloat(item.totalCost.toFixed(4)),
        })),
        errorRate: parseFloat(stats.errorRate.toFixed(2)),
        whitelistHitRate: parseFloat(stats.whitelistHitRate.toFixed(2)),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get system stats');
    reply.status(500).send({
      success: false,
      error: 'Failed to get system statistics',
    });
  }
}

/**
 * GET /api/admin/debug/health - System health check
 */
export async function getHealthCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get health status from service
    const debugService = getDebugService();
    const health = await debugService.getHealthCheck();

    reply.send({
      success: true,
      data: health,
    });
  } catch (err) {
    logger.error({ err }, 'Health check failed');
    reply.status(500).send({
      success: false,
      error: 'Health check failed',
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      },
    });
  }
}
