-- Migration: Add trust_level column to whitelist_entries
-- Purpose: Enable content-aware conditional bypass based on sender trust level
-- Author: PhishLogic Team
-- Date: 2026-03-10

-- Add trust_level column with CHECK constraint
ALTER TABLE whitelist_entries
ADD COLUMN IF NOT EXISTS trust_level VARCHAR(20) NOT NULL DEFAULT 'high'
CHECK (trust_level IN ('high', 'medium', 'low'));

-- Add index for trust level queries (filtered index for active entries only)
CREATE INDEX IF NOT EXISTS idx_whitelist_trust_level
ON whitelist_entries(trust_level)
WHERE deleted_at IS NULL AND is_active = true;

-- Add comment for documentation
COMMENT ON COLUMN whitelist_entries.trust_level IS 'Trust level for conditional bypass: high (conditional based on content), medium (always verify content), low (skip expensive analyzers)';

-- Verify migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'whitelist_entries'
    AND column_name = 'trust_level'
  ) THEN
    RAISE NOTICE 'Migration successful: trust_level column added to whitelist_entries';
  ELSE
    RAISE EXCEPTION 'Migration failed: trust_level column not found';
  END IF;
END $$;
