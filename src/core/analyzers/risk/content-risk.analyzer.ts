/**
 * Content Risk Analyzer (facade)
 *
 * Delegates to task-specific prescan strategies (email MIME vs URL static / optional HTML context).
 */

import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput, isUrlInput } from '../../models/input.js';
import type { ContentPrescanMode } from '../../models/content-prescan.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import { runEmailContentPrescan } from './email-content-prescan.strategy.js';
import { runUrlContentPrescan } from './url-content-prescan.strategy.js';
import type { EnhancedContentRiskProfile } from './content-risk.types.js';

export type { EnhancedContentRiskProfile, ContentRiskProfile } from './content-risk.types.js';

const logger = getLogger();

export interface AnalyzeRiskOptions {
  /** When set (e.g. from the resolved integration policy), overrides inference from input. */
  contentPrescan?: ContentPrescanMode;
}

function inferContentPrescanMode(input: NormalizedInput): ContentPrescanMode {
  if (isUrlInput(input)) {
    return 'url';
  }
  if (isEmailInput(input)) {
    return 'email';
  }
  return 'email';
}

/**
 * Content Risk Analyzer — public entry for pre-scan before analyzers.
 */
export class ContentRiskAnalyzer {
  /**
   * Run task-appropriate content risk pre-scan.
   */
  async analyzeRisk(
    input: NormalizedInput,
    options?: AnalyzeRiskOptions
  ): Promise<EnhancedContentRiskProfile> {
    const mode = options?.contentPrescan ?? inferContentPrescanMode(input);

    if (mode === 'none') {
      throw new Error(
        'contentPrescan "none" must be handled by the caller (e.g. minimal profile); do not invoke ContentRiskAnalyzer'
      );
    }

    if (mode === 'url') {
      if (!isUrlInput(input)) {
        logger.warn({ msg: 'URL prescan requested but input is not URL; falling back to email pipeline' });
        return runEmailContentPrescan(input, logger);
      }
      return runUrlContentPrescan(input, logger);
    }

    if (!isEmailInput(input)) {
      logger.warn({ msg: 'Email prescan requested but input is not email; using URL prescan' });
      if (!isUrlInput(input)) {
        throw new Error('Content prescan requires email or URL input');
      }
      return runUrlContentPrescan(input, logger);
    }

    return runEmailContentPrescan(input, logger);
  }
}
