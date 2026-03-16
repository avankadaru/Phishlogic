/**
 * Test Trust Level Functionality
 * Validates content-aware conditional bypass with different trust levels
 */

import { randomUUID } from 'node:crypto';
import { RawEmailAdapter } from '../src/adapters/input/index.js';
import { getAnalysisEngine } from '../src/core/engine/analysis.engine.js';
import { getAnalyzerRegistry } from '../src/core/engine/analyzer-registry.js';
import { getWhitelistService } from '../src/core/services/whitelist.service.js';
import { getLogger } from '../src/infrastructure/logging/index.js';
import type { TrustLevel } from '../src/core/models/whitelist.js';
import {
  UrlEntropyAnalyzer,
  SpfAnalyzer,
  DkimAnalyzer,
} from '../src/core/analyzers/static/index.js';
import {
  RedirectAnalyzer,
  FormAnalyzer,
} from '../src/core/analyzers/dynamic/index.js';
import { SenderReputationAnalyzer } from '../src/core/analyzers/reputation/sender-reputation.analyzer.js';
import { LinkReputationAnalyzer } from '../src/core/analyzers/reputation/link-reputation.analyzer.js';
import { ContentAnalysisAnalyzer } from '../src/core/analyzers/ml/content-analysis.analyzer.js';
import { AttachmentAnalyzer } from '../src/core/analyzers/attachment/attachment.analyzer.js';

const logger = getLogger();

// Initialize analyzer registry with all analyzers
const analyzerRegistry = getAnalyzerRegistry();
const staticAnalyzers = [
  new UrlEntropyAnalyzer(),
  new SpfAnalyzer(),
  new DkimAnalyzer(),
  new SenderReputationAnalyzer(),
  new LinkReputationAnalyzer(),
  new AttachmentAnalyzer(),
  new ContentAnalysisAnalyzer(),
];
const dynamicAnalyzers = [
  new RedirectAnalyzer(),
  new FormAnalyzer(),
];
analyzerRegistry.registerMany([...staticAnalyzers, ...dynamicAnalyzers]);
logger.info(`Registered ${staticAnalyzers.length + dynamicAnalyzers.length} analyzers for testing`);

interface TestScenario {
  name: string;
  trustLevel: TrustLevel;
  email: {
    from: string;
    to: string;
    subject: string;
    body: string;
  };
  expectedBehavior: {
    shouldBypass: boolean;
    expectedAnalyzersMin?: number;
    expectedAnalyzersMax?: number;
    bypassType?: 'full' | 'selective' | 'partial';
  };
}

const scenarios: TestScenario[] = [
  // HIGH trust + no risk = Full bypass (0 analyzers)
  {
    name: 'HIGH trust + no links + no attachments + normal text',
    trustLevel: 'high',
    email: {
      from: 'trusted-high@example.com',
      to: 'user@test.com',
      subject: 'Monthly Report',
      body: 'Hello, here is your monthly report. All metrics look good. Best regards, Team',
    },
    expectedBehavior: {
      shouldBypass: true,
      expectedAnalyzersMin: 0,
      expectedAnalyzersMax: 0,
      bypassType: 'full',
    },
  },

  // HIGH trust + safe links = Bypass (safe links don't trigger analysis)
  {
    name: 'HIGH trust + safe links only',
    trustLevel: 'high',
    email: {
      from: 'trusted-high-links@example.com',
      to: 'user@test.com',
      subject: 'Check out this report',
      body: 'Hi, please review the report: https://www.google.com and https://www.amazon.com',
    },
    expectedBehavior: {
      shouldBypass: false,
      expectedAnalyzersMin: 1,
      expectedAnalyzersMax: 4,
      bypassType: 'selective',
    },
  },

  // HIGH trust + suspicious link = Selective analysis (link analyzers only)
  {
    name: 'HIGH trust + suspicious link',
    trustLevel: 'high',
    email: {
      from: 'trusted-high-suspicious@example.com',
      to: 'user@test.com',
      subject: 'Important Update',
      body: 'Please verify your account: http://paypa1-verify.com/login',
    },
    expectedBehavior: {
      shouldBypass: false,
      expectedAnalyzersMin: 1,
      expectedAnalyzersMax: 4,
      bypassType: 'selective',
    },
  },

  // HIGH trust + urgency language = Selective analysis (content analyzers)
  {
    name: 'HIGH trust + urgency language',
    trustLevel: 'high',
    email: {
      from: 'trusted-high-urgent@example.com',
      to: 'user@test.com',
      subject: 'URGENT: Action Required',
      body: 'IMMEDIATE ACTION REQUIRED! Your account will be suspended in 24 hours unless you verify your identity. Act now!',
    },
    expectedBehavior: {
      shouldBypass: false,
      expectedAnalyzersMin: 1,
      expectedAnalyzersMax: 3,
      bypassType: 'selective',
    },
  },

  // MEDIUM trust = Always verify content, skip authentication
  {
    name: 'MEDIUM trust + any content',
    trustLevel: 'medium',
    email: {
      from: 'partner-medium@example.com',
      to: 'user@test.com',
      subject: 'Partnership Update',
      body: 'Hi, here is an update on our partnership. Check out: https://example.com',
    },
    expectedBehavior: {
      shouldBypass: false,
      expectedAnalyzersMin: 5,
      expectedAnalyzersMax: 8,
      bypassType: 'partial',
    },
  },

  // LOW trust = Full analysis except expensive browser checks
  {
    name: 'LOW trust + newsletter',
    trustLevel: 'low',
    email: {
      from: 'newsletter-low@example.com',
      to: 'user@test.com',
      subject: 'Weekly Newsletter',
      body: 'Subscribe to our newsletter: https://newsletter.example.com',
    },
    expectedBehavior: {
      shouldBypass: false,
      expectedAnalyzersMin: 7,
      expectedAnalyzersMax: 10,
      bypassType: 'partial',
    },
  },
];

async function testTrustLevelFunctionality() {
  logger.info('🧪 Testing Trust Level Functionality\n');
  logger.info('=' .repeat(80));

  const engine = getAnalysisEngine();
  const whitelistService = getWhitelistService();
  const adapter = new RawEmailAdapter();

  const results = {
    total: scenarios.length,
    passed: 0,
    failed: 0,
    scenarios: [] as any[],
  };

  for (const scenario of scenarios) {
    logger.info(`\n${'='.repeat(80)}`);
    logger.info(`📧 Test: ${scenario.name}`);
    logger.info(`   Trust Level: ${scenario.trustLevel.toUpperCase()}`);
    logger.info(`   From: ${scenario.email.from}`);
    logger.info(`   Subject: ${scenario.email.subject}`);
    logger.info('-'.repeat(80));

    try {
      // Step 1: Add whitelist entry with trust level
      const entryId = randomUUID();
      await whitelistService.addEntry({
        type: 'email',
        value: scenario.email.from,
        description: `Test entry for ${scenario.name}`,
        trustLevel: scenario.trustLevel,
      });

      logger.info(`✓ Added whitelist entry with trust level: ${scenario.trustLevel}`);

      // Step 2: Create raw email
      const rawEmail = `MIME-Version: 1.0
From: ${scenario.email.from}
To: ${scenario.email.to}
Subject: ${scenario.email.subject}
Date: ${new Date().toUTCString()}
Content-Type: text/plain; charset=utf-8

${scenario.email.body}`;

      // Step 3: Analyze
      const input = await adapter.adapt({ rawEmail });
      const result = await engine.analyze(input);

      // Step 4: Verify results
      const analyzersRun = result.metadata.analyzersRun?.length || 0;
      const { expectedAnalyzersMin, expectedAnalyzersMax } = scenario.expectedBehavior;

      const passed =
        analyzersRun >= (expectedAnalyzersMin || 0) &&
        analyzersRun <= (expectedAnalyzersMax || 999);

      logger.info(`\n📊 Results:`);
      logger.info(`   Verdict: ${result.verdict}`);
      logger.info(`   Score: ${result.score}/10`);
      logger.info(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      logger.info(`   Analyzers Run: ${analyzersRun}`);
      logger.info(`   Expected Range: ${expectedAnalyzersMin}-${expectedAnalyzersMax}`);
      logger.info(`   Bypass Type: ${scenario.expectedBehavior.bypassType}`);
      logger.info(`   Duration: ${result.metadata.duration}ms`);

      if (result.metadata.analyzersRun && result.metadata.analyzersRun.length > 0) {
        logger.info(`\n   Analyzers Executed:`);
        result.metadata.analyzersRun.forEach((name) => {
          logger.info(`      • ${name}`);
        });
      } else {
        logger.info(`\n   ℹ️  No analyzers executed (full bypass)`);
      }

      if (result.metadata.trustLevel) {
        logger.info(`\n   Trust Level Used: ${result.metadata.trustLevel}`);
      }

      if (result.metadata.riskScore !== undefined) {
        logger.info(`   Risk Score: ${result.metadata.riskScore}/10`);
      }

      logger.info(`\n   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);

      results.scenarios.push({
        name: scenario.name,
        trustLevel: scenario.trustLevel,
        passed,
        verdict: result.verdict,
        analyzersRun,
        expectedRange: `${expectedAnalyzersMin}-${expectedAnalyzersMax}`,
        duration: result.metadata.duration,
      });

      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }

      // Step 5: Cleanup whitelist entry
      const entries = await whitelistService.getAllEntries();
      const entry = entries.find((e) => e.value === scenario.email.from);
      if (entry) {
        await whitelistService.removeEntry(entry.id);
        logger.info(`✓ Cleaned up whitelist entry`);
      }
    } catch (error) {
      logger.error(`\n❌ Error testing scenario:`, error);
      results.failed++;
      results.scenarios.push({
        name: scenario.name,
        trustLevel: scenario.trustLevel,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Summary
  logger.info(`\n${'='.repeat(80)}`);
  logger.info(`\n📈 SUMMARY\n`);
  logger.info(`Total tests: ${results.total}`);
  logger.info(`Passed: ${results.passed} (${((results.passed / results.total) * 100).toFixed(1)}%)`);
  logger.info(`Failed: ${results.failed} (${((results.failed / results.total) * 100).toFixed(1)}%)`);

  logger.info(`\n📋 Results by Trust Level:\n`);

  const byTrustLevel = results.scenarios.reduce((acc: any, r) => {
    if (!acc[r.trustLevel]) {
      acc[r.trustLevel] = { total: 0, passed: 0, failed: 0 };
    }
    acc[r.trustLevel].total++;
    if (r.passed) {
      acc[r.trustLevel].passed++;
    } else {
      acc[r.trustLevel].failed++;
    }
    return acc;
  }, {});

  Object.entries(byTrustLevel).forEach(([level, stats]: [string, any]) => {
    const accuracy = ((stats.passed / stats.total) * 100).toFixed(1);
    logger.info(`   ${level.toUpperCase()}: ${stats.passed}/${stats.total} passed (${accuracy}%)`);
  });

  logger.info(`\n${'='.repeat(80)}`);

  if (results.failed > 0) {
    logger.info(`\n❌ Failed Tests:\n`);
    results.scenarios
      .filter((r) => !r.passed)
      .forEach((r) => {
        logger.info(
          `   ${r.name}: ${r.error || `analyzers=${r.analyzersRun}, expected=${r.expectedRange}`}`
        );
      });
  }

  logger.info(`\n✅ Testing complete!`);

  return {
    total: results.total,
    passed: results.passed,
    failed: results.failed,
    accuracy: (results.passed / results.total) * 100,
  };
}

// Run the test
testTrustLevelFunctionality()
  .then((stats) => {
    process.exit(stats.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
