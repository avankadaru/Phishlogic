#!/usr/bin/env tsx

/**
 * Test SenderReputationAnalyzer performance improvements
 *
 * This script tests the analyzer with timeout optimizations:
 * - WHOIS timeout: 10s
 * - DNS timeout: 10s
 * - Smart WHOIS skip when DNS fails
 */

import { randomUUID } from 'crypto';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

/**
 * Create a simple MIME-formatted email
 */
function createRawEmail(from: string, to: string, subject: string, body: string): string {
  const date = new Date().toUTCString();
  return `From: ${from}
To: ${to}
Subject: ${subject}
Date: ${date}
Content-Type: text/plain; charset=utf-8

${body}
`;
}

async function testPerformance() {
  try {
    logger.info('Testing SenderReputationAnalyzer performance...');

    const analysisId = randomUUID();
    const testDomain = 'nonexistent-domain-12345.com';

    // Create raw email in MIME format
    const rawEmail = createRawEmail(
      `suspicious@${testDomain}`,
      'user@example.com',
      'Test Email - Performance Verification',
      'This is a test email to verify SenderReputationAnalyzer performance with timeouts.'
    );

    const testEmail = {
      rawEmail,
      analysisId,
      uiTimestamp: Date.now(),
    };

    logger.info({
      analysisId,
      testDomain,
    }, 'Starting test analysis...');

    const startTime = Date.now();

    // Call the API
    const response = await fetch('http://localhost:3000/api/v1/analyze/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testEmail),
    });

    const totalDuration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    logger.info({
      analysisId,
      verdict: result.verdict,
      score: result.score,
      totalDuration,
      apiDuration: result.metadata?.duration,
    }, '✅ Analysis completed');

    // Extract SenderReputationAnalyzer execution step
    const senderRepStep = result.metadata?.executionSteps?.find(
      (step: any) => step.step === 'analyzer_SenderReputationAnalyzer_completed'
    );

    if (senderRepStep) {
      console.log('\n=== SenderReputationAnalyzer Performance ===\n');
      console.log(`Duration: ${senderRepStep.duration}ms`);
      console.log(`Signal Count: ${senderRepStep.context?.signalCount || 0}`);
      console.log(`Context:`, JSON.stringify(senderRepStep.context, null, 2));

      if (senderRepStep.duration < 3000) {
        logger.info('✅ PERFORMANCE TARGET MET: < 3s');
      } else if (senderRepStep.duration < 10000) {
        logger.warn(`⚠️  SLOWER THAN TARGET: ${senderRepStep.duration}ms (target: <3s)`);
      } else {
        logger.error(`❌ TOO SLOW: ${senderRepStep.duration}ms (target: <3s)`);
      }
    } else {
      logger.warn('SenderReputationAnalyzer step not found in execution steps');
    }

    // Show all analyzer durations
    console.log('\n=== All Analyzer Durations ===\n');
    const analyzerSteps = result.metadata?.executionSteps?.filter(
      (step: any) => step.step.includes('analyzer_') && step.step.includes('_completed')
    ) || [];

    analyzerSteps.forEach((step: any) => {
      const analyzerName = step.step.replace('analyzer_', '').replace('_completed', '');
      console.log(`${analyzerName}: ${step.duration}ms`);
    });

    console.log(`\nTotal API Duration: ${result.metadata?.duration || 'N/A'}ms`);

    logger.info('✅ Performance test complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '❌ Test failed');
    process.exit(1);
  }
}

testPerformance();
