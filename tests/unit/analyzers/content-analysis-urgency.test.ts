/**
 * Tests for the deterministic urgency-language detector used by
 * ContentAnalysisAnalyzer. Imports the pure helper module directly so we
 * don't transitively load the `natural` NLP package (ESM-only deps).
 */

import { detectUrgencyLanguage } from '../../../src/core/analyzers/ml/urgency-detector.js';

describe('urgency-detector (ContentAnalysisAnalyzer urgency_language_detected)', () => {
  it('fires on hard-urgency subject phrases (URGENT:, account will be closed)', () => {
    const result = detectUrgencyLanguage(
      'URGENT: Account will be closed in 24 hours',
      'Dear customer, please review your account status.'
    );

    expect(result.firesBySubject).toBe(true);
    expect(result.subjectMatches.length).toBeGreaterThan(0);
  });

  it('fires when the body combines an urgency token with an action token', () => {
    const result = detectUrgencyLanguage(
      'Account update',
      'Please verify your account immediately to avoid suspension.'
    );

    expect(result.firesByBody).toBe(true);
    expect(result.bodyUrgencyMatches.length).toBeGreaterThan(0);
    expect(result.bodyActionMatches.length).toBeGreaterThan(0);
  });

  it('does NOT fire on plain receipt / confirmation copy', () => {
    const result = detectUrgencyLanguage(
      'Your receipt from Acme Coffee',
      'Thanks for your purchase. Your order #1234 will arrive on Thursday.'
    );

    expect(result.firesBySubject).toBe(false);
    expect(result.firesByBody).toBe(false);
  });

  it('does NOT fire when the body has urgency without an action token', () => {
    const result = detectUrgencyLanguage(
      'Status update',
      'This is an urgent weather notice for your area. Stay safe.'
    );

    expect(result.firesBySubject).toBe(false);
    expect(result.firesByBody).toBe(false);
  });

  it('does NOT fire when the body has only an action token without urgency', () => {
    const result = detectUrgencyLanguage(
      'Welcome',
      'Please verify your email address when you have a moment.'
    );

    expect(result.firesBySubject).toBe(false);
    expect(result.firesByBody).toBe(false);
  });

  it('matches "Final notice" and "act now" subject phrases', () => {
    const a = detectUrgencyLanguage(
      'Final Notice: action required',
      'Please log in.'
    );
    const b = detectUrgencyLanguage(
      'Act now to secure your account',
      'Hello.'
    );

    expect(a.firesBySubject).toBe(true);
    expect(b.firesBySubject).toBe(true);
  });

  it('matches the malicious-urgency scenario subject', () => {
    const result = detectUrgencyLanguage(
      'URGENT: Account will be closed in 24 hours',
      'Click here to verify your account immediately.'
    );

    expect(result.firesBySubject).toBe(true);
    expect(result.firesByBody).toBe(true);
  });
});
