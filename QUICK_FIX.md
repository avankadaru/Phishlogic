# Quick Fix Guide - Immediate Solutions

## Fix 1: Tasks Page "No integration tasks configured" Error

### Step 1: Check if data exists
```bash
npx tsx scripts/check-integration-tasks.ts
```

### Step 2: If no data found, seed it
```bash
PGPASSWORD=phishlogic_dev_password psql -h localhost -U phishlogic -d Phishlogic << 'EOF'
INSERT INTO integration_tasks (integration_name, display_name, description, input_type, enabled, execution_mode, fallback_to_native)
VALUES
  ('gmail', 'Gmail Integration', 'Analyze emails from Gmail', 'email', true, 'native', true),
  ('chrome', 'Chrome Extension', 'Analyze URLs from Chrome extension', 'url', true, 'native', true)
ON CONFLICT (integration_name) DO NOTHING;

SELECT integration_name, display_name, enabled FROM integration_tasks WHERE deleted_at IS NULL;
EOF
```

### Step 3: Refresh Tasks page
- Reload the browser page
- Should now show Gmail and Chrome integrations

---

## Fix 2: False Positive Malicious Verdicts

### Quick Solution 1: Add to Whitelist (Recommended for immediate fix)

1. **Navigate to Whitelist page** in Admin UI
2. **Click "Add Entry"**
3. Fill in:
   - **Type:** `domain`
   - **Value:** `example.com` (replace with the false positive domain)
   - **Trust Level:** `HIGH`
   - **Description:** `Legitimate site - false positive`
4. **Click Save**

### Quick Solution 2: Reduce Analyzer Sensitivity via Database

```bash
PGPASSWORD=phishlogic_dev_password psql -h localhost -U phishlogic -d Phishlogic << 'EOF'
-- Reduce weights for FormAnalyzer and RedirectAnalyzer
UPDATE analyzers
SET default_weight = 1.0
WHERE analyzer_name IN ('FormAnalyzer', 'RedirectAnalyzer');

-- Verify change
SELECT analyzer_name, default_weight FROM analyzers WHERE analyzer_name IN ('FormAnalyzer', 'RedirectAnalyzer');
EOF
```

Then restart the backend:
```bash
# Stop backend (Ctrl+C)
npm run dev
```

### Quick Solution 3: Temporarily Disable Problematic Analyzers

Via Admin UI:
1. Navigate to **Tasks** page
2. Expand **Gmail** integration
3. Click **Configure Analyzers** button
4. Scroll to **Links** section
5. **Toggle OFF** the following:
   - [ ] Form Detection
   - [ ] Redirect Detection
6. Click **Save Configuration**

### Verify the Fix

Re-test the content:
```bash
# Via curl (replace URL)
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "source": "manual-test"
  }'
```

Check Debug page - verdict should now be "Safe"

---

## Still Having Issues?

### Run Full Diagnostics:

```bash
# 1. Check database migration
npx tsx scripts/verify-task-based-migration.ts

# 2. Debug false positives
npx tsx scripts/debug-false-positive.ts

# 3. Check integration tasks
npx tsx scripts/check-integration-tasks.ts
```

### Check Backend Logs:

```bash
# If using pm2
pm2 logs

# If using npm run dev
# Check terminal output

# Check error logs
tail -f logs/error.log
```

### Database Connection Test:

```bash
PGPASSWORD=phishlogic_dev_password psql -h localhost -U phishlogic -d Phishlogic -c "\dt"
```

Should show tables including:
- `integration_tasks`
- `integration_analyzers`
- `tasks`
- `analyzers`
- `api_credentials`

---

## Configuration Check

Verify `.env` file has these settings:
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Phishlogic
DB_USER=phishlogic
DB_PASSWORD=phishlogic_dev_password
DB_SSL=false

# Server
PORT=3000

# Auth
JWT_SECRET=phishlogic-dev-jwt-secret-key-change-in-production-min-32-chars

# Thresholds (optional - adjust if needed)
THRESHOLD_MALICIOUS=0.75   # Increase to reduce false positives
THRESHOLD_SUSPICIOUS=0.45
```

---

## Contact

If issues persist after trying these fixes, check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions.
