/**
 * Test Email Samples Script
 * Tests all email scenarios from admin-ui against the new systematic analyzers
 */

import { RawEmailAdapter } from '../src/adapters/input/index.js';
import { getAnalysisEngine } from '../src/core/engine/analysis.engine.js';
import { getAnalyzerRegistry } from '../src/core/engine/analyzer-registry.js';
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

// Email scenarios (copied from admin-ui)
const emailScenarios = [
  // Safe Emails
  {
    id: 'safe-amazon',
    label: 'Legitimate Amazon',
    category: 'safe' as const,
    data: {
      from: 'auto-confirm@amazon.com',
      to: 'customer@example.com',
      subject: 'Your Amazon.com order #123-4567890 has shipped',
      body: 'Hello,\n\nYour order has been shipped and should arrive by Friday, March 15.\n\nTracking: 1Z999AA10123456784\n\nThank you for shopping with Amazon!\n\nAmazon.com\nhttps://www.amazon.com/your-orders'
    }
  },
  {
    id: 'safe-paypal',
    label: 'Legitimate PayPal',
    category: 'safe' as const,
    data: {
      from: 'service@paypal.com',
      to: 'user@example.com',
      subject: 'You sent a payment of $25.00 USD to John Doe',
      body: 'Hello,\n\nYou sent a payment of $25.00 USD to John Doe (johndoe@example.com).\n\nTransaction ID: 1AB23456CD789012E\nDate: March 9, 2026\n\nView transaction details:\nhttps://www.paypal.com/activity\n\nPayPal'
    }
  },
  // Suspicious Emails
  {
    id: 'suspicious-grammar',
    label: 'Poor Grammar',
    category: 'suspicious' as const,
    data: {
      from: 'support@bank-secure-verify.com',
      to: 'user@example.com',
      subject: 'Important Update Required',
      body: 'Dear valued customer,\n\nWe needs you to update your informations for security purpose. Please login to your account and complete verification process within 48 hours.\n\nYour account may be limited if you not complete this action.\n\nThank you for your cooperation.\n\nBank Security Team'
    }
  },
  {
    id: 'suspicious-urgency',
    label: 'Urgency Tactics',
    category: 'suspicious' as const,
    data: {
      from: 'security@account-services.net',
      to: 'user@example.com',
      subject: 'URGENT: Account will be closed in 24 hours',
      body: 'IMMEDIATE ACTION REQUIRED\n\nYour account shows unusual activity and will be permanently closed in 24 hours unless you verify your identity.\n\nClick here to verify now:\nhttp://verify-account-now.com/login\n\nDo not ignore this message or you will lose access to your account forever.'
    }
  },
  // Malicious Emails
  {
    id: 'malicious-paypal',
    label: 'PayPal Phishing',
    category: 'malicious' as const,
    data: {
      from: 'security@paypa1.com',
      to: 'victim@example.com',
      subject: 'URGENT: Verify your PayPal account NOW',
      body: 'Dear valued customer,\n\nYour account will be locked in 24 hours due to suspicious activity. Click here to verify immediately:\n\nhttp://paypa1-verify.com/login\n\nEnter your email and password to restore full access.\n\nFailure to verify will result in permanent account suspension.'
    }
  },
  {
    id: 'malicious-ceo-fraud',
    label: 'CEO Fraud',
    category: 'malicious' as const,
    data: {
      from: 'ceo@company-mail.com',
      to: 'finance@example.com',
      subject: 'URGENT: Wire Transfer Needed',
      body: 'Hi,\n\nI need you to process an urgent wire transfer immediately. We are closing an acquisition deal and need to send $50,000 to the following account:\n\nAccount: 123456789\nRouting: 987654321\nBank: International Trust Bank\n\nThis is time-sensitive. Please handle this discreetly and confirm once done.\n\n- CEO'
    }
  },
  {
    id: 'malicious-google',
    label: 'Google Typosquatting',
    category: 'malicious' as const,
    data: {
      from: 'no-reply@g00gle.com',
      to: 'user@example.com',
      subject: 'Security Alert: New sign-in from unknown device',
      body: 'Google detected a new sign-in to your account from an unknown device.\n\nLocation: Russia\nDevice: Windows PC\nTime: March 9, 2026 at 3:42 AM\n\nIf this was not you, secure your account immediately:\nhttp://g00gle.com/security/signin\n\nEnter your email and password to review this activity.\n\nGoogle Security Team'
    }
  },
  {
    id: 'malicious-prize',
    label: 'Prize Scam',
    category: 'malicious' as const,
    data: {
      from: 'winner@prize-notification.net',
      to: 'lucky@example.com',
      subject: 'CONGRATULATIONS! You Won $1,000,000',
      body: 'CONGRATULATIONS!!!\n\nYou have been selected as the winner of our $1,000,000 Grand Prize!\n\nTo claim your prize, click here and enter your banking information:\nhttp://claim-prize-now.net/winner\n\nYou must claim within 24 hours or the prize will be forfeited to another winner.\n\nPrize Commission International'
    }
  },
];

async function testEmailSamples() {
  console.log('🧪 Testing Email Samples with Systematic Analyzers\n');
  console.log('=' .repeat(80));

  // Initialize analyzers
  const analyzerRegistry = getAnalyzerRegistry();

  const staticAnalyzers = [
    new UrlEntropyAnalyzer(),
    new SpfAnalyzer(),
    new DkimAnalyzer(),
    new SenderReputationAnalyzer(), // Phase 1
    new LinkReputationAnalyzer(),    // Phase 2
    new AttachmentAnalyzer(),         // Phase 3
    new ContentAnalysisAnalyzer(),    // Phase 4
  ];

  const dynamicAnalyzers = [
    new RedirectAnalyzer(),
    new FormAnalyzer(),
  ];

  staticAnalyzers.forEach(a => analyzerRegistry.register(a));
  dynamicAnalyzers.forEach(a => analyzerRegistry.register(a));

  console.log(`\n✅ Registered ${staticAnalyzers.length + dynamicAnalyzers.length} analyzers:`);
  console.log(`   Static: ${staticAnalyzers.map(a => a.getName()).join(', ')}`);
  console.log(`   Dynamic: ${dynamicAnalyzers.map(a => a.getName()).join(', ')}`);
  console.log();

  const engine = getAnalysisEngine(analyzerRegistry);
  const adapter = new RawEmailAdapter();

  let passCount = 0;
  let failCount = 0;
  const results: any[] = [];

  for (const scenario of emailScenarios) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📧 Testing: ${scenario.label} (${scenario.id})`);
    console.log(`   Category: ${scenario.category.toUpperCase()}`);
    console.log(`   From: ${scenario.data.from}`);
    console.log(`   Subject: ${scenario.data.subject}`);
    console.log('-'.repeat(80));

    // Convert to raw email format (proper MIME format)
    const rawEmail = `MIME-Version: 1.0
From: ${scenario.data.from}
To: ${scenario.data.to}
Subject: ${scenario.data.subject}
Date: ${new Date().toUTCString()}
Content-Type: text/plain; charset=utf-8

${scenario.data.body}`;

    try {
      // Adapt input (adapter expects {rawEmail: string})
      const input = await adapter.adapt({ rawEmail });

      // Analyze (static only for quick test)
      const result = await engine.analyze(input, { mode: 'static' });

      results.push({
        id: scenario.id,
        label: scenario.label,
        expected: scenario.category,
        actual: result.verdict.toLowerCase(),
        score: result.score,
        signals: result.signals.length,
        match: result.verdict.toLowerCase() === scenario.category,
      });

      console.log(`\n📊 Results:`);
      console.log(`   Verdict: ${result.verdict} (score: ${result.score}/10, confidence: ${(result.confidence * 100).toFixed(1)}%)`);
      console.log(`   Expected: ${scenario.category.toUpperCase()}`);
      console.log(`   Match: ${result.verdict.toLowerCase() === scenario.category ? '✅ PASS' : '❌ FAIL'}`);

      if (result.signals.length > 0) {
        console.log(`\n   Signals detected (${result.signals.length}):`);

        // Group signals by analyzer
        const byAnalyzer = result.signals.reduce((acc: any, signal) => {
          if (!acc[signal.analyzerName]) {
            acc[signal.analyzerName] = [];
          }
          acc[signal.analyzerName].push(signal);
          return acc;
        }, {});

        Object.entries(byAnalyzer).forEach(([analyzer, signals]: [string, any]) => {
          console.log(`\n   ${analyzer}:`);
          signals.forEach((signal: any) => {
            console.log(`      • [${signal.severity}] ${signal.signalType} (conf: ${(signal.confidence * 100).toFixed(0)}%)`);
            console.log(`        ${signal.description}`);
          });
        });
      } else {
        console.log(`\n   ℹ️  No signals detected`);
      }

      if (result.redFlags.length > 0) {
        console.log(`\n   🚩 Red Flags:`);
        result.redFlags.forEach((flag: any) => {
          console.log(`      • [${flag.severity}] ${flag.message}`);
        });
      }

      if (result.verdict.toLowerCase() === scenario.category) {
        passCount++;
      } else {
        failCount++;
      }

    } catch (error) {
      console.error(`\n❌ Error analyzing email:`, error);
      failCount++;
      results.push({
        id: scenario.id,
        label: scenario.label,
        expected: scenario.category,
        actual: 'ERROR',
        score: 0,
        signals: 0,
        match: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n📈 SUMMARY\n`);
  console.log(`Total tests: ${emailScenarios.length}`);
  console.log(`Passed: ${passCount} (${((passCount / emailScenarios.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failCount} (${((failCount / emailScenarios.length) * 100).toFixed(1)}%)`);

  console.log(`\n📋 Results by Category:\n`);

  const byCategory = results.reduce((acc: any, r) => {
    if (!acc[r.expected]) {
      acc[r.expected] = { total: 0, passed: 0, failed: 0 };
    }
    acc[r.expected].total++;
    if (r.match) {
      acc[r.expected].passed++;
    } else {
      acc[r.expected].failed++;
    }
    return acc;
  }, {});

  Object.entries(byCategory).forEach(([category, stats]: [string, any]) => {
    const accuracy = ((stats.passed / stats.total) * 100).toFixed(1);
    console.log(`   ${category.toUpperCase()}: ${stats.passed}/${stats.total} correct (${accuracy}%)`);
  });

  console.log(`\n${'='.repeat(80)}`);

  if (failCount > 0) {
    console.log(`\n❌ Failed Tests:\n`);
    results.filter(r => !r.match).forEach(r => {
      console.log(`   ${r.label}: expected ${r.expected}, got ${r.actual} (score: ${r.score})`);
    });
  }

  console.log(`\n✅ Testing complete!`);

  return {
    total: emailScenarios.length,
    passed: passCount,
    failed: failCount,
    accuracy: (passCount / emailScenarios.length) * 100,
  };
}

// Run the test
testEmailSamples()
  .then((stats) => {
    process.exit(stats.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
