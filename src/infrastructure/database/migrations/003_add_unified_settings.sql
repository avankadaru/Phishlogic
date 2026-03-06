-- ============================================================================
-- PhishLogic Admin UI - Add Unified Settings for Merged Settings Page
-- ============================================================================

-- Add webhook settings
INSERT INTO system_settings (key, value, description, value_type, category) VALUES
  ('notifications.webhook.enabled', 'false', 'Enable webhook notifications', 'boolean', 'notification'),
  ('notifications.webhook.url', '""', 'Webhook endpoint URL', 'string', 'notification'),
  ('notifications.webhook.timeout', '30', 'Webhook timeout in seconds', 'number', 'notification')
ON CONFLICT (key) DO NOTHING;

-- Add slack settings
INSERT INTO system_settings (key, value, description, value_type, category) VALUES
  ('notifications.slack.enabled', 'false', 'Enable Slack notifications', 'boolean', 'notification'),
  ('notifications.slack.webhook_url', '""', 'Slack webhook URL', 'string', 'notification'),
  ('notifications.slack.channel', '""', 'Default Slack channel', 'string', 'notification')
ON CONFLICT (key) DO NOTHING;

-- Add general settings
INSERT INTO system_settings (key, value, description, value_type, category) VALUES
  ('analysis.retention_days', '90', 'Days to keep analysis history', 'number', 'general'),
  ('analysis.timeout_seconds', '60', 'Default analysis timeout in seconds', 'number', 'general'),
  ('api.rate_limit_per_minute', '100', 'API rate limit per minute', 'number', 'general')
ON CONFLICT (key) DO NOTHING;

-- Display summary
DO $$
DECLARE
  setting_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO setting_count FROM system_settings;

  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'Total system settings: %', setting_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Added unified settings for:';
  RAISE NOTICE '  - Webhook notifications (enabled, url, timeout)';
  RAISE NOTICE '  - Slack notifications (enabled, webhook_url, channel)';
  RAISE NOTICE '  - General settings (retention, timeout, rate limit)';
END $$;
