/**
 * Verdict Factory
 *
 * Selects the correct VerdictService variant based on the content prescan
 * mode (`'email' | 'url' | 'none'`). Email and `none` keep the existing
 * `VerdictService` exactly as-is (zero regression to email behavior); the
 * `'url'` mode returns a `UrlVerdictService` that layers URL-specific
 * known-host demotion on top.
 *
 * This factory is the single seam every execution strategy goes through
 * when it needs a verdict service.
 */
import type { AppConfig } from '../../config/app.config.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import type { ContentPrescanMode } from '../models/content-prescan.js';
import type { NormalizedInput } from '../models/input.js';
import { isUrlInput } from '../models/input.js';
import { UrlVerdictService } from './url-verdict.service.js';
import { VerdictService } from './verdict.service.js';

const logger = getLogger();

/**
 * Create an appropriate VerdictService for the given prescan mode /
 * input. Called once per analysis. `cfg` is optional; the factory falls
 * back to the process-wide app config.
 */
export function createVerdictService(
  mode: ContentPrescanMode | undefined,
  input: NormalizedInput,
  cfg?: AppConfig
): VerdictService {
  const config = cfg ?? getConfig();

  // URL mode is explicit OR the input is a URL (covers missing
  // pipeline.contentPrescan in older callers).
  const effectiveMode: ContentPrescanMode =
    mode ?? (isUrlInput(input) ? 'url' : 'email');

  if (effectiveMode === 'url') {
    const svc = new UrlVerdictService(config);
    if (isUrlInput(input)) {
      svc.setTargetUrl(input.data.url);
    }
    logger.info({
      msg: 'VerdictFactory selected UrlVerdictService',
      mode: effectiveMode,
      targetUrl: isUrlInput(input) ? input.data.url : null,
    });
    return svc;
  }

  logger.info({
    msg: 'VerdictFactory selected VerdictService (base / email)',
    mode: effectiveMode,
  });
  return new VerdictService(config);
}
