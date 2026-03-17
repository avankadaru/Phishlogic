# PhishLogic Troubleshooting Guide

## Getting Started

### Prerequisites
- Node.js v18+ installed
- PostgreSQL running locally (port 5432)
- Database "Phishlogic" created
- Environment file configured (copy from `.env.example` to `.env`)

### Starting Development Servers

#### 1. Start Backend Server (Port 3000)

```bash
# From project root directory
npm run dev
```

**What it does:**
- Starts Fastify server on port 3000
- Connects to PostgreSQL database
- Loads environment variables from `.env`
- Enables hot-reload for TypeScript files

**Expected Output:**
```
Server listening at http://localhost:3000
Database connected successfully
```

#### 2. Start Admin UI (Port 5173)

**Open a SEPARATE terminal window/tab** (backend must keep running)

```bash
# From project root directory
cd admin-ui
npm run dev
```

**What it does:**
- Starts Vite development server on port 5173
- Serves React admin interface
- Enables hot-module replacement (HMR)

**Expected Output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Access the UI:**
Open http://localhost:5173 in your browser

---

### Common Startup Errors

#### Error: "EADDRINUSE: address already in use"

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
    at Server.setupListenHandle [as _listen2]
```

**Cause:** Another process is already using the port (previous server instance still running)

**Solution 1: Kill Process by Port (macOS/Linux)**

```bash
# Kill backend server (port 3000)
lsof -ti :3000 | xargs kill -9

# Kill UI server (port 5173)
lsof -ti :5173 | xargs kill -9
```

**Solution 2: Find and Kill Process Manually**

```bash
# Find process using port 3000
lsof -i :3000

# Output example:
# COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
# node    12345  user   22u  IPv6  0x1234  0t0  TCP *:3000 (LISTEN)

# Kill by PID
kill -9 12345
```

**Solution 3: Use Different Port (Temporary)**

```bash
# Backend - set PORT in .env
PORT=3001 npm run dev

# UI - specify port
cd admin-ui
npm run dev -- --port 5174
```

#### Error: "Cannot find module '@fastify/...'"

**Cause:** Dependencies not installed

**Solution:**
```bash
# Install backend dependencies
npm install

# Install UI dependencies
cd admin-ui
npm install
```

#### Error: "FATAL: database 'Phishlogic' does not exist"

**Cause:** PostgreSQL database not created

**Solution:**
```bash
# Create database
createdb -U phishlogic Phishlogic

# Or using psql
psql -U postgres -c "CREATE DATABASE Phishlogic OWNER phishlogic;"
```

#### Error: "getaddrinfo ENOTFOUND localhost"

**Cause:** PostgreSQL not running or wrong host

**Solution:**
```bash
# Start PostgreSQL (macOS with Homebrew)
brew services start postgresql@14

# Or check if it's running
pg_isready

# Verify connection settings in .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Phishlogic
DB_USER=phishlogic
DB_PASSWORD=your_password
```

---

## Debugging Analysis Execution

### Enable Debug Mode

**Set LOG_LEVEL environment variable:**
```bash
# Start with debug logging
LOG_LEVEL=debug npm run dev

# Or temporarily in .env file
LOG_LEVEL=debug
LOG_PRETTY_PRINT=true
```

**Available Log Levels:** error, warn, info (default), debug

**Additional Debug Settings:**
```bash
ANALYSIS_TIMEOUT=60000             # Increase for debugging
WHITELIST_TRUST_LEVEL_LOGGING=true # Log trust level decisions
```

---

### Common Breakpoint Locations

#### Analysis Controller (Entry Point)
**File:** `src/api/controllers/analysis.controller.ts`

**Key breakpoints:**
- Line 122: `analyzeEmail()` function entry
- Line 127: After input validation
- Line 135: After input normalization
- Line 142: Before `engine.analyze()` call (critical handoff point)

#### Analysis Engine (Orchestration)
**File:** `src/core/engine/analysis.engine.ts`

**Key breakpoints:**
- Line 67: `analyze()` function entry
- Line 114: Whitelist check
- Line 131: Content risk analysis
- Line 256: Strategy execution
- Line 330: Error handling

#### Native Execution Strategy
**File:** `src/core/execution/strategies/native.strategy.ts`

**Key breakpoints:**
- Line 25: Analyzer filtering
- Line 62: Analyzer execution (Promise.allSettled)
- Line 80: Individual analyzer.analyze() calls
- Line 121: Verdict calculation

---

### Debugging "Analyze Email" Flow

#### Request Flow
```
EmailTestPage (Admin UI)
  ↓ POST /api/analyze/email
Analysis Controller
  ↓ Validates & normalizes input
Analysis Engine
  ↓ Whitelist check → Content risk
  ↓ Load integration config
  ↓ Route to execution strategy
Native Strategy
  ↓ Filter & run analyzers in parallel
Verdict Service
  ↓ Calculate score & verdict
Analysis Engine (finally)
  ↓ Persist to database
Response ← JSON result
```

#### Debug Workflow

**Option 1: Console Logging**
```bash
LOG_LEVEL=debug npm run dev

# Observe in terminal:
# - Input validation
# - Whitelist check results
# - Execution steps (started/completed/failed)
# - Analyzer signals
# - Final verdict calculation
```

**Option 2: Query Database**
```bash
# Get recent analyses
curl http://localhost:3000/api/admin/debug/analyses?limit=10

# Get specific analysis
curl http://localhost:3000/api/admin/debug/analyses/{analysisId}
```

**Option 3: Debug Script**
```bash
npx tsx scripts/test-debug-api.ts
npx tsx scripts/debug-analyzer-filtering.ts
```

---

### Understanding Logging vs Debugging

**IMPORTANT:** There are two different debugging approaches - don't confuse them!

#### 1. Debug Logging (Shows Console Output)
```bash
LOG_LEVEL=debug npm run dev
```
- ✓ Shows debug-level log messages in terminal
- ✓ Good for seeing what the code is doing
- ✗ Does NOT let you set breakpoints
- ✗ Does NOT pause execution
- **Use case:** Quick runtime inspection, production debugging

#### 2. VSCode Debugger (Breakpoints & Step-Through)
Press **F5** in VSCode or use **Run → "Debug Backend"**
- ✓ Hit breakpoints in your code
- ✓ Step through code line by line (F10, F11)
- ✓ Inspect variables at runtime
- ✓ Pause, resume, step over, step into
- **Use case:** Deep investigation, finding bugs, understanding flow

**⚠️ If breakpoints aren't being hit:** You're probably using method #1 (logging) when you need method #2 (debugger). Running `npm run dev` won't trigger breakpoints - you must use VSCode's debugger (F5).

---

### VSCode Debugging Setup

**Prerequisites:**
1. VSCode with "Run and Debug" panel (View → Run, or Ctrl+Shift+D)
2. `.vscode/launch.json` file (should now exist, created automatically)

**Verify launch.json exists:**
```bash
ls -la .vscode/launch.json
```

**Configuration in `.vscode/launch.json`:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["tsx", "--inspect-brk", "src/index.ts"],
      "port": 9229,
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

**How to Start Debugging:**

1. **Stop any running `npm run dev` processes** (Ctrl+C in terminals)

2. **Set breakpoints:** Click line numbers in VSCode (red dots appear)
   - **Recommended locations:**
     - `src/api/controllers/analysis.controller.ts:142` - Before engine.analyze()
     - `src/core/engine/analysis.engine.ts:67` - Analysis start
     - `src/core/engine/analysis.engine.ts:114` - Whitelist check
     - `src/core/execution/strategies/native.strategy.ts:62` - Analyzer execution

3. **Start debugger:** Press **F5** or click Run → "Debug Backend"
   - Backend starts with "Debugger listening on ws://127.0.0.1:9229..."
   - Server starts: "Server listening on http://localhost:3000"

4. **Trigger analysis:**
   - Navigate to http://localhost:5173/testing/email
   - Fill in From and Subject fields
   - Click "Analyze Email"

5. **Debugger pauses at your breakpoints:**
   - Yellow highlight shows current line
   - Debug toolbar appears at top
   - Variables panel shows local variables
   - Call stack shows function hierarchy

**Debug Controls:**
- **Continue (F5):** Resume until next breakpoint
- **Step Over (F10):** Execute current line, move to next
- **Step Into (F11):** Enter function call
- **Step Out (Shift+F11):** Exit current function
- **Stop (Shift+F5):** Stop debugging

**Troubleshooting:**
- Breakpoints show **gray circle** (not red): Debugger not attached, press F5
- "Cannot connect to runtime process": Port 9229 in use, kill it: `lsof -ti :9229 | xargs kill -9`
- Breakpoints still not hit: Verify TypeScript source maps are enabled

---

### Inspecting Execution Steps

#### Via Debug API
```bash
# Get analysis with execution steps
curl http://localhost:3000/api/admin/debug/analyses/{analysisId}

# Response includes executionSteps array:
{
  "step": "whitelist_check_started",
  "status": "completed",
  "duration": 45,
  "context": { "trustLevel": "high" }
}
```

#### Typical Step Sequence
```
1. request_received (completed)
2. whitelist_check_started (completed)
3. content_risk_analysis_started (completed)
4. config_loading_started (completed)
5. strategy_execution_started (completed)
   ├─ analyzer_SenderReputationAnalyzer_completed
   ├─ analyzer_LinkReputationAnalyzer_completed
   └─ ...
6. email_alert_check (completed)
7. response_sent (completed)
```

#### Troubleshooting Failed Steps
```json
{
  "step": "analyzer_FormAnalyzer_failed",
  "status": "failed",
  "error": "Timeout exceeded",
  "duration": 5000
}
```

**Check:**
- Timeout settings (BROWSER_TIMEOUT, DYNAMIC_ANALYSIS_TIMEOUT)
- Network connectivity
- Logs around failure time

---

### Quick Reference

**Enable debug mode:**
```bash
LOG_LEVEL=debug npm run dev
```

**Query recent analyses:**
```bash
curl http://localhost:3000/api/admin/debug/analyses?limit=10
```

**Debug specific analysis:**
```bash
curl http://localhost:3000/api/admin/debug/analyses/{analysisId}
```

**Test debug service:**
```bash
npx tsx scripts/test-debug-api.ts
```

**Key log fields:**
- `analysisId` - Trace analysis through logs
- `executionMode` - native/hybrid/ai
- `verdict`, `score` - Final result
- `processingTime` - Duration in ms

---

## Understanding Dynamic Analyzer Behavior

**Common Question: "I don't see any login form in the email body - where did the form detection come from?"**

### How FormAnalyzer Works

FormAnalyzer is a **dynamic analyzer** that doesn't just parse the email HTML. Here's what it actually does:

1. **Extracts URLs from email body** - Finds all links in the email
2. **Opens each URL in a browser** - Uses Playwright to visit the destination
3. **Scans the landing page** - Looks for forms on the actual website
4. **Reports findings** - Generates signals based on forms found on the destination page

**Example Flow:**
```
Email Body: "Click here to view your invoice"
            ↓
            Contains link: https://example.com/invoice
            ↓
FormAnalyzer opens https://example.com/invoice in browser
            ↓
Landing page has a login form (normal for this site)
            ↓
Signal generated: "Page contains a login form requesting password and email"
```

**Key Point:** The form is on the **destination website**, not in the email body itself. This is why you don't see the form when viewing the email.

### Why This Causes False Positives

If your email contains a link to a legitimate site that has a login page (Google, Microsoft, LinkedIn, banking sites, etc.), FormAnalyzer will flag it as suspicious even though it's completely normal.

**Current Behavior:**
- ANY login form → flagged as suspicious (severity: high, confidence: 85%)
- Even on legitimate sites like google.com, microsoft.com, github.com

**File:** [src/core/analyzers/dynamic/form.analyzer.ts](src/core/analyzers/dynamic/form.analyzer.ts):94-108

---

## Issue 1: Tasks Page Error - "No integration tasks configured"

### Symptoms
- Tasks page displays: "No integration tasks configured. Please run database migration 006"
- Admin UI cannot load integration configurations

### Diagnosis
Run the diagnostic script:
```bash
npx tsx scripts/check-integration-tasks.ts
```

### Root Causes
1. **Migration 006 not run**: `integration_tasks` table doesn't exist
2. **Data not seeded**: Table exists but has no rows
3. **Soft-deleted tasks**: Tasks exist but have `deleted_at` timestamp

### Solutions

#### Solution 1: Run Migration 006
```bash
PGPASSWORD=phishlogic_dev_password psql -h localhost -U phishlogic -d Phishlogic -f src/infrastructure/database/migrations/006_integration_tasks.sql
```

#### Solution 2: Seed Integration Tasks Manually
```sql
-- Connect to database
PGPASSWORD=phishlogic_dev_password psql -h localhost -U phishlogic -d Phishlogic

-- Insert Gmail and Chrome integrations
INSERT INTO integration_tasks (integration_name, display_name, description, input_type, enabled, execution_mode, fallback_to_native)
VALUES
  ('gmail', 'Gmail Integration', 'Analyze emails from Gmail', 'email', true, 'native', true),
  ('chrome', 'Chrome Extension', 'Analyze URLs from Chrome extension', 'url', true, 'native', true)
ON CONFLICT (integration_name) DO NOTHING;

-- Verify
SELECT integration_name, display_name, enabled FROM integration_tasks WHERE deleted_at IS NULL;
```

#### Solution 3: Restore Soft-Deleted Tasks
```sql
UPDATE integration_tasks
SET deleted_at = NULL
WHERE integration_name IN ('gmail', 'chrome');
```

---

## Issue 2: False Positive Malicious Verdicts

### Symptoms
- Legitimate content flagged as "Malicious"
- Debug page shows signals like:
  - "Page contains a login form requesting password and email"
  - "url redirect also 2 times"
- Test button shows "Safe" but Debug page shows "Malicious"

### Diagnosis
Run the false positive diagnostic:
```bash
npx tsx scripts/debug-false-positive.ts
```

This will show:
- Recent malicious verdicts
- Signals generated by each analyzer
- Which analyzers are contributing false positives
- Confidence levels of signals

### Root Causes

#### 1. **FormAnalyzer Too Aggressive**
FormAnalyzer detects ANY login form as suspicious, including legitimate sites.

**Current Behavior:**
```typescript
// FormAnalyzer flags all forms with password fields
if (hasPasswordField && hasEmailField) {
  signals.push({
    signalType: 'form_detected',
    severity: 'medium',  // ← Too high for legitimate sites
    confidence: 0.7,     // ← Too confident
  });
}
```

**Fix:**
```typescript
// Only flag forms on suspicious domains
if (hasPasswordField && hasEmailField && !isKnownLegitDomain(url)) {
  signals.push({
    signalType: 'form_detected',
    severity: 'low',       // ← Reduced severity
    confidence: 0.3,       // ← Lower confidence for non-suspicious domains
  });
}
```

#### 2. **RedirectAnalyzer Too Sensitive**
RedirectAnalyzer flags normal redirects (e.g., HTTP→HTTPS, login redirects).

**Current Behavior:**
```typescript
// Flags ANY redirect
if (redirectCount >= 1) {
  signals.push({
    signalType: 'suspicious_redirect',
    severity: 'medium',
  });
}
```

**Fix:**
```typescript
// Only flag suspicious redirect chains (3+ redirects to different domains)
if (redirectCount >= 3 && hasCrossDomainRedirects) {
  signals.push({
    signalType: 'suspicious_redirect',
    severity: 'medium',
  });
}

// Single redirects are normal (HTTP→HTTPS)
if (redirectCount === 1 || redirectCount === 2) {
  // Don't generate signal
}
```

#### 3. **Verdict Thresholds**
Current thresholds in `src/config/app.config.ts`:
```typescript
thresholds: {
  malicious: 0.7,   // 70% confidence → Malicious
  suspicious: 0.4,  // 40% confidence → Suspicious
}
```

These are reasonable, but consider adjusting if needed:
```bash
# Set environment variables
THRESHOLD_MALICIOUS=0.75  # Increase to 75%
THRESHOLD_SUSPICIOUS=0.45 # Increase to 45%
```

### Solutions

#### Solution 1: Quick Fix - Add to Whitelist
Add the legitimate domain to whitelist:

```bash
# Via API
curl -X POST http://localhost:3000/api/admin/whitelist \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "type": "domain",
    "value": "example.com",
    "trustLevel": "high",
    "description": "Legitimate site - false positive"
  }'
```

Or via Admin UI:
1. Navigate to **Whitelist** page
2. Click **Add Entry**
3. Type: `domain`
4. Value: `example.com`
5. Trust Level: `HIGH`
6. Save

#### Solution 2: Adjust Analyzer Weights
Reduce weight of FormAnalyzer and RedirectAnalyzer:

```bash
# Edit .env file
ANALYZER_WEIGHT_FORM=1.0        # Reduce from 1.7 to 1.0
ANALYZER_WEIGHT_REDIRECT=1.0    # Reduce from 1.5 to 1.0
```

Or update database directly:
```sql
UPDATE analyzers
SET default_weight = 1.0
WHERE analyzer_name IN ('FormAnalyzer', 'RedirectAnalyzer');
```

#### Solution 3: Disable Problematic Analyzers (Temporary)
Via Admin UI:
1. Navigate to **Tasks** page
2. Expand **Gmail** integration
3. Click **Configure Analyzers**
4. Find **Links** task group
5. Toggle OFF **Form Detection** and **Redirect Detection**
6. Click **Save Configuration**

#### Solution 4: Code Fix - Update FormAnalyzer

Edit `src/core/analyzers/dynamic/form.analyzer.ts`:

```typescript
// Around line 80-100, update the form detection logic
async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
  const signals: AnalysisSignal[] = [];

  // ... existing code ...

  // Check if domain is known legitimate
  const url = new URL(extractedUrl);
  const domain = url.hostname;

  // List of known legitimate domains (expand as needed)
  const knownLegitDomains = [
    'google.com', 'microsoft.com', 'amazon.com', 'facebook.com',
    'linkedin.com', 'github.com', 'stackoverflow.com'
  ];

  const isLegit = knownLegitDomains.some(d => domain.endsWith(d));

  if (hasPasswordField && hasEmailField) {
    signals.push({
      signalType: 'form_detected',
      severity: isLegit ? 'low' : 'medium',  // Reduce severity for known domains
      confidence: isLegit ? 0.2 : 0.6,       // Lower confidence for known domains
      description: `Login form detected on ${domain}`,
    });
  }

  return signals;
}
```

#### Solution 5: Code Fix - Update RedirectAnalyzer

Edit `src/core/analyzers/dynamic/redirect.analyzer.ts`:

```typescript
// Around line 90-120, update redirect detection logic
async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
  const signals: AnalysisSignal[] = [];

  // ... existing code ...

  // Only flag suspicious redirect chains
  if (redirectCount >= 3) {
    // Check if redirects cross domains
    const uniqueDomains = new Set(redirectChain.map(url => new URL(url).hostname));

    if (uniqueDomains.size >= 2) {
      signals.push({
        signalType: 'suspicious_redirect',
        severity: 'medium',
        confidence: 0.6,
        description: `Suspicious redirect chain: ${redirectCount} redirects across ${uniqueDomains.size} domains`,
      });
    }
  }

  // Normal redirects (1-2 hops, same domain) - no signal
  return signals;
}
```

### Verification

After applying fixes:

1. **Re-test the content:**
```bash
# Submit test via API
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "source": "manual-test"
  }'
```

2. **Check Debug page:**
   - Navigate to **Debug** page
   - Find the analysis
   - Verify verdict is now "Safe"
   - Check signals - should have fewer false positives

3. **Check cost tracking:**
   - Expand **Cost Breakdown** section
   - Verify operations are tracked correctly

---

## Common Issues

### Issue 3: "TypeError: Cannot read properties of undefined"

**Symptom:** Frontend crashes when opening Tasks page

**Solution:** Clear browser cache and reload:
```bash
# Chrome DevTools
Cmd+Shift+Delete → Clear cache → Reload
```

### Issue 4: Analyzers Not Showing in Tasks Page

**Symptom:** Click "Configure Analyzers" but section is empty

**Diagnosis:**
```bash
# Check if analyzers are assigned to Gmail
PGPASSWORD=phishlogic_dev_password psql -h localhost -U phishlogic -d Phishlogic -c "SELECT COUNT(*) FROM integration_analyzers WHERE integration_name = 'gmail';"
```

**Solution:**
```bash
# Run migration 011 to assign analyzers
PGPASSWORD=phishlogic_dev_password psql -h localhost -U phishlogic -d Phishlogic -f src/infrastructure/database/migrations/011_task_based_architecture.sql
```

### Issue 5: Cost Summary Not Showing

**Symptom:** Debug page analysis doesn't show cost breakdown

**Cause:** Analysis used old execution strategy without cost tracking

**Solution:** Re-submit analysis to use new TaskBasedExecutionStrategy:
```bash
# Set execution mode to use task-based strategy
# (Implementation pending - currently uses NativeExecutionStrategy)
```

---

## Environment Variables Reference

```bash
# Verdict Thresholds
THRESHOLD_MALICIOUS=0.7      # 0.0-1.0, default 0.7
THRESHOLD_SUSPICIOUS=0.4     # 0.0-1.0, default 0.4

# Analyzer Weights
ANALYZER_WEIGHT_FORM=1.7         # 0.5-3.0, default 1.7
ANALYZER_WEIGHT_REDIRECT=1.5     # 0.5-3.0, default 1.5
ANALYZER_WEIGHT_LINK_REP=2.5     # 0.5-3.0, default 2.5

# Whitelist
WHITELIST_TRUST_LEVEL_ENABLED=true
WHITELIST_TRUST_LEVEL_LOGGING=true

# Encryption
ENCRYPTION_KEY=your-32-char-key-here  # For production API credentials
```

---

## Support

If issues persist:
1. Check logs: `tail -f logs/app.log`
2. Run diagnostics: `npx tsx scripts/verify-task-based-migration.ts`
3. Open issue: https://github.com/yourusername/PhishLogic/issues

---

**Last Updated:** 2026-03-13
