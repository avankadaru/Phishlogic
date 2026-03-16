-- ============================================================================
-- PhishLogic Admin UI - Update Chrome Integration
-- ============================================================================
-- Migration: 014_update_chrome_integration
-- Purpose: Add linkReputationAnalyzer to Chrome integration for threat intelligence
-- Note: formAnalyzer and redirectAnalyzer are already present (added in migration 006)
-- ============================================================================

-- Add linkReputationAnalyzer to Chrome integration
-- This is the ONLY change needed - Chrome already has formAnalyzer and redirectAnalyzer
INSERT INTO integration_analyzers (
  id,
  integration_name,
  analyzer_name,
  execution_order,
  analyzer_options,
  created_at
)
SELECT
  gen_random_uuid(),
  'chrome',
  'linkReputationAnalyzer',
  3, -- After urlEntropyAnalyzer (2), before formAnalyzer (4)
  '{
    "enablePhishTank": true,
    "enableUrlhaus": true
  }'::jsonb,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM integration_analyzers
  WHERE integration_name = 'chrome'
    AND analyzer_name = 'linkReputationAnalyzer'
);

-- Update execution_order for existing analyzers to accommodate linkReputationAnalyzer
UPDATE integration_analyzers
SET execution_order = 4
WHERE integration_name = 'chrome'
  AND analyzer_name = 'formAnalyzer';

UPDATE integration_analyzers
SET execution_order = 5
WHERE integration_name = 'chrome'
  AND analyzer_name = 'redirectAnalyzer';

-- Verify Chrome integration configuration
SELECT
  ia.analyzer_name,
  ia.execution_order,
  ta.estimated_duration_ms,
  ta.is_long_running
FROM integration_analyzers ia
LEFT JOIN task_analyzers ta ON ia.analyzer_name = ta.analyzer_name
WHERE ia.integration_name = 'chrome'
ORDER BY ia.execution_order;
