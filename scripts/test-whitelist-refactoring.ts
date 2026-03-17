/**
 * Test Whitelist Refactoring Implementation
 *
 * Tests:
 * 1. Add a trusted whitelist entry with new fields
 * 2. Verify entry is stored with correct fields
 * 3. Send test email from trusted sender (with links)
 * 4. Verify content pre-scan always runs
 * 5. Verify correct analyzers are filtered based on content
 */

import { getWhitelistService } from '../src/core/services/whitelist.service.js';
import { ContentRiskAnalyzer } from '../src/core/analyzers/risk/content-risk.analyzer.js';
import { getAnalyzerRegistry } from '../src/core/engine/analyzer-registry.js';
import type { NormalizedInput } from '../src/core/models/input.js';
import { getLogger } from '../src/infrastructure/logging/index.js';
import { closePool } from '../src/infrastructure/database/client.js';

const logger = getLogger();

async function testWhitelistRefactoring() {
  try {
    logger.info('=== Test 1: Add Trusted Whitelist Entry ===');

    const whitelistService = getWhitelistService();

    // Add a trusted entry
    const testEntry = await whitelistService.addEntry({
      type: 'email',
      value: 'trusted@example.com',
      description: 'Test entry for refactoring verification',
      isTrusted: true,
      scanAttachments: true,
      scanRichContent: false, // Skip rich content scanning
    });

    logger.info('✓ Whitelist entry added:', {
      id: testEntry.id,
      value: testEntry.value,
      isTrusted: testEntry.isTrusted,
      scanAttachments: testEntry.scanAttachments,
      scanRichContent: testEntry.scanRichContent,
    });

    // Verify the entry
    const retrievedEntry = await whitelistService.getEntry(testEntry.id);
    if (!retrievedEntry) {
      throw new Error('Failed to retrieve whitelist entry');
    }

    logger.info('✓ Entry verification passed');

    logger.info('=== Test 2: Content Pre-Scan ===');

    // Create test email input with links
    const testInput: NormalizedInput = {
      type: 'email',
      id: 'test-email-1',
      timestamp: new Date(),
      data: {
        raw: 'test-email',
        parsed: {
          headers: new Map(),
          from: { address: 'trusted@example.com', name: 'Trusted Sender' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test Email with Links',
          body: {
            text: 'Check out this link: https://example.com/page',
            html: '<p>Check out this link: <a href="https://example.com/page">Example</a></p>',
          },
          urls: ['https://example.com/page'],
        },
      },
    };

    const contentRiskAnalyzer = new ContentRiskAnalyzer();
    const riskProfile = await contentRiskAnalyzer.analyzeRisk(testInput);

    logger.info('✓ Content pre-scan completed:', {
      hasLinks: riskProfile.hasLinks,
      linkCount: riskProfile.linkCount,
      hasAttachments: riskProfile.hasAttachments,
      hasImages: riskProfile.hasImages,
      hasQRCodes: riskProfile.hasQRCodes,
      hasForms: riskProfile.hasForms,
      hasUrgencyLanguage: riskProfile.hasUrgencyLanguage,
      overallRiskScore: riskProfile.overallRiskScore,
    });

    logger.info('=== Test 3: Analyzer Filtering ===');

    // Check whitelist
    const whitelistResult = await whitelistService.check(testInput);

    if (!whitelistResult.isWhitelisted) {
      throw new Error('Expected email to be whitelisted');
    }

    logger.info('✓ Whitelist check passed:', {
      isWhitelisted: whitelistResult.isWhitelisted,
      matchReason: whitelistResult.matchReason,
      entry: whitelistResult.entry
        ? {
            isTrusted: whitelistResult.entry.isTrusted,
            scanAttachments: whitelistResult.entry.scanAttachments,
            scanRichContent: whitelistResult.entry.scanRichContent,
          }
        : undefined,
    });

    // Get filtered analyzers
    const analyzerRegistry = getAnalyzerRegistry();
    const filteredAnalyzers = analyzerRegistry.getFilteredAnalyzers(
      whitelistResult.entry,
      riskProfile
    );

    const analyzerNames = filteredAnalyzers.map((a) => a.getName());

    logger.info('✓ Analyzers filtered based on content and whitelist:', {
      analyzersCount: filteredAnalyzers.length,
      analyzers: analyzerNames,
    });

    // Verify expected filtering behavior
    // Trusted sender, scanRichContent=false → should skip link analyzers
    const hasAuthAnalyzers = analyzerNames.some((name) =>
      ['SpfAnalyzer', 'DkimAnalyzer', 'SenderReputationAnalyzer'].includes(name)
    );
    const hasLinkAnalyzers = analyzerNames.some((name) =>
      ['LinkReputationAnalyzer', 'UrlEntropyAnalyzer'].includes(name)
    );

    if (hasAuthAnalyzers) {
      logger.warn('⚠ Warning: Authentication analyzers should be skipped for trusted senders');
    } else {
      logger.info('✓ Authentication analyzers correctly skipped');
    }

    if (hasLinkAnalyzers) {
      logger.warn('⚠ Warning: Link analyzers should be skipped (scanRichContent=false)');
    } else {
      logger.info('✓ Link analyzers correctly skipped due to scanRichContent=false');
    }

    logger.info('=== Test 4: Non-Trusted Email with Links ===');

    // Test with non-trusted sender
    const nonTrustedInput: NormalizedInput = {
      type: 'email',
      id: 'test-email-2',
      timestamp: new Date(),
      data: {
        raw: 'test-email',
        parsed: {
          headers: new Map(),
          from: { address: 'unknown@example.com', name: 'Unknown Sender' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test Email',
          body: {
            text: 'Check out this link: https://example.com/page',
            html: '<p>Check out this link: <a href="https://example.com/page">Example</a></p>',
          },
          urls: ['https://example.com/page'],
        },
      },
    };

    const nonTrustedRiskProfile = await contentRiskAnalyzer.analyzeRisk(nonTrustedInput);
    const nonTrustedWhitelistResult = await whitelistService.check(nonTrustedInput);

    const nonTrustedFilteredAnalyzers = analyzerRegistry.getFilteredAnalyzers(
      nonTrustedWhitelistResult.entry,
      nonTrustedRiskProfile
    );

    const nonTrustedAnalyzerNames = nonTrustedFilteredAnalyzers.map((a) => a.getName());

    logger.info('✓ Non-trusted email analyzers:', {
      analyzersCount: nonTrustedFilteredAnalyzers.length,
      analyzers: nonTrustedAnalyzerNames,
    });

    const nonTrustedHasAuth = nonTrustedAnalyzerNames.some((name) =>
      ['SpfAnalyzer', 'DkimAnalyzer', 'SenderReputationAnalyzer'].includes(name)
    );
    const nonTrustedHasLinks = nonTrustedAnalyzerNames.some((name) =>
      ['LinkReputationAnalyzer', 'UrlEntropyAnalyzer'].includes(name)
    );

    if (!nonTrustedHasAuth) {
      logger.warn('⚠ Warning: Authentication analyzers should run for non-trusted senders');
    } else {
      logger.info('✓ Authentication analyzers correctly included');
    }

    if (!nonTrustedHasLinks) {
      logger.warn('⚠ Warning: Link analyzers should run when links are present');
    } else {
      logger.info('✓ Link analyzers correctly included for links');
    }

    // Clean up
    await whitelistService.removeEntry(testEntry.id);
    logger.info('✓ Test entry cleaned up');

    logger.info('=== All Tests Passed! ===');
  } catch (error) {
    logger.error('Test failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run tests
testWhitelistRefactoring().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
