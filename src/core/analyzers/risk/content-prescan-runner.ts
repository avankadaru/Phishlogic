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

  const extractionPromise = Promise.allSettled(extractors.map((extractor) => extractor.extract(input)));

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Extraction timeout')), timeoutMs)
  );

  let extractionResults: PromiseSettledResult<ExtractionResult<unknown>>[];
  let timedOut = false;

  try {
    extractionResults = await Promise.race([extractionPromise, timeoutPromise]);
  } catch (error) {
    timedOut = true;
    logger.warn({
      msg: 'Content extraction timed out',
      timeoutMs,
      error: error instanceof Error ? error.message : String(error),
    });

    extractionResults = extractors.map(() => ({
      status: 'rejected' as const,
      reason: new Error('Extraction timeout'),
    }));
  }

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
