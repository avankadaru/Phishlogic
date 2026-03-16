import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskAnalyzerMapping, ApiCredential } from '@/types';

interface AnalyzerConfig {
  analyzerName: string;
  enabled: boolean;
  options: Record<string, any>;
}

interface AnalyzerConfigSectionProps {
  integrationName: string;
  analyzers: TaskAnalyzerMapping[];
  credentials: ApiCredential[];
  onSave: (configs: AnalyzerConfig[]) => Promise<void>;
  executionMode?: 'native' | 'hybrid' | 'ai';
}

interface TaskGroup {
  taskName: string;
  displayName: string;
  emoji: string;
  estimatedDuration: string;
  skipCondition?: string;
  analyzers: TaskAnalyzerMapping[];
}

export default function AnalyzerConfigSection({
  integrationName,
  analyzers,
  credentials,
  onSave,
  executionMode = 'native',
}: AnalyzerConfigSectionProps) {

  // Helper to check if analyzer has configurable options
  const hasConfigurableOptions = (analyzerName: string): boolean => {
    const configurableAnalyzers = [
      'senderreputationanalyzer',
      'linkreputationanalyzer',
    ];
    return configurableAnalyzers.includes(analyzerName.toLowerCase());
  };
  // Group analyzers by task
  const taskGroups: TaskGroup[] = [
    {
      taskName: 'sender_verification',
      displayName: 'Sender Verification',
      emoji: '📧',
      estimatedDuration: '~10s',
      analyzers: analyzers.filter((a) => a.taskName === 'sender_verification'),
    },
    {
      taskName: 'attachments',
      displayName: 'Attachments',
      emoji: '📎',
      estimatedDuration: '~1s',
      skipCondition: 'Skips if no attachments',
      analyzers: analyzers.filter((a) => a.taskName === 'attachments'),
    },
    {
      taskName: 'links',
      displayName: 'Links',
      emoji: '🔗',
      estimatedDuration: '~10s',
      skipCondition: 'Skips if no links found',
      analyzers: analyzers.filter((a) => a.taskName === 'links'),
    },
    {
      taskName: 'emotional_analysis_urgency',
      displayName: 'Emotional Analysis/Urgency Detection',
      emoji: '📝',
      estimatedDuration: '~1s',
      analyzers: analyzers.filter((a) => a.taskName === 'emotional_analysis_urgency'),
    },
    {
      taskName: 'images_qrcodes',
      displayName: 'Images/QR Codes',
      emoji: '🖼️',
      estimatedDuration: '~1.5s',
      skipCondition: 'Skips if no images',
      analyzers: analyzers.filter((a) => a.taskName === 'images_qrcodes'),
    },
    {
      taskName: 'buttons_cta',
      displayName: 'Button/CTA Tracking',
      emoji: '🔘',
      estimatedDuration: '~0.3s',
      skipCondition: 'Skips if no buttons',
      analyzers: analyzers.filter((a) => a.taskName === 'buttons_cta'),
    },
  ].filter(group => group.analyzers.length > 0);

  // Local state for analyzer configurations
  const [configs, setConfigs] = useState<Record<string, AnalyzerConfig>>(() => {
    const initial: Record<string, AnalyzerConfig> = {};
    analyzers.forEach((analyzer) => {
      initial[analyzer.analyzerName] = {
        analyzerName: analyzer.analyzerName,
        enabled: true, // All enabled by default
        options: {},
      };
    });
    return initial;
  });

  const [expandedAnalyzers, setExpandedAnalyzers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggleAnalyzer = (analyzerName: string) => {
    setConfigs((prev) => ({
      ...prev,
      [analyzerName]: {
        ...prev[analyzerName],
        enabled: !prev[analyzerName].enabled,
      },
    }));
  };

  const toggleOptions = (analyzerName: string) => {
    setExpandedAnalyzers((prev) => {
      const next = new Set(prev);
      if (next.has(analyzerName)) {
        next.delete(analyzerName);
      } else {
        next.add(analyzerName);
      }
      return next;
    });
  };

  const updateOption = (analyzerName: string, optionKey: string, value: any) => {
    setConfigs((prev) => ({
      ...prev,
      [analyzerName]: {
        ...prev[analyzerName],
        options: {
          ...prev[analyzerName].options,
          [optionKey]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(Object.values(configs));
    } finally {
      setSaving(false);
    }
  };

  const getTotalActiveAnalyzers = () => {
    return Object.values(configs).filter((c) => c.enabled).length;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Configure Analyzers ({getTotalActiveAnalyzers()} active)</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Select which analyzers to run for {integrationName}. Tasks automatically skip if email has no
                matching content.
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {taskGroups.map((taskGroup) => (
            <div key={taskGroup.taskName} className="border rounded-lg p-4">
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{taskGroup.emoji}</span>
                  <div>
                    <h3 className="text-lg font-semibold">{taskGroup.displayName}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{taskGroup.estimatedDuration}</span>
                      {taskGroup.skipCondition && (
                        <>
                          <span>•</span>
                          <span className="italic">{taskGroup.skipCondition}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {taskGroup.analyzers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No analyzers configured for this task</p>
              ) : (
                <div className="space-y-3">
                  {taskGroup.analyzers.map((analyzer) => {
                    const config = configs[analyzer.analyzerName];
                    const isExpanded = expandedAnalyzers.has(analyzer.analyzerName);
                    const isLongRunning = analyzer.isLongRunning;

                    return (
                      <div key={analyzer.analyzerName} className="border rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={() => toggleAnalyzer(analyzer.analyzerName)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                              <span className="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                                {config.enabled ? 'On' : 'Off'}
                              </span>
                            </label>

                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{analyzer.analyzerDisplayName || analyzer.analyzerName}</span>
                                {isLongRunning && (
                                  <span
                                    className="flex items-center gap-1 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100 rounded"
                                    title="This analyzer may take longer to execute"
                                  >
                                    <AlertCircle className="w-3 h-3" />
                                    slow
                                  </span>
                                )}
                              </div>
                              {analyzer.analyzerDescription && (
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {analyzer.analyzerDescription}
                                </p>
                              )}
                              {analyzer.estimatedDurationMs && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Est. ~{(analyzer.estimatedDurationMs / 1000).toFixed(1)}s
                                </p>
                              )}
                            </div>
                          </div>

                          {hasConfigurableOptions(analyzer.analyzerName) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleOptions(analyzer.analyzerName)}
                              disabled={!config.enabled}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              Configure
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              No additional configuration
                            </span>
                          )}
                        </div>

                        {/* Analyzer Options (Expanded) */}
                        {isExpanded && config.enabled && (
                          <div className="mt-3 pt-3 border-t space-y-3">
                            {/* Render analyzer-specific options based on analyzer name */}
                            {renderAnalyzerOptions(analyzer, config, credentials, updateOption)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Render analyzer-specific options based on analyzer type
 */
function renderAnalyzerOptions(
  analyzer: TaskAnalyzerMapping,
  config: AnalyzerConfig,
  credentials: ApiCredential[],
  updateOption: (analyzerName: string, optionKey: string, value: any) => void
) {
  const analyzerName = analyzer.analyzerName.toLowerCase();

  // SenderReputationAnalyzer options
  if (analyzerName === 'senderreputationanalyzer') {
    return (
      <>
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded mb-3">
          <p className="text-sm text-green-800 dark:text-green-100">
            ✓ No API keys required - uses free public WHOIS and DNS services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.options.enableWhois !== false}
            onChange={(e) => updateOption(analyzer.analyzerName, 'enableWhois', e.target.checked)}
            className="w-4 h-4"
          />
          <label className="text-sm">Enable WHOIS Lookup (adds ~10s)</label>
        </div>
        <div>
          <label className="text-sm font-medium">WHOIS Timeout (ms)</label>
          <Input
            type="number"
            value={config.options.whoisTimeoutMs || 10000}
            onChange={(e) =>
              updateOption(analyzer.analyzerName, 'whoisTimeoutMs', Number(e.target.value))
            }
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">DNS Timeout (ms)</label>
          <Input
            type="number"
            value={config.options.dnsTimeoutMs || 10000}
            onChange={(e) =>
              updateOption(analyzer.analyzerName, 'dnsTimeoutMs', Number(e.target.value))
            }
            className="mt-1"
          />
        </div>
      </>
    );
  }

  // LinkReputationAnalyzer options
  if (analyzerName === 'linkreputationanalyzer') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Checks URLs against threat intelligence databases:
        </p>
        <ul className="text-sm space-y-1 ml-4">
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span> URLhaus (free, no API key required)
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span> PhishTank (uses API key from settings if configured)
          </li>
          <li className="flex items-center gap-2 opacity-50">
            <span className="text-gray-400">○</span> VirusTotal (coming soon)
          </li>
          <li className="flex items-center gap-2 opacity-50">
            <span className="text-gray-400">○</span> Google Safe Browsing (coming soon)
          </li>
        </ul>
        <p className="text-xs text-muted-foreground italic p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
          💡 Configure API keys in "API Key Settings" section above to enable PhishTank, VirusTotal, and Google Safe Browsing.
        </p>
      </div>
    );
  }

  // AttachmentAnalyzer options
  if (analyzerName === 'attachmentanalyzer') {
    return (
      <>
        <div>
          <label className="text-sm font-medium">Max File Size (MB)</label>
          <Input
            type="number"
            value={config.options.maxFileSizeMb || 25}
            onChange={(e) =>
              updateOption(analyzer.analyzerName, 'maxFileSizeMb', Number(e.target.value))
            }
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Sandbox Analysis</label>
          <select
            value={config.options.sandboxMode || 'enabled'}
            onChange={(e) => updateOption(analyzer.analyzerName, 'sandboxMode', e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="auto">Auto (based on file type)</option>
          </select>
        </div>
      </>
    );
  }

  // ContentAnalysisAnalyzer options (AI model selection would go here)
  if (analyzerName === 'contentanalysisanalyzer') {
    return (
      <>
        <div>
          <label className="text-sm font-medium">AI Model</label>
          <p className="text-xs text-muted-foreground mt-1">
            AI model selection is configured at the integration level (not per-analyzer)
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">Sensitivity</label>
          <select
            value={config.options.sensitivity || 'high'}
            onChange={(e) => updateOption(analyzer.analyzerName, 'sensitivity', e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </>
    );
  }

  // Default: No specific options
  return (
    <p className="text-sm text-muted-foreground">No additional options for this analyzer</p>
  );
}
