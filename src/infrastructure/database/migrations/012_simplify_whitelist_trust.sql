-- Migration: Simplify Whitelist Trust Levels
-- Replace 3-tier trust levels (high/medium/low) with simple boolean flags
-- This enables content-based analyzer filtering for ALL emails (trusted and non-trusted)

-- Step 1: Add new columns (nullable first to allow data migration)
ALTER TABLE whitelist_entries
  ADD COLUMN IF NOT EXISTS is_trusted BOOLEAN,
  ADD COLUMN IF NOT EXISTS scan_attachments BOOLEAN,
  ADD COLUMN IF NOT EXISTS scan_rich_content BOOLEAN;

-- Step 2: Migrate existing trust_level data to new schema
-- high → is_trusted=true, scan_attachments=false, scan_rich_content=false (full bypass if no risk)
-- medium → is_trusted=true, scan_attachments=true, scan_rich_content=true (selective analysis)
-- low → is_trusted=true, scan_attachments=true, scan_rich_content=true (full analysis)
UPDATE whitelist_entries
SET
  is_trusted = true,
  scan_attachments = CASE
    WHEN trust_level = 'high' THEN false
    ELSE true
  END,
  scan_rich_content = CASE
    WHEN trust_level = 'high' THEN false
    ELSE true
  END
WHERE trust_level IS NOT NULL AND is_trusted IS NULL;

-- Step 3: Set defaults for any entries that still have NULL values
UPDATE whitelist_entries
SET
  is_trusted = COALESCE(is_trusted, true),
  scan_attachments = COALESCE(scan_attachments, true),
  scan_rich_content = COALESCE(scan_rich_content, true)
WHERE is_trusted IS NULL OR scan_attachments IS NULL OR scan_rich_content IS NULL;

-- Step 4: Set column defaults for future entries
ALTER TABLE whitelist_entries
  ALTER COLUMN is_trusted SET DEFAULT true,
  ALTER COLUMN scan_attachments SET DEFAULT true,
  ALTER COLUMN scan_rich_content SET DEFAULT true;

-- Step 5: Make columns NOT NULL (after all data migrated)
ALTER TABLE whitelist_entries
  ALTER COLUMN is_trusted SET NOT NULL,
  ALTER COLUMN scan_attachments SET NOT NULL,
  ALTER COLUMN scan_rich_content SET NOT NULL;

-- Step 6: Drop old trust_level column (data preserved in new columns)
ALTER TABLE whitelist_entries DROP COLUMN IF EXISTS trust_level;

-- Step 7: Drop old index (if exists)
DROP INDEX IF EXISTS idx_whitelist_trust_level;

-- Step 8: Create new index for efficient filtering by scan options
CREATE INDEX IF NOT EXISTS idx_whitelist_scan_options
  ON whitelist_entries(is_trusted, scan_attachments, scan_rich_content)
  WHERE deleted_at IS NULL AND is_active = true;

-- Verification query (run manually after migration):
-- SELECT id, type, value, is_trusted, scan_attachments, scan_rich_content
-- FROM whitelist_entries
-- WHERE deleted_at IS NULL
-- LIMIT 10;
