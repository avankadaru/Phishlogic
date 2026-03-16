#!/usr/bin/env tsx
/**
 * Test Debug API Response
 *
 * Tests the debug API endpoint to see the actual response structure
 */

import { getDebugService } from '../src/core/services/debug.service.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function testDebugApi() {
  try {
    logger.info('Testing debug API response structure...');

    const debugService = getDebugService();
    const result = await debugService.getRecentAnalyses({
      limit: 5,
      offset: 0,
    });

    console.log('\nDebug Service Result:');
    console.log(JSON.stringify({
      totalItems: result.items.length,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
    }, null, 2));

    if (result.items.length > 0) {
      const firstItem = result.items[0];
      console.log('\nFirst Analysis:');
      console.log(JSON.stringify({
        id: firstItem.id,
        verdict: firstItem.verdict,
        inputType: firstItem.inputType,
        executionMode: firstItem.executionMode,
        analyzersRun: firstItem.analyzersRun || [],
        redFlags: firstItem.redFlags || [],
        whitelisted: firstItem.whitelisted,
        confidence: firstItem.confidence,
        durationMs: firstItem.durationMs,
      }, null, 2));

      // Extract trust level and content risk
      const whitelistCheckStep = firstItem.executionSteps?.find(
        (step: any) => step.step === 'whitelist_check_started' && step.status === 'completed'
      );
      const contentRiskStep = firstItem.executionSteps?.find(
        (step: any) => step.step === 'content_risk_analysis_started' && step.status === 'completed'
      );

      console.log('\nExtracted Data:');
      console.log(JSON.stringify({
        trustLevel: whitelistCheckStep?.context?.trustLevel,
        contentRisk: contentRiskStep?.context ? {
          hasLinks: contentRiskStep.context.hasLinks || false,
          hasAttachments: contentRiskStep.context.hasAttachments || false,
          hasUrgency: contentRiskStep.context.hasUrgency || false,
          riskScore: contentRiskStep.context.riskScore || 0,
        } : null,
      }, null, 2));
    } else {
      logger.warn('No analyses found in database');
    }

    logger.info('✅ Debug API test complete');
    process.exit(0);

  } catch (error) {
    logger.error({ error }, 'Failed to test debug API');
    process.exit(1);
  }
}

testDebugApi();
