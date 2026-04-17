/**
 * Analysis API controller
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UrlAnalysisRequest, EmailAnalysisRequest } from '../schemas/analysis.schema.js';
import { RawUrlAdapter, RawEmailAdapter } from '../../adapters/input/index.js';
import { getAnalysisEngine } from '../../core/engine/analysis.engine.js';
import { getAnalyzerRegistry } from '../../core/engine/analyzer-registry.js';
import {
  UrlEntropyAnalyzer,
  SpfAnalyzer,
  DkimAnalyzer,
} from '../../core/analyzers/static/index.js';
import { UrlEntropyUrlAnalyzer } from '../../core/analyzers/static/url-entropy.url.analyzer.js';
import {
  RedirectAnalyzer,
  FormAnalyzer,
} from '../../core/analyzers/dynamic/index.js';
import { RedirectUrlAnalyzer } from '../../core/analyzers/dynamic/redirect.url.analyzer.js';
import { FormUrlAnalyzer } from '../../core/analyzers/dynamic/form.url.analyzer.js';
import { SenderReputationAnalyzer } from '../../core/analyzers/reputation/sender-reputation.analyzer.js';
import { LinkReputationAnalyzer } from '../../core/analyzers/reputation/link-reputation.analyzer.js';
import { LinkReputationUrlAnalyzer } from '../../core/analyzers/reputation/link-reputation.url.analyzer.js';
import { ContentAnalysisAnalyzer } from '../../core/analyzers/ml/content-analysis.analyzer.js';
import { AttachmentAnalyzer } from '../../core/analyzers/attachment/attachment.analyzer.js';
import { ButtonAnalyzer } from '../../core/analyzers/content/button.analyzer.js';
import { ImageAnalyzer } from '../../core/analyzers/image/image.analyzer.js';
import { QRCodeAnalyzer } from '../../core/analyzers/image/qrcode.analyzer.js';
import { WhitelistService } from '../../core/services/whitelist.service.js';
import { loginPageDetectionService } from '../../core/services/login-page-detection.service.js';
import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();

// Initialize analyzer registry with all analyzers
const analyzerRegistry = getAnalyzerRegistry();

const staticAnalyzers = [
  new UrlEntropyAnalyzer(),
  new SpfAnalyzer(),
  new DkimAnalyzer(),
  // DEPRECATED: Keyword-based analyzers (replaced by systematic ML/NLP)
  // new HeaderAnalyzer(), // Replaced by ContentAnalysisAnalyzer (Phase 4)
  // new EmotionalManipulationAnalyzer(), // Replaced by ContentAnalysisAnalyzer (Phase 4)
  // NEW: Systematic verification analyzers
  new SenderReputationAnalyzer(), // Phase 1: Systematic sender validation
  new LinkReputationAnalyzer(), // Phase 2: Threat intelligence URL checking
  new AttachmentAnalyzer(), // Phase 3: File type analysis (ClamAV/YARA when available)
  new ContentAnalysisAnalyzer(), // Phase 4: ML/NLP content analysis (NO keywords)
  // Phase 5: Task-based architecture - new analyzers
  new ButtonAnalyzer(), // Button/CTA tracking (hidden redirects, text mismatches)
  new ImageAnalyzer(), // Image analysis (OCR, EXIF, phishing text detection)
  new QRCodeAnalyzer(), // QR code decoding and URL validation
];

// Initialize services for dependency injection
const whitelistService = new WhitelistService();

const dynamicAnalyzers = [
  new RedirectAnalyzer(whitelistService, loginPageDetectionService),
  new FormAnalyzer(),
];

// URL-task specialized analyzer subclasses. Registered alongside the base
// email-first analyzers; `AnalyzerRegistry.selectInspectUrlAnalyzers`
// prefers these when `getSupportedPrescanModes()` includes 'url'.
const urlSpecializedAnalyzers = [
  new UrlEntropyUrlAnalyzer(),
  new LinkReputationUrlAnalyzer(),
  new RedirectUrlAnalyzer(whitelistService, loginPageDetectionService),
  new FormUrlAnalyzer(),
];

// Register analyzers (used by NativeExecutionStrategy)
analyzerRegistry.registerMany([
  ...staticAnalyzers,
  ...dynamicAnalyzers,
  ...urlSpecializedAnalyzers,
]);

// Get singleton engine instance (strategies are initialized in constructor)
const engine = getAnalysisEngine();

logger.info('Analysis engine initialized with execution strategies and analyzers');

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

    // Pass through analysis ID and UI timestamp from request
    normalizedInput.analysisId = request.body.analysisId;
    normalizedInput.uiTimestamp = request.body.uiTimestamp;
    if (request.body.executionMode) {
      normalizedInput.executionModeOverride = request.body.executionMode;
    }
    if (request.body.integrationName) {
      normalizedInput.integrationName = request.body.integrationName;
    }

    // Analyze
    const result = await engine.analyze(normalizedInput);

    logger.info({
      msg: 'URL analysis completed',
      url: request.body.url,
      verdict: result.verdict,
      score: result.score,
      analysisId: result.metadata.analysisId,
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

    // Pass through analysis ID and UI timestamp from request
    normalizedInput.analysisId = request.body.analysisId;
    normalizedInput.uiTimestamp = request.body.uiTimestamp;
    if (request.body.executionMode) {
      normalizedInput.executionModeOverride = request.body.executionMode;
    }
    if (request.body.integrationName) {
      normalizedInput.integrationName = request.body.integrationName;
    }

    // Analyze
    const result = await engine.analyze(normalizedInput);

    logger.info({
      msg: 'Email analysis completed',
      verdict: result.verdict,
      score: result.score,
      analysisId: result.metadata.analysisId,
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
