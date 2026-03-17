/**
 * Quick test script to verify domain pattern matching fix
 * Run with: npx tsx scripts/test-domain-patterns.ts
 */

import { SenderReputationAnalyzer } from '../src/core/analyzers/reputation/sender-reputation.analyzer.js';

const analyzer = new SenderReputationAnalyzer();

// Access private method using type assertion
const testPattern = (domain: string): boolean => {
  return (analyzer as any).hasSuspiciousDomainPattern(domain);
};

console.log('\n🧪 Testing Domain Pattern Matching Fix\n');
console.log('=' .repeat(60));

// Test legitimate domains (should NOT flag)
console.log('\n✅ LEGITIMATE DOMAINS (should be false):');
const legitimateDomains = [
  'paypal.com',
  'google.com',
  'amazon.com',
  'facebook.com',
  'apple.com',
  'microsoft.com',
  'paypal.org',
  'pay.paypal.com',
];

let passCount = 0;
let failCount = 0;

legitimateDomains.forEach(domain => {
  const result = testPattern(domain);
  const status = result ? '❌ FAIL' : '✅ PASS';
  console.log(`  ${status} ${domain.padEnd(25)} → ${result}`);
  if (!result) passCount++;
  else failCount++;
});

// Test typosquatting domains (should flag)
console.log('\n❌ TYPOSQUATTING DOMAINS (should be true):');
const typoSquattingDomains = [
  'paypa1.com',
  'g00gle.com',
  'amaz0n.com',
  'faceb00k.com',
  'appl3.com',
  'micr0s0ft.com',
  'login.paypa1.com',
];

typoSquattingDomains.forEach(domain => {
  const result = testPattern(domain);
  const status = result ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${status} ${domain.padEnd(25)} → ${result}`);
  if (result) passCount++;
  else failCount++;
});

// Test excessive hyphens (more than 3 hyphens)
console.log('\n⚠️  EXCESSIVE HYPHENS (should be true):');
const hyphenDomains = [
  'pay-pal-login-secure-verify.com',  // 4 hyphens
  'a-b-c-d-e.com',                     // 4 hyphens
];

hyphenDomains.forEach(domain => {
  const result = testPattern(domain);
  const status = result ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${status} ${domain.padEnd(25)} → ${result}`);
  if (result) passCount++;
  else failCount++;
});

// Test edge cases
console.log('\n🔍 EDGE CASES:');
const normalHyphenDomain = 'pay-pal-login.com'; // 3 hyphens, should be false
const result = testPattern(normalHyphenDomain);
const status = !result ? '✅ PASS' : '❌ FAIL';
console.log(`  ${status} ${normalHyphenDomain.padEnd(25)} → ${result} (3 hyphens, OK)`);
if (!result) passCount++;
else failCount++;

// Summary
console.log('\n' + '='.repeat(60));
console.log(`\n📊 SUMMARY: ${passCount}/${passCount + failCount} tests passed`);

if (failCount === 0) {
  console.log('\n✅ All tests passed! Domain pattern matching fix is working correctly.\n');
  process.exit(0);
} else {
  console.log(`\n❌ ${failCount} test(s) failed. Please review the fix.\n`);
  process.exit(1);
}
