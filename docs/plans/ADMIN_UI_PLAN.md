# Admin UI Plan: Configuration & Management Dashboard

## Overview

**Problem**: All configuration currently via environment variables - not user-friendly, requires server restart, no visibility into costs/logs/debug.

**Solution**: Full-featured admin web UI for:
- Per-task execution mode (AI/Hybrid/Native)
- Whitelist management (domains, emails, IPs)
- Cost analysis & budgets
- Debug interface (search by analysis ID)
- Log viewer
- Real-time monitoring

**User Flow**:
```
User → Admin Dashboard → Configure Task → Save → Server reloads config → Tasks execute per selection
```

---

## Architecture

### Frontend Framework

**Recommended**: **React + TypeScript + TailwindCSS + Shadcn/UI**

**Why?**
- ✅ React ecosystem maturity
- ✅ TypeScript for type safety (matches backend)
- ✅ TailwindCSS for rapid UI development
- ✅ Shadcn/UI for accessible, beautiful components
- ✅ Recharts for cost/analytics charts
- ✅ React Query for API state management

### Project Structure

```
admin-ui/                          # NEW: Admin dashboard SPA
├── package.json                   # React, TypeScript, Vite
├── vite.config.ts                 # Build config
├── tsconfig.json                  # TypeScript config
├── tailwind.config.js             # Tailwind CSS
├── src/
│   ├── main.tsx                   # App entry point
│   ├── App.tsx                    # Root component
│   ├── components/
│   │   ├── ui/                    # Shadcn/UI components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   └── dialog.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Layout.tsx
│   │   └── charts/
│   │       ├── CostChart.tsx
│   │       ├── LatencyChart.tsx
│   │       └── ErrorRateChart.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx          # Overview
│   │   ├── TaskConfiguration.tsx  # AI/Hybrid/Native selection
│   │   ├── WhitelistManagement.tsx
│   │   ├── CostAnalytics.tsx
│   │   ├── DebugInterface.tsx
│   │   ├── LogViewer.tsx
│   │   └── Settings.tsx
│   ├── api/                       # API client
│   │   ├── client.ts
│   │   └── endpoints/
│   │       ├── config.ts
│   │       ├── whitelist.ts
│   │       ├── costs.ts
│   │       └── debug.ts
│   ├── hooks/                     # Custom React hooks
│   │   ├── useTaskConfig.ts
│   │   ├── useWhitelist.ts
│   │   ├── useCostAnalytics.ts
│   │   └── useDebug.ts
│   └── utils/
│       ├── formatters.ts          # Date, currency
│       └── validators.ts          # Form validation
└── public/
    └── favicon.ico
```

---

## 1. Task Configuration UI

### Features
- List all AI tasks with current execution mode
- **Per-task toggle: AI / Hybrid / Native**
- Model selection dropdown per task
- Enable/disable toggle
- Cost estimate per task
- Save configuration (no server restart)

### UI Screenshot (Text Description)
```
┌─────────────────────────────────────────────────────────────┐
│ Task Configuration                        [Save Configuration]│
│ Configure execution mode and AI model for each analysis task │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌──────────────────────────────────────────────────────┐    │
│ │ Email Semantic Analysis                    [Enabled]  │    │
│ │ Analyze email text for social engineering patterns    │    │
│ │                                                        │    │
│ │ ┌──────────┐  ┌──────────┐  ┌──────────┐            │    │
│ │ │ AI Only  │  │ Hybrid ✓ │  │ Native   │            │    │
│ │ │ Use AI   │  │ AI with  │  │ Rule-    │            │    │
│ │ │ model    │  │ fallback │  │ based    │            │    │
│ │ └──────────┘  └──────────┘  └──────────┘            │    │
│ │                                                        │    │
│ │ AI Provider: [OpenAI ▾]    Model: [GPT-4o Mini ▾]   │    │
│ │                                                        │    │
│ │ Estimated cost per analysis: $0.0008                  │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                               │
│ ┌──────────────────────────────────────────────────────┐    │
│ │ Visual Phishing Detection                 [Disabled]  │    │
│ │ Screenshot analysis using Claude Vision               │    │
│ │ ...                                                    │    │
│ └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Backend API

**Endpoints**:
- `GET /api/admin/tasks` - Get all task configurations
- `PUT /api/admin/tasks/:taskName` - Update task config
- `POST /api/admin/tasks/reload` - Reload config without restart

**Example API Call**:
```typescript
// Update email semantic analysis to hybrid mode
PUT /api/admin/tasks/emailSemanticAnalysis
{
  "enabled": true,
  "executionMode": "hybrid",
  "provider": "openai",
  "model": "gpt-4o-mini"
}

// Response
{
  "success": true,
  "message": "Task emailSemanticAnalysis configuration updated",
  "config": { ... }
}
```

### Database Schema

```sql
CREATE TABLE task_configs (
  id TEXT PRIMARY KEY,
  task_name TEXT UNIQUE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  execution_mode TEXT NOT NULL CHECK(execution_mode IN ('ai', 'hybrid', 'native')),
  provider TEXT CHECK(provider IN ('anthropic', 'openai')),
  model TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. Whitelist Management UI

### Features
- List all whitelisted domains, emails, IPs
- Add/edit/delete entries
- Search and filter by type
- Bulk import via CSV
- Validation per entry type

### UI Layout
```
┌─────────────────────────────────────────────────────────┐
│ Whitelist Management           [Bulk Import] [Add Entry]│
│ Manage trusted domains, emails, and IP addresses        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ [🔍 Search...              ] [Filter: All Types ▾]     │
│                                                          │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Type   │ Value          │ Description │ Added  │ ⚙ │ │
│ ├────────┼────────────────┼─────────────┼────────┼───┤ │
│ │ domain │ microsoft.com  │ Office 365  │ 3/1/24 │✏️🗑│ │
│ │ email  │ admin@corp.com │ Admin       │ 2/28   │✏️🗑│ │
│ │ ip     │ 192.168.1.10   │ Internal    │ 2/25   │✏️🗑│ │
│ └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Backend API

**Endpoints**:
- `GET /api/admin/whitelist` - Get all entries
- `POST /api/admin/whitelist` - Add new entry
- `PUT /api/admin/whitelist/:id` - Update entry
- `DELETE /api/admin/whitelist/:id` - Delete entry
- `POST /api/admin/whitelist/bulk` - Bulk import CSV

**Validation**:
```typescript
// Domain validation
if (type === 'domain' && !isValidDomain(value)) {
  return { error: 'Invalid domain' };
}

// Email validation
if (type === 'email' && !isValidEmail(value)) {
  return { error: 'Invalid email' };
}

// IP validation
if (type === 'ip' && !isValidIP(value)) {
  return { error: 'Invalid IP address' };
}
```

### Database Schema

```sql
CREATE TABLE whitelist_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('domain', 'email', 'ip')),
  value TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type, value)
);
```

---

## 3. Cost Analytics Dashboard

### Features
- Monthly spend overview with budget percentage
- Daily cost line charts (last 30 days)
- Cost breakdown by task (bar chart)
- Cost breakdown by model (pie chart)
- Budget alerts at 80% threshold
- Month-end projection
- Export to CSV

### UI Layout
```
┌──────────────────────────────────────────────────────────┐
│ Cost Analytics                              [Export CSV] │
│ Track AI API costs and budget usage                      │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │This Month│ │Total Calls│ │Projected│ │Status    │   │
│ │$12.34    │ │1,247      │ │$38.45   │ │✅ On Track│   │
│ │12.3% of  │ │Avg $0.0099│ │this month│ │          │   │
│ │$100 budget│ │per call   │ │         │ │          │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Daily Costs (Last 30 Days)                          │ │
│ │  $                                                   │ │
│ │  │     ╭─╮                                          │ │
│ │  │  ╭──╯ ╰─╮  ╭─╮                                  │ │
│ │  │──╯      ╰──╯ ╰────────────                      │ │
│ │  └──────────────────────────────────────> days     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌────────────────────┐ ┌────────────────────┐          │
│ │ Cost by Task       │ │ Cost by Model      │          │
│ │ ╔════════╗         │ │     ◐ Claude       │          │
│ │ ║████    ║ Semantic│ │     ◑ Haiku        │          │
│ │ ╚════════╝         │ │     ◔ GPT-4o-mini  │          │
│ └────────────────────┘ └────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

### Backend API

**Endpoints**:
- `GET /api/admin/costs/summary` - Monthly summary
- `GET /api/admin/costs/breakdown?start=...&end=...` - Detailed breakdown
- `GET /api/admin/costs/export?start=...&end=...` - CSV export
- `PUT /api/admin/costs/budget` - Update budget settings

**Example Response**:
```json
{
  "summary": {
    "currentMonth": 12.34,
    "budget": 100,
    "percentOfBudget": 12.3,
    "totalAnalyses": 1247,
    "avgCostPerAnalysis": 0.0099
  },
  "dailyCosts": [
    { "date": "2024-03-01", "cost": 0.45 },
    { "date": "2024-03-02", "cost": 0.52 }
  ],
  "taskBreakdown": {
    "emailSemanticAnalysis": 2.45,
    "urlSemanticAnalysis": 3.21,
    "visualPhishingDetection": 5.67,
    "verdictReasoning": 1.01
  },
  "modelBreakdown": {
    "claude-3-5-sonnet": 7.89,
    "claude-3-5-haiku": 1.12,
    "gpt-4o-mini": 3.33
  }
}
```

---

## 4. Debug Interface

### Features
- **Search analysis by ID** (UUID)
- View full execution trace with timing
- See AI metadata: tokens, cost, latency per step
- View all signals and red flags
- Raw JSON export
- **Rerun analysis** button

### UI Layout
```
┌──────────────────────────────────────────────────────────┐
│ Debug Interface                                          │
│ Search and analyze specific analysis results by ID       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ [Enter Analysis ID (UUID)         ] [Search]            │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Analysis Summary              [Rerun Analysis]      │ │
│ │ ID: a3f2b1c9-4567-89ab-cdef-0123456789ab            │ │
│ │                                                      │ │
│ │ Verdict: Suspicious    Score: 5.2/10               │ │
│ │ Duration: 4523ms       Timestamp: 3/2/24 10:30 AM   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ▼ Execution Trace                                   │ │
│ │                                                      │ │
│ │   ▶ analyzer_SemanticAI_started    [completed] 1234ms│ │
│ │     AI: gpt-4o-mini | 456 in / 123 out | $0.0080   │ │
│ │                                                      │ │
│ │   ▶ analyzer_VisualAI_started      [completed] 2700ms│ │
│ │     AI: claude-3-5-sonnet | 5234 in / 456 out | $1.82│ │
│ │                                                      │ │
│ │   ▶ verdict_calculation_started    [completed] 150ms│ │
│ │     AI: claude-3-5-haiku | 234 in / 67 out | $0.012│ │
│ │                                                      │ │
│ │ AI Cost Summary: $1.84 total                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌──────────────────┐ ┌──────────────────┐              │
│ │ Signals (12)     │ │ Red Flags (3)    │              │
│ │ • SPF fail       │ │ 🚩 Sender mismatch│              │
│ │ • High entropy   │ │ 🚩 Urgency language│             │
│ │ • Form detected  │ │ 🚩 Suspicious URL │              │
│ └──────────────────┘ └──────────────────┘              │
└──────────────────────────────────────────────────────────┘
```

### Backend API

**Endpoints**:
- `GET /api/admin/debug/:analysisId` - Get analysis by ID
- `POST /api/admin/debug/search` - Search analyses
- `GET /api/admin/debug/:analysisId/trace` - Get execution trace
- `POST /api/admin/debug/:analysisId/rerun` - Rerun analysis

**Analysis Storage**:
```sql
CREATE TABLE analyses (
  id TEXT PRIMARY KEY,
  input_type TEXT NOT NULL,
  input_data TEXT NOT NULL,
  verdict TEXT NOT NULL,
  score REAL NOT NULL,
  red_flags TEXT NOT NULL, -- JSON
  signals TEXT NOT NULL, -- JSON
  execution_steps TEXT NOT NULL, -- JSON
  ai_cost_cents REAL DEFAULT 0,
  duration_ms INTEGER NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analyses_timestamp ON analyses(timestamp);
CREATE INDEX idx_analyses_verdict ON analyses(verdict);
```

---

## 5. Analysis ID in Response

### Enhanced API Response

Every analysis returns an `analysisId` in the response JSON:

```json
{
  "analysisId": "a3f2b1c9-4567-89ab-cdef-0123456789ab",
  "verdict": "Suspicious",
  "score": 5.2,
  "confidence": 0.52,
  "alertLevel": "medium",
  "redFlags": [...],
  "reasoning": "This shows several suspicious characteristics...",
  "signals": [...],
  "metadata": {
    "duration": 4523,
    "timestamp": "2024-03-02T10:30:00.000Z",
    "analyzersRun": ["SPFAnalyzer", "SemanticAIAnalyzer", ...],
    "aiCostSummary": {
      "totalCostCents": 1.84,
      "breakdown": {
        "emailSemanticAnalysis": 0.008,
        "visualPhishingDetection": 1.82,
        "verdictReasoning": 0.012
      }
    }
  }
}
```

### Analysis Storage Service

```typescript
// New: src/infrastructure/database/analysis-store.service.ts
export class AnalysisStoreService {
  /**
   * Store analysis result for debugging
   */
  async storeAnalysis(result: AnalysisResult, input: NormalizedInput): Promise<void> {
    await db.insert('analyses', {
      id: result.metadata.analysisId,
      input_type: input.type,
      input_data: JSON.stringify(input.data),
      verdict: result.verdict,
      score: result.score,
      red_flags: JSON.stringify(result.redFlags),
      signals: JSON.stringify(result.signals),
      execution_steps: JSON.stringify(result.metadata.executionSteps),
      ai_cost_cents: result.metadata.aiCostSummary?.totalCostCents || 0,
      duration_ms: result.metadata.duration,
      timestamp: result.metadata.timestamp,
    });

    // Auto-cleanup: Delete analyses older than 90 days
    await db.delete('analyses')
      .where('timestamp < ?', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  }

  /**
   * Get analysis by ID for debug
   */
  async getAnalysisById(analysisId: string): Promise<StoredAnalysis | null> {
    return await db.select('analyses').where('id = ?', analysisId).first();
  }
}
```

---

## New Files to Create

### Frontend
```
admin-ui/
├── src/
│   ├── pages/
│   │   ├── TaskConfiguration.tsx
│   │   ├── WhitelistManagement.tsx
│   │   ├── CostAnalytics.tsx
│   │   ├── DebugInterface.tsx
│   │   └── LogViewer.tsx
│   ├── hooks/
│   │   ├── useTaskConfig.ts
│   │   ├── useWhitelist.ts
│   │   ├── useCostAnalytics.ts
│   │   └── useDebug.ts
│   └── api/
│       └── client.ts
```

### Backend
```
src/
├── api/
│   ├── routes/
│   │   └── admin.routes.ts           # NEW
│   └── controllers/
│       └── admin/
│           ├── task-config.controller.ts
│           ├── whitelist.controller.ts
│           ├── cost.controller.ts
│           └── debug.controller.ts
├── core/
│   └── services/
│       ├── config-manager.service.ts  # NEW
│       └── analysis-store.service.ts  # NEW
└── infrastructure/
    └── database/
        ├── migrations/
        │   ├── 001_task_configs.sql
        │   ├── 002_whitelist_entries.sql
        │   └── 003_analyses_storage.sql
        └── schemas/
            ├── config.schema.ts
            ├── whitelist.schema.ts
            └── analysis.schema.ts
```

---

## Key Features Summary

1. **Task Configuration UI**
   - Per-task execution mode: AI / Hybrid / Native
   - Model selection per task
   - Enable/disable toggle
   - Cost estimates

2. **Whitelist Management**
   - Add/edit/delete domains, emails, IPs
   - Bulk import via CSV
   - Search and filter

3. **Cost Analytics Dashboard**
   - Monthly spend overview
   - Daily cost charts
   - Task/model breakdown
   - Budget alerts

4. **Debug Interface**
   - Search by analysis ID
   - Full execution trace
   - AI metadata (tokens, cost, latency)
   - Rerun analysis

5. **Analysis ID Tracking**
   - Always returned in API response
   - Stored in database
   - Searchable for debugging

6. **Dynamic Configuration**
   - Changes applied without server restart
   - Hot reload via API
   - Database-backed (persistent)

---

## Success Criteria

**Task Configuration**:
✅ Visual UI for selecting AI/Hybrid/Native per task
✅ Changes apply without restart
✅ Cost estimates shown

**Whitelist Management**:
✅ CRUD operations functional
✅ Bulk import works
✅ Search and filter functional

**Cost Analytics**:
✅ Monthly overview accurate
✅ Charts render correctly
✅ Budget alerts trigger
✅ CSV export works

**Debug Interface**:
✅ Search by analysis ID works
✅ Full trace displayed
✅ AI metadata visible
✅ Rerun functionality works

**Overall**:
✅ No server restart needed for config changes
✅ All data persisted to database
✅ Responsive UI (mobile-friendly)
✅ Fast (<500ms page loads)

---

See also:
- [AI Enhancement Plan](./AI_ENHANCEMENT_PLAN.md)
- [Cost Tracking Plan](./COST_TRACKING_PLAN.md)
- [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md)
