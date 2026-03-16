// Authentication
export interface User {
  id: string;
  username: string;
  email?: string;
  role: 'admin' | 'user';
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
}

// AI Model Configuration
export interface AIModelConfig {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'custom';
  modelId: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  usageCount?: number;
}

// API Credentials (External Services)
export interface ApiCredential {
  id: string;
  credentialName: string;
  displayName: string;
  description?: string;
  provider: string;
  apiKeySanitized: string; // Only first/last 4 chars shown
  hasApiSecret: boolean;
  endpointUrl?: string;
  rateLimitPerDay?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Task Definition (email analysis tasks: sender_verification, links, attachments, etc.)
export interface Task {
  taskName: string;
  displayName: string;
  description?: string;
  inputType: 'email' | 'url';
  executionOrder: number;
  isActive: boolean;
  createdAt: string;
}

// Analyzer Definition (analyzer implementations: spfAnalyzer, buttonAnalyzer, etc.)
export interface Analyzer {
  analyzerName: string;
  displayName: string;
  description?: string;
  analyzerType: 'static' | 'dynamic';
  defaultWeight: number;
  isActive: boolean;
  createdAt: string;
}

// Task-Analyzer Mapping (which analyzers run in which tasks)
export interface TaskAnalyzerMapping {
  id: string;
  taskName: string;
  analyzerName: string;
  executionOrder: number;
  isLongRunning: boolean;
  estimatedDurationMs?: number;
  taskDisplayName?: string;
  taskDescription?: string;
  analyzerDisplayName?: string;
  analyzerDescription?: string;
  analyzerType?: 'static' | 'dynamic';
}

// Integration Task (user-facing tasks: Gmail, Chrome, etc.)
export interface IntegrationTask {
  id: string;
  integrationName: string;
  displayName: string;
  description: string;
  inputType: 'email' | 'url';
  enabled: boolean;
  executionMode: 'native' | 'hybrid' | 'ai';
  aiModelId?: string;
  fallbackToNative: boolean;
  analyzers: AnalyzerInfo[];
  createdAt: string;
  updatedAt: string;
}

// Analyzer Info (for display in integration task details)
export interface AnalyzerInfo {
  taskName: string;
  displayName: string;
  description: string;
  analyzerGroup: string;
  isActive: boolean;
  executionOrder: number;
}

// Task Configuration (analyzer definitions - not directly user-configurable)
export interface TaskConfig {
  id: string;
  task_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Cost Analytics (Aggregated reporting)
export interface CostSummary {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalCost: number;
    totalRequests: number;
    avgCostPerRequest: number;
    monthlyBudget?: number;
    budgetUtilization?: number;
    budgetRemaining?: number;
  };
  byProvider: Array<{
    provider: string;
    requestCount: number;
    totalCost: number;
    avgCostPerRequest: number;
    totalTokens: number;
  }>;
  byTask: Array<{
    taskName: string;
    requestCount: number;
    totalCost: number;
    avgCostPerRequest: number;
  }>;
  dailyTrend: Array<{
    date: string;
    requestCount: number;
    totalCost: number;
  }>;
}

// Per-Analysis Cost Tracking
export interface CostOperation {
  operationType: 'ai_api_call' | 'whois_lookup' | 'browser_automation' | 'dns_lookup' | 'external_api_call';
  description: string;
  count: number;
  costUsd?: number;
  metadata?: {
    provider?: string;
    model?: string;
    tokensUsed?: number;
    apiKeyUsed?: boolean;
    browser?: string;
    urlsChecked?: number;
  };
}

export interface AnalysisCostSummary {
  totalCostUsd: number;
  operations: CostOperation[];
}

// Whitelist
export type WhitelistType = 'email' | 'domain' | 'url';
export type TrustLevel = 'high' | 'medium' | 'low';

export interface WhitelistEntry {
  id: string;
  type: WhitelistType;
  value: string;
  description?: string;
  trustLevel?: TrustLevel;
  addedAt: string;
  expiresAt?: string;
  active: boolean;
  matchCount?: number;
  lastMatchedAt?: string;
}

export interface WhitelistStats {
  total: number;
  active: number;
  byType: {
    email: number;
    domain: number;
    url: number;
  };
  topMatched: Array<{
    id: string;
    type: string;
    value: string;
    matchCount: number;
    lastMatchedAt: string;
  }>;
}

// Debug & Analytics
export interface RedFlag {
  message: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ExecutionStep {
  step: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  status?: 'started' | 'completed' | 'failed' | 'skipped';
  error?: string;
  stackTrace?: string;
  errorContext?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface Analysis {
  id: string;
  inputType: string;
  inputSource: string;
  verdict: 'Safe' | 'Suspicious' | 'Malicious';
  confidenceScore: number;
  riskFactors: RedFlag[] | string[];
  executionMode: string;
  aiProvider?: string;
  aiModel?: string;
  processingTimeMs: number;
  costUsd?: number;
  tokensUsed?: number;
  whitelisted: boolean;
  whitelistReason?: string;
  trustLevel?: TrustLevel;
  analyzersRun?: string[];
  executionSteps?: ExecutionStep[];
  contentRisk?: {
    hasLinks: boolean;
    hasAttachments: boolean;
    hasUrgencyLanguage: boolean;
    overallRiskScore: number;
  };
  costSummary?: AnalysisCostSummary;
  skippedTasks?: string[];
  errorMessage?: string;
  createdAt: string;
}

export interface SystemStats {
  period: string;
  verdictDistribution: Array<{
    verdict: string;
    count: number;
    avgConfidence: number;
    avgProcessingTime: number;
  }>;
  executionModeDistribution: Array<{
    executionMode: string;
    count: number;
    avgProcessingTime: number;
    totalCost: number;
  }>;
  errorRate: number;
  whitelistHitRate: number;
  taskPerformance: Array<{
    taskName: string;
    count: number;
    avgProcessingTime: number;
    avgCost: number;
  }>;
}

// Notifications
export interface NotificationConfig {
  id: string;
  type: 'webhook' | 'email' | 'slack';
  name: string;
  enabled: boolean;
  config: {
    url?: string;
    email?: string;
    slackChannel?: string;
  };
  triggers: string[];
  filters?: {
    minConfidence?: number;
    verdicts?: string[];
  };
  lastTriggeredAt?: string;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

// System Settings
export interface SystemSetting {
  key: string;
  value: string | number | boolean;
  description?: string;
  updatedBy?: string;
  updatedAt?: string;
}

// Release Notes
export interface ReleaseNote {
  version: string;
  date: string;
  features: string[];
  bugFixes: string[];
  improvements: string[];
  breaking?: string[];
}

// Support Requests
export interface SupportRequest {
  id: string;
  requestType: 'issue' | 'improvement';
  category: string;
  description: string;
  email?: string;
  preferredContactTime?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
