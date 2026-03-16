/**
 * Test Script: API Credentials CRUD Operations
 *
 * Tests the credentials management API:
 * - Create new credential
 * - Read/list credentials
 * - Update credential
 * - Test credential connection
 * - Delete credential
 * - Verify encryption (check sanitized keys)
 */

import axios from 'axios';
import { getLogger } from '../src/infrastructure/logging/index.js';

const logger = getLogger();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const JWT_TOKEN = process.env.JWT_TOKEN || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: JWT_TOKEN ? { Authorization: `Bearer ${JWT_TOKEN}` } : {},
});

async function testCredentialsAPI() {
  console.log('\n========================================');
  console.log('API CREDENTIALS CRUD TEST');
  console.log('========================================\n');

  let testCredentialId: string | null = null;

  try {
    // 1. List existing credentials
    console.log('1. Listing existing credentials...');
    const listResponse = await api.get('/admin/credentials');
    console.log(`   ✓ Found ${listResponse.data.credentials.length} existing credentials`);
    console.log(`   ✓ Encryption secure: ${listResponse.data.encryptionSecure}`);

    if (!listResponse.data.encryptionSecure) {
      console.log('   ⚠️  Warning: Using insecure encryption key (development only)');
    }

    // 2. Create new test credential
    console.log('\n2. Creating new test credential...');
    const createPayload = {
      credentialName: 'test_virustotal_credential',
      displayName: 'Test VirusTotal Credential',
      description: 'Test credential for automated testing',
      provider: 'virustotal',
      apiKey: 'test-api-key-1234567890abcdef',
      rateLimitPerDay: 500,
    };

    const createResponse = await api.post('/admin/credentials', createPayload);
    testCredentialId = createResponse.data.id;

    console.log(`   ✓ Created credential with ID: ${testCredentialId}`);
    console.log(`   ✓ API Key sanitized: ${createResponse.data.apiKeySanitized}`);

    // Verify key is sanitized (should not be full key)
    if (createResponse.data.apiKeySanitized === createPayload.apiKey) {
      console.log('   ✗ API key was NOT sanitized (security issue!)');
      throw new Error('API key sanitization failed');
    }

    // 3. Read the created credential
    console.log('\n3. Reading created credential...');
    const getResponse = await api.get(`/admin/credentials/${testCredentialId}`);
    console.log(`   ✓ Retrieved credential: ${getResponse.data.displayName}`);
    console.log(`   ✓ Provider: ${getResponse.data.provider}`);
    console.log(`   ✓ Active: ${getResponse.data.isActive}`);

    // 4. Update credential
    console.log('\n4. Updating credential...');
    const updatePayload = {
      displayName: 'Test VirusTotal Credential (Updated)',
      rateLimitPerDay: 1000,
      description: 'Updated description for testing',
    };

    const updateResponse = await api.put(`/admin/credentials/${testCredentialId}`, updatePayload);
    console.log(`   ✓ Updated credential`);
    console.log(`   ✓ New display name: ${updateResponse.data.displayName}`);
    console.log(`   ✓ New rate limit: ${updateResponse.data.rateLimitPerDay}`);

    // 5. Test credential connection (may fail since it's a test key)
    console.log('\n5. Testing credential connection...');
    try {
      const testResponse = await api.post(`/admin/credentials/${testCredentialId}/test`);
      console.log(`   ✓ Test successful: ${testResponse.data.message}`);
    } catch (error: any) {
      if (error.response?.status === 500) {
        console.log('   ⚠️  Test failed (expected for test API key)');
        console.log(`   ℹ️  Message: ${error.response?.data?.message || 'Connection test failed'}`);
      } else {
        throw error;
      }
    }

    // 6. List credentials again (should have +1)
    console.log('\n6. Listing credentials after creation...');
    const listAfterResponse = await api.get('/admin/credentials');
    console.log(`   ✓ Total credentials: ${listAfterResponse.data.credentials.length}`);

    const ourCredential = listAfterResponse.data.credentials.find(
      (c: any) => c.id === testCredentialId
    );

    if (ourCredential) {
      console.log(`   ✓ Found our test credential in list`);
    } else {
      console.log(`   ✗ Test credential not found in list`);
    }

    // 7. Delete test credential
    console.log('\n7. Deleting test credential...');
    await api.delete(`/admin/credentials/${testCredentialId}`);
    console.log(`   ✓ Credential deleted successfully`);

    // 8. Verify deletion
    console.log('\n8. Verifying deletion...');
    try {
      await api.get(`/admin/credentials/${testCredentialId}`);
      console.log('   ✗ Credential still exists after deletion!');
      throw new Error('Deletion verification failed');
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('   ✓ Credential not found (successfully deleted)');
      } else {
        throw error;
      }
    }

    // Summary
    console.log('\n========================================');
    console.log('✓ ALL API CREDENTIALS TESTS PASSED');
    console.log('========================================\n');

    process.exit(0);
  } catch (error: any) {
    logger.error({
      msg: 'API credentials test failed',
      error: error instanceof Error ? error.message : String(error),
    });

    console.error('\n✗ TEST FAILED');
    console.error('Error:', error.response?.data || error.message);

    // Cleanup: try to delete test credential if it was created
    if (testCredentialId) {
      try {
        await api.delete(`/admin/credentials/${testCredentialId}`);
        console.log('Cleanup: Test credential deleted');
      } catch {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Check if JWT token is provided
if (!JWT_TOKEN) {
  console.error('\n⚠️  JWT_TOKEN environment variable not set');
  console.error('Usage: JWT_TOKEN=your-token npx tsx scripts/test-credentials-api.ts\n');
  console.error('To get a token:');
  console.error('1. Login to the admin UI');
  console.error('2. Open browser DevTools > Application > Local Storage');
  console.error('3. Copy the "token" value\n');
  process.exit(1);
}

testCredentialsAPI();
