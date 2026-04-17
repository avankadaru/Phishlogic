/**
 * Task-specific content prescan (extensible for new tasks / providers).
 */

import type { NormalizedInput } from '../../models/input.js';
import type { EnhancedContentRiskProfile } from './content-risk.types.js';

export interface ContentPrescanStrategy {
  analyzeRisk(input: NormalizedInput): Promise<EnhancedContentRiskProfile>;
}
