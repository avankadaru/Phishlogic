# PhishLogic Backend Testing Guide

Complete guide for testing the PhishLogic Admin Backend.

## Prerequisites

1. **PostgreSQL** installed and running
2. **Database** created and migrated
3. **Server** running on port 3000

## Quick Start

### 1. Set Up Database

```bash
# Create database
sudo -u postgres psql << EOF
CREATE DATABASE phishlogic;
CREATE USER phishlogic WITH PASSWORD 'phishlogic_dev_password';
GRANT ALL PRIVILEGES ON DATABASE phishlogic TO phishlogic;
\q
EOF

# Run migration
psql -U phishlogic -d phishlogic -h localhost < src/infrastructure/database/migrations/001_initial_schema.sql
```

### 2. Start Server

```bash
npm run dev
```

Server should start on `http://localhost:3000`.

### 3. Run Integration Tests

```bash
./scripts/test-admin-api.sh
```

Expected output:
```
====================================
PhishLogic Admin API Integration Tests
====================================

API URL: http://localhost:3000
Admin User: admin

====================================
1. Authentication Tests
====================================

Testing: Admin Login... ✓ (HTTP 200)
Token: eyJhbGciOiJIUzI1NiIs...

Testing: Create API Key... ✓ (HTTP 200)
API Key: pl_abc123...

Testing: Verify Auth... ✓ (HTTP 200)

====================================
2. Task Configuration Tests
====================================

Testing: List All Tasks... ✓ (HTTP 200)
Testing: Get Specific Task... ✓ (HTTP 200)
Testing: Update Task Config... ✓ (HTTP 200)

... [more tests] ...

====================================
Test Summary
====================================
Passed: 25
Failed: 0
Total: 25

All tests passed!
```

---

## Manual Testing with curl

### 1. Authentication

#### Admin Login
```bash
curl -X POST http://localhost:3000/api/auth/login/admin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGci...",
  "user": {
    "id": "...",
    "username": "admin",
    "email": "admin@phishlogic.local",
    "role": "admin"
  }
}
```

**Save token:**
```bash
export TOKEN="<paste token here>"
```

#### Create API Key
```bash
curl -X POST http://localhost:3000/api/admin/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "userName": "John Doe",
    "userEmail": "john@example.com",
    "expiresInDays": 365
  }'
```

**Response:**
```json
{
  "success": true,
  "apiKey": "pl_a1b2c3d4e5...",
  "keyInfo": {
    "id": "...",
    "name": "API Key for John Doe",
    "user_name": "John Doe",
    "expires_at": "2027-03-06T..."
  }
}
```

### 2. Task Configuration

#### List All Tasks
```bash
curl http://localhost:3000/api/admin/tasks \
  -H "Authorization: Bearer $TOKEN"
```

#### Get Specific Task
```bash
curl http://localhost:3000/api/admin/tasks/url_extraction \
  -H "Authorization: Bearer $TOKEN"
```

#### Update Task
```bash
curl -X PUT http://localhost:3000/api/admin/tasks/url_extraction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "enabled": true,
    "executionMode": "hybrid",
    "aiProvider": "anthropic",
    "aiModel": "claude-3-sonnet"
  }'
```

### 3. Cost Analytics

#### Get Cost Summary
```bash
curl http://localhost:3000/api/admin/costs/summary \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "startDate": "2026-03-01T...",
      "endDate": "2026-03-06T..."
    },
    "summary": {
      "totalCost": 125.45,
      "totalRequests": 1500,
      "avgCostPerRequest": 0.084,
      "monthlyBudget": 1000,
      "budgetUtilization": 12.55,
      "budgetRemaining": 874.55
    },
    "byProvider": [...],
    "byTask": [...],
    "dailyTrend": [...]
  }
}
```

#### Get Cost Breakdown
```bash
curl "http://localhost:3000/api/admin/costs/breakdown?provider=anthropic" \
  -H "Authorization: Bearer $TOKEN"
```

#### Update Budget
```bash
curl -X PUT http://localhost:3000/api/admin/costs/budget \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"monthlyBudgetUsd": 1500}'
```

### 4. Debug Interface

#### Get Recent Analyses
```bash
curl "http://localhost:3000/api/admin/debug/analyses?limit=10&verdict=Malicious" \
  -H "Authorization: Bearer $TOKEN"
```

#### Get Analysis by ID
```bash
curl http://localhost:3000/api/admin/debug/analyses/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN"
```

#### Get System Stats
```bash
curl http://localhost:3000/api/admin/debug/stats \
  -H "Authorization: Bearer $TOKEN"
```

#### Health Check
```bash
curl http://localhost:3000/api/admin/debug/health \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Whitelist Management

#### Add Whitelist Entry
```bash
curl -X POST http://localhost:3000/api/admin/whitelist \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "domain",
    "value": "google.com",
    "description": "Google is safe"
  }'
```

#### List Whitelist Entries
```bash
curl http://localhost:3000/api/admin/whitelist \
  -H "Authorization: Bearer $TOKEN"
```

#### Get Whitelist Stats
```bash
curl http://localhost:3000/api/admin/whitelist/stats \
  -H "Authorization: Bearer $TOKEN"
```

#### Update Whitelist Entry
```bash
curl -X PUT http://localhost:3000/api/admin/whitelist/<entry-id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "description": "Updated description",
    "active": true
  }'
```

#### Delete Whitelist Entry
```bash
curl -X DELETE http://localhost:3000/api/admin/whitelist/<entry-id> \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Notifications

#### Create Webhook Notification
```bash
curl -X POST http://localhost:3000/api/admin/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "webhook",
    "name": "Slack Alerts",
    "enabled": true,
    "config": {
      "url": "https://hooks.slack.com/services/..."
    },
    "triggers": ["malicious_detected", "error"],
    "filters": {
      "minConfidence": 0.8
    }
  }'
```

#### List Notifications
```bash
curl http://localhost:3000/api/admin/notifications \
  -H "Authorization: Bearer $TOKEN"
```

#### Test Notification
```bash
curl -X POST http://localhost:3000/api/admin/notifications/<notification-id>/test \
  -H "Authorization: Bearer $TOKEN"
```

#### Delete Notification
```bash
curl -X DELETE http://localhost:3000/api/admin/notifications/<notification-id> \
  -H "Authorization: Bearer $TOKEN"
```

### 7. System Settings

#### Get All Settings
```bash
curl http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer $TOKEN"
```

#### Update Setting
```bash
curl -X PUT http://localhost:3000/api/admin/settings/max_analysis_retries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "value": 3,
    "description": "Maximum analysis retry attempts"
  }'
```

#### Bulk Update Settings
```bash
curl -X PUT http://localhost:3000/api/admin/settings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "log_retention_days": 90,
    "email_notification_enabled": true,
    "max_concurrent_analyses": 10
  }'
```

---

## Unit Tests

Unit tests are available but have mocking complexities. To run them:

```bash
npm test -- tests/unit/admin
```

**Note:** Some tests may fail due to database connection attempts. Integration tests (above) are more reliable for end-to-end validation.

---

## Troubleshooting

### Server Won't Start

**Error:** `Failed to initialize database`

**Solution:**
```bash
# Check PostgreSQL is running
brew services list | grep postgresql
# or
sudo systemctl status postgresql

# Test connection
psql -U phishlogic -d phishlogic -h localhost -c "SELECT 1"
```

### Authentication Failed

**Error:** `Invalid username or password`

**Solution:**
```bash
# Check admin user exists
psql -U phishlogic -d phishlogic -h localhost -c "SELECT username FROM admin_users"

# Re-run migration if needed
psql -U phishlogic -d phishlogic -h localhost < src/infrastructure/database/migrations/001_initial_schema.sql
```

### JWT Token Expired

**Error:** `Unauthorized: No valid authentication provided`

**Solution:**
- Tokens expire after 30 days (default)
- Login again to get a new token

### API Key Not Working

**Error:** `API key has been deactivated` or `API key has expired`

**Solution:**
```bash
# Check API key status
psql -U phishlogic -d phishlogic -h localhost -c "SELECT key_prefix, is_active, expires_at FROM api_keys WHERE key_prefix = 'pl_...';"

# Create new API key if needed
curl -X POST http://localhost:3000/api/admin/keys \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userName":"Test User","userEmail":"test@example.com"}'
```

---

## Test Coverage

Current test coverage:

| Component | Unit Tests | Integration Tests |
|-----------|------------|-------------------|
| Auth Controller | ✅ | ✅ |
| Task Config | ✅ | ✅ |
| Cost Analytics | ✅ | ✅ |
| Debug Interface | ✅ | ✅ |
| Whitelist | ✅ | ✅ |
| Notifications | ✅ | ✅ |
| Settings | ✅ | ✅ |
| Middleware | ⏳ | ✅ |

---

## Next Steps

After backend testing is complete:

1. **Build React Frontend** - Admin UI with authentication
2. **E2E Tests** - Playwright/Cypress for full user flows
3. **Load Testing** - k6 or Artillery for performance
4. **Security Audit** - Penetration testing, OWASP checks

---

## Quick Reference

**Default Credentials:**
- Username: `admin`
- Password: `Admin@123`

**API Base URL:**
- Development: `http://localhost:3000`
- Production: (Configure in .env)

**Database:**
- Host: `localhost`
- Port: `5432`
- Database: `phishlogic`
- User: `phishlogic`

**Endpoints:**
- Auth: `/api/auth/*`
- Admin: `/api/admin/*`
- Health: `/health`

---

For detailed API documentation, see [ADMIN_BACKEND_SETUP.md](ADMIN_BACKEND_SETUP.md).
