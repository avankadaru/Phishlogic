-- ============================================================================
-- PhishLogic - Task-Based Email Analysis Architecture
-- ============================================================================
-- Migration: 011_task_based_architecture
-- Purpose: Implement task-based analysis with 6 email tasks, API credentials,
--          and comprehensive analyzer mappings
--
-- Changes:
-- 1. Create tasks table (6 email tasks: sender, attachments, links, emotional analysis, images, buttons)
-- 2. Create api_credentials table with encryption support
-- 3. Rename task_configs → analyzers table
-- 4. Create task_analyzers mapping table (which analyzers run for each task)
-- 5. Seed all mappings with long-running flags
-- 6. Remove deprecated headerAnalyzer
-- 7. Add all 12 analyzers to gmail integration (enabled by default)
-- 8. Seed api_credentials with VirusTotal and Google Safe Browsing placeholders
-- ============================================================================

-- Step 1: Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  input_type VARCHAR(20) NOT NULL CHECK (input_type IN ('email', 'url')),
  execution_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tasks IS 'Email analysis tasks grouped by what they analyze (sender, attachments, links, body, images, buttons)';
COMMENT ON COLUMN tasks.task_name IS 'Unique task identifier used in code';
COMMENT ON COLUMN tasks.display_name IS 'User-friendly name shown in UI';
COMMENT ON COLUMN tasks.input_type IS 'Type of input this task processes (email or url)';
COMMENT ON COLUMN tasks.execution_order IS 'Order in which tasks are displayed in UI';

-- Seed email tasks (6 tasks)
INSERT INTO tasks (task_name, display_name, description, input_type, execution_order) VALUES
  ('sender_verification', 'Sender Verification', 'Validates email sender identity: domain name, domain age, sender signature, SPF, DKIM, MX records', 'email', 1),
  ('attachments', 'Attachments', 'Scans file attachments: sandbox analysis, virus scanning, file type validation', 'email', 2),
  ('links', 'Links', 'Analyzes URLs: static patterns, dynamic browser checks, external reputation databases', 'email', 3),
  ('emotional_analysis_urgency', 'Emotional Analysis/Urgency Detection', 'Analyzes email body and subject for emotional manipulation, urgency language, and pressure tactics', 'email', 4),
  ('images_qrcodes', 'Images/QR Codes', 'Verifies embedded images and QR codes for malicious content and hidden URLs', 'email', 5),
  ('buttons_cta', 'Button/CTA Tracking', 'Analyzes HTML buttons and call-to-action elements for hidden tracking and malicious redirects', 'email', 6)
ON CONFLICT (task_name) DO NOTHING;

-- Step 2: Create api_credentials table
CREATE TABLE IF NOT EXISTS api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  provider VARCHAR(100) NOT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT,
  endpoint_url TEXT,
  rate_limit_per_day INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE api_credentials IS 'API credentials for external services (VirusTotal, Google Safe Browsing, etc.)';
COMMENT ON COLUMN api_credentials.credential_name IS 'Unique credential identifier';
COMMENT ON COLUMN api_credentials.provider IS 'Service provider: virustotal, google_safe_browsing, abuseipdb, etc.';
COMMENT ON COLUMN api_credentials.api_key IS 'Encrypted API key';
COMMENT ON COLUMN api_credentials.api_secret IS 'Encrypted API secret (optional for OAuth)';
COMMENT ON COLUMN api_credentials.endpoint_url IS 'Custom endpoint URL if self-hosted';
COMMENT ON COLUMN api_credentials.rate_limit_per_day IS 'Rate limit per day for this credential';

-- Seed example credentials (API keys are placeholders - update in UI)
INSERT INTO api_credentials (credential_name, display_name, description, provider, api_key, rate_limit_per_day) VALUES
  ('virustotal_free', 'VirusTotal Free Tier', 'VirusTotal API for URL/file reputation checks', 'virustotal', 'VT_API_KEY_PLACEHOLDER', 500),
  ('google_safebrowsing', 'Google Safe Browsing', 'Google Safe Browsing API for phishing URL detection', 'google_safe_browsing', 'GSB_API_KEY_PLACEHOLDER', 10000)
ON CONFLICT (credential_name) DO NOTHING;

-- Step 3: Rename task_configs to analyzers (if not already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_configs') THEN
    ALTER TABLE task_configs RENAME TO analyzers;
    ALTER TABLE analyzers RENAME COLUMN task_name TO analyzer_name;
    ALTER TABLE analyzers RENAME COLUMN task_type TO analyzer_type;
  END IF;
END $$;

-- Add task_name column to analyzers table (references tasks.task_name)
ALTER TABLE analyzers ADD COLUMN IF NOT EXISTS task_name VARCHAR(100);

COMMENT ON COLUMN analyzers.task_name IS 'References tasks.task_name - which task this analyzer belongs to';

-- Step 4: Create task_analyzers mapping table
CREATE TABLE IF NOT EXISTS task_analyzers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name VARCHAR(100) NOT NULL REFERENCES tasks(task_name),
  analyzer_name VARCHAR(100) NOT NULL,
  execution_order INTEGER DEFAULT 0,
  is_long_running BOOLEAN DEFAULT false,
  estimated_duration_ms INTEGER,
  CONSTRAINT unique_task_analyzer UNIQUE(task_name, analyzer_name)
);

COMMENT ON TABLE task_analyzers IS 'Maps which analyzers run for each task with performance metadata';
COMMENT ON COLUMN task_analyzers.task_name IS 'Task identifier (e.g., sender_verification, links)';
COMMENT ON COLUMN task_analyzers.analyzer_name IS 'Analyzer identifier (matches code getName())';
COMMENT ON COLUMN task_analyzers.execution_order IS 'Order within task (informational, actual execution is parallel)';
COMMENT ON COLUMN task_analyzers.is_long_running IS 'Flag for analyzers that take >3 seconds';
COMMENT ON COLUMN task_analyzers.estimated_duration_ms IS 'Estimated duration in milliseconds';

-- Map analyzers to tasks (12 total: 9 existing + 3 new)
INSERT INTO task_analyzers (task_name, analyzer_name, execution_order, is_long_running, estimated_duration_ms) VALUES
  -- Sender Verification task (3 analyzers)
  ('sender_verification', 'spfAnalyzer', 1, false, 200),
  ('sender_verification', 'dkimAnalyzer', 2, false, 200),
  ('sender_verification', 'senderReputationAnalyzer', 3, true, 10000), -- WHOIS can be slow

  -- Attachments task (1 analyzer)
  ('attachments', 'attachmentAnalyzer', 1, false, 1000),

  -- Links task (4 analyzers - flat list, no sub-grouping)
  ('links', 'urlEntropyAnalyzer', 1, false, 100),
  ('links', 'linkReputationAnalyzer', 2, false, 500),
  ('links', 'formAnalyzer', 3, true, 5000), -- Browser-based: checks extracted URLs for forms
  ('links', 'redirectAnalyzer', 4, true, 5000), -- Browser-based: checks extracted URLs for redirects

  -- Emotional Analysis/Urgency Detection task (1 analyzer)
  ('emotional_analysis_urgency', 'contentAnalysisAnalyzer', 1, false, 500),

  -- Images/QR Codes task (2 NEW analyzers)
  ('images_qrcodes', 'imageAnalyzer', 1, false, 800),
  ('images_qrcodes', 'qrcodeAnalyzer', 2, false, 600),

  -- Button/CTA Tracking task (1 NEW analyzer)
  ('buttons_cta', 'buttonAnalyzer', 1, false, 300)
ON CONFLICT (task_name, analyzer_name) DO NOTHING;

-- Step 5: Remove deprecated headerAnalyzer
DELETE FROM integration_analyzers WHERE analyzer_name = 'headerAnalyzer';

-- Step 6: Add all 12 email analyzers to gmail (enabled by default for maximum security)
INSERT INTO integration_analyzers (integration_name, analyzer_name, execution_order, analyzer_options)
VALUES
  -- Sender Verification (3)
  ('gmail', 'spfAnalyzer', 1, '{}'::jsonb),
  ('gmail', 'dkimAnalyzer', 2, '{}'::jsonb),
  ('gmail', 'senderReputationAnalyzer', 3, '{"enableWhois": true, "whoisTimeoutMs": 10000, "dnsTimeoutMs": 10000}'::jsonb),

  -- Attachments (1)
  ('gmail', 'attachmentAnalyzer', 4, '{}'::jsonb),

  -- Links (4)
  ('gmail', 'urlEntropyAnalyzer', 5, '{}'::jsonb),
  ('gmail', 'linkReputationAnalyzer', 6, '{"apiCredentialId": null}'::jsonb), -- Will select VirusTotal credential in UI
  ('gmail', 'formAnalyzer', 7, '{}'::jsonb),
  ('gmail', 'redirectAnalyzer', 8, '{}'::jsonb),

  -- Emotional Analysis (1)
  ('gmail', 'contentAnalysisAnalyzer', 9, '{}'::jsonb),

  -- Images/QR Codes (2 NEW)
  ('gmail', 'imageAnalyzer', 10, '{}'::jsonb),
  ('gmail', 'qrcodeAnalyzer', 11, '{}'::jsonb),

  -- Button/CTA Tracking (1 NEW)
  ('gmail', 'buttonAnalyzer', 12, '{}'::jsonb)
ON CONFLICT (integration_name, analyzer_name) DO NOTHING;

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_input_type ON tasks(input_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_task_analyzers_task ON task_analyzers(task_name);
CREATE INDEX IF NOT EXISTS idx_task_analyzers_analyzer ON task_analyzers(analyzer_name);
CREATE INDEX IF NOT EXISTS idx_api_credentials_provider ON api_credentials(provider) WHERE is_active = true;

-- Step 8: Add trigger to update updated_at timestamp on api_credentials
DROP TRIGGER IF EXISTS update_api_credentials_updated_at ON api_credentials;
CREATE TRIGGER update_api_credentials_updated_at
  BEFORE UPDATE ON api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 9: Display migration summary
DO $$
DECLARE
  task_count INTEGER;
  analyzer_count INTEGER;
  credential_count INTEGER;
  gmail_analyzer_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO task_count FROM tasks WHERE input_type = 'email';
  SELECT COUNT(*) INTO analyzer_count FROM task_analyzers;
  SELECT COUNT(*) INTO credential_count FROM api_credentials WHERE is_active = true;
  SELECT COUNT(*) INTO gmail_analyzer_count FROM integration_analyzers WHERE integration_name = 'gmail';

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration 011_task_based_architecture completed successfully!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  ✓ Created tasks table with % email tasks', task_count;
  RAISE NOTICE '  ✓ Created api_credentials table with % credentials', credential_count;
  RAISE NOTICE '  ✓ Renamed task_configs → analyzers table';
  RAISE NOTICE '  ✓ Created task_analyzers mapping with % analyzer mappings', analyzer_count;
  RAISE NOTICE '  ✓ Removed deprecated headerAnalyzer from gmail integration';
  RAISE NOTICE '  ✓ Gmail integration now has % analyzers (all enabled by default)', gmail_analyzer_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Task Breakdown:';
  RAISE NOTICE '  • Sender Verification: 3 analyzers (SPF, DKIM, SenderReputation)';
  RAISE NOTICE '  • Attachments: 1 analyzer (AttachmentAnalyzer)';
  RAISE NOTICE '  • Links: 4 analyzers (UrlEntropy, LinkReputation, Form, Redirect)';
  RAISE NOTICE '  • Emotional Analysis: 1 analyzer (ContentAnalysis)';
  RAISE NOTICE '  • Images/QR Codes: 2 analyzers (Image, QRCode) [NEW]';
  RAISE NOTICE '  • Button/CTA: 1 analyzer (Button) [NEW]';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  • All analyzers enabled by default for maximum security coverage';
  RAISE NOTICE '  • Conditional task skipping (skip if no content to analyze)';
  RAISE NOTICE '  • Long-running analyzers flagged (Form, Redirect, SenderReputation)';
  RAISE NOTICE '  • Global API credentials management (VirusTotal, Safe Browsing)';
  RAISE NOTICE '  • Cost tracking support for AI, WHOIS, browser automation, DNS, external APIs';
  RAISE NOTICE '============================================================================';
END $$;
