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

// Cost Analytics
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

// Whitelist
export type WhitelistType = 'email' | 'domain' | 'url';

export interface WhitelistEntry {
  id: string;
  type: WhitelistType;
  value: string;
  description?: string;
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
export interface Analysis {
  id: string;
  inputType: string;
  inputSource: string;
  verdict: 'Safe' | 'Suspicious' | 'Malicious';
  confidenceScore: number;
  riskFactors: string[];
  executionMode: string;
  aiProvider?: string;
  aiModel?: string;
  processingTimeMs: number;
  costUsd?: number;
  tokensUsed?: number;
  whitelisted: boolean;
  whitelistReason?: string;
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
