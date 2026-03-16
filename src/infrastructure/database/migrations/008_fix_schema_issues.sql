-- Migration 008: Fix Schema Issues for Test Screens
-- Purpose: Fix missing tables and columns causing errors

-- Step 1: Create integrations table (referenced by integration_tasks)
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

COMMENT ON TABLE integrations IS 'Integration sources (Gmail, Chrome, etc.)';

-- Step 2: Seed initial integrations
INSERT INTO integrations (name, display_name, description, enabled) VALUES
  ('gmail', 'Gmail Integration', 'Analyzes emails from Gmail', true),
  ('chrome', 'Chrome Extension', 'Analyzes URLs from Chrome browser', true),
  ('test-email', 'Email Test Screen', 'Test screen for email analysis', true),
  ('test-url', 'URL Test Screen', 'Test screen for URL analysis', true)
ON CONFLICT (name) DO NOTHING;

-- Step 3: Add integration_id FK to integration_tasks (if not exists)
ALTER TABLE integration_tasks
ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE;

-- Step 4: Link existing integration_tasks to integrations
UPDATE integration_tasks it
SET integration_id = i.id
FROM integrations i
WHERE it.integration_name = i.name
  AND it.integration_id IS NULL;

-- Step 5: Add ai_provider and ai_model columns to analyses for backward compatibility
-- These duplicate data from ai_metadata JSONB but are needed for existing queries
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50);
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100);
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS tokens_used INTEGER;

-- Step 6: Create index for ai_provider queries
CREATE INDEX IF NOT EXISTS idx_analyses_ai_provider ON analyses(ai_provider);

-- Step 7: Update existing analyses to populate new columns from JSONB
UPDATE analyses
SET
  ai_provider = (ai_metadata->>'provider')::VARCHAR(50),
  ai_model = (ai_metadata->>'model')::VARCHAR(100),
  tokens_used = (ai_metadata->'tokens'->>'total')::INTEGER
WHERE ai_metadata IS NOT NULL
  AND ai_metadata != '{}'::JSONB
  AND ai_provider IS NULL;

-- Step 8: Create view for cost analytics
CREATE OR REPLACE VIEW analyses_cost_view AS
SELECT
  id,
  created_at,
  execution_mode,
  COALESCE(ai_provider, (ai_metadata->>'provider')::VARCHAR(50)) AS ai_provider,
  COALESCE(ai_model, (ai_metadata->>'model')::VARCHAR(100)) AS ai_model,
  COALESCE(tokens_used, (ai_metadata->'tokens'->>'total')::INTEGER) AS tokens_used,
  ai_cost_usd AS cost_usd,
  duration_ms,
  input_source
FROM analyses;

COMMENT ON VIEW analyses_cost_view IS 'Cost analytics view with flattened AI metadata';

-- Migration tracking
INSERT INTO schema_migrations (version, description)
VALUES (8, 'Fix schema issues: add integrations table and ai_provider column')
ON CONFLICT (version) DO NOTHING;
