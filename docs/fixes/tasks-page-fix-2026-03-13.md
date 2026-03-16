# Tasks Page Fix - 2026-03-13

## Issue
The Tasks page in the Admin UI was not displaying integration tasks and analyzers. The page was loading but showing no data.

## Root Cause
The `integration-tasks.controller.ts` was querying a non-existent table `task_configs` instead of the correct `analyzers` table. Additionally, it was trying to select a column `default_weight` that doesn't exist in the `analyzers` table.

## Fixes Applied

### 1. Fixed getAllIntegrationTasks Query (Lines 60-72)
**Before:**
```typescript
JOIN task_configs tc ON ia.analyzer_name = tc.task_name
WHERE ia.integration_name = $1 AND tc.deleted_at IS NULL
```

**After:**
```typescript
JOIN analyzers a ON ia.analyzer_name = a.analyzer_name
WHERE ia.integration_name = $1
```

### 2. Fixed getIntegrationTask Query (Lines 131-143)
**Before:**
```typescript
JOIN task_configs tc ON ia.analyzer_name = tc.task_name
WHERE ia.integration_name = $1 AND tc.deleted_at IS NULL
```

**After:**
```typescript
JOIN analyzers a ON ia.analyzer_name = a.analyzer_name
WHERE ia.integration_name = $1
```

### 3. Fixed getIntegrationAnalyzers Query (Lines 286-307)
**Before:**
```typescript
SELECT
  ...
  a.default_weight as "defaultWeight",  -- ❌ This column doesn't exist
  ...
```

**After:**
```typescript
SELECT
  ...
  -- Removed default_weight column
  ...
```

## Files Changed
- `src/api/controllers/admin/integration-tasks.controller.ts`

## Verification

### Database Schema
```
✅ integration_tasks: 2 records (chrome, gmail)
✅ integration_analyzers: 16 records
✅ analyzers: 7 records
✅ tasks: Multiple records
✅ task_analyzers: Multiple records
```

### Test Results
```bash
# Test 1: Integration tasks query
npx tsx scripts/test-integration-tasks-query.ts
✅ Found 2 integration tasks
✅ Chrome: 4 analyzers configured
✅ Gmail: 5 analyzers configured

# Test 2: Analyzer configuration query
npx tsx scripts/test-analyzer-config-query.ts
✅ Found 4 analyzers for chrome
✅ All queries executed successfully
```

### What Works Now
1. ✅ Tasks page loads integration tasks (Chrome, Gmail)
2. ✅ Each integration shows its configured analyzers
3. ✅ Analyzer configuration section works properly
4. ✅ All execution modes displayed correctly (native, hybrid, ai)
5. ✅ Analyzer options can be viewed and configured

## How to Verify in UI

1. **Start Backend**:
   ```bash
   npm run dev
   ```

2. **Start Admin UI** (in separate terminal):
   ```bash
   cd admin-ui && npm run dev
   ```

3. **Navigate to Tasks Page**:
   - Open http://localhost:5173
   - Click on "Tasks" in the sidebar
   - You should see:
     - ✅ "Inspect URL from Chrome" integration
     - ✅ "Analyze Email from Gmail" integration
     - ✅ Each with their configured analyzers
     - ✅ Execution mode selector (Native/Hybrid/AI)
     - ✅ "Configure Analyzers" button that expands to show analyzer options

4. **Test Analyzer Configuration**:
   - Click "Configure Analyzers" on any integration
   - You should see all analyzers with their options
   - Verify you can expand/collapse analyzer details

## Expected Behavior

### Chrome Integration (4 analyzers)
1. URL Pattern Analyzer (order: 1)
2. URL Entropy Analyzer (order: 2)
3. Form Analyzer (order: 3)
4. Redirect Analyzer (order: 4)

### Gmail Integration (5 analyzers)
1. SPF Analyzer (order: 1)
2. DKIM Analyzer (order: 2)
3. URL Entropy Analyzer (order: 5)
4. Form Analyzer (order: 7)
5. Redirect Analyzer (order: 8)

## Notes
- The fix only corrects the database queries - no schema changes needed
- All existing data remains intact
- No migration required
- Backend restart required to apply changes
