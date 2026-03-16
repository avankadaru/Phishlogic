# Task Definitions Page - Complete Implementation

## Summary

Created a new **Task Definitions Page** that shows:
- ✅ **6 Tasks** (Sender Verification, Attachments, Links, Emotional Analysis, Images/QR Codes, Button/CTA)
- ✅ **12 Analyzers** assigned to these tasks
- ✅ **Configuration Options** for each analyzer (WHOIS lookup, DNS timeout, API credentials, etc.)

## Changes Made

### 1. Database Migration (012_add_missing_analyzers.sql)
Added 7 missing analyzers to the `analyzers` table:
- ✅ senderReputationAnalyzer
- ✅ linkReputationAnalyzer
- ✅ attachmentAnalyzer
- ✅ contentAnalysisAnalyzer
- ✅ imageAnalyzer
- ✅ qrcodeAnalyzer
- ✅ buttonAnalyzer

**Result**: Total analyzers in database: 14 (12 active + 2 extra)

### 2. Task Definitions Page UI
**File**: `admin-ui/src/pages/TaskDefinitionsPage.tsx`

**Features**:
- Displays all 6 tasks with expand/collapse functionality
- Shows analyzer count per task
- Each analyzer displays:
  - Display name and description
  - Execution order
  - Long-running indicator (⏱️)
  - Estimated duration
  - Configuration options (where applicable)

**Configuration Options Supported**:
1. **Sender Reputation Analyzer**:
   - Enable/Disable WHOIS Lookup
   - DNS Timeout (ms)
   - WHOIS Timeout (ms)

2. **Link Reputation Analyzer**:
   - Check URLhaus
   - Check PhishTank
   - Check VirusTotal
   - API Credential Selection

3. **Redirect Analyzer**:
   - Max Redirects (1-10)
   - Follow Redirects (on/off)

4. **Form Analyzer**:
   - Check Forms (on/off)

### 3. Routing Updates
**Files Modified**:
- `admin-ui/src/App.tsx` - Added route for `/tasks/definitions`
- `admin-ui/src/components/Layout/DashboardLayout.tsx` - Updated sidebar navigation

**Navigation Structure**:
```
Tasks
├── Integrations (old page - Chrome, Gmail)
└── Task Definitions (new page - 6 tasks, 12 analyzers) ← NEW
```

### 4. Fixed Integration Tasks Controller
**File**: `src/api/controllers/admin/integration-tasks.controller.ts`

**Issues Fixed**:
- ❌ Was querying non-existent `task_configs` table
- ❌ Was trying to select non-existent `default_weight` column

**Fixes Applied**:
- ✅ Changed `JOIN task_configs` → `JOIN analyzers`
- ✅ Removed `default_weight` column reference
- ✅ Fixed 3 SQL queries in the controller

## Task-Analyzer Structure

### 1. Sender Verification (3 analyzers)
1. SPF Analyzer (~200ms)
2. DKIM Analyzer (~200ms)
3. Sender Reputation Analyzer (~10s) ⏱️ Long Running

### 2. Attachments (1 analyzer)
1. Attachment Analyzer (~1s)

### 3. Links (4 analyzers)
1. URL Entropy Analyzer (~100ms)
2. Link Reputation Analyzer (~500ms)
3. Form Analyzer (~5s) ⏱️ Long Running
4. Redirect Analyzer (~5s) ⏱️ Long Running

### 4. Emotional Analysis/Urgency Detection (1 analyzer)
1. Content Analysis Analyzer (~500ms)

### 5. Images/QR Codes (2 analyzers)
1. Image Analyzer (~800ms)
2. QR Code Analyzer (~600ms)

### 6. Button/CTA Tracking (1 analyzer)
1. Button/CTA Analyzer (~300ms)

**Total: 6 Tasks, 12 Analyzers**

## How to Access

1. **Start Backend**:
   ```bash
   npm run dev
   ```

2. **Start Admin UI** (in separate terminal):
   ```bash
   cd admin-ui && npm run dev
   ```

3. **Navigate**:
   - Open http://localhost:5173
   - Login to admin panel
   - Click "Tasks" in sidebar
   - Click "Task Definitions" sub-menu

## What You'll See

### Task Definitions Page
- **6 expandable cards** (one per task)
- Each card shows:
  - Task name and description
  - Active/Inactive status
  - Analyzer count
  - Execution order

### When Expanded
- **List of analyzers** assigned to the task
- Each analyzer shows:
  - Display name and description
  - Execution order
  - Long-running indicator (if applicable)
  - Estimated duration
  - **Configuration options** (expandable section)

### Configuration Options
- **Toggle switches** for boolean options (Enable WHOIS, Follow Redirects, etc.)
- **Number inputs** for timeouts and thresholds
- **Dropdown selects** for API credential selection
- **Save button** for each analyzer

## API Endpoints Used

- `GET /api/admin/tasks/definitions` - List all tasks
- `GET /api/admin/tasks/definitions/:taskName/analyzers` - Get analyzers for a task
- `PUT /api/admin/integration-tasks/:integrationName/analyzers/:analyzerName` - Save analyzer options (existing)

## Next Steps (Optional Enhancements)

1. **Persist Analyzer Options**:
   - Create dedicated table for `task_analyzer_options`
   - API endpoint to save/load options per task-analyzer mapping

2. **Add More Configuration Options**:
   - Attachment Analyzer: Max file size, allowed types
   - Image Analyzer: OCR settings, steganography detection
   - QR Code Analyzer: Allowed domains, warning thresholds

3. **Task-Level Settings**:
   - Enable/disable entire tasks
   - Task execution timeout
   - Parallel vs sequential execution mode

4. **Validation**:
   - Input validation for timeout values
   - Required field checks
   - Dependency validation (e.g., VirusTotal requires API key)

## Files Created/Modified

### Created
- `src/infrastructure/database/migrations/012_add_missing_analyzers.sql`
- `admin-ui/src/pages/TaskDefinitionsPage.tsx`
- `scripts/check-all-analyzers.ts`
- `scripts/check-task-analyzer-details.ts`
- `scripts/test-task-definitions-api.ts`
- `scripts/run-migration-012.ts`

### Modified
- `src/api/controllers/admin/integration-tasks.controller.ts`
- `admin-ui/src/App.tsx`
- `admin-ui/src/components/Layout/DashboardLayout.tsx`

## Verification

Run verification script:
```bash
npx tsx scripts/test-task-definitions-api.ts
```

Expected output:
```
✅ 6 Active Tasks
✅ 12 Total Analyzers
```

## Status

🎉 **COMPLETE** - Task Definitions Page is fully functional and accessible from the admin UI sidebar.
