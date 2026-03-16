#!/usr/bin/env tsx
/**
 * Test API Response Structure
 *
 * Tests both list and single analysis endpoints to verify executionSteps is included
 */

import { getDebugService } from '../src/core/services/debug.service.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function testApiResponse() {
  try {
    logger.info('Testing API response structure...');

    const debugService = getDebugService();

    // Test list endpoint
    const listResult = await debugService.getRecentAnalyses({
      limit: 1,
      offset: 0,
    });

    if (listResult.items.length === 0) {
      logger.warn('No analyses found in database');
      process.exit(0);
    }

    const firstAnalysis = listResult.items[0];

    console.log('\n📋 LIST ENDPOINT SIMULATION:');
    console.log('='.repeat(80));

    // Simulate what the API controller returns
    const whitelistCheckStep = firstAnalysis.executionSteps?.find(
      (step: any) => step.step === 'whitelist_check_started' && step.status === 'completed'
    );
    const contentRiskStep = firstAnalysis.executionSteps?.find(
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

    const apiResponse = {
      id: firstAnalysis.id,
      inputType: firstAnalysis.inputType,
      inputSource: firstAnalysis.inputSource,
      verdict: firstAnalysis.verdict,
      confidenceScore: firstAnalysis.confidence,
      riskFactors: firstAnalysis.redFlags,
      executionMode: firstAnalysis.executionMode,
      aiProvider: firstAnalysis.aiMetadata?.provider,
      aiModel: firstAnalysis.aiMetadata?.model,
      processingTimeMs: firstAnalysis.durationMs,
      costUsd: firstAnalysis.aiMetadata?.costUsd,
      tokensUsed: firstAnalysis.aiMetadata?.tokens?.total,
      whitelisted: firstAnalysis.whitelisted,
      whitelistReason: firstAnalysis.whitelistReason,
      trustLevel,
      analyzersRun: firstAnalysis.analyzersRun || [],
      executionSteps: firstAnalysis.executionSteps || [], // NEW: Should be included now
      contentRisk,
      errorMessage: firstAnalysis.errorDetails?.message,
      createdAt: firstAnalysis.createdAt,
      tenantId: firstAnalysis.tenantId,
    };

    console.log(JSON.stringify({
      id: apiResponse.id,
      verdict: apiResponse.verdict,
      executionStepsCount: apiResponse.executionSteps?.length || 0,
      hasExecutionSteps: !!(apiResponse.executionSteps && apiResponse.executionSteps.length > 0),
      trustLevel: apiResponse.trustLevel,
      contentRisk: apiResponse.contentRisk,
      analyzersRunCount: apiResponse.analyzersRun?.length || 0,
    }, null, 2));

    // Test single analysis endpoint
    console.log('\n📄 SINGLE ANALYSIS ENDPOINT (by ID):');
    console.log('='.repeat(80));

    const singleAnalysis = await debugService.getAnalysisById(firstAnalysis.id);

    if (!singleAnalysis) {
      logger.error(`Analysis not found with ID: ${firstAnalysis.id}`);
      process.exit(1);
    }

    console.log(JSON.stringify({
      id: singleAnalysis.id,
      verdict: singleAnalysis.verdict,
      executionStepsCount: singleAnalysis.executionSteps?.length || 0,
      hasExecutionSteps: !!(singleAnalysis.executionSteps && singleAnalysis.executionSteps.length > 0),
      analyzersRunCount: singleAnalysis.analyzersRun?.length || 0,
    }, null, 2));

    if (apiResponse.executionSteps && apiResponse.executionSteps.length > 0) {
      console.log('\n✅ executionSteps is now included in list endpoint!');
    } else {
      console.log('\n❌ executionSteps is still missing from list endpoint');
    }

    if (singleAnalysis.executionSteps && singleAnalysis.executionSteps.length > 0) {
      console.log('✅ executionSteps is included in single analysis endpoint!');
    } else {
      console.log('❌ executionSteps is missing from single analysis endpoint');
    }

    logger.info('\n✅ API response test complete');
    process.exit(0);

  } catch (error) {
    logger.error({ error }, 'Failed to test API response');
    process.exit(1);
  }
}

testApiResponse();
