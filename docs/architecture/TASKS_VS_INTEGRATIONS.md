# Tasks vs Integrations Architecture

## Overview

PhishLogic uses a **3-layer configuration model**:

1. **Analyzers** (Layer 1) - What analysis capabilities exist
2. **Tasks** (Layer 2) - How analyzers are grouped logically
3. **Integrations** (Layer 3) - How platforms (Gmail, Chrome) use analyzers

```
Layer 1: ANALYZERS          Layer 2: TASKS             Layer 3: INTEGRATIONS
(What exists)                (How to group)             (Where/how to use)
┌──────────────┐            ┌──────────────────┐       ┌──────────────────┐
│ 12 Analyzers │            │ 6 Tasks          │       │ 2 Integrations   │
│              │            │                  │       │                  │
│ spfAnalyzer  │──────────▶ │ sender_          │─────▶ │ Gmail            │
│ dkimAnalyzer │            │   verification   │       │ Chrome           │
│ formAnalyzer │            │ attachments      │       │                  │
│ etc...       │            │ links            │       │ (+ future:       │
│              │            │ emotional...     │       │  Outlook, etc.)  │
└──────────────┘            │ images_qrcodes   │       └──────────────────┘
                            │ buttons_cta      │
                            └──────────────────┘
```

---

## Layer Details

### Layer 1: Analyzers (analyzers table)

**Purpose:** Defines what analysis capabilities exist

- SPF, DKIM, form detection, URL entropy, redirects, etc.
- 14 analyzers total
- Managed by: Database migrations
- Implementation: Code in `src/core/analyzers/`

**Example Records:**
```
spfAnalyzer         - SPF Analyzer
dkimAnalyzer        - DKIM Analyzer
formAnalyzer        - Form Analyzer
redirectAnalyzer    - Redirect Analyzer
```

---

### Layer 2: Tasks (tasks + task_analyzers tables)

**Purpose:** Groups analyzers into logical email analysis categories

- 6 tasks: sender_verification, attachments, links, emotional_analysis_urgency, images_qrcodes, buttons_cta
- Each task has multiple analyzers assigned
- Managed by: Database migrations (011_task_based_architecture.sql)
- **Role:** System definition/documentation - NOT runtime configuration

**Example Task Mapping:**
```
Task: sender_verification
├─ spfAnalyzer (order: 1, duration: 200ms)
├─ dkimAnalyzer (order: 2, duration: 200ms)
└─ senderReputationAnalyzer (order: 3, duration: 10000ms, long-running)

Task: links
├─ urlEntropyAnalyzer (order: 1, duration: 100ms)
├─ linkReputationAnalyzer (order: 2, duration: 500ms)
├─ formAnalyzer (order: 3, duration: 5000ms, long-running)
└─ redirectAnalyzer (order: 4, duration: 5000ms, long-running)
```

**Database Schema:**
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  task_name VARCHAR(100) UNIQUE,      -- 'sender_verification', 'links', etc.
  display_name VARCHAR(200),          -- 'Sender Verification'
  description TEXT,
  input_type VARCHAR(20),             -- 'email' or 'url'
  execution_order INTEGER,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE task_analyzers (
  id UUID PRIMARY KEY,
  task_name VARCHAR(100),             -- References tasks.task_name
  analyzer_name VARCHAR(100),         -- References analyzers.analyzer_name
  execution_order INTEGER,
  is_long_running BOOLEAN,            -- Performance hint
  estimated_duration_ms INTEGER       -- Performance hint
  -- NOTE: No analyzer_options column - tasks don't store runtime config
);
```

---

### Layer 3: Integrations (integration_tasks + integration_analyzers tables)

**Purpose:** Defines how specific platforms use PhishLogic

- Current integrations: Gmail, Chrome
- Future: Outlook, Twitter, Facebook, etc.
- Configurable via: **Admin UI TasksPage** (`/tasks` route)
- Contains: execution_mode, ai_model_id, **analyzer_options (JSONB)**
- **Role:** Runtime configuration - what actually executes

**Example Integration Configuration:**
```
Gmail Integration:
├─ enabled: true
├─ execution_mode: 'native'
├─ ai_model_id: null
└─ analyzers:
    ├─ spfAnalyzer (order: 1, options: {})
    ├─ senderReputationAnalyzer (order: 3, options: {
    │    enableWhois: true,
    │    whoisTimeoutMs: 10000,
    │    dnsTimeoutMs: 10000
    │  })
    └─ linkReputationAnalyzer (order: 6, options: {
         apiCredentialId: "virustotal_free"
       })
```

**Database Schema:**
```sql
CREATE TABLE integration_tasks (
  id UUID PRIMARY KEY,
  integration_name VARCHAR(100) UNIQUE,  -- 'gmail', 'chrome'
  display_name VARCHAR(200),
  description TEXT,
  input_type VARCHAR(20),                -- 'email' or 'url'
  enabled BOOLEAN DEFAULT true,
  execution_mode VARCHAR(20),            -- 'native', 'hybrid', or 'ai'
  ai_model_id UUID,                      -- References ai_model_configs
  fallback_to_native BOOLEAN DEFAULT true
);

CREATE TABLE integration_analyzers (
  id UUID PRIMARY KEY,
  integration_name VARCHAR(100),         -- References integration_tasks
  analyzer_name VARCHAR(100),            -- References analyzers
  execution_order INTEGER,
  analyzer_options JSONB DEFAULT '{}'   -- ← RUNTIME CONFIGURATION STORAGE
);
```

---

## Runtime Flow

When analysis runs (e.g., Gmail receives an email):

1. **Load integration config** from `integration_tasks` WHERE integration_name='gmail'
   - Gets: execution_mode, ai_model_id, enabled status

2. **Load analyzer configs** from `integration_analyzers` WHERE integration_name='gmail'  **← THIS IS WHERE OPTIONS COME FROM**
   - Gets: analyzer_name, execution_order, **analyzer_options** (JSONB)
   - Example: `senderReputationAnalyzer` with `{enableWhois: true, whoisTimeoutMs: 10000}`

3. **For each analyzer:**
   - Load the analyzer implementation from code
   - **Call `analyzer.setOptions(analyzer_options)`** ← Options applied here
   - Run the analyzer
   - Collect signals

4. **Aggregate signals** → Calculate verdict → Return result

**Note:** The `tasks` table is used for grouping/display only, NOT for runtime configuration.

---

## What Tasks Are Used For

✅ **Tasks are used for:**
- Grouping analyzers in UI for better organization
- Performance metadata (is_long_running, estimated_duration_ms)
- Documentation of system capabilities
- Displaying what PhishLogic can analyze

❌ **Tasks are NOT used for:**
- Runtime configuration
- Storing analyzer options
- Execution decisions
- Per-platform customization

---

## Configuration Location

**All runtime analyzer configuration is stored in:**
- `integration_analyzers.analyzer_options` (JSONB column)

**Accessed via:**
- **Admin UI:** TasksPage (`/tasks`) → "Configure Analyzers" section
- **API Endpoint:** `PUT /api/admin/integration-tasks/:integrationName/analyzers/:analyzerName`

**Example API Call:**
```bash
curl -X PUT http://localhost:3000/api/admin/integration-tasks/gmail/analyzers/senderReputationAnalyzer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "analyzerOptions": {
      "enableWhois": true,
      "whoisTimeoutMs": 10000,
      "dnsTimeoutMs": 10000
    }
  }'
```

---

## Key Differences Summary

| Aspect | Tasks (Layer 2) | Integrations (Layer 3) |
|--------|-----------------|------------------------|
| **Purpose** | Define what PhishLogic analyzes | Define how platforms use PhishLogic |
| **Scope** | System-wide (static) | Per-platform (dynamic) |
| **Mutability** | Created once, rarely changed | Configured by admins per integration |
| **Example** | "sender_verification task uses SPF, DKIM, and sender reputation" | "Gmail integration runs these 12 analyzers in native mode with these options" |
| **Created in** | Migration 011 | Migration 006 |
| **Configuration Storage** | None (only metadata) | `analyzer_options` JSONB column |
| **UI Management** | None (system definitions) | TasksPage (`/tasks` route) |
| **Runtime Usage** | Not used for execution | **Used for execution** |

---

## Why We Don't Have a Task Definitions UI

**Previously, there was a TaskDefinitionsPage (`/tasks/definitions`) that:**
- Displayed the 6 tasks and their assigned analyzers
- Tried to allow configuration of analyzer options per task
- **Problem:** The save button was fake (simulated delay), and the `task_analyzers` table has no `analyzer_options` column

**This was removed because:**
1. Tasks are system definitions managed by migrations, not user configuration
2. Integration-level configuration (TasksPage) provides all necessary functionality
3. Having two similar pages was confusing
4. Only integration-level options are actually used at runtime

**If you need to see task structure:**
- It's documented here
- It can be queried via API: `GET /api/admin/tasks/definitions`
- Future enhancement: Add a read-only reference section in TasksPage

---

## Architecture Design Philosophy

This 3-layer design follows these principles:

1. **Separation of Concerns:** System definitions (tasks) separate from platform usage (integrations)
2. **Flexibility:** Admins can configure which analyzers run per integration without code changes
3. **Reusability:** Same analyzer can be used by multiple integrations with different options
4. **Performance Metadata:** Long-running analyzers flagged for conditional execution
5. **Runtime Configuration:** JSONB `analyzer_options` allows per-analyzer settings without schema changes
6. **Future-Proof:** Easy to add new integrations (Outlook, Twitter, etc.) by adding rows to tables

---

## File References

**Database Migrations:**
- `src/infrastructure/database/migrations/011_task_based_architecture.sql` - Task definitions
- `src/infrastructure/database/migrations/006_restructure_to_integration_tasks.sql` - Integration configuration
- `src/infrastructure/database/migrations/010_add_analyzer_options.sql` - Analyzer options (runtime config)
- `src/infrastructure/database/migrations/012_add_missing_analyzers.sql` - Complete analyzer catalog

**Controllers:**
- `src/api/controllers/admin/tasks.controller.ts` - Task CRUD (system definitions)
- `src/api/controllers/admin/integration-tasks.controller.ts` - Integration CRUD (runtime config)

**Services:**
- `src/core/services/integration-config.service.ts` - Loads integration config at runtime

**Execution:**
- `src/core/execution/strategies/task-based.strategy.ts` - Uses tasks for grouping execution
- `src/core/engine/analysis.engine.ts` - Orchestrates analysis with integration config

**Admin UI:**
- `admin-ui/src/pages/TasksPage.tsx` - Integration configuration (the working page)

---

## For Developers

**To add a new analyzer:**
1. Create analyzer implementation in `src/core/analyzers/`
2. Add to `analyzers` table via migration
3. Assign to appropriate task(s) in `task_analyzers` table
4. Assign to integrations in `integration_analyzers` table with default options

**To add a new integration:**
1. Add row to `integration_tasks` table
2. Add analyzer assignments to `integration_analyzers` table
3. UI will automatically display it on TasksPage

**To configure analyzer options:**
1. Navigate to TasksPage (`/tasks`) in Admin UI
2. Select integration (Gmail/Chrome)
3. Click "Configure Analyzers"
4. Edit options for each analyzer
5. Click "Save" - options persisted to `integration_analyzers.analyzer_options`
