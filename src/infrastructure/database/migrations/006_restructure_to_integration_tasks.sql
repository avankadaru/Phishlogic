-- ============================================================================
-- PhishLogic Admin UI - Restructure to Integration-Level Tasks
-- ============================================================================
-- Migration: 006_restructure_to_integration_tasks
-- Purpose: Move from analyzer-level to integration-level configuration
--
-- Changes:
-- 1. Create integration_tasks table (Gmail, Chrome integrations)
-- 2. Create integration_analyzers mapping table
-- 3. Remove execution mode columns from task_configs (now at integration level)
-- 4. Seed 2 integrations: gmail, chrome
-- 5. Map 7 analyzers to integrations (3 for Gmail, 4 for Chrome)
-- ============================================================================

-- Step 1: Create integration_tasks table
CREATE TABLE IF NOT EXISTS integration_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  input_type VARCHAR(20) NOT NULL CHECK (input_type IN ('email', 'url')),
  enabled BOOLEAN DEFAULT true,
  execution_mode VARCHAR(20) DEFAULT 'native' CHECK (execution_mode IN ('native', 'hybrid', 'ai')),
  ai_model_id UUID REFERENCES ai_model_configs(id) ON DELETE SET NULL,
  fallback_to_native BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

COMMENT ON TABLE integration_tasks IS 'Integration-level tasks (Gmail, Chrome, etc.) - user configures mode once per integration';
COMMENT ON COLUMN integration_tasks.integration_name IS 'Unique integration identifier: gmail, chrome, outlook, etc.';
COMMENT ON COLUMN integration_tasks.display_name IS 'User-friendly name shown in UI';
COMMENT ON COLUMN integration_tasks.input_type IS 'Type of input this integration handles';
COMMENT ON COLUMN integration_tasks.execution_mode IS 'Execution mode for all analyzers in this integration';
COMMENT ON COLUMN integration_tasks.ai_model_id IS 'AI model to use when execution_mode is hybrid or ai';
COMMENT ON COLUMN integration_tasks.fallback_to_native IS 'For hybrid mode: whether to fall back to native on AI failure';

-- Step 2: Create integration_analyzers mapping table
CREATE TABLE IF NOT EXISTS integration_analyzers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name VARCHAR(100) NOT NULL,
  analyzer_name VARCHAR(100) NOT NULL,
  execution_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_integration_analyzer UNIQUE(integration_name, analyzer_name)
);

COMMENT ON TABLE integration_analyzers IS 'Maps which analyzers run for each integration';
COMMENT ON COLUMN integration_analyzers.integration_name IS 'References integration_tasks.integration_name';
COMMENT ON COLUMN integration_analyzers.analyzer_name IS 'References task_configs.task_name';
COMMENT ON COLUMN integration_analyzers.execution_order IS 'Order in which analyzers execute (lower = earlier)';

-- Step 3: Modify task_configs - remove execution mode columns (now at integration level)
ALTER TABLE task_configs DROP COLUMN IF EXISTS execution_mode;
ALTER TABLE task_configs DROP COLUMN IF EXISTS ai_model_id;
ALTER TABLE task_configs DROP COLUMN IF EXISTS fallback_to_native;
ALTER TABLE task_configs DROP COLUMN IF EXISTS fallback_on_error;

-- Add is_active flag for enabling/disabling individual analyzers
ALTER TABLE task_configs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

COMMENT ON COLUMN task_configs.is_active IS 'Whether this analyzer is active (can be toggled per analyzer)';

-- Step 4: Seed integration_tasks with Gmail and Chrome
INSERT INTO integration_tasks (integration_name, display_name, description, input_type, enabled, execution_mode) VALUES
  (
    'gmail',
    'Analyze Email from Gmail',
    'Analyzes emails received in Gmail for phishing threats using SPF, DKIM, and header analysis',
    'email',
    true,
    'native'
  ),
  (
    'chrome',
    'Inspect URL from Chrome',
    'Inspects URLs opened in Chrome for malicious patterns, suspicious entropy, forms, and redirects',
    'url',
    true,
    'native'
  )
ON CONFLICT (integration_name) DO NOTHING;

-- Step 5: Map analyzers to Gmail integration (3 email analyzers)
INSERT INTO integration_analyzers (integration_name, analyzer_name, execution_order) VALUES
  ('gmail', 'spfAnalyzer', 1),
  ('gmail', 'dkimAnalyzer', 2),
  ('gmail', 'headerAnalyzer', 3)
ON CONFLICT (integration_name, analyzer_name) DO NOTHING;

-- Step 6: Map analyzers to Chrome integration (4 URL analyzers)
INSERT INTO integration_analyzers (integration_name, analyzer_name, execution_order) VALUES
  ('chrome', 'urlPatternAnalyzer', 1),
  ('chrome', 'urlEntropyAnalyzer', 2),
  ('chrome', 'formAnalyzer', 3),
  ('chrome', 'redirectAnalyzer', 4)
ON CONFLICT (integration_name, analyzer_name) DO NOTHING;

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_tasks_name ON integration_tasks(integration_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_integration_tasks_input_type ON integration_tasks(input_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_integration_analyzers_integration ON integration_analyzers(integration_name);
CREATE INDEX IF NOT EXISTS idx_integration_analyzers_analyzer ON integration_analyzers(analyzer_name);
CREATE INDEX IF NOT EXISTS idx_task_configs_active ON task_configs(is_active) WHERE deleted_at IS NULL;

-- Step 8: Add trigger to update updated_at timestamp on integration_tasks
DROP TRIGGER IF EXISTS update_integration_tasks_updated_at ON integration_tasks;
CREATE TRIGGER update_integration_tasks_updated_at
  BEFORE UPDATE ON integration_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 9: Display migration summary
DO $$
DECLARE
  integration_count INTEGER;
  analyzer_count INTEGER;
  gmail_analyzers INTEGER;
  chrome_analyzers INTEGER;
BEGIN
  SELECT COUNT(*) INTO integration_count FROM integration_tasks WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO analyzer_count FROM task_configs WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO gmail_analyzers FROM integration_analyzers WHERE integration_name = 'gmail';
  SELECT COUNT(*) INTO chrome_analyzers FROM integration_analyzers WHERE integration_name = 'chrome';

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration 006_restructure_to_integration_tasks completed successfully!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  ✓ Created integration_tasks table';
  RAISE NOTICE '  ✓ Created integration_analyzers mapping table';
  RAISE NOTICE '  ✓ Removed execution_mode columns from task_configs';
  RAISE NOTICE '  ✓ Seeded % integration(s)', integration_count;
  RAISE NOTICE '  ✓ Mapped % total analyzers', gmail_analyzers + chrome_analyzers;
  RAISE NOTICE '';
  RAISE NOTICE 'Integration Details:';
  RAISE NOTICE '  • Gmail: % email analyzers (spfAnalyzer, dkimAnalyzer, headerAnalyzer)', gmail_analyzers;
  RAISE NOTICE '  • Chrome: % URL analyzers (urlPatternAnalyzer, urlEntropyAnalyzer, formAnalyzer, redirectAnalyzer)', chrome_analyzers;
  RAISE NOTICE '';
  RAISE NOTICE 'Configuration Level Change:';
  RAISE NOTICE '  Before: % analyzer-level configurations (each with own mode)', analyzer_count;
  RAISE NOTICE '  After: % integration-level configurations (one mode per integration)', integration_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Benefits:';
  RAISE NOTICE '  • Configure once at integration level (Gmail, Chrome)';
  RAISE NOTICE '  • All analyzers in an integration use the same execution mode';
  RAISE NOTICE '  • Future-ready for adding Outlook, Twitter, Facebook integrations';
  RAISE NOTICE '============================================================================';
END $$;
