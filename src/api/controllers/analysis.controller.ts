/**
 * Analysis API controller
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UrlAnalysisRequest, EmailAnalysisRequest } from '../schemas/analysis.schema.js';
import { RawUrlAdapter, RawEmailAdapter } from '../../adapters/input/index.js';
import { AnalysisEngine } from '../../core/engine/index.js';
import {
  UrlEntropyAnalyzer,
  SpfAnalyzer,
  DkimAnalyzer,
  HeaderAnalyzer,
} from '../../core/analyzers/static/index.js';
import {
  RedirectAnalyzer,
  FormAnalyzer,
} from '../../core/analyzers/dynamic/index.js';
import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();

// Initialize analyzers and engine
const engine = new AnalysisEngine();

// Register static analyzers
engine.registerAnalyzers([
  new UrlEntropyAnalyzer(),
  new SpfAnalyzer(),
  new DkimAnalyzer(),
  new HeaderAnalyzer(),
]);

// Register dynamic analyzers
engine.registerAnalyzers([
  new RedirectAnalyzer(),
  new FormAnalyzer(),
]);

logger.info('Analysis engine initialized with all analyzers');

/**
 * Analyze URL endpoint
 */
export async function analyzeUrl(
  request: FastifyRequest<{ Body: UrlAnalysisRequest }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const adapter = new RawUrlAdapter();

    // Validate input
    const validation = await adapter.validate(request.body);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    // Adapt input
    const normalizedInput = await adapter.adapt(request.body);

    // Analyze
    const result = await engine.analyze(normalizedInput);

    logger.info({
      msg: 'URL analysis completed',
      url: request.body.url,
      verdict: result.verdict,
      score: result.score,
    });

    return reply.status(200).send(result);
  } catch (error) {
    logger.error({
      msg: 'URL analysis failed',
      error: error instanceof Error ? error.message : String(error),
    });

    return reply.status(500).send({
      error: 'Analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Analyze email endpoint
 */
export async function analyzeEmail(
  request: FastifyRequest<{ Body: EmailAnalysisRequest }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const adapter = new RawEmailAdapter();

    // Validate input
    const validation = await adapter.validate(request.body);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    // Adapt input
    const normalizedInput = await adapter.adapt(request.body);

    // Analyze
    const result = await engine.analyze(normalizedInput);

    logger.info({
      msg: 'Email analysis completed',
      verdict: result.verdict,
      score: result.score,
    });

    return reply.status(200).send(result);
  } catch (error) {
    logger.error({
      msg: 'Email analysis failed',
      error: error instanceof Error ? error.message : String(error),
    });

    return reply.status(500).send({
      error: 'Analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Health check endpoint
 */
export async function healthCheck(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return reply.status(200).send({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
}
