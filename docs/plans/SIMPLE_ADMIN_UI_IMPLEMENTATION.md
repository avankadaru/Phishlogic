# PhishLogic Simple Admin UI Implementation Plan

## Context

Building a single-tenant admin UI for PhishLogic with **multi-tenant-ready design**. This allows fast time-to-market (2-3 weeks) while maintaining the ability to migrate to full multi-tenancy later (4-6 weeks migration effort).

**Problem to Solve:**
- All configuration currently via environment variables
- No visibility into costs, logs, or analysis history
- No web UI for whitelist management
- No debug interface for troubleshooting

**Solution:**
React-based admin dashboard with 5 main features:
1. Task Configuration (AI/Hybrid/Native per analyzer)
2. Whitelist Management (domains, emails, URLs)
3. Cost Analytics (track AI API spending)
4. Debug Interface (search analyses by ID)
5. Log Viewer (real-time structured logs)

**Key Design Principle:** Build for single-tenant NOW, but design schema and services to make multi-tenant migration trivial later.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│         React Admin UI (Vite + TypeScript)      │
│    5 Pages: Config | Whitelist | Costs |        │
│              Debug | Logs                       │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│           Fastify REST API (New Routes)         │
│    /api/admin/* - Protected by API Key          │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│          PhishLogic Core Engine                 │
│    (Minimal changes - stays stateless)          │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│      PostgreSQL Database (New)                  │
│  • task_configs                                 │
│  • whitelist_entries (migrated from memory)     │
│  • analyses (history tracking)                  │
│  • api_keys                                     │
│  • cost_tracking                                │
│  • audit_logs                                   │
└─────────────────────────────────────────────────┘
```

---

## Database Schema (Multi-Tenant-Ready)

### Design Principles for Easy Migration

1. **Use UUIDs** - Globally unique, no conflicts when merging tenants
2. **Add tenant_id column** - Nullable now, required later
3. **No foreign key to tenants table** - Table doesn't exist yet
4. **Use TIMESTAMPTZ** - Timezone-aware for global deployments
5. **Include soft deletes** - deleted_at pattern

### Core Tables

```sql
-- ============================================================================
-- AUTHENTICATION & AUTHORIZATION
-- ============================================================================

-- API Keys for authentication
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- Human-readable name
  key_hash VARCHAR(255) NOT NULL UNIQUE, -- bcrypt hash of API key
  key_prefix VARCHAR(10) NOT NULL, -- First 8 chars for display (e.g., "pl_abc123")

  -- Multi-tenant ready (nullable for now)
  tenant_id UUID DEFAULT NULL, -- Will reference organizations(id) in Phase 2

  -- Permissions (simple for Phase 1, RBAC in Phase 2)
  is_admin BOOLEAN NOT NULL DEFAULT true,
  scopes TEXT[] DEFAULT ARRAY['read', 'write', 'admin'], -- PostgreSQL array

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  last_used_at TIMESTAMPTZ DEFAULT NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- TASK CONFIGURATION
-- ============================================================================

-- Per-task execution mode and model selection
CREATE TABLE task_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Task identification
  task_name VARCHAR(100) NOT NULL UNIQUE, -- 'emailSemanticAnalysis', 'visualPhishingDetection', etc.
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) NOT NULL, -- 'analyzer', 'verdict', 'enrichment'

  -- Multi-tenant ready
  tenant_id UUID DEFAULT NULL,

  -- Execution configuration
  enabled BOOLEAN NOT NULL DEFAULT true,
  execution_mode VARCHAR(20) NOT NULL DEFAULT 'native', -- 'ai', 'hybrid', 'native'

  -- AI model configuration (nullable if execution_mode = 'native')
  ai_provider VARCHAR(50) DEFAULT NULL, -- 'anthropic', 'openai'
  ai_model VARCHAR(100) DEFAULT NULL, -- 'claude-3-5-sonnet', 'gpt-4o-mini'
  ai_temperature DECIMAL(3,2) DEFAULT 0.0,
  ai_max_tokens INTEGER DEFAULT NULL,
  ai_timeout_ms INTEGER DEFAULT 30000,

  -- Fallback configuration (for hybrid mode)
  fallback_to_native BOOLEAN NOT NULL DEFAULT true,
  fallback_on_error BOOLEAN NOT NULL DEFAULT true,

  -- Cost estimation (updated nightly)
  estimated_cost_per_call DECIMAL(10,6) DEFAULT 0.0, -- In dollars

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_task_configs_tenant_id ON task_configs(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_configs_enabled ON task_configs(enabled) WHERE deleted_at IS NULL;

-- ============================================================================
-- WHITELIST (Migrate from in-memory to PostgreSQL)
-- ============================================================================

CREATE TABLE whitelist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant ready
  tenant_id UUID DEFAULT NULL,

  -- Entry data
  type VARCHAR(20) NOT NULL, -- 'domain', 'email', 'url', 'ip'
  value TEXT NOT NULL, -- Normalized (lowercase for domain/email)
  description TEXT,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT NULL,

  -- Usage tracking
  match_count INTEGER NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMPTZ DEFAULT NULL,

  -- Metadata
  added_by VARCHAR(255) DEFAULT 'system', -- API key name or 'system'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,

  -- Uniqueness per tenant (or globally if tenant_id is NULL)
  UNIQUE(tenant_id, type, value)
);

CREATE INDEX idx_whitelist_type_value ON whitelist_entries(type, value) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_whitelist_tenant_id ON whitelist_entries(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_whitelist_expires_at ON whitelist_entries(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- ANALYSIS HISTORY & DEBUG
-- ============================================================================

CREATE TABLE analyses (
  id UUID PRIMARY KEY, -- Same as AnalysisResult.metadata.analysisId

  -- Multi-tenant ready
  tenant_id UUID DEFAULT NULL,

  -- Input data
  input_type VARCHAR(20) NOT NULL, -- 'url', 'email'
  input_data JSONB NOT NULL, -- Full NormalizedInput as JSON
  input_hash VARCHAR(64) NOT NULL, -- SHA-256 of normalized input for deduplication

  -- Result data
  verdict VARCHAR(20) NOT NULL, -- 'Safe', 'Suspicious', 'Malicious'
  confidence DECIMAL(4,3) NOT NULL, -- 0.000 to 1.000
  score DECIMAL(4,2) NOT NULL, -- 0.00 to 10.00
  alert_level VARCHAR(20) NOT NULL, -- 'none', 'low', 'medium', 'high'

  -- Analysis details
  red_flags JSONB NOT NULL, -- Array of RedFlag objects
  reasoning TEXT, -- AI-generated reasoning (if available)
  signals JSONB NOT NULL, -- Array of AnalysisSignal objects

  -- Execution metadata
  analyzers_run TEXT[] NOT NULL, -- Array of analyzer names
  execution_steps JSONB NOT NULL, -- Full execution trace
  duration_ms INTEGER NOT NULL,

  -- Cost tracking
  ai_cost_usd DECIMAL(10,6) DEFAULT 0.0,
  ai_tokens_input INTEGER DEFAULT 0,
  ai_tokens_output INTEGER DEFAULT 0,
  ai_calls_count INTEGER DEFAULT 0,

  -- Whitelist bypass
  whitelisted BOOLEAN NOT NULL DEFAULT false,
  whitelist_reason TEXT DEFAULT NULL,

  -- Metadata
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analyses_tenant_id ON analyses(tenant_id);
CREATE INDEX idx_analyses_verdict ON analyses(verdict);
CREATE INDEX idx_analyses_analyzed_at ON analyses(analyzed_at DESC);
CREATE INDEX idx_analyses_input_hash ON analyses(input_hash);
CREATE INDEX idx_analyses_whitelisted ON analyses(whitelisted);

-- GIN index for fast JSONB queries
CREATE INDEX idx_analyses_input_data ON analyses USING GIN(input_data);
CREATE INDEX idx_analyses_signals ON analyses USING GIN(signals);

-- ============================================================================
-- COST TRACKING
-- ============================================================================

-- Aggregated cost data (updated hourly via cron)
CREATE TABLE cost_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant ready
  tenant_id UUID DEFAULT NULL,

  -- Time period
  period_type VARCHAR(20) NOT NULL, -- 'hourly', 'daily', 'monthly'
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Aggregated metrics
  total_analyses INTEGER NOT NULL DEFAULT 0,
  total_cost_usd DECIMAL(10,2) NOT NULL DEFAULT 0.0,
  total_ai_calls INTEGER NOT NULL DEFAULT 0,
  total_tokens_input INTEGER NOT NULL DEFAULT 0,
  total_tokens_output INTEGER NOT NULL DEFAULT 0,

  -- Breakdown by task (JSONB for flexibility)
  cost_by_task JSONB DEFAULT '{}', -- { "emailSemanticAnalysis": 1.23, ... }
  cost_by_model JSONB DEFAULT '{}', -- { "claude-3-5-sonnet": 5.67, ... }

  -- Verdict distribution
  verdicts JSONB DEFAULT '{}', -- { "Safe": 100, "Suspicious": 20, "Malicious": 5 }

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, period_type, period_start)
);

CREATE INDEX idx_cost_summary_tenant_period ON cost_summary(tenant_id, period_type, period_start DESC);

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant ready
  tenant_id UUID DEFAULT NULL,

  -- Actor (who did it)
  actor_type VARCHAR(50) NOT NULL, -- 'api_key', 'user', 'system'
  actor_id UUID DEFAULT NULL, -- api_key.id or user.id
  actor_name VARCHAR(255) DEFAULT NULL, -- Human-readable

  -- Action (what happened)
  action VARCHAR(100) NOT NULL, -- 'whitelist.add', 'config.update', 'analysis.run'
  resource_type VARCHAR(50) NOT NULL, -- 'whitelist_entry', 'task_config', 'analysis'
  resource_id UUID DEFAULT NULL,

  -- Details
  description TEXT,
  changes JSONB DEFAULT NULL, -- Before/after for updates
  metadata JSONB DEFAULT NULL, -- Additional context

  -- Result
  status VARCHAR(20) NOT NULL, -- 'success', 'failure', 'error'
  error_message TEXT DEFAULT NULL,

  -- Request context
  ip_address INET DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  request_id UUID DEFAULT NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================================================
-- SYSTEM CONFIGURATION
-- ============================================================================

-- Key-value store for system-wide settings
CREATE TABLE system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  value_type VARCHAR(50) NOT NULL, -- 'string', 'number', 'boolean', 'json'
  is_sensitive BOOLEAN NOT NULL DEFAULT false, -- Hide value in UI
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO system_settings (key, value, description, value_type) VALUES
  ('cost_tracking.enabled', 'true', 'Enable AI cost tracking', 'boolean'),
  ('cost_tracking.budget_monthly_usd', '1000', 'Monthly AI cost budget in USD', 'number'),
  ('cost_tracking.alert_threshold_percent', '80', 'Alert when cost reaches this % of budget', 'number'),
  ('analysis.retention_days', '90', 'Keep analysis history for this many days', 'number'),
  ('whitelist.auto_expire_days', '365', 'Default expiration for whitelist entries', 'number'),
  ('api.rate_limit_per_minute', '100', 'API rate limit per API key', 'number');
```

---

## Backend Implementation

### Phase 1: Database Setup (Day 1)

#### File: `src/infrastructure/database/client.ts`

```typescript
import { Pool, QueryResult } from 'pg';
import { getConfig } from '../../config/app.config.js';
import { getLogger } from '../logging/logger.js';

const logger = getLogger();
let pool: Pool | null = null;

/**
 * Initialize PostgreSQL connection pool
 */
export function initDatabase(): Pool {
  if (pool) {
    return pool;
  }

  const config = getConfig();

  pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    max: config.database.poolSize || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected database error');
  });

  logger.info('Database connection pool initialized');
  return pool;
}

/**
 * Get database pool (initialize if needed)
 */
export function getDatabase(): Pool {
  if (!pool) {
    return initDatabase();
  }
  return pool;
}

/**
 * Execute a query with logging
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const db = getDatabase();

  try {
    const result = await db.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug({
      query: text,
      params: params,
      rows: result.rowCount,
      duration,
    }, 'Database query executed');

    return result;
  } catch (err) {
    logger.error({ err, query: text, params }, 'Database query failed');
    throw err;
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}
```

#### File: `src/infrastructure/database/migrations/001_initial_schema.sql`

```sql
-- Copy the full schema from the "Database Schema" section above
-- This will be executed manually or via migration tool
```

#### File: `src/config/app.config.ts` (Update)

```typescript
// Add database configuration to existing config

interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  poolSize: number;
  ssl: boolean;
}

// In the Zod schema, add:
const DatabaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().default(5432),
  name: z.string().default('phishlogic'),
  user: z.string().default('phishlogic'),
  password: z.string(),
  poolSize: z.coerce.number().default(20),
  ssl: z.boolean().default(false),
});

// In loadConfig(), add:
database: {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  name: process.env.DB_NAME || 'phishlogic',
  user: process.env.DB_USER || 'phishlogic',
  password: process.env.DB_PASSWORD!,
  poolSize: parseInt(process.env.DB_POOL_SIZE || '20', 10),
  ssl: process.env.DB_SSL === 'true',
}
```

---

### Phase 2: Migrate Whitelist to PostgreSQL (Day 1)

#### File: `src/core/services/whitelist.service.ts` (Refactor)

```typescript
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../infrastructure/database/client.js';
import { getLogger } from '../../infrastructure/logging/logger.js';

const logger = getLogger();

export interface WhitelistEntry {
  id: string;
  tenantId: string | null; // Multi-tenant ready
  type: 'domain' | 'email' | 'url' | 'ip';
  value: string;
  description?: string;
  isActive: boolean;
  expiresAt?: Date;
  matchCount: number;
  lastMatchedAt?: Date;
  addedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class WhitelistService {
  private tenantId: string | null;

  constructor(tenantId?: string) {
    this.tenantId = tenantId || null; // Multi-tenant ready
  }

  /**
   * Add a new whitelist entry
   */
  async addEntry(
    type: WhitelistEntry['type'],
    value: string,
    description?: string,
    expiresAt?: Date,
    addedBy: string = 'system'
  ): Promise<WhitelistEntry> {
    const normalizedValue = this.normalizeValue(type, value);
    const id = uuidv4();

    const result = await query<WhitelistEntry>(
      `INSERT INTO whitelist_entries
       (id, tenant_id, type, value, description, expires_at, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, this.tenantId, type, normalizedValue, description, expiresAt, addedBy]
    );

    logger.info({ entryId: id, type, value: normalizedValue }, 'Whitelist entry added');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Remove a whitelist entry (soft delete)
   */
  async removeEntry(id: string): Promise<void> {
    await query(
      `UPDATE whitelist_entries
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );

    logger.info({ entryId: id }, 'Whitelist entry removed');
  }

  /**
   * Check if a value is whitelisted
   */
  async check(
    type: WhitelistEntry['type'],
    value: string
  ): Promise<{ whitelisted: boolean; entry?: WhitelistEntry }> {
    const normalizedValue = this.normalizeValue(type, value);

    const result = await query<any>(
      `SELECT * FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND type = $2
         AND value = $3
         AND is_active = true
         AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [this.tenantId, type, normalizedValue]
    );

    if (result.rows.length > 0) {
      const entry = this.mapRow(result.rows[0]);

      // Update match count asynchronously (don't wait)
      this.incrementMatchCount(entry.id).catch((err) => {
        logger.warn({ err, entryId: entry.id }, 'Failed to increment match count');
      });

      return { whitelisted: true, entry };
    }

    return { whitelisted: false };
  }

  /**
   * Get all whitelist entries
   */
  async getAll(): Promise<WhitelistEntry[]> {
    const result = await query<any>(
      `SELECT * FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [this.tenantId]
    );

    return result.rows.map(this.mapRow);
  }

  /**
   * Get whitelist statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
  }> {
    const result = await query<any>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true) as active,
         type,
         COUNT(*) as type_count
       FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND deleted_at IS NULL
       GROUP BY type`,
      [this.tenantId]
    );

    const stats = {
      total: 0,
      active: 0,
      byType: {} as Record<string, number>,
    };

    result.rows.forEach((row) => {
      stats.total += parseInt(row.type_count, 10);
      if (row.is_active) {
        stats.active += parseInt(row.type_count, 10);
      }
      stats.byType[row.type] = parseInt(row.type_count, 10);
    });

    return stats;
  }

  /**
   * Normalize value based on type
   */
  private normalizeValue(type: WhitelistEntry['type'], value: string): string {
    if (type === 'domain' || type === 'email') {
      return value.toLowerCase().trim();
    }
    return value.trim();
  }

  /**
   * Increment match count for an entry
   */
  private async incrementMatchCount(id: string): Promise<void> {
    await query(
      `UPDATE whitelist_entries
       SET match_count = match_count + 1,
           last_matched_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Map database row to WhitelistEntry
   */
  private mapRow(row: any): WhitelistEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      type: row.type,
      value: row.value,
      description: row.description,
      isActive: row.is_active,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      matchCount: row.match_count,
      lastMatchedAt: row.last_matched_at ? new Date(row.last_matched_at) : undefined,
      addedBy: row.added_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

/**
 * Factory function (request-scoped, tenant-aware)
 */
export function getWhitelistService(tenantId?: string): WhitelistService {
  return new WhitelistService(tenantId);
}
```

---

### Phase 3: Admin API Endpoints (Days 2-3)

#### File: `src/api/controllers/admin/task-config.controller.ts`

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

// Validation schemas
const UpdateTaskConfigSchema = z.object({
  enabled: z.boolean().optional(),
  executionMode: z.enum(['ai', 'hybrid', 'native']).optional(),
  aiProvider: z.enum(['anthropic', 'openai']).optional(),
  aiModel: z.string().optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
  aiMaxTokens: z.number().positive().optional(),
  aiTimeoutMs: z.number().positive().optional(),
  fallbackToNative: z.boolean().optional(),
  fallbackOnError: z.boolean().optional(),
});

/**
 * GET /api/admin/tasks - Get all task configurations
 */
export async function getAllTasks(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const result = await query(
      `SELECT * FROM task_configs
       WHERE deleted_at IS NULL
       ORDER BY task_name ASC`
    );

    reply.send({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get task configs');
    reply.status(500).send({
      success: false,
      error: 'Failed to get task configurations',
    });
  }
}

/**
 * PUT /api/admin/tasks/:taskName - Update task configuration
 */
export async function updateTask(
  request: FastifyRequest<{ Params: { taskName: string }; Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { taskName } = request.params;
    const updates = UpdateTaskConfigSchema.parse(request.body);

    // Build dynamic UPDATE query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      // Convert camelCase to snake_case
      const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      setClauses.push(`${columnName} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    });

    if (setClauses.length === 0) {
      reply.status(400).send({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(taskName);

    const result = await query(
      `UPDATE task_configs
       SET ${setClauses.join(', ')}
       WHERE task_name = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Task not found',
      });
      return;
    }

    logger.info({ taskName, updates }, 'Task config updated');

    reply.send({
      success: true,
      message: `Task ${taskName} configuration updated`,
      data: result.rows[0],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Failed to update task config');
    reply.status(500).send({
      success: false,
      error: 'Failed to update task configuration',
    });
  }
}
```

#### File: `src/api/controllers/admin/cost.controller.ts`

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

/**
 * GET /api/admin/costs/summary - Get cost summary
 */
export async function getCostSummary(
  request: FastifyRequest<{ Querystring: { period?: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const period = request.query.period || 'monthly';

    // Get current period costs
    const currentResult = await query(
      `SELECT * FROM cost_summary
       WHERE period_type = $1
         AND period_start <= NOW()
         AND period_end >= NOW()
       ORDER BY period_start DESC
       LIMIT 1`,
      [period]
    );

    // Get total analyses this month
    const analysesResult = await query(
      `SELECT COUNT(*) as total,
              SUM(ai_cost_usd) as total_cost,
              AVG(ai_cost_usd) as avg_cost
       FROM analyses
       WHERE analyzed_at >= date_trunc('month', NOW())`
    );

    // Get budget settings
    const budgetResult = await query(
      `SELECT value FROM system_settings WHERE key = 'cost_tracking.budget_monthly_usd'`
    );

    const budget = budgetResult.rows[0]
      ? parseFloat(budgetResult.rows[0].value)
      : 1000;

    const totalCost = parseFloat(analysesResult.rows[0].total_cost || '0');
    const percentOfBudget = (totalCost / budget) * 100;

    reply.send({
      success: true,
      data: {
        summary: {
          currentMonth: totalCost,
          budget: budget,
          percentOfBudget: percentOfBudget.toFixed(1),
          totalAnalyses: parseInt(analysesResult.rows[0].total || '0', 10),
          avgCostPerAnalysis: parseFloat(analysesResult.rows[0].avg_cost || '0'),
        },
        period: currentResult.rows[0] || null,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get cost summary');
    reply.status(500).send({
      success: false,
      error: 'Failed to get cost summary',
    });
  }
}

/**
 * GET /api/admin/costs/breakdown - Get detailed cost breakdown
 */
export async function getCostBreakdown(
  request: FastifyRequest<{ Querystring: { start?: string; end?: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const start = request.query.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = request.query.end || new Date().toISOString();

    // Daily costs
    const dailyResult = await query(
      `SELECT DATE(analyzed_at) as date,
              COUNT(*) as analyses,
              SUM(ai_cost_usd) as cost
       FROM analyses
       WHERE analyzed_at >= $1 AND analyzed_at <= $2
       GROUP BY DATE(analyzed_at)
       ORDER BY date ASC`,
      [start, end]
    );

    // Cost by task (aggregate from execution_steps JSON)
    const taskResult = await query(
      `SELECT jsonb_object_keys(cost_by_task) as task,
              SUM((cost_by_task->>jsonb_object_keys(cost_by_task))::numeric) as cost
       FROM cost_summary
       WHERE period_start >= $1 AND period_end <= $2
       GROUP BY task
       ORDER BY cost DESC`,
      [start, end]
    );

    // Cost by model
    const modelResult = await query(
      `SELECT jsonb_object_keys(cost_by_model) as model,
              SUM((cost_by_model->>jsonb_object_keys(cost_by_model))::numeric) as cost
       FROM cost_summary
       WHERE period_start >= $1 AND period_end <= $2
       GROUP BY model
       ORDER BY cost DESC`,
      [start, end]
    );

    reply.send({
      success: true,
      data: {
        dailyCosts: dailyResult.rows,
        taskBreakdown: taskResult.rows.reduce((acc, row) => {
          acc[row.task] = parseFloat(row.cost);
          return acc;
        }, {} as Record<string, number>),
        modelBreakdown: modelResult.rows.reduce((acc, row) => {
          acc[row.model] = parseFloat(row.cost);
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get cost breakdown');
    reply.status(500).send({
      success: false,
      error: 'Failed to get cost breakdown',
    });
  }
}
```

#### File: `src/api/controllers/admin/debug.controller.ts`

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../../infrastructure/database/client.js';
import { getLogger } from '../../../infrastructure/logging/logger.js';

const logger = getLogger();

/**
 * GET /api/admin/debug/:analysisId - Get analysis by ID
 */
export async function getAnalysisById(
  request: FastifyRequest<{ Params: { analysisId: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { analysisId } = request.params;

    const result = await query(
      `SELECT * FROM analyses WHERE id = $1`,
      [analysisId]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'Analysis not found',
      });
      return;
    }

    reply.send({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get analysis');
    reply.status(500).send({
      success: false,
      error: 'Failed to get analysis',
    });
  }
}

/**
 * POST /api/admin/debug/search - Search analyses
 */
export async function searchAnalyses(
  request: FastifyRequest<{
    Body: {
      verdict?: string;
      startDate?: string;
      endDate?: string;
      inputType?: string;
      limit?: number;
    };
  }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { verdict, startDate, endDate, inputType, limit = 50 } = request.body;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let paramIndex = 1;

    if (verdict) {
      conditions.push(`verdict = $${paramIndex}`);
      values.push(verdict);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`analyzed_at >= $${paramIndex}`);
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`analyzed_at <= $${paramIndex}`);
      values.push(endDate);
      paramIndex++;
    }

    if (inputType) {
      conditions.push(`input_type = $${paramIndex}`);
      values.push(inputType);
      paramIndex++;
    }

    values.push(limit);

    const result = await query(
      `SELECT id, input_type, verdict, score, alert_level,
              ai_cost_usd, duration_ms, whitelisted, analyzed_at
       FROM analyses
       WHERE ${conditions.join(' AND ')}
       ORDER BY analyzed_at DESC
       LIMIT $${paramIndex}`,
      values
    );

    reply.send({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to search analyses');
    reply.status(500).send({
      success: false,
      error: 'Failed to search analyses',
    });
  }
}
```

---

### Phase 4: Admin Routes (Day 3)

#### File: `src/api/routes/admin.routes.ts`

```typescript
import { FastifyInstance } from 'fastify';
import {
  getAllTasks,
  updateTask,
} from '../controllers/admin/task-config.controller.js';
import {
  getCostSummary,
  getCostBreakdown,
} from '../controllers/admin/cost.controller.js';
import {
  getAnalysisById,
  searchAnalyses,
} from '../controllers/admin/debug.controller.js';

/**
 * Admin routes (protected by API key middleware)
 */
export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // Task configuration
  fastify.get('/tasks', getAllTasks);
  fastify.put('/tasks/:taskName', updateTask);

  // Cost analytics
  fastify.get('/costs/summary', getCostSummary);
  fastify.get('/costs/breakdown', getCostBreakdown);

  // Debug interface
  fastify.get('/debug/:analysisId', getAnalysisById);
  fastify.post('/debug/search', searchAnalyses);

  // Whitelist (reuse existing controller, just add to admin routes)
  fastify.get('/whitelist', (request, reply) => {
    // Import and call existing whitelist controller
  });
}
```

#### File: `src/api/routes/index.ts` (Update)

```typescript
// Add admin routes
import { adminRoutes } from './admin.routes.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // ... existing routes ...

  // Admin routes (protected)
  fastify.register(adminRoutes, { prefix: '/api/admin' });
}
```

---

## Frontend Implementation (Days 4-10)

### Project Setup

```bash
# Create admin-ui directory
mkdir admin-ui
cd admin-ui

# Initialize Vite + React + TypeScript
npm create vite@latest . -- --template react-ts

# Install dependencies
npm install

# Install UI libraries
npm install @tanstack/react-query axios zod
npm install -D tailwindcss postcss autoprefixer
npm install @shadcn/ui react-router-dom recharts date-fns

# Initialize Tailwind
npx tailwindcss init -p
```

### File Structure

```
admin-ui/
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/
│   │   ├── client.ts
│   │   └── endpoints/
│   │       ├── tasks.ts
│   │       ├── costs.ts
│   │       ├── debug.ts
│   │       └── whitelist.ts
│   ├── components/
│   │   ├── ui/ (Shadcn components)
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Layout.tsx
│   │   └── charts/
│   │       ├── CostChart.tsx
│   │       └── UsageChart.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── TaskConfiguration.tsx
│   │   ├── WhitelistManagement.tsx
│   │   ├── CostAnalytics.tsx
│   │   ├── DebugInterface.tsx
│   │   └── LogViewer.tsx
│   ├── hooks/
│   │   ├── useTaskConfig.ts
│   │   ├── useCosts.ts
│   │   └── useDebug.ts
│   └── types/
│       └── api.ts
└── public/
```

I'll provide key frontend files in the next section due to length constraints.

---

## Implementation Timeline

### Week 1: Backend Foundation

**Day 1: Database Setup**
- [ ] Install PostgreSQL (local or Docker)
- [ ] Create database and user
- [ ] Run schema migration (001_initial_schema.sql)
- [ ] Implement database client (client.ts)
- [ ] Update config to include database settings
- [ ] Test database connection

**Day 2: Migrate Whitelist Service**
- [ ] Refactor WhitelistService to use PostgreSQL
- [ ] Update whitelist controller
- [ ] Test all whitelist endpoints
- [ ] Verify backward compatibility

**Day 3: Admin API Endpoints**
- [ ] Implement task-config controller
- [ ] Implement cost controller
- [ ] Implement debug controller
- [ ] Create admin routes
- [ ] Add API key middleware (simple for now)
- [ ] Test all endpoints with Postman/curl

### Week 2: Frontend Development

**Days 4-5: Setup & Layout**
- [ ] Initialize Vite + React project
- [ ] Setup Tailwind CSS
- [ ] Install Shadcn UI components
- [ ] Create layout (Header, Sidebar)
- [ ] Setup React Router
- [ ] Setup React Query

**Days 6-7: Core Pages**
- [ ] Task Configuration page
- [ ] Whitelist Management page
- [ ] API client integration

**Days 8-9: Analytics & Debug**
- [ ] Cost Analytics page with charts
- [ ] Debug Interface page
- [ ] Log Viewer page (basic)

**Day 10: Polish & Testing**
- [ ] End-to-end testing
- [ ] Error handling
- [ ] Loading states
- [ ] Documentation

### Week 3: Integration & Deployment

**Days 11-12: Analysis History Tracking**
- [ ] Update analysis engine to store results
- [ ] Add cost tracking to AI calls
- [ ] Test analysis storage

**Days 13-14: Deployment**
- [ ] Docker setup for PostgreSQL
- [ ] Environment configuration
- [ ] Deploy backend + frontend
- [ ] End-to-end verification

**Day 15: Documentation**
- [ ] API documentation
- [ ] User guide
- [ ] Deployment guide

---

## Verification Steps

### Backend Verification

```bash
# 1. Test database connection
psql -h localhost -U phishlogic -d phishlogic -c "SELECT version();"

# 2. Verify schema
psql -h localhost -U phishlogic -d phishlogic -c "\dt"

# 3. Test admin endpoints
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/admin/tasks

# 4. Test whitelist migration
curl -X POST http://localhost:3000/api/v1/whitelist \
  -H "Content-Type: application/json" \
  -d '{"type": "domain", "value": "microsoft.com"}'

# 5. Run analysis and verify storage
curl -X POST http://localhost:3000/api/v1/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Check if stored
psql -c "SELECT id, verdict, score FROM analyses ORDER BY analyzed_at DESC LIMIT 1;"
```

### Frontend Verification

```bash
# 1. Start dev server
cd admin-ui
npm run dev

# 2. Navigate to http://localhost:5173

# 3. Verify each page:
# - Dashboard: Shows summary stats
# - Task Config: Can toggle AI/Hybrid/Native
# - Whitelist: Can add/remove entries
# - Costs: Shows charts and breakdown
# - Debug: Can search by analysis ID
```

---

## Migration Path to Multi-Tenancy (Phase 2)

When you have 25+ customers and need multi-tenancy:

### Step 1: Add Organizations Table (1 day)

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Make tenant_id NOT NULL and add foreign key
ALTER TABLE api_keys ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE api_keys ADD CONSTRAINT fk_api_keys_tenant
  FOREIGN KEY (tenant_id) REFERENCES organizations(id);

-- Repeat for all tables with tenant_id
```

### Step 2: Add Users Table (1 day)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  role VARCHAR(50) NOT NULL, -- 'admin', 'member', 'viewer'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Step 3: Update Middleware (2 days)

- Extract tenant_id from API key
- Inject into request context
- Update all services to use tenant_id from context

### Step 4: Update UI (3-5 days)

- Add organization switcher (if user in multiple orgs)
- Add user management page
- Add organization settings page

**Total Migration Effort:** 7-10 days

---

## Files Created Summary

### Backend (New Files)

```
src/
├── infrastructure/
│   └── database/
│       ├── client.ts
│       └── migrations/
│           └── 001_initial_schema.sql
├── api/
│   ├── controllers/
│   │   └── admin/
│   │       ├── task-config.controller.ts
│   │       ├── cost.controller.ts
│   │       └── debug.controller.ts
│   └── routes/
│       └── admin.routes.ts
└── core/
    └── services/
        └── whitelist.service.ts (refactored)
```

### Frontend (New Directory)

```
admin-ui/
├── src/
│   ├── api/client.ts
│   ├── pages/ (6 pages)
│   ├── components/ (layout + charts)
│   └── hooks/ (3 custom hooks)
└── package.json
```

### Modified Files

```
src/
├── config/app.config.ts (add database config)
└── api/routes/index.ts (register admin routes)
```

---

## Success Criteria

### Phase 1 Complete When:

✅ PostgreSQL database running with all tables
✅ Whitelist migrated from memory to database
✅ All admin API endpoints working
✅ React UI deployed and accessible
✅ Can configure tasks via UI (no server restart)
✅ Can manage whitelist via UI
✅ Can view cost analytics
✅ Can search analyses by ID
✅ Analysis history stored in database

### Ready for Multi-Tenancy When:

✅ Using UUIDs for all IDs
✅ All tables have tenant_id column (nullable)
✅ Services use factory pattern (not singletons)
✅ Request context architecture in place
✅ API keys stored in database

---

## Next Steps

1. **Start with Database Setup** - Day 1 tasks
2. **Migrate Whitelist** - Day 2 tasks
3. **Build Admin APIs** - Day 3 tasks
4. **Build React UI** - Days 4-10

Would you like me to:
1. Generate the complete frontend code (React components)?
2. Create Docker setup for easy deployment?
3. Start implementing the backend files?
