#!/usr/bin/env tsx

/**
 * Submit a test email and get analysis ID
 */

import { randomUUID } from 'crypto';

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

async function submitTestEmail() {
  const analysisId = randomUUID();

  // Create a phishing test email with suspicious domain
  const rawEmail = createRawEmail(
    'security@paypa1.com',  // Typosquatting domain (paypa1 instead of paypal)
    'victim@example.com',
    'URGENT: Verify your PayPal account NOW',
    `Dear valued customer,

Your account will be locked in 24 hours due to suspicious activity. Click here to verify immediately:

http://paypa1-verify.com/login

Enter your email and password to restore full access.

Failure to verify will result in permanent account suspension.`
  );

  console.log('\n🔍 Submitting test email to API...\n');
  console.log(`Analysis ID: ${analysisId}`);
  console.log(`Test Domain: paypa1.com (typosquatting)\n`);

  const response = await fetch('http://localhost:3000/api/v1/analyze/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rawEmail,
      analysisId,
      uiTimestamp: Date.now(),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ API returned ${response.status}: ${errorText}`);
    process.exit(1);
  }

  const result = await response.json();

  console.log('✅ Analysis completed!\n');
  console.log('=== Results ===\n');
  console.log(`Verdict: ${result.verdict}`);
  console.log(`Score: ${result.score}/10`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`Alert Level: ${result.alertLevel}`);
  console.log(`Duration: ${result.metadata.duration}ms`);

  console.log('\n=== Analyzers Run ===\n');
  result.metadata.analyzersRun?.forEach((analyzer: string) => {
    console.log(`- ${analyzer}`);
  });

  console.log('\n=== Red Flags ===\n');
  result.redFlags?.forEach((flag: any) => {
    console.log(`- [${flag.severity}] ${flag.message}`);
  });

  console.log('\n=== Execution Steps ===\n');
  const analyzerSteps = result.metadata.executionSteps?.filter(
    (step: any) => step.step.includes('analyzer_') && (step.step.includes('_completed') || step.step.includes('_failed'))
  ) || [];

  analyzerSteps.forEach((step: any) => {
    const analyzerName = step.step.replace('analyzer_', '').replace('_completed', '').replace('_failed', '');
    const duration = step.duration !== undefined ? `${step.duration}ms` : 'N/A';
    const status = step.status || 'unknown';
    const icon = status === 'completed' ? '✓' : '✗';
    console.log(`${icon} ${analyzerName}: ${duration} [${status}]`);
    if (step.context) {
      console.log(`   Signals: ${step.context.signalCount || 0}`);
    }
  });

  console.log(`\n📝 Analysis ID: ${analysisId}`);
  console.log(`\nYou can view this analysis in the Debug UI at:`);
  console.log(`http://localhost:5173/debug?id=${analysisId}\n`);

  process.exit(0);
}

submitTestEmail().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
