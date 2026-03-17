#!/bin/bash

# Test Whitelist API with New Fields
echo "=== Testing Whitelist Refactoring API ==="

# Test 1: Add whitelist entry with new fields
echo -e "\n1. Adding trusted whitelist entry..."
ADD_RESPONSE=$(curl -s -X POST http://localhost:3000/api/admin/whitelist \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "value": "api-test@example.com",
    "description": "API test entry",
    "isTrusted": true,
    "scanAttachments": true,
    "scanRichContent": false
  }')

ENTRY_ID=$(echo "$ADD_RESPONSE" | jq -r '.data.id')
echo "✓ Entry added with ID: $ENTRY_ID"
echo "  Fields: $(echo "$ADD_RESPONSE" | jq '{isTrusted: .data.isTrusted, scanAttachments: .data.scanAttachments, scanRichContent: .data.scanRichContent}')"

# Test 2: Get all whitelist entries
echo -e "\n2. Retrieving all whitelist entries..."
GET_ALL=$(curl -s http://localhost:3000/api/admin/whitelist)
COUNT=$(echo "$GET_ALL" | jq '.data | length')
echo "✓ Found $COUNT whitelist entries"

# Test 3: Get specific entry
echo -e "\n3. Retrieving specific entry..."
GET_ONE=$(curl -s http://localhost:3000/api/admin/whitelist/$ENTRY_ID)
echo "✓ Entry retrieved:"
echo "$GET_ONE" | jq '{type: .data.type, value: .data.value, isTrusted: .data.isTrusted, scanAttachments: .data.scanAttachments, scanRichContent: .data.scanRichContent}'

# Test 4: Test email analysis with trusted sender
echo -e "\n4. Testing email analysis from trusted sender..."
ANALYSIS_ID="api-test-$(date +%s)"
ANALYSIS_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/analyze/email \
  -H "Content-Type: application/json" \
  -d "{
    \"analysisId\": \"$ANALYSIS_ID\",
    \"uiTimestamp\": $(date +%s000),
    \"executionMode\": \"native\",
    \"rawEmail\": \"From: api-test@example.com\nTo: user@example.com\nSubject: Test Email\n\nCheck out https://example.com\"
  }")

echo "✓ Analysis completed:"
echo "$ANALYSIS_RESPONSE" | jq '{verdict: .verdict, confidence: .confidence, analyzersRun: .metadata.analyzersRun | length}'

# Test 5: Clean up
echo -e "\n5. Cleaning up test entry..."
DELETE_RESPONSE=$(curl -s -X DELETE http://localhost:3000/api/admin/whitelist/$ENTRY_ID)
echo "✓ Entry deleted: $(echo "$DELETE_RESPONSE" | jq -r '.message // .success')"

echo -e "\n=== All API Tests Completed! ==="
