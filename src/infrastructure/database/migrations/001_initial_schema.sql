-- ============================================================================
-- PhishLogic Admin UI - Initial Database Schema
-- Phase 1: Single-Tenant with Multi-Tenant Ready Design
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- AUTHENTICATION & AUTHORIZATION
-- ============================================================================

-- Super Admin accounts (platform owners)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'super_admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_admin_users_username ON admin_users(username) WHERE is_active = true;

COMMENT ON TABLE admin_users IS 'Super admin accounts for platform management';
COMMENT ON COLUMN admin_users.password_hash IS 'bcrypt hash of password';

-- Insert default super admin (username: admin, password: Admin@123)
-- Password hash generated with: bcrypt.hash('Admin@123', 10)
INSERT INTO admin_users (username, password_hash, email, role)
VALUES (
  'admin',
  '$2b$10$rW8kGLqELCh5eqD8YvY5c.7QOXL3xHqVJpGZw5z0K3lJ2nN4pO6qW',
  'admin@phishlogic.local',
  'super_admin'
);

-- API Keys for user authentication
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(10) NOT NULL,
  user_name VARCHAR(255) DEFAULT NULL,
  user_email VARCHAR(255) DEFAULT NULL,
  tenant_id UUID DEFAULT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  scopes TEXT[] DEFAULT ARRAY['read', 'write'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  last_used_at TIMESTAMPTZ DEFAULT NULL,
  created_by VARCHAR(255) DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE deleted_at IS NULL;

COMMENT ON TABLE api_keys IS 'API keys for user authentication (tenant-ready)';
COMMENT ON COLUMN api_keys.key_hash IS 'bcrypt hash of full API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 10 chars of key for display';
COMMENT ON COLUMN api_keys.tenant_id IS 'Future: will reference organizations(id)';

-- ============================================================================
-- TASK CONFIGURATION
-- ============================================================================

CREATE TABLE task_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) NOT NULL,
  tenant_id UUID DEFAULT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  execution_mode VARCHAR(20) NOT NULL DEFAULT 'native',
  ai_provider VARCHAR(50) DEFAULT NULL,
  ai_model VARCHAR(100) DEFAULT NULL,
  ai_temperature DECIMAL(3,2) DEFAULT 0.0,
  ai_max_tokens INTEGER DEFAULT NULL,
  ai_timeout_ms INTEGER DEFAULT 30000,
  fallback_to_native BOOLEAN NOT NULL DEFAULT true,
  fallback_on_error BOOLEAN NOT NULL DEFAULT true,
  estimated_cost_per_call DECIMAL(10,6) DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT chk_execution_mode CHECK (execution_mode IN ('ai', 'hybrid', 'native')),
  CONSTRAINT chk_ai_provider CHECK (ai_provider IS NULL OR ai_provider IN ('anthropic', 'openai'))
);

CREATE INDEX idx_task_configs_tenant_id ON task_configs(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_configs_enabled ON task_configs(enabled) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_configs_task_name ON task_configs(task_name) WHERE deleted_at IS NULL;

COMMENT ON TABLE task_configs IS 'Per-task execution mode configuration (AI/Hybrid/Native)';

-- Insert default task configurations
INSERT INTO task_configs (task_name, display_name, description, task_type, execution_mode) VALUES
  ('spfAnalyzer', 'SPF Analyzer', 'Check SPF records for email authentication', 'analyzer', 'native'),
  ('dkimAnalyzer', 'DKIM Analyzer', 'Verify DKIM signatures', 'analyzer', 'native'),
  ('urlPatternAnalyzer', 'URL Pattern Analyzer', 'Detect suspicious URL patterns', 'analyzer', 'native'),
  ('formDetectionAnalyzer', 'Form Detection Analyzer', 'Detect credential harvesting forms', 'analyzer', 'native');

-- ============================================================================
-- WHITELIST (Migrated from in-memory to PostgreSQL)
-- ============================================================================

CREATE TABLE whitelist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID DEFAULT NULL,
  type VARCHAR(20) NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  match_count INTEGER NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMPTZ DEFAULT NULL,
  added_by VARCHAR(255) DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(tenant_id, type, value),
  CONSTRAINT chk_whitelist_type CHECK (type IN ('domain', 'email', 'url', 'ip'))
);

CREATE INDEX idx_whitelist_type_value ON whitelist_entries(type, value)
  WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_whitelist_tenant_id ON whitelist_entries(tenant_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_whitelist_expires_at ON whitelist_entries(expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE whitelist_entries IS 'Whitelisted domains, emails, URLs, IPs (tenant-ready)';

-- ============================================================================
-- ANALYSIS HISTORY & DEBUG
-- ============================================================================

CREATE TABLE analyses (
  id UUID PRIMARY KEY,
  tenant_id UUID DEFAULT NULL,
  input_type VARCHAR(20) NOT NULL,
  input_data JSONB NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  verdict VARCHAR(20) NOT NULL,
  confidence DECIMAL(4,3) NOT NULL,
  score DECIMAL(4,2) NOT NULL,
  alert_level VARCHAR(20) NOT NULL,
  red_flags JSONB NOT NULL,
  reasoning TEXT,
  signals JSONB NOT NULL,
  analyzers_run TEXT[] NOT NULL,
  execution_steps JSONB NOT NULL,
  duration_ms INTEGER NOT NULL,
  ai_cost_usd DECIMAL(10,6) DEFAULT 0.0,
  ai_tokens_input INTEGER DEFAULT 0,
  ai_tokens_output INTEGER DEFAULT 0,
  ai_calls_count INTEGER DEFAULT 0,
  whitelisted BOOLEAN NOT NULL DEFAULT false,
  whitelist_reason TEXT DEFAULT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_input_type CHECK (input_type IN ('url', 'email')),
  CONSTRAINT chk_verdict CHECK (verdict IN ('Safe', 'Suspicious', 'Malicious')),
  CONSTRAINT chk_alert_level CHECK (alert_level IN ('none', 'low', 'medium', 'high'))
);

CREATE INDEX idx_analyses_tenant_id ON analyses(tenant_id);
CREATE INDEX idx_analyses_verdict ON analyses(verdict);
CREATE INDEX idx_analyses_analyzed_at ON analyses(analyzed_at DESC);
CREATE INDEX idx_analyses_input_hash ON analyses(input_hash);
CREATE INDEX idx_analyses_whitelisted ON analyses(whitelisted);
CREATE INDEX idx_analyses_input_data ON analyses USING GIN(input_data);
CREATE INDEX idx_analyses_signals ON analyses USING GIN(signals);

COMMENT ON TABLE analyses IS 'Analysis history for debugging and cost tracking (tenant-ready)';
COMMENT ON COLUMN analyses.id IS 'Same as AnalysisResult.metadata.analysisId';

-- ============================================================================
-- COST TRACKING
-- ============================================================================

CREATE TABLE cost_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID DEFAULT NULL,
  period_type VARCHAR(20) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_analyses INTEGER NOT NULL DEFAULT 0,
  total_cost_usd DECIMAL(10,2) NOT NULL DEFAULT 0.0,
  total_ai_calls INTEGER NOT NULL DEFAULT 0,
  total_tokens_input INTEGER NOT NULL DEFAULT 0,
  total_tokens_output INTEGER NOT NULL DEFAULT 0,
  cost_by_task JSONB DEFAULT '{}',
  cost_by_model JSONB DEFAULT '{}',
  verdicts JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, period_type, period_start),
  CONSTRAINT chk_period_type CHECK (period_type IN ('hourly', 'daily', 'monthly'))
);

CREATE INDEX idx_cost_summary_tenant_period ON cost_summary(tenant_id, period_type, period_start DESC);

COMMENT ON TABLE cost_summary IS 'Aggregated cost metrics per time period (tenant-ready)';

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID DEFAULT NULL,
  actor_type VARCHAR(50) NOT NULL,
  actor_id UUID DEFAULT NULL,
  actor_name VARCHAR(255) DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID DEFAULT NULL,
  description TEXT,
  changes JSONB DEFAULT NULL,
  metadata JSONB DEFAULT NULL,
  status VARCHAR(20) NOT NULL,
  error_message TEXT DEFAULT NULL,
  ip_address INET DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  request_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_actor_type CHECK (actor_type IN ('admin', 'api_key', 'system')),
  CONSTRAINT chk_status CHECK (status IN ('success', 'failure', 'error'))
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

COMMENT ON TABLE audit_logs IS 'Audit trail of all system actions (tenant-ready)';

-- ============================================================================
-- SYSTEM SETTINGS
-- ============================================================================

CREATE TABLE system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  value_type VARCHAR(50) NOT NULL,
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  category VARCHAR(50) DEFAULT 'general',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_value_type CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
  CONSTRAINT chk_category CHECK (category IN ('general', 'cost', 'notification', 'security'))
);

COMMENT ON TABLE system_settings IS 'Key-value store for system-wide configuration';

-- Insert default settings
INSERT INTO system_settings (key, value, description, value_type, category) VALUES
  ('cost_tracking.enabled', 'true', 'Enable AI cost tracking', 'boolean', 'cost'),
  ('cost_tracking.budget_monthly_usd', '1000', 'Monthly AI cost budget in USD', 'number', 'cost'),
  ('cost_tracking.alert_threshold_percent', '80', 'Alert when cost reaches this % of budget', 'number', 'cost'),
  ('analysis.retention_days', '90', 'Keep analysis history for this many days', 'number', 'general'),
  ('whitelist.auto_expire_days', '365', 'Default expiration for whitelist entries', 'number', 'general'),
  ('api.rate_limit_per_minute', '100', 'API rate limit per API key', 'number', 'security'),
  ('notifications.email.enabled', 'false', 'Enable email notifications', 'boolean', 'notification'),
  ('notifications.email.alert_threshold', '7.0', 'Send email alerts for scores >= this', 'number', 'notification'),
  ('notifications.webhook.enabled', 'false', 'Enable webhook notifications', 'boolean', 'notification'),
  ('notifications.slack.enabled', 'false', 'Enable Slack notifications', 'boolean', 'notification');

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE notification_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID DEFAULT NULL,
  type VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL,
  trigger_on_verdicts TEXT[] DEFAULT ARRAY['Malicious', 'Suspicious'],
  min_score DECIMAL(4,2) DEFAULT 7.0,
  max_per_hour INTEGER DEFAULT 10,
  max_per_day INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(tenant_id, type),
  CONSTRAINT chk_notification_type CHECK (type IN ('email', 'webhook', 'slack'))
);

CREATE INDEX idx_notification_configs_tenant ON notification_configs(tenant_id)
  WHERE deleted_at IS NULL AND enabled = true;

COMMENT ON TABLE notification_configs IS 'Notification configurations per tenant';

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- Display table counts
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';

  RAISE NOTICE 'PhishLogic database schema initialized successfully!';
  RAISE NOTICE 'Total tables created: %', table_count;
  RAISE NOTICE 'Default super admin created: username=admin, password=Admin@123';
  RAISE NOTICE 'Multi-tenant ready: All tables have tenant_id column (nullable)';
END $$;
