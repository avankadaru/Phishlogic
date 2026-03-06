-- ============================================================================
-- PhishLogic Admin UI - Central AI Model Management & Support System
-- ============================================================================
-- Migration: 005_ai_models_and_support
-- Purpose: Add central AI model configuration system and user support features
--
-- Changes:
-- 1. Create ai_model_configs table for reusable AI model configurations
-- 2. Update task_configs to reference AI models by ID instead of storing credentials
-- 3. Create support_requests table for user feedback and issue reporting
-- 4. Add indexes for performance optimization
-- ============================================================================

-- Step 1: Create ai_model_configs table for central AI model management
CREATE TABLE IF NOT EXISTS ai_model_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('anthropic', 'openai', 'google', 'custom')),
  model_id VARCHAR(200) NOT NULL,
  api_key TEXT NOT NULL,
  temperature DECIMAL(3,2) DEFAULT 0.3 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER DEFAULT 4096 CHECK (max_tokens > 0),
  timeout_ms INTEGER DEFAULT 30000 CHECK (timeout_ms > 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  deleted_at TIMESTAMP
);

COMMENT ON TABLE ai_model_configs IS 'Central storage for AI model configurations - configure once, reuse across tasks';
COMMENT ON COLUMN ai_model_configs.name IS 'Custom name for easy reference (e.g., "Claude Production", "GPT-4 Testing")';
COMMENT ON COLUMN ai_model_configs.provider IS 'AI provider: anthropic, openai, google, or custom';
COMMENT ON COLUMN ai_model_configs.model_id IS 'Actual model identifier (e.g., "claude-3-5-sonnet-20241022")';
COMMENT ON COLUMN ai_model_configs.api_key IS 'Encrypted API key - decrypted only when making API calls';
COMMENT ON COLUMN ai_model_configs.temperature IS 'Model temperature (0-2) - controls randomness in responses';
COMMENT ON COLUMN ai_model_configs.max_tokens IS 'Maximum tokens per request';
COMMENT ON COLUMN ai_model_configs.timeout_ms IS 'Request timeout in milliseconds';
COMMENT ON COLUMN ai_model_configs.last_used_at IS 'Last time this model was used in an analysis';
COMMENT ON COLUMN ai_model_configs.usage_count IS 'Number of times this model has been used';

-- Step 2: Add ai_model_id foreign key to task_configs
ALTER TABLE task_configs ADD COLUMN IF NOT EXISTS ai_model_id UUID REFERENCES ai_model_configs(id) ON DELETE SET NULL;

COMMENT ON COLUMN task_configs.ai_model_id IS 'Reference to ai_model_configs - used when execution_mode is "hybrid" or "ai"';

-- Step 3: Drop deprecated columns from task_configs (credentials now in ai_model_configs)
ALTER TABLE task_configs DROP COLUMN IF EXISTS ai_provider;
ALTER TABLE task_configs DROP COLUMN IF EXISTS ai_model;
ALTER TABLE task_configs DROP COLUMN IF EXISTS ai_temperature;
ALTER TABLE task_configs DROP COLUMN IF EXISTS ai_max_tokens;
ALTER TABLE task_configs DROP COLUMN IF EXISTS ai_timeout_ms;

-- Step 4: Create support_requests table for user feedback
CREATE TABLE IF NOT EXISTS support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('issue', 'improvement')),
  category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL CHECK (LENGTH(description) >= 20),
  email VARCHAR(255),
  preferred_contact_time VARCHAR(50),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  admin_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);

COMMENT ON TABLE support_requests IS 'User-submitted issues, feature requests, and feedback';
COMMENT ON COLUMN support_requests.request_type IS 'Type: issue (bug report) or improvement (feature request)';
COMMENT ON COLUMN support_requests.category IS 'Category: general, settings, tasks, debug, cost, whitelist, notifications, etc.';
COMMENT ON COLUMN support_requests.description IS 'Detailed description of the issue or improvement (minimum 20 characters)';
COMMENT ON COLUMN support_requests.email IS 'Optional: User email for follow-up';
COMMENT ON COLUMN support_requests.preferred_contact_time IS 'Optional: Best time to contact user';
COMMENT ON COLUMN support_requests.status IS 'Current status: open, in_progress, resolved, closed';
COMMENT ON COLUMN support_requests.priority IS 'Admin-assigned priority level';
COMMENT ON COLUMN support_requests.admin_notes IS 'Internal notes for admins';

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_model_configs_name ON ai_model_configs(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_model_configs_provider ON ai_model_configs(provider) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_configs_ai_model ON task_configs(ai_model_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_requests_category ON support_requests(category, created_at DESC);

-- Step 6: Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to ai_model_configs
DROP TRIGGER IF EXISTS update_ai_model_configs_updated_at ON ai_model_configs;
CREATE TRIGGER update_ai_model_configs_updated_at
  BEFORE UPDATE ON ai_model_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to support_requests
DROP TRIGGER IF EXISTS update_support_requests_updated_at ON support_requests;
CREATE TRIGGER update_support_requests_updated_at
  BEFORE UPDATE ON support_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 7: Display migration summary
DO $$
DECLARE
  ai_model_count INTEGER;
  support_request_count INTEGER;
  task_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ai_model_count FROM ai_model_configs WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO support_request_count FROM support_requests;
  SELECT COUNT(*) INTO task_count FROM task_configs WHERE deleted_at IS NULL;

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration 005_ai_models_and_support completed successfully!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  ✓ Created ai_model_configs table for central AI model management';
  RAISE NOTICE '  ✓ Updated task_configs to reference AI models by ID';
  RAISE NOTICE '  ✓ Removed 5 deprecated credential columns from task_configs';
  RAISE NOTICE '  ✓ Created support_requests table for user feedback';
  RAISE NOTICE '  ✓ Added 5 performance indexes';
  RAISE NOTICE '  ✓ Added automatic updated_at triggers';
  RAISE NOTICE '';
  RAISE NOTICE 'Current Counts:';
  RAISE NOTICE '  AI Models Configured: %', ai_model_count;
  RAISE NOTICE '  Support Requests: %', support_request_count;
  RAISE NOTICE '  Active Tasks: %', task_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Benefits:';
  RAISE NOTICE '  • Configure AI models once, reuse across all tasks';
  RAISE NOTICE '  • Custom model names (e.g., "Claude Production", "GPT-4 Testing")';
  RAISE NOTICE '  • Encrypted API keys - no need to re-enter credentials per task';
  RAISE NOTICE '  • Support multiple providers: Anthropic, OpenAI, Google, custom';
  RAISE NOTICE '  • Track model usage and performance';
  RAISE NOTICE '  • Centralized user feedback system';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Navigate to Tasks page to configure AI models';
  RAISE NOTICE '  2. Set execution mode (Native/Hybrid/AI) for each task';
  RAISE NOTICE '  3. Select AI model for Hybrid and AI modes';
  RAISE NOTICE '  4. Use Support page to report issues or suggest improvements';
  RAISE NOTICE '============================================================================';
END $$;
