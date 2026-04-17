/**
 * Resolved pipeline for a single analysis request.
 *
 * The integration config row (`integration_tasks`) is the single source of
 * truth for analysis policy. When a field is NULL on the row we fall back to
 * a sensible default derived from the input type. `executionModeOverride`
 * (request-level) always wins over the config for `executionMode`.
 */

import type { NormalizedInput } from '../models/input.js';
import { isUrlInput } from '../models/input.js';
import type { ContentPrescanMode } from '../models/content-prescan.js';
import type { IntegrationConfig } from '../services/integration-config.service.js';
import type { AnalyzerFilteringMode } from './analyzer-registry.js';

export type { AnalyzerFilteringMode };
export type { ContentPrescanMode } from '../models/content-prescan.js';

export type ExecutionMode = 'native' | 'hybrid' | 'ai';

export interface ResolvedPipeline {
  integrationName: string;
  contentPrescan: ContentPrescanMode;
  analyzerFilteringMode: AnalyzerFilteringMode;
  executionMode: ExecutionMode;
}

/**
 * Resolve the pipeline for a request using (in order of precedence):
 *   1. request-level override (`executionModeOverride` only)
 *   2. integration config row
 *   3. input type default
 */
export function resolvePipeline(
  input: NormalizedInput,
  cfg: IntegrationConfig | null
): ResolvedPipeline {
  const isUrl = isUrlInput(input);

  const integrationName =
    cfg?.integrationName ?? input.integrationName ?? (isUrl ? 'chrome' : 'gmail');

  const contentPrescan: ContentPrescanMode =
    cfg?.contentPrescan ?? (isUrl ? 'url' : 'email');

  const analyzerFilteringMode: AnalyzerFilteringMode =
    cfg?.analyzerFilteringMode ?? (isUrl ? 'inspect_url' : 'email_inbox');

  const executionMode: ExecutionMode =
    input.executionModeOverride ?? cfg?.executionMode ?? 'native';

  return {
    integrationName,
    contentPrescan,
    analyzerFilteringMode,
    executionMode,
  };
}
