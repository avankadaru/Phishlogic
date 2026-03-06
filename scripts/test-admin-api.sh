#!/bin/bash

# PhishLogic Admin API Integration Test Script
# Tests all admin panel endpoints with curl

set -e  # Exit on error

API_URL="${API_URL:-http://localhost:3000}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-Admin@123}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "PhishLogic Admin API Integration Tests"
echo "======================================"
echo ""
echo "API URL: $API_URL"
echo "Admin User: $ADMIN_USER"
echo ""

# Helper function to test endpoint
test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  local expected_status="${5:-200}"

  echo -n "Testing: $name... "

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data")
  elif [ "$method" = "PUT" ]; then
    response=$(curl -s -w "\n%{http_code}" -X PUT "$API_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data")
  elif [ "$method" = "DELETE" ]; then
    response=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json")
  fi

  http_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓${NC} (HTTP $http_code)"
    return 0
  else
    echo -e "${RED}✗${NC} (Expected HTTP $expected_status, got $http_code)"
    echo "Response: $body"
    return 1
  fi
}

# Counter for passed/failed tests
PASSED=0
FAILED=0

# Step 1: Admin Login
echo "======================================"
echo "1. Authentication Tests"
echo "======================================"
echo ""

echo -n "Testing: Admin Login... "
login_response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/auth/login/admin" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

http_code=$(echo "$login_response" | tail -n 1)
body=$(echo "$login_response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}✓${NC} (HTTP $http_code)"
  TOKEN=$(echo "$body" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗${NC} Failed to extract token"
    exit 1
  fi
  echo "Token: ${TOKEN:0:20}..."
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗${NC} (Expected HTTP 200, got $http_code)"
  echo "Response: $body"
  exit 1
fi
echo ""

# Step 2: Create API Key
echo "Testing: Create API Key... "
create_key_response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/admin/keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userName":"Test User","userEmail":"test@example.com"}')

http_code=$(echo "$create_key_response" | tail -n 1)
body=$(echo "$create_key_response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}✓${NC} (HTTP $http_code)"
  API_KEY=$(echo "$body" | grep -o '"apiKey":"pl_[^"]*"' | cut -d'"' -f4)
  KEY_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "API Key: ${API_KEY:0:15}..."
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗${NC} (HTTP $http_code)"
  FAILED=$((FAILED + 1))
fi
echo ""

# Step 3: Verify Auth
if test_endpoint "Verify Auth" "POST" "/api/auth/verify" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi
echo ""

# Step 4: Task Configuration Tests
echo "======================================"
echo "2. Task Configuration Tests"
echo "======================================"
echo ""

if test_endpoint "List All Tasks" "GET" "/api/admin/tasks" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

if test_endpoint "Get Specific Task" "GET" "/api/admin/tasks/url_extraction" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

if test_endpoint "Update Task Config" "PUT" "/api/admin/tasks/url_extraction" \
  '{"enabled":true,"executionMode":"hybrid"}' "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi
echo ""

# Step 5: Cost Analytics Tests
echo "======================================"
echo "3. Cost Analytics Tests"
echo "======================================"
echo ""

if test_endpoint "Get Cost Summary" "GET" "/api/admin/costs/summary" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

if test_endpoint "Get Cost Breakdown" "GET" "/api/admin/costs/breakdown" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

if test_endpoint "Update Budget" "PUT" "/api/admin/costs/budget" \
  '{"monthlyBudgetUsd":1000}' "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi
echo ""

# Step 6: Debug Interface Tests
echo "======================================"
echo "4. Debug Interface Tests"
echo "======================================"
echo ""

if test_endpoint "Get Recent Analyses" "GET" "/api/admin/debug/analyses?limit=5" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

if test_endpoint "Get System Stats" "GET" "/api/admin/debug/stats" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

if test_endpoint "Health Check" "GET" "/api/admin/debug/health" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi
echo ""

# Step 7: Whitelist Management Tests
echo "======================================"
echo "5. Whitelist Management Tests"
echo "======================================"
echo ""

# Create whitelist entry
echo -n "Testing: Add Whitelist Entry... "
whitelist_response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/admin/whitelist" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"domain","value":"google.com","description":"Test whitelist"}')

http_code=$(echo "$whitelist_response" | tail -n 1)
body=$(echo "$whitelist_response" | sed '$d')

if [ "$http_code" = "201" ]; then
  echo -e "${GREEN}✓${NC} (HTTP $http_code)"
  WHITELIST_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗${NC} (HTTP $http_code)"
  FAILED=$((FAILED + 1))
fi

if test_endpoint "List Whitelist Entries" "GET" "/api/admin/whitelist" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

if test_endpoint "Get Whitelist Stats" "GET" "/api/admin/whitelist/stats" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

# Delete whitelist entry if created
if [ ! -z "$WHITELIST_ID" ]; then
  if test_endpoint "Delete Whitelist Entry" "DELETE" "/api/admin/whitelist/$WHITELIST_ID" "" "200"; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
  fi
fi
echo ""

# Step 8: Notification Tests
echo "======================================"
echo "6. Notification Tests"
echo "======================================"
echo ""

# Create notification
echo -n "Testing: Create Notification... "
notification_response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/admin/notifications" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"webhook","name":"Test Webhook","enabled":true,"config":{"url":"https://example.com/webhook"},"triggers":["malicious_detected"]}')

http_code=$(echo "$notification_response" | tail -n 1)
body=$(echo "$notification_response" | sed '$d')

if [ "$http_code" = "201" ]; then
  echo -e "${GREEN}✓${NC} (HTTP $http_code)"
  NOTIFICATION_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗${NC} (HTTP $http_code)"
  FAILED=$((FAILED + 1))
fi

if test_endpoint "List Notifications" "GET" "/api/admin/notifications" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

# Delete notification if created
if [ ! -z "$NOTIFICATION_ID" ]; then
  if test_endpoint "Delete Notification" "DELETE" "/api/admin/notifications/$NOTIFICATION_ID" "" "200"; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
  fi
fi
echo ""

# Step 9: System Settings Tests
echo "======================================"
echo "7. System Settings Tests"
echo "======================================"
echo ""

if test_endpoint "Get All Settings" "GET" "/api/admin/settings" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

if test_endpoint "Update Setting" "PUT" "/api/admin/settings/test_setting" \
  '{"value":"test_value","description":"Test setting"}' "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi
echo ""

# Step 10: API Key Management Tests
echo "======================================"
echo "8. API Key Management Tests"
echo "======================================"
echo ""

if test_endpoint "List API Keys" "GET" "/api/admin/keys" "" "200"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

# Revoke API key if created
if [ ! -z "$KEY_ID" ]; then
  if test_endpoint "Revoke API Key" "DELETE" "/api/admin/keys/$KEY_ID" "" "200"; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
  fi
fi
echo ""

# Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total: $((PASSED + FAILED))"
echo ""

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}"
  exit 1
fi
