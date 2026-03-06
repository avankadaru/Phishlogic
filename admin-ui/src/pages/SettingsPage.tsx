import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Save, Mail, Webhook, MessageSquare, DollarSign, Settings as SettingsIcon } from 'lucide-react';

interface Setting {
  key: string;
  value: string | number | boolean;
  description?: string;
  valueType: 'string' | 'number' | 'boolean';
  helpText?: string;
  useCases?: string[];
  examples?: string;
  bestPractices?: string;
  examplePayload?: object;
  docsUrl?: string;
}

interface SettingHelpProps {
  description: string;
  useCases?: string[];
  examples?: string;
  bestPractices?: string;
  examplePayload?: object;
  docsUrl?: string;
}

function SettingHelp({ description, useCases, examples, bestPractices, examplePayload, docsUrl }: SettingHelpProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="text-sm space-y-2">
      <p className="text-muted-foreground">{description}</p>

      {(useCases || examples || bestPractices || examplePayload) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-primary hover:underline text-xs flex items-center gap-1"
        >
          {expanded ? '▼' : '▶'} {expanded ? 'Hide' : 'Show'} details
        </button>
      )}

      {expanded && (
        <div className="pl-4 space-y-2 border-l-2 border-primary/20">
          {useCases && (
            <div>
              <p className="font-medium text-xs text-muted-foreground">USE CASES:</p>
              <ul className="list-disc list-inside text-xs space-y-1">
                {useCases.map((uc, i) => <li key={i}>{uc}</li>)}
              </ul>
            </div>
          )}

          {examples && (
            <div>
              <p className="font-medium text-xs text-muted-foreground">EXAMPLES:</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block mt-1">{examples}</code>
            </div>
          )}

          {bestPractices && (
            <div>
              <p className="font-medium text-xs text-muted-foreground">BEST PRACTICES:</p>
              <p className="text-xs">{bestPractices}</p>
            </div>
          )}

          {examplePayload && (
            <div className="mt-3 pt-3 border-t">
              <p className="font-semibold text-xs text-muted-foreground mb-2">EXAMPLE PAYLOAD:</p>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto dark:bg-gray-800">
                {JSON.stringify(examplePayload, null, 2)}
              </pre>
            </div>
          )}

          {docsUrl && (
            <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-block">
              📚 Documentation →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [settingMetadata, setSettingMetadata] = useState<Record<string, Setting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get('/admin/settings');
      const settingsMap: Record<string, Setting> = {};
      const metadataMap: Record<string, Setting> = {};

      // Response has both grouped and flat arrays, use flat
      const flatSettings = response.data.data?.flat || [];
      flatSettings.forEach((setting: Setting) => {
        settingsMap[setting.key] = setting;
        metadataMap[setting.key] = setting; // Includes helpText, useCases, etc.
      });

      setSettings(settingsMap);
      setSettingMetadata(metadataMap);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, string | number | boolean> = {};
      Object.entries(settings).forEach(([key, setting]) => {
        updates[key] = setting.value;
      });

      await api.put('/admin/settings', updates);
      alert('Settings saved successfully!');
      await loadSettings();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: string | number | boolean) => {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], value }
    }));
  };

  const getSetting = (key: string, defaultValue: string | number | boolean = ''): string | number | boolean => {
    return settings[key]?.value ?? defaultValue;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure system-wide settings and notifications</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save All Changes'}
        </Button>
      </div>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Threat alerts, failures, and cost budgets</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Email Recipients</label>
            <Input
              type="text"
              placeholder="security@company.com, admin@company.com"
              value={getSetting('notifications.email.recipients', '') as string}
              onChange={(e) => updateSetting('notifications.email.recipients', e.target.value)}
            />
            <SettingHelp
              description={settingMetadata['notifications.email.recipients']?.helpText || 'Comma-separated email addresses'}
              useCases={settingMetadata['notifications.email.recipients']?.useCases}
              examples={settingMetadata['notifications.email.recipients']?.examples}
              bestPractices={settingMetadata['notifications.email.recipients']?.bestPractices}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Include in Suspicious & Malicious Email Reports</label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.email.include_email_details', true) as boolean}
                  onChange={(e) => updateSetting('notifications.email.include_email_details', e.target.checked)}
                />
                <span className="text-sm">Email Subject & Sender</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.email.include_verdict_score', true) as boolean}
                  onChange={(e) => updateSetting('notifications.email.include_verdict_score', e.target.checked)}
                />
                <span className="text-sm">Verdict & Score (e.g., Suspicious - 6.5/10)</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.email.include_red_flags', true) as boolean}
                  onChange={(e) => updateSetting('notifications.email.include_red_flags', e.target.checked)}
                />
                <span className="text-sm">Red Flags Summary (suspicious indicators detected)</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Customize what information appears in email notifications
            </p>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="send-failures"
              checked={getSetting('notifications.email.send_failures', true) as boolean}
              onChange={(e) => updateSetting('notifications.email.send_failures', e.target.checked)}
            />
            <label htmlFor="send-failures" className="text-sm">
              Include Failure Notifications
            </label>
          </div>
          <SettingHelp
            description={settingMetadata['notifications.email.send_failures']?.helpText || 'Send emails when analysis fails'}
            useCases={settingMetadata['notifications.email.send_failures']?.useCases}
            bestPractices={settingMetadata['notifications.email.send_failures']?.bestPractices}
          />

          <div>
            <label className="text-sm font-medium">Notification Interval (minutes)</label>
            <Input
              type="number"
              min="1"
              value={getSetting('notifications.email.batch_interval', 60) as number}
              onChange={(e) => updateSetting('notifications.email.batch_interval', parseInt(e.target.value) || 60)}
            />
            <SettingHelp
              description={settingMetadata['notifications.email.batch_interval']?.helpText || 'How often to send grouped alerts'}
              useCases={settingMetadata['notifications.email.batch_interval']?.useCases}
              examples={settingMetadata['notifications.email.batch_interval']?.examples}
              bestPractices={settingMetadata['notifications.email.batch_interval']?.bestPractices}
            />
          </div>
        </CardContent>
      </Card>

      {/* SMTP Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>SMTP Configuration</CardTitle>
              <CardDescription>Configure email server settings for sending notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Configure your SMTP server to enable email notifications.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">SMTP Host</label>
              <Input
                type="text"
                placeholder="smtp.gmail.com"
                value={getSetting('notifications.smtp.host', '') as string}
                onChange={(e) => updateSetting('notifications.smtp.host', e.target.value)}
              />
              <SettingHelp
                description={settingMetadata['notifications.smtp.host']?.helpText || 'SMTP server hostname'}
                examples={settingMetadata['notifications.smtp.host']?.examples}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">SMTP Port</label>
              <Input
                type="number"
                placeholder="587"
                value={getSetting('notifications.smtp.port', 587) as number}
                onChange={(e) => updateSetting('notifications.smtp.port', parseInt(e.target.value) || 587)}
              />
              <SettingHelp
                description={settingMetadata['notifications.smtp.port']?.helpText || 'SMTP server port'}
                examples={settingMetadata['notifications.smtp.port']?.examples}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">SMTP Username</label>
              <Input
                type="text"
                placeholder="notifications@company.com"
                value={getSetting('notifications.smtp.user', '') as string}
                onChange={(e) => updateSetting('notifications.smtp.user', e.target.value)}
              />
              <SettingHelp
                description={settingMetadata['notifications.smtp.user']?.helpText || 'SMTP authentication username'}
                examples={settingMetadata['notifications.smtp.user']?.examples}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">SMTP Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={getSetting('notifications.smtp.password', '') as string}
                onChange={(e) => updateSetting('notifications.smtp.password', e.target.value)}
              />
              <SettingHelp
                description={settingMetadata['notifications.smtp.password']?.helpText || 'SMTP authentication password'}
                examples={settingMetadata['notifications.smtp.password']?.examples}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Use TLS/SSL</label>
              <select
                value={getSetting('notifications.smtp.secure', 'true') as string}
                onChange={(e) => updateSetting('notifications.smtp.secure', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="true">Yes (TLS)</option>
                <option value="false">No</option>
              </select>
              <SettingHelp
                description={settingMetadata['notifications.smtp.secure']?.helpText || 'Enable TLS/SSL encryption'}
                examples={settingMetadata['notifications.smtp.secure']?.examples}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">From Address</label>
              <Input
                type="email"
                placeholder="phishlogic@company.com"
                value={getSetting('notifications.smtp.from_address', '') as string}
                onChange={(e) => updateSetting('notifications.smtp.from_address', e.target.value)}
              />
              <SettingHelp
                description={settingMetadata['notifications.smtp.from_address']?.helpText || 'Email address shown as sender'}
                examples={settingMetadata['notifications.smtp.from_address']?.examples}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Webhook className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Webhook Notifications</CardTitle>
              <CardDescription>Send analysis results to external systems (SIEM, ticketing, automation)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="webhook-enabled"
              checked={getSetting('notifications.webhook.enabled', false) as boolean}
              onChange={(e) => updateSetting('notifications.webhook.enabled', e.target.checked)}
            />
            <label htmlFor="webhook-enabled" className="text-sm font-medium">
              Enable Webhook Notifications
            </label>
          </div>

          <div>
            <label className="text-sm font-medium">Webhook URL</label>
            <Input
              type="url"
              placeholder="https://your-system.com/api/phishlogic-webhook"
              value={getSetting('notifications.webhook.url', '') as string}
              onChange={(e) => updateSetting('notifications.webhook.url', e.target.value)}
              disabled={!getSetting('notifications.webhook.enabled', false)}
            />
            <SettingHelp
              description={settingMetadata['notifications.webhook.url']?.helpText || 'Webhook endpoint for POST requests'}
              useCases={settingMetadata['notifications.webhook.url']?.useCases}
              examples={settingMetadata['notifications.webhook.url']?.examples}
              bestPractices={settingMetadata['notifications.webhook.url']?.bestPractices}
              examplePayload={settingMetadata['notifications.webhook.url']?.examplePayload}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Send Webhook For:</label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.webhook.on_malicious', true) as boolean}
                  onChange={(e) => updateSetting('notifications.webhook.on_malicious', e.target.checked)}
                  disabled={!getSetting('notifications.webhook.enabled', false)}
                />
                <span className="text-sm">🔴 Malicious Detections (score ≥ 8)</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.webhook.on_suspicious', true) as boolean}
                  onChange={(e) => updateSetting('notifications.webhook.on_suspicious', e.target.checked)}
                  disabled={!getSetting('notifications.webhook.enabled', false)}
                />
                <span className="text-sm">🟡 Suspicious Detections (score 5-7)</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.webhook.on_failed', true) as boolean}
                  onChange={(e) => updateSetting('notifications.webhook.on_failed', e.target.checked)}
                  disabled={!getSetting('notifications.webhook.enabled', false)}
                />
                <span className="text-sm">⚠️ Analysis Failures (errors, timeouts)</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.webhook.on_cost_alert', true) as boolean}
                  onChange={(e) => updateSetting('notifications.webhook.on_cost_alert', e.target.checked)}
                  disabled={!getSetting('notifications.webhook.enabled', false)}
                />
                <span className="text-sm">💰 Cost Budget Alerts</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Select which events trigger webhook notifications
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Max Retries</label>
              <Input
                type="number"
                min="0"
                max="10"
                value={getSetting('notifications.webhook.max_retries', 3) as number}
                onChange={(e) => updateSetting('notifications.webhook.max_retries', parseInt(e.target.value) || 3)}
                disabled={!getSetting('notifications.webhook.enabled', false)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Retry attempts for failed webhook calls
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Timeout (seconds)</label>
              <Input
                type="number"
                min="5"
                max="60"
                value={getSetting('notifications.webhook.timeout', 30) as number}
                onChange={(e) => updateSetting('notifications.webhook.timeout', parseInt(e.target.value) || 30)}
                disabled={!getSetting('notifications.webhook.enabled', false)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Slack Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Slack Notifications</CardTitle>
              <CardDescription>Real-time security alerts to Slack channels</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="slack-enabled"
              checked={getSetting('notifications.slack.enabled', false) as boolean}
              onChange={(e) => updateSetting('notifications.slack.enabled', e.target.checked)}
            />
            <label htmlFor="slack-enabled" className="text-sm font-medium">
              Enable Slack Notifications
            </label>
          </div>

          <div>
            <label className="text-sm font-medium">Slack Webhook URL</label>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
              value={getSetting('notifications.slack.webhook_url', '') as string}
              onChange={(e) => updateSetting('notifications.slack.webhook_url', e.target.value)}
              disabled={!getSetting('notifications.slack.enabled', false)}
            />
            <SettingHelp
              description={settingMetadata['notifications.slack.webhook_url']?.helpText || 'Slack incoming webhook URL'}
              useCases={settingMetadata['notifications.slack.webhook_url']?.useCases}
              examples={settingMetadata['notifications.slack.webhook_url']?.examples}
              bestPractices={settingMetadata['notifications.slack.webhook_url']?.bestPractices}
              examplePayload={settingMetadata['notifications.slack.webhook_url']?.examplePayload}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Send Slack Alerts For:</label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.slack.on_malicious', true) as boolean}
                  onChange={(e) => updateSetting('notifications.slack.on_malicious', e.target.checked)}
                  disabled={!getSetting('notifications.slack.enabled', false)}
                />
                <span className="text-sm">🔴 Malicious Detections (score ≥ 8)</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.slack.on_suspicious', true) as boolean}
                  onChange={(e) => updateSetting('notifications.slack.on_suspicious', e.target.checked)}
                  disabled={!getSetting('notifications.slack.enabled', false)}
                />
                <span className="text-sm">🟡 Suspicious Detections (score 5-7)</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.slack.on_failed', true) as boolean}
                  onChange={(e) => updateSetting('notifications.slack.on_failed', e.target.checked)}
                  disabled={!getSetting('notifications.slack.enabled', false)}
                />
                <span className="text-sm">⚠️ Analysis Failures (errors, timeouts)</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={getSetting('notifications.slack.on_cost_alert', true) as boolean}
                  onChange={(e) => updateSetting('notifications.slack.on_cost_alert', e.target.checked)}
                  disabled={!getSetting('notifications.slack.enabled', false)}
                />
                <span className="text-sm">💰 Cost Budget Alerts</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Select which events trigger Slack notifications
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cost Tracking */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Cost Tracking & Budgets</CardTitle>
              <CardDescription>Monitor AI costs - alerts sent to email recipients</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Monthly Budget ($)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="1000.00"
              value={getSetting('cost_tracking.budget_monthly_usd', 1000) as number}
              onChange={(e) => updateSetting('cost_tracking.budget_monthly_usd', parseFloat(e.target.value) || 0)}
            />
            <SettingHelp
              description={settingMetadata['cost_tracking.budget_monthly_usd']?.helpText || 'Monthly AI cost budget'}
              useCases={settingMetadata['cost_tracking.budget_monthly_usd']?.useCases}
              examples={settingMetadata['cost_tracking.budget_monthly_usd']?.examples}
              bestPractices={settingMetadata['cost_tracking.budget_monthly_usd']?.bestPractices}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Alert Threshold (%)</label>
            <Input
              type="number"
              min="0"
              max="100"
              value={getSetting('cost_tracking.alert_threshold_percent', 80) as number}
              onChange={(e) => updateSetting('cost_tracking.alert_threshold_percent', parseInt(e.target.value) || 80)}
            />
            <SettingHelp
              description={settingMetadata['cost_tracking.alert_threshold_percent']?.helpText || 'Send cost warning at percentage of budget'}
              useCases={settingMetadata['cost_tracking.alert_threshold_percent']?.useCases}
              examples={settingMetadata['cost_tracking.alert_threshold_percent']?.examples}
              bestPractices={settingMetadata['cost_tracking.alert_threshold_percent']?.bestPractices}
            />
          </div>
        </CardContent>
      </Card>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Other system-wide configuration options</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Whitelist Auto-Expire (days)</label>
            <Input
              type="number"
              min="0"
              value={getSetting('whitelist.auto_expire_days', 365) as number}
              onChange={(e) => updateSetting('whitelist.auto_expire_days', parseInt(e.target.value) || 365)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Default expiration for new whitelist entries (0 for never)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Analysis Retention (days)</label>
              <Input
                type="number"
                min="7"
                value={getSetting('analysis.retention_days', 90) as number}
                onChange={(e) => updateSetting('analysis.retention_days', parseInt(e.target.value) || 90)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Keep analysis history for this many days
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Analysis Timeout (seconds)</label>
              <Input
                type="number"
                min="5"
                max="300"
                value={getSetting('analysis.timeout_seconds', 60) as number}
                onChange={(e) => updateSetting('analysis.timeout_seconds', parseInt(e.target.value) || 60)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">API Rate Limit (per minute)</label>
            <Input
              type="number"
              min="10"
              max="1000"
              value={getSetting('api.rate_limit_per_minute', 100) as number}
              onChange={(e) => updateSetting('api.rate_limit_per_minute', parseInt(e.target.value) || 100)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
