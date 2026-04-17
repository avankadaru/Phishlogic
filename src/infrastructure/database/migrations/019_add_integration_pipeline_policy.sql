-- ============================================================================
-- PhishLogic - Add pipeline policy columns to integration_tasks
-- ============================================================================
-- Migration: 019_add_integration_pipeline_policy
-- Purpose: Make integration config the single source of truth for analysis
--          policy. Moves task-specific pipeline settings (content prescan mode
--          and analyzer filtering mode) from code-level profiles onto the
--          integration_tasks row, so integrations like `chrome_task2` can
--          customise behaviour without code changes.
--
-- Changes:
-- 1. Add content_prescan column ('email' | 'url' | 'none')
-- 2. Add analyzer_filtering_mode column ('email_inbox' | 'inspect_url')
-- 3. Backfill existing rows (gmail, chrome) + any other rows via input_type
-- ============================================================================

-- Step 1: Add content_prescan column
ALTER TABLE integration_tasks
  ADD COLUMN IF NOT EXISTS content_prescan VARCHAR(20)
    CHECK (content_prescan IN ('email', 'url', 'none'));

COMMENT ON COLUMN integration_tasks.content_prescan IS
  'Which content prescan pipeline to run before analyzer filtering. Falls back to input_type when NULL.';

-- Step 2: Add analyzer_filtering_mode column
ALTER TABLE integration_tasks
  ADD COLUMN IF NOT EXISTS analyzer_filtering_mode VARCHAR(20)
    CHECK (analyzer_filtering_mode IN ('email_inbox', 'inspect_url'));

COMMENT ON COLUMN integration_tasks.analyzer_filtering_mode IS
  'How AnalyzerRegistry selects analyzers post-whitelist. Falls back to input_type when NULL.';

-- Step 3: Backfill seeded rows (gmail, chrome) and any other rows based on input_type
UPDATE integration_tasks
   SET content_prescan = CASE
         WHEN integration_name = 'gmail' THEN 'email'
         WHEN integration_name = 'chrome' THEN 'url'
         WHEN input_type = 'email' THEN 'email'
         WHEN input_type = 'url' THEN 'url'
         ELSE content_prescan
       END,
       analyzer_filtering_mode = CASE
         WHEN integration_name = 'gmail' THEN 'email_inbox'
         WHEN integration_name = 'chrome' THEN 'inspect_url'
         WHEN input_type = 'email' THEN 'email_inbox'
         WHEN input_type = 'url' THEN 'inspect_url'
         ELSE analyzer_filtering_mode
       END
 WHERE content_prescan IS NULL
    OR analyzer_filtering_mode IS NULL;

-- Step 4: Display migration summary
DO $$
DECLARE
  total_rows INTEGER;
  with_prescan INTEGER;
  with_filtering INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM integration_tasks WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO with_prescan FROM integration_tasks WHERE content_prescan IS NOT NULL AND deleted_at IS NULL;
  SELECT COUNT(*) INTO with_filtering FROM integration_tasks WHERE analyzer_filtering_mode IS NOT NULL AND deleted_at IS NULL;

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration 019_add_integration_pipeline_policy completed successfully!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '  Total integration rows: %', total_rows;
  RAISE NOTICE '  Rows with content_prescan set: %', with_prescan;
  RAISE NOTICE '  Rows with analyzer_filtering_mode set: %', with_filtering;
  RAISE NOTICE '============================================================================';
END $$;
