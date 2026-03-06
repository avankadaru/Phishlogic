-- ============================================================================
-- PhishLogic Admin UI - Enhance Settings with Rich Metadata
-- ============================================================================
-- Migration: 004_enhance_settings_metadata
-- Purpose: Add missing notification settings, update descriptions, remove deprecated settings
--
-- Changes:
-- 1. Add 3 email notification detail flags (replace include_analysis_ids)
-- 2. Add 8 event trigger settings (4 webhook + 4 Slack)
-- 3. Update 5 existing setting descriptions with enhanced clarity
-- 4. Remove 2 deprecated settings
-- ============================================================================

-- Step 1: Add new email notification detail settings (replacing include_analysis_ids)
INSERT INTO system_settings (key, value, description, value_type, category) VALUES
  ('notifications.email.include_email_details', 'true', 'Include email subject and sender in notifications', 'boolean', 'notification'),
  ('notifications.email.include_red_flags', 'true', 'Include detected red flags summary in notifications', 'boolean', 'notification'),
  ('notifications.email.include_verdict_score', 'true', 'Include verdict and numeric score in notifications', 'boolean', 'notification')
ON CONFLICT (key) DO NOTHING;

-- Step 2: Add webhook event trigger settings
INSERT INTO system_settings (key, value, description, value_type, category) VALUES
  ('notifications.webhook.on_malicious', 'true', 'Send webhook notification when Malicious detected (score >= 8)', 'boolean', 'notification'),
  ('notifications.webhook.on_suspicious', 'true', 'Send webhook notification when Suspicious detected (score 5-7)', 'boolean', 'notification'),
  ('notifications.webhook.on_failed', 'true', 'Send webhook notification when analysis fails', 'boolean', 'notification'),
  ('notifications.webhook.on_cost_alert', 'true', 'Send webhook notification for cost budget alerts', 'boolean', 'notification')
ON CONFLICT (key) DO NOTHING;

-- Step 3: Add Slack event trigger settings
INSERT INTO system_settings (key, value, description, value_type, category) VALUES
  ('notifications.slack.on_malicious', 'true', 'Send Slack alert when Malicious detected (score >= 8)', 'boolean', 'notification'),
  ('notifications.slack.on_suspicious', 'true', 'Send Slack alert when Suspicious detected (score 5-7)', 'boolean', 'notification'),
  ('notifications.slack.on_failed', 'true', 'Send Slack alert when analysis fails', 'boolean', 'notification'),
  ('notifications.slack.on_cost_alert', 'true', 'Send Slack alert for cost budget alerts', 'boolean', 'notification')
ON CONFLICT (key) DO NOTHING;

-- Step 4: Update existing setting descriptions with enhanced clarity
UPDATE system_settings SET description =
  CASE key
    WHEN 'notifications.email.recipients' THEN 'Comma-separated emails for threat and cost alerts (e.g., security@company.com, soc-team@company.com)'
    WHEN 'notifications.email.send_failures' THEN 'Send email when analysis fails (timeouts, errors, service unavailable, invalid input)'
    WHEN 'notifications.email.batch_interval' THEN 'Minutes between batch email sends - groups multiple alerts together (recommended: 15-60)'
    WHEN 'cost_tracking.budget_monthly_usd' THEN 'Monthly AI cost budget - alerts sent to email recipients when exceeded'
    WHEN 'cost_tracking.alert_threshold_percent' THEN 'Send cost warning when reaching % of budget (recommended: 80)'
    ELSE description
  END
WHERE key IN (
  'notifications.email.recipients',
  'notifications.email.send_failures',
  'notifications.email.batch_interval',
  'cost_tracking.budget_monthly_usd',
  'cost_tracking.alert_threshold_percent'
);

-- Step 5: Remove deprecated settings
DELETE FROM system_settings WHERE key IN (
  'notifications.email.include_analysis_ids',  -- Replaced by 3 specific flags
  'notifications.email.batch_mode'              -- Always on now, only interval configurable
);

-- Step 6: Display migration summary
DO $$
DECLARE
  setting_count INTEGER;
  notification_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO setting_count FROM system_settings;
  SELECT COUNT(*) INTO notification_count FROM system_settings WHERE category = 'notification';

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration 004_enhance_settings_metadata completed successfully!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  ✓ Added 3 email notification detail flags';
  RAISE NOTICE '  ✓ Added 4 webhook event trigger settings';
  RAISE NOTICE '  ✓ Added 4 Slack event trigger settings';
  RAISE NOTICE '  ✓ Updated 5 existing setting descriptions';
  RAISE NOTICE '  ✓ Removed 2 deprecated settings';
  RAISE NOTICE '';
  RAISE NOTICE 'Total system settings: %', setting_count;
  RAISE NOTICE 'Notification settings: %', notification_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New settings added:';
  RAISE NOTICE '  Email Details:';
  RAISE NOTICE '    - notifications.email.include_email_details';
  RAISE NOTICE '    - notifications.email.include_red_flags';
  RAISE NOTICE '    - notifications.email.include_verdict_score';
  RAISE NOTICE '  Webhook Triggers:';
  RAISE NOTICE '    - notifications.webhook.on_malicious';
  RAISE NOTICE '    - notifications.webhook.on_suspicious';
  RAISE NOTICE '    - notifications.webhook.on_failed';
  RAISE NOTICE '    - notifications.webhook.on_cost_alert';
  RAISE NOTICE '  Slack Triggers:';
  RAISE NOTICE '    - notifications.slack.on_malicious';
  RAISE NOTICE '    - notifications.slack.on_suspicious';
  RAISE NOTICE '    - notifications.slack.on_failed';
  RAISE NOTICE '    - notifications.slack.on_cost_alert';
  RAISE NOTICE '';
  RAISE NOTICE 'Deprecated settings removed:';
  RAISE NOTICE '  - notifications.email.include_analysis_ids (replaced by 3 specific flags)';
  RAISE NOTICE '  - notifications.email.batch_mode (always on now)';
  RAISE NOTICE '============================================================================';
END $$;
