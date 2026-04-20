/**
 * Parallel content extractor execution with timeout (shared by email and URL prescan strategies).
 */

import type { NormalizedInput } from '../../models/input.js';
import type { Logger } from 'pino';
import type { ContentExtractor, ExtractionResult } from './extractors/base.extractor.js';

const DEFAULT_TIMEOUT_MS = 3000;

export interface ContentPrescanRunResult {
  extractedData: Record<string, unknown>;
  timings: Record<string, number>;
  timedOut: boolean;
}

export async function runContentExtractors(
  extractors: ContentExtractor<unknown>[],
  input: NormalizedInput,
  logger: Logger,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ContentPrescanRunResult> {
  logger.debug({
    msg: 'Starting parallel content extraction',
    extractorCount: extractors.length,
    extractors: extractors.map((e) => e.getName()),
    timeoutMs,
  });

  // Track individual results as they complete so partial results survive a timeout.
  // Previous approach used Promise.race([allSettled, timeout]) which discarded ALL
  // results when the timeout fired — even extractors that had already completed.
  const individualResults: (PromiseSettledResult<ExtractionResult<unknown>> | null)[] =
    new Array(extractors.length).fill(null);

  const trackedPromises = extractors.map(async (extractor, i) => {
    try {
      const value = await extractor.extract(input);
      individualResults[i] = { status: 'fulfilled' as const, value };
    } catch (reason) {
      individualResults[i] = { status: 'rejected' as const, reason };
    }
  });

  let timedOut = false;

  await Promise.race([
    Promise.all(trackedPromises),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve();
      }, timeoutMs);
    }),
  ]);

  if (timedOut) {
    const completed = individualResults.filter((r) => r !== null).length;
    logger.warn({
      msg: 'Content extraction timed out',
      timeoutMs,
      completedExtractors: completed,
      totalExtractors: extractors.length,
    });
  }

  // Use actual results for completed extractors; synthetic rejection for still-running ones.
  const extractionResults: PromiseSettledResult<ExtractionResult<unknown>>[] =
    individualResults.map((r) =>
      r ?? { status: 'rejected' as const, reason: new Error('Extraction timeout') }
    );

  const timings: Record<string, number> = {};
  const extractedData: Record<string, unknown> = {};

  extractionResults.forEach((result, index) => {
    const extractor = extractors[index];
    if (!extractor) return;

    const name = extractor.getName();

    if (result.status === 'fulfilled') {
      const { data, durationMs, error } = result.value;
      timings[name] = durationMs;
      extractedData[name] = data;

      logger.debug({
        msg: 'Extractor completed',
        extractor: name,
        duration: durationMs,
        success: !error,
        error: error || undefined,
      });

      if (error) {
        logger.warn({
          msg: 'Extractor failed gracefully',
          extractor: name,
          error,
        });
      }
    } else {
      logger.debug({
        msg: timedOut ? 'Extractor timed out' : 'Extractor crashed',
        extractor: name,
        error: result.reason,
      });

      if (!timedOut) {
        logger.error({
          msg: 'Extractor crashed',
          extractor: name,
          error: result.reason,
        });
      }

      timings[name] = 0;
      extractedData[name] = extractor.getEmptyData();
    }
  });

  logger.info({
    msg: 'Content extraction completed',
    totalDuration: Object.values(timings).reduce((a, b) => a + b, 0),
    extractorCount: extractors.length,
    successCount: Object.keys(extractedData).length,
    timedOut,
  });

  return { extractedData, timings, timedOut };
}
