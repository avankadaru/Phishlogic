import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import type { IntegrationTask, AIModelConfig, TaskAnalyzerMapping, ApiCredential, PromptTemplate } from '@/types';
import AnalyzerConfigSection from '@/components/AnalyzerConfigSection';
import {
  Settings,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  Trash2,
  Zap,
  Mail,
  Globe,
} from 'lucide-react';

export default function TasksPage() {
  const [integrationTasks, setIntegrationTasks] = useState<IntegrationTask[]>([]);
  const [aiModels, setAiModels] = useState<AIModelConfig[]>([]);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [taskAnalyzers, setTaskAnalyzers] = useState<Record<string, TaskAnalyzerMapping[]>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [showAnalyzers, setShowAnalyzers] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [addingNewModel, setAddingNewModel] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModelConfig | null>(null);
  const [modelForm, setModelForm] = useState({
    name: '',
    provider: 'anthropic' as 'anthropic' | 'openai' | 'google' | 'custom',
    modelId: '',
    apiKey: '',
    temperature: undefined as number | undefined,
    maxTokens: undefined as number | undefined,
    timeoutMs: 30000,
    promptTemplateId: undefined as string | undefined,
  });

  useEffect(() => {
    loadIntegrationTasks();
    loadAIModels();
    loadCredentials();
    loadPromptTemplates();
  }, []);

  const loadIntegrationTasks = async () => {
    try {
      const response = await api.get('/admin/integration-tasks');
      setIntegrationTasks(response.data.data || []);
    } catch (error) {
      console.error('Failed to load integration tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAIModels = async () => {
    try {
      const response = await api.get('/admin/ai-models');
      setAiModels(response.data.data || []);
    } catch (error) {
      console.error('Failed to load AI models:', error);
    }
  };

  const loadCredentials = async () => {
    try {
      const response = await api.get('/admin/credentials');
      setCredentials(response.data.credentials || []);
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
  };

  const loadPromptTemplates = async () => {
    try {
      const response = await api.get('/admin/prompt-templates');
      setPromptTemplates(response.data.templates || []);
    } catch (error) {
      console.error('Failed to load prompt templates:', error);
    }
  };

  const loadTaskAnalyzers = async (integrationName: string) => {
    try {
      const response = await api.get(`/admin/integration-tasks/${integrationName}/analyzers`);
      const analyzers = response.data.data?.analyzers || [];

      // Transform to TaskAnalyzerMapping format with task information from API
      const mappings: TaskAnalyzerMapping[] = analyzers.map((a: any) => ({
        id: a.id || `${integrationName}-${a.analyzerName}`,
        taskName: a.taskName || 'unknown',
        analyzerName: a.analyzerName,
        executionOrder: a.executionOrder || 0,
        isLongRunning: a.isLongRunning || false,
        estimatedDurationMs: a.estimatedDurationMs,
        taskDisplayName: a.taskDisplayName,
        taskDescription: a.taskDescription,
        analyzerDisplayName: a.displayName,
        analyzerDescription: a.description,
        analyzerType: a.analyzerType,
      }));

      setTaskAnalyzers(prev => ({ ...prev, [integrationName]: mappings }));
    } catch (error) {
      console.error(`Failed to load analyzers for ${integrationName}:`, error);
      setTaskAnalyzers(prev => ({ ...prev, [integrationName]: [] }));
    }
  };

  const handleUpdateMode = async (
    integrationName: string,
    mode: 'ai' | 'hybrid' | 'native'
  ) => {
    setUpdating(integrationName);
    try {
      await api.put(`/admin/integration-tasks/${integrationName}`, {
        executionMode: mode,
      });
      await loadIntegrationTasks();
    } catch (error) {
      console.error('Failed to update integration mode:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleEnabled = async (integrationName: string, currentState: boolean) => {
    setUpdating(integrationName);
    try {
      await api.put(`/admin/integration-tasks/${integrationName}`, {
        enabled: !currentState,
      });
      await loadIntegrationTasks();
    } catch (error) {
      console.error('Failed to toggle integration:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateIntegrationModel = async (integrationName: string, modelId: string) => {
    setUpdating(integrationName);
    try {
      await api.put(`/admin/integration-tasks/${integrationName}`, {
        aiModelId: modelId || null,
      });
      await loadIntegrationTasks();
    } catch (error) {
      console.error('Failed to update integration model:', error);
    } finally {
      setUpdating(null);
    }
  };

  // AI Model Management Functions
  const handleSaveAIModel = async () => {
    try {
      if (editingModel) {
        await api.put(`/admin/ai-models/${editingModel.id}`, modelForm);
      } else {
        await api.post('/admin/ai-models', modelForm);
      }
      await loadAIModels();
      setAddingNewModel(false);
      setEditingModel(null);
      resetModelForm();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save AI model');
    }
  };

  const handleDeleteAIModel = async (id: string, name: string) => {
    if (!confirm(`Delete AI model "${name}"? Tasks using it will need to be reconfigured.`)) {
      return;
    }
    try {
      await api.delete(`/admin/ai-models/${id}`);
      await loadAIModels();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete AI model');
    }
  };

  const handleTestConnection = async (id: string) => {
    try {
      const response = await api.post(`/admin/ai-models/${id}/test`);
      alert(response.data.message || 'Connection test successful!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Connection test failed');
    }
  };

  const startEditingModel = (model: AIModelConfig) => {
    setEditingModel(model);
    setModelForm({
      name: model.name,
      provider: model.provider,
      modelId: model.modelId || '',
      apiKey: '',
      temperature: model.temperature,
      maxTokens: model.maxTokens,
      timeoutMs: model.timeoutMs,
      promptTemplateId: model.promptTemplateId,
    });
    setAddingNewModel(true);
  };

  const resetModelForm = () => {
    setModelForm({
      name: '',
      provider: 'anthropic',
      modelId: '',
      apiKey: '',
      temperature: undefined,
      maxTokens: undefined,
      timeoutMs: 30000,
      promptTemplateId: undefined,
    });
    setShowAdvanced(false);
  };

  const getModelIdPlaceholder = (provider: string) => {
    switch (provider) {
      case 'anthropic': return 'Default: claude-3-5-sonnet-20241022';
      case 'openai': return 'Default: gpt-4';
      case 'google': return 'Default: gemini-1.5-pro';
      case 'custom': return 'Required for custom providers';
      default: return 'Model ID';
    }
  };

  const toggleDetails = (taskId: string) => {
    setShowDetails(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const toggleAnalyzers = async (integrationName: string) => {
    const isCurrentlyShown = showAnalyzers[integrationName];

    // If we're opening the section and haven't loaded analyzers yet, load them
    if (!isCurrentlyShown && !taskAnalyzers[integrationName]) {
      await loadTaskAnalyzers(integrationName);
    }

    setShowAnalyzers(prev => ({ ...prev, [integrationName]: !prev[integrationName] }));
  };

  const handleSaveAnalyzerConfigs = async (integrationName: string, configs: any[]) => {
    try {
      // Update each analyzer's configuration
      for (const config of configs) {
        if (config.enabled) {
          // Analyzer is enabled, update options
          await api.put(
            `/admin/integration-tasks/${integrationName}/analyzers/${config.analyzerName}`,
            {
              analyzerOptions: config.options,
            }
          );
        }
      }

      alert('Analyzer configuration saved successfully!');

      // Reload analyzers to reflect changes
      await loadTaskAnalyzers(integrationName);
    } catch (error: any) {
      console.error('Failed to save analyzer configs:', error);
      alert(error.response?.data?.error || 'Failed to save analyzer configuration');
    }
  };

  const renderModeDetails = (task: IntegrationTask) => {
    if (!showDetails[task.id]) return null;

    const selectedModel = aiModels.find(m => m.id === task.aiModelId);
    const activeAnalyzers = task.analyzers.filter(a => a.isActive);

    switch (task.executionMode) {
      case 'native':
        return (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-semibold text-sm mb-2 text-blue-900 dark:text-blue-100">
              Native Mode - Built-in Analyzers
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              Uses built-in analyzers without AI:
            </p>
            <ul className="space-y-2 text-xs ml-4">
              {activeAnalyzers.map((analyzer) => (
                <li key={analyzer.taskName} className="flex items-start">
                  <span className="text-blue-600 mr-2 font-bold">•</span>
                  <div>
                    <strong>{analyzer.displayName}</strong> - {analyzer.description}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-3 font-medium">
              Fast (~{task.inputType === 'email' ? '150' : '200'}ms total), no API costs, rule-based analysis
            </p>
          </div>
        );

      case 'hybrid':
        return (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <h4 className="font-semibold text-sm mb-2 text-purple-900 dark:text-purple-100">
              Hybrid Mode - AI with Native Fallback
            </h4>
            <div className="mb-3">
              <label className="text-xs font-medium block mb-1">Select AI Model:</label>
              <select
                value={task.aiModelId || ''}
                onChange={(e) => handleUpdateIntegrationModel(task.integrationName, e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
                disabled={updating === task.integrationName}
              >
                <option value="">Select a model...</option>
                {aiModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
              </select>
            </div>
            {selectedModel ? (
              <div className="text-xs space-y-2">
                <p className="font-medium">
                  <strong>Primary:</strong> {selectedModel.name} analyzes using all {activeAnalyzers.length} checks
                </p>
                <p className="font-medium">
                  <strong>Fallback:</strong> If AI fails/times out, uses native analyzers:
                </p>
                <ul className="ml-4 space-y-1 text-muted-foreground">
                  {activeAnalyzers.map((analyzer) => (
                    <li key={analyzer.taskName}>• {analyzer.displayName}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-2 pt-2 border-t border-purple-200">
                  Best for production: combines AI accuracy with reliability
                </p>
              </div>
            ) : (
              <p className="text-xs text-orange-600 font-medium">
                No AI model selected. Please configure an AI model above to use Hybrid mode.
              </p>
            )}
          </div>
        );

      case 'ai':
        return (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <h4 className="font-semibold text-sm mb-2 text-green-900 dark:text-green-100">
              AI Mode - AI-Only Analysis
            </h4>
            <div className="mb-3">
              <label className="text-xs font-medium block mb-1">Select AI Model:</label>
              <select
                value={task.aiModelId || ''}
                onChange={(e) => handleUpdateIntegrationModel(task.integrationName, e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
                disabled={updating === task.integrationName}
              >
                <option value="">Select a model...</option>
                {aiModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
              </select>
            </div>
            {selectedModel ? (
              <div className="text-xs space-y-2">
                <p className="font-medium"><strong>Model:</strong> {selectedModel.name}</p>
                <p className="font-medium"><strong>Analysis:</strong> AI performs all checks:</p>
                <ul className="ml-4 space-y-1 text-muted-foreground">
                  {activeAnalyzers.map((analyzer) => (
                    <li key={analyzer.taskName}>• {analyzer.displayName}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-2 pt-2 border-t border-green-200">
                  No fallback. Maximum accuracy with richer context and reasoning. Best for testing and maximum security.
                </p>
              </div>
            ) : (
              <p className="text-xs text-orange-600 font-medium">
                No AI model selected. Please configure an AI model above to use AI mode.
              </p>
            )}
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Task Configuration</h1>
        <p className="text-muted-foreground">
          Configure AI models and execution modes for integration tasks
        </p>
      </div>

      {/* AI Model Configuration Section */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowModelConfig(!showModelConfig)}
          >
            <div className="flex items-center space-x-3">
              <Zap className="w-5 h-5 text-primary" />
              <div>
                <CardTitle>AI Model Configuration</CardTitle>
                <CardDescription>
                  Configure AI models once, reuse across tasks ({aiModels.length} model{aiModels.length !== 1 ? 's' : ''} configured)
                </CardDescription>
              </div>
            </div>
            {showModelConfig ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </CardHeader>

        {showModelConfig && (
          <CardContent className="space-y-4">
            {aiModels.length > 0 && (
              <div className="space-y-3">
                {aiModels.map((model) => (
                  <div key={model.id} className="border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm">{model.name}</h3>
                        <div className="text-xs text-muted-foreground space-y-1 mt-2">
                          <p><strong>Provider:</strong> {model.provider}</p>
                          <p><strong>Model:</strong> {model.modelId}</p>
                          <p><strong>API Key:</strong> {model.apiKey}</p>
                          <p><strong>Temperature:</strong> {model.temperature} | <strong>Max Tokens:</strong> {model.maxTokens}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditingModel(model)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestConnection(model.id)}
                        >
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteAIModel(model.id, model.name)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {addingNewModel ? (
              <div className="border rounded-lg p-4 bg-background">
                <h3 className="font-semibold text-sm mb-3">
                  {editingModel ? 'Edit AI Model' : 'Add New AI Model'}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium block mb-1">
                      Model Name* <span className="text-muted-foreground">(e.g., "Claude Production")</span>
                    </label>
                    <input
                      type="text"
                      value={modelForm.name}
                      onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                      placeholder="Custom name for reference"
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Provider*</label>
                      <select
                        value={modelForm.provider}
                        onChange={(e) => setModelForm({ ...modelForm, provider: e.target.value as any })}
                        className="w-full border rounded px-2 py-1 text-sm"
                      >
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                        <option value="google">Google</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">
                        Model ID{modelForm.provider === 'custom' && '*'}
                        <span className="text-muted-foreground font-normal"> (optional - defaults by provider)</span>
                      </label>
                      <input
                        type="text"
                        value={modelForm.modelId}
                        onChange={(e) => setModelForm({ ...modelForm, modelId: e.target.value })}
                        placeholder={getModelIdPlaceholder(modelForm.provider)}
                        className="w-full border rounded px-2 py-1 text-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave empty for default model
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">API Key*</label>
                    <input
                      type="password"
                      value={modelForm.apiKey}
                      onChange={(e) => setModelForm({ ...modelForm, apiKey: e.target.value })}
                      placeholder={editingModel ? "Leave empty to keep existing key" : "sk-ant-api-key-here"}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </div>

                  {/* Prompt Template Selector */}
                  <div>
                    <label className="text-xs font-medium block mb-1">
                      Prompt Template
                      <span className="ml-2 text-xs text-amber-600">⭐ Recommended</span>
                    </label>
                    <select
                      value={modelForm.promptTemplateId || ''}
                      onChange={(e) => setModelForm({ ...modelForm, promptTemplateId: e.target.value || undefined })}
                      className="w-full border rounded px-2 py-1 text-sm"
                    >
                      <option value="">Use default template</option>
                      {promptTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.displayName} - {template.tokenEstimate} tokens (~{(template.accuracyTarget * 100).toFixed(0)}% accuracy)
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      <strong>Cost-Efficient</strong>: Fast screening (~$0.70/1k emails, 92% accuracy)
                      <br /><strong>Balanced</strong> ⭐: Production default (~$1.00/1k, 96% accuracy)
                      <br /><strong>Comprehensive</strong>: VIP/forensic (~$1.50/1k, 98% accuracy)
                    </p>
                  </div>

                  {/* Advanced Settings - Collapsible */}
                  <div className="border-t pt-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>Advanced Settings (Optional)</span>
                      <span>{showAdvanced ? '▼' : '▶'}</span>
                    </button>

                    {showAdvanced && (
                      <div className="grid grid-cols-3 gap-3 mt-3 pl-3 border-l-2 border-muted">
                        <div>
                          <label className="text-xs font-medium block mb-1">Temperature</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            value={modelForm.temperature ?? 0.3}
                            onChange={(e) => setModelForm({ ...modelForm, temperature: parseFloat(e.target.value) || undefined })}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                          <p className="text-xs text-muted-foreground mt-0.5">Default: 0.3 (0-2)</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1">Max Tokens</label>
                          <input
                            type="number"
                            value={modelForm.maxTokens ?? 4096}
                            onChange={(e) => setModelForm({ ...modelForm, maxTokens: parseInt(e.target.value) || undefined })}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                          <p className="text-xs text-muted-foreground mt-0.5">Default: 4096</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1">Timeout (ms)</label>
                          <input
                            type="number"
                            value={modelForm.timeoutMs}
                            onChange={(e) => setModelForm({ ...modelForm, timeoutMs: parseInt(e.target.value) })}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                          <p className="text-xs text-muted-foreground mt-0.5">Default: 30000ms</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end space-x-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAddingNewModel(false);
                        setEditingModel(null);
                        resetModelForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveAIModel}
                      disabled={
                        !modelForm.name ||
                        !modelForm.provider ||
                        (!editingModel && !modelForm.apiKey) ||
                        (modelForm.provider === 'custom' && !modelForm.modelId)
                      }
                    >
                      {editingModel ? 'Update Model' : 'Save Model'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddingNewModel(true)}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New AI Model
              </Button>
            )}
          </CardContent>
        )}
      </Card>

      {/* API Key Settings Section */}
      <Card className="border-2 border-amber-200 dark:border-amber-800">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Settings className="w-5 h-5 text-amber-600" />
            <div>
              <CardTitle>API Key Settings</CardTitle>
              <CardDescription>
                Configure API keys for external threat intelligence services (used by analyzers)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* PhishTank API Key */}
          <div className="space-y-2">
            <label className="text-sm font-medium">PhishTank API Key</label>
            <select
              className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800"
              disabled
            >
              <option>No API Key (1 req/5sec rate limit)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Optional - Higher rate limits with API key. Used by Link Reputation Analyzer.
            </p>
            <p className="text-xs text-muted-foreground italic">
              Configure credentials in Credentials page, then they'll appear here.
            </p>
          </div>

          {/* VirusTotal API Key */}
          <div className="space-y-2 opacity-50">
            <label className="text-sm font-medium">VirusTotal API Key</label>
            <select disabled className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800">
              <option>Coming soon</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Coming soon - Multi-engine malware scanning
            </p>
          </div>

          {/* Google Safe Browsing API Key */}
          <div className="space-y-2 opacity-50">
            <label className="text-sm font-medium">Google Safe Browsing API Key</label>
            <select disabled className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800">
              <option>Coming soon</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Coming soon - Google's phishing and malware database
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Integration Tasks (Gmail, Chrome) */}
      <div className="space-y-4">
        {integrationTasks.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No integration tasks configured. Please run database migration 006.
              </p>
            </CardContent>
          </Card>
        ) : (
          integrationTasks.map((task) => (
            <Card key={task.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {task.inputType === 'email' ? (
                      <Mail className="w-5 h-5 text-primary" />
                    ) : (
                      <Globe className="w-5 h-5 text-primary" />
                    )}
                    <div>
                      <CardTitle>{task.displayName}</CardTitle>
                      <CardDescription>{task.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {task.enabled ? (
                      <span className="flex items-center text-sm text-green-600">
                        <Check className="w-4 h-4 mr-1" />
                        Enabled
                      </span>
                    ) : (
                      <span className="flex items-center text-sm text-gray-500">
                        <X className="w-4 h-4 mr-1" />
                        Disabled
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Execution Mode */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Execution Mode</label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleDetails(task.id)}
                        className="text-xs"
                      >
                        {showDetails[task.id] ? (
                          <>
                            <ChevronUp className="w-3 h-3 mr-1" />
                            Hide Details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3 mr-1" />
                            Show Details
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="flex space-x-2">
                      {(['native', 'hybrid', 'ai'] as const).map((mode) => (
                        <Button
                          key={mode}
                          size="sm"
                          variant={task.executionMode === mode ? 'default' : 'outline'}
                          onClick={() => handleUpdateMode(task.integrationName, mode)}
                          disabled={updating === task.integrationName}
                        >
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Mode Details */}
                  {renderModeDetails(task)}

                  {/* Analyzer Configuration Section */}
                  <div className="pt-4 border-t">
                    {task.executionMode === 'ai' ? (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                        <p className="text-sm text-blue-800 dark:text-blue-100">
                          <strong>AI Mode:</strong> Individual analyzer configuration is disabled.
                          The AI model handles all analysis decisions.
                        </p>
                      </div>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleAnalyzers(task.integrationName)}
                          className="w-full"
                        >
                          {showAnalyzers[task.integrationName] ? (
                            <>
                              <ChevronUp className="w-4 h-4 mr-2" />
                              Hide Analyzer Configuration
                            </>
                          ) : (
                            <>
                              <Settings className="w-4 h-4 mr-2" />
                              Configure Analyzers
                            </>
                          )}
                        </Button>

                        {showAnalyzers[task.integrationName] && (
                          <div className="mt-4">
                            {taskAnalyzers[task.integrationName] ? (
                              <AnalyzerConfigSection
                                integrationName={task.integrationName}
                                analyzers={taskAnalyzers[task.integrationName]}
                                credentials={credentials}
                                onSave={(configs) => handleSaveAnalyzerConfigs(task.integrationName, configs)}
                                executionMode={task.executionMode}
                              />
                            ) : (
                              <div className="flex items-center justify-center py-8">
                                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
                                <p className="ml-3 text-sm text-muted-foreground">Loading analyzers...</p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Toggle Enabled */}
                  <div className="flex justify-between items-center pt-4 border-t mt-4">
                    <span className="text-sm text-muted-foreground">Task Status</span>
                    <Button
                      size="sm"
                      variant={task.enabled ? 'destructive' : 'default'}
                      onClick={() => handleToggleEnabled(task.integrationName, task.enabled)}
                      disabled={updating === task.integrationName}
                    >
                      {task.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
