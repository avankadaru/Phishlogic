-- ============================================================================
-- PhishLogic Admin UI - Add All Analyzers and Missing Settings
-- ============================================================================

-- Update task_configs table to add category and group columns
ALTER TABLE task_configs ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'analyzer';
ALTER TABLE task_configs ADD COLUMN IF NOT EXISTS input_type VARCHAR(20) DEFAULT 'both';
ALTER TABLE task_configs ADD COLUMN IF NOT EXISTS analyzer_group VARCHAR(50) DEFAULT 'general';

COMMENT ON COLUMN task_configs.category IS 'Task category: analyzer, preprocessor, enrichment';
COMMENT ON COLUMN task_configs.input_type IS 'Input type: email, url, or both';
COMMENT ON COLUMN task_configs.analyzer_group IS 'Analyzer grouping: email-static, email-dynamic, url-static, url-dynamic';

-- Update existing task configs with proper grouping
UPDATE task_configs SET
  input_type = 'email',
  analyzer_group = 'email-static'
WHERE task_name IN ('spfAnalyzer', 'dkimAnalyzer');

UPDATE task_configs SET
  input_type = 'email',
  analyzer_group = 'email-static'
WHERE task_name = 'headerAnalyzer';

UPDATE task_configs SET
  input_type = 'url',
  analyzer_group = 'url-static'
WHERE task_name = 'urlPatternAnalyzer';

UPDATE task_configs SET
  input_type = 'url',
  analyzer_group = 'url-dynamic'
WHERE task_name = 'formDetectionAnalyzer';

-- Add missing analyzers
INSERT INTO task_configs (task_name, display_name, description, task_type, execution_mode, category, input_type, analyzer_group) VALUES
  ('urlEntropyAnalyzer', 'URL Entropy Analyzer', 'Analyzes URL randomness and suspicious patterns', 'analyzer', 'native', 'analyzer', 'url', 'url-static'),
  ('redirectAnalyzer', 'Redirect Analyzer', 'Detects suspicious redirects and URL chains', 'analyzer', 'native', 'analyzer', 'url', 'url-dynamic')
ON CONFLICT (task_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  input_type = EXCLUDED.input_type,
  analyzer_group = EXCLUDED.analyzer_group;

-- Rename existing task for consistency
UPDATE task_configs SET
  task_name = 'formAnalyzer',
  display_name = 'Form Analyzer',
  description = 'Detects credential harvesting forms and suspicious form fields'
WHERE task_name = 'formDetectionAnalyzer';

-- Add missing system settings for notifications
INSERT INTO system_settings (key, value, description, value_type, category) VALUES
  -- Email notification settings
  ('notifications.email.recipients', '""', 'Comma-separated list of email recipients', 'string', 'notification'),
  ('notifications.email.include_analysis_ids', 'true', 'Include analysis IDs in email notifications', 'boolean', 'notification'),
  ('notifications.email.send_failures', 'true', 'Send notifications for failed analyses', 'boolean', 'notification'),
  ('notifications.email.batch_mode', 'false', 'Enable batch mode for email notifications', 'boolean', 'notification'),
  ('notifications.email.batch_interval', '60', 'Batch interval in minutes', 'number', 'notification'),

  -- Webhook settings
  ('notifications.webhook.max_retries', '3', 'Maximum number of retry attempts for failed webhook calls', 'number', 'notification'),

  -- General settings
  ('whitelist.auto_expire_days', '365', 'Default expiration for whitelist entries in days', 'number', 'general')
ON CONFLICT (key) DO NOTHING;

-- Create index for task config grouping
CREATE INDEX IF NOT EXISTS idx_task_configs_group ON task_configs(analyzer_group, input_type)
  WHERE deleted_at IS NULL AND enabled = true;

-- Display summary
DO $$
DECLARE
  analyzer_count INTEGER;
  setting_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO analyzer_count FROM task_configs WHERE task_type = 'analyzer' AND deleted_at IS NULL;
  SELECT COUNT(*) INTO setting_count FROM system_settings;

  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'Total analyzers configured: %', analyzer_count;
  RAISE NOTICE 'Total system settings: %', setting_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Analyzer Groups:';
  RAISE NOTICE '  - email-static: SPF, DKIM, Header';
  RAISE NOTICE '  - url-static: URL Pattern, URL Entropy';
  RAISE NOTICE '  - url-dynamic: Form Detection, Redirect';
END $$;
