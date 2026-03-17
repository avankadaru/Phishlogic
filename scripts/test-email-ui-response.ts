#!/usr/bin/env tsx
/**
 * Test script to verify email analysis API response structure
 */

import axios from 'axios';

async function testEmailAnalysis() {
  try {
    const analysisId = crypto.randomUUID();
    const uiTimestamp = Date.now();

    const rawEmail = `From: test@example.com
To: user@example.com
Subject: Test Email

This is a test email body.`;

    console.log('📧 Sending email analysis request...');
    console.log('Analysis ID:', analysisId);
    console.log('');

    const response = await axios.post('http://localhost:3000/api/v1/analyze/email', {
      analysisId,
      uiTimestamp,
      executionMode: 'native',
      rawEmail
    });

    console.log('✅ Response received');
    console.log('Status:', response.status);
    console.log('');

    console.log('📊 Response Data Structure:');
    console.log('- verdict:', response.data.verdict);
    console.log('- confidence:', response.data.confidence);
    console.log('- score:', response.data.score);
    console.log('- redFlags count:', response.data.redFlags?.length || 0);
    console.log('- metadata.duration:', response.data.metadata?.duration);
    console.log('- executionMode (top level):', response.data.executionMode);
    console.log('- aiProvider (top level):', response.data.aiProvider);
    console.log('- processingTimeMs (top level):', response.data.processingTimeMs);
    console.log('');

    console.log('🔍 Full Response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testEmailAnalysis();
