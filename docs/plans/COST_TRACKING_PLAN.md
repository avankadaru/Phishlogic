# AI Cost Tracking & Model Selection Plan

## Overview

This plan details the per-task AI model selection architecture and comprehensive cost tracking system for PhishLogic. It enables granular control over which AI models are used for different tasks and provides real-time cost monitoring and analytics.

---

## Per-Task AI Model Selection

### Design Philosophy

**Problem**: Different AI tasks have different requirements:
- Email semantic analysis → Fast, cheap (GPT-4o-mini)
- Visual phishing detection → Accurate, vision (Claude Sonnet)
- Code generation → Reasoning, quality (Claude Sonnet)
- Verdict reasoning → Fast, cheap (Claude Haiku)

**Solution**: Granular model selection per analyzer + default fallback

### Configuration Architecture

```typescript
// src/config/app.config.ts - Enhanced AI config
const AIConfigSchema = z.object({
  enabled: z.coerce.boolean().default(false),

  // Default provider/model (fallback for all tasks)
  defaultProvider: z.enum(['anthropic', 'openai']).default('anthropic'),
  defaultModel: z.string().default('claude-3-5-sonnet-20241022'),

  // Anthropic configuration
  anthropic: z.object({
    apiKey: z.string().optional(),
    models: z.object({
      sonnet: z.string().default('claude-3-5-sonnet-20241022'),
      haiku: z.string().default('claude-3-5-haiku-20241022'),
      opus: z.string().default('claude-opus-4-6'),
    }),
  }),

  // OpenAI configuration
  openai: z.object({
    apiKey: z.string().optional(),
    models: z.object({
      gpt4o: z.string().default('gpt-4o'),
      gpt4oMini: z.string().default('gpt-4o-mini'),
      gpt4Turbo: z.string().default('gpt-4-turbo-preview'),
    }),
  }),

  // Per-task model selection (overrides default)
  taskModels: z.object({
    emailSemanticAnalysis: z.object({
      provider: z.enum(['anthropic', 'openai']).default('openai'),
      model: z.string().default('gpt-4o-mini'),
      enabled: z.boolean().default(true),
    }),
    urlSemanticAnalysis: z.object({
      provider: z.enum(['anthropic', 'openai']).default('anthropic'),
      model: z.string().default('claude-3-5-sonnet-20241022'),
      enabled: z.boolean().default(true),
    }),
    visualPhishingDetection: z.object({
      provider: z.enum(['anthropic', 'openai']).default('anthropic'),
      model: z.string().default('claude-3-5-sonnet-20241022'),
      enabled: z.boolean().default(false),
    }),
    verdictReasoning: z.object({
      provider: z.enum(['anthropic', 'openai']).default('anthropic'),
      model: z.string().default('claude-3-5-haiku-20241022'),
      enabled: z.boolean().default(true),
    }),
    anomalyDetection: z.object({
      provider: z.enum(['anthropic', 'openai']).default('openai'),
      model: z.string().default('text-embedding-3-small'),
      enabled: z.boolean().default(false),
    }),
    debugAssistant: z.object({
      provider: z.enum(['anthropic', 'openai']).default('anthropic'),
      model: z.string().default('claude-3-5-sonnet-20241022'),
      enabled: z.boolean().default(true),
    }),
    codeGenerator: z.object({
      provider: z.enum(['anthropic', 'openai']).default('anthropic'),
      model: z.string().default('claude-3-5-sonnet-20241022'),
      enabled: z.boolean().default(true),
    }),
  }),

  // Fallback behavior
  fallback: z.object({
    useNativeOnAIFailure: z.boolean().default(true),
    nativeOnlyMode: z.boolean().default(false),
    timeoutMs: z.number().default(10000),
    retryAttempts: z.number().default(2),
  }),

  // Cost controls
  costLimits: z.object({
    maxCostPerAnalysisCents: z.number().default(5),
    monthlyBudgetDollars: z.number().default(100),
    alertThresholdPercent: z.number().default(80),
  }),
});
```

### Environment Variables

```bash
# AI Configuration
AI_ENABLED=true
AI_DEFAULT_PROVIDER=anthropic
AI_DEFAULT_MODEL=claude-3-5-sonnet-20241022

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_SONNET_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_HAIKU_MODEL=claude-3-5-haiku-20241022
ANTHROPIC_OPUS_MODEL=claude-opus-4-6

# OpenAI API
OPENAI_API_KEY=sk-...
OPENAI_GPT4O_MODEL=gpt-4o
OPENAI_GPT4O_MINI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Per-Task Model Selection
AI_EMAIL_SEMANTIC_PROVIDER=openai
AI_EMAIL_SEMANTIC_MODEL=gpt-4o-mini
AI_EMAIL_SEMANTIC_ENABLED=true

AI_URL_SEMANTIC_PROVIDER=anthropic
AI_URL_SEMANTIC_MODEL=claude-3-5-sonnet-20241022
AI_URL_SEMANTIC_ENABLED=true

AI_VISUAL_PHISHING_PROVIDER=anthropic
AI_VISUAL_PHISHING_MODEL=claude-3-5-sonnet-20241022
AI_VISUAL_PHISHING_ENABLED=false

AI_VERDICT_REASONING_PROVIDER=anthropic
AI_VERDICT_REASONING_MODEL=claude-3-5-haiku-20241022
AI_VERDICT_REASONING_ENABLED=true

# Fallback Configuration
AI_FALLBACK_TO_NATIVE=true
AI_NATIVE_ONLY_MODE=false
AI_TIMEOUT_MS=10000
AI_RETRY_ATTEMPTS=2

# Cost Controls
AI_MAX_COST_PER_ANALYSIS_CENTS=5
AI_MONTHLY_BUDGET_DOLLARS=100
AI_COST_ALERT_THRESHOLD_PERCENT=80
```

---

## Model Selection Service

```typescript
// New: src/core/services/ai/model-selector.service.ts
export type AITask =
  | 'emailSemanticAnalysis'
  | 'urlSemanticAnalysis'
  | 'visualPhishingDetection'
  | 'verdictReasoning'
  | 'anomalyDetection'
  | 'debugAssistant'
  | 'codeGenerator';

export interface ModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  enabled: boolean;
}

export class ModelSelectorService {
  constructor(private config: AppConfig) {}

  /**
   * Get model configuration for a specific task
   */
  getModelForTask(task: AITask): ModelConfig {
    const taskConfig = this.config.ai.taskModels[task];

    if (!taskConfig.enabled) {
      throw new Error(`AI disabled for task: ${task}`);
    }

    return {
      provider: taskConfig.provider,
      model: taskConfig.model,
      enabled: taskConfig.enabled,
    };
  }

  /**
   * Check if task should use native/rule-based implementation
   */
  shouldUseNative(task: AITask): boolean {
    if (this.config.ai.fallback.nativeOnlyMode) {
      return true;
    }

    const taskConfig = this.config.ai.taskModels[task];
    return !taskConfig.enabled;
  }

  /**
   * Get client for specific task
   */
  async getClient(task: AITask): Promise<AnthropicClient | OpenAIClient> {
    const modelConfig = this.getModelForTask(task);

    if (modelConfig.provider === 'anthropic') {
      return new AnthropicClient(
        this.config.ai.anthropic.apiKey,
        modelConfig.model
      );
    } else {
      return new OpenAIClient(
        this.config.ai.openai.apiKey,
        modelConfig.model
      );
    }
  }
}
```

---

## Enhanced Execution Tracing

### ExecutionStep Schema with AI Metadata

```typescript
// src/core/models/analysis-result.ts - Enhanced
export interface ExecutionStep {
  step: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // Total duration (ms)
  status: 'started' | 'completed' | 'failed';
  context?: Record<string, unknown>;

  // NEW: AI-specific fields
  aiMetadata?: {
    enabled: boolean;              // Was AI used?
    task: AITask;                  // Which AI task?
    provider: 'anthropic' | 'openai' | 'native';
    model?: string;                // Model name
    inputTokens?: number;          // Tokens sent
    outputTokens?: number;         // Tokens received
    cacheHit?: boolean;            // Cached response?
    latencyMs?: number;            // AI API latency
    costCents?: number;            // Estimated cost
    fallbackUsed?: boolean;        // Did we fallback?
    error?: {
      code: string;
      message: string;
      retryAttempt?: number;
    };
  };
}
```

### Example Enhanced Trace

```json
{
  "step": "analyzer_SemanticAI_started",
  "startedAt": "2024-03-02T10:30:00.000Z",
  "completedAt": "2024-03-02T10:30:01.234Z",
  "duration": 1234,
  "status": "completed",
  "aiMetadata": {
    "enabled": true,
    "task": "emailSemanticAnalysis",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "inputTokens": 456,
    "outputTokens": 123,
    "latencyMs": 1150,
    "costCents": 0.008,
    "cacheHit": false
  }
}
```

---

## Cost Tracking Service

```typescript
// New: src/core/services/ai/cost-tracker.service.ts
export interface CostRecord {
  timestamp: Date;
  analysisId: string;
  task: AITask;
  provider: 'anthropic' | 'openai';
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  latencyMs: number;
  cacheHit: boolean;
  error?: string;
}

export class CostTrackerService {
  private records: CostRecord[] = [];
  private monthlyBudgetCents: number;
  private alertThresholdPercent: number;

  constructor(private config: AppConfig) {
    this.monthlyBudgetCents = config.ai.costLimits.monthlyBudgetDollars * 100;
    this.alertThresholdPercent = config.ai.costLimits.alertThresholdPercent;
  }

  /**
   * Record AI operation cost
   */
  recordCost(record: CostRecord): void {
    this.records.push(record);

    // Check if over budget
    const monthlyTotal = this.getMonthlyTotal();
    if (monthlyTotal >= this.monthlyBudgetCents) {
      logger.error({
        msg: 'AI monthly budget exceeded',
        monthlyBudget: this.monthlyBudgetCents / 100,
        currentSpend: monthlyTotal / 100,
      });
      this.sendBudgetAlert(monthlyTotal);
    }

    // Check if approaching budget
    const usagePercent = (monthlyTotal / this.monthlyBudgetCents) * 100;
    if (usagePercent >= this.alertThresholdPercent && usagePercent < 100) {
      logger.warn({
        msg: 'AI budget threshold reached',
        threshold: this.alertThresholdPercent,
        currentUsage: usagePercent,
      });
    }
  }

  /**
   * Get monthly total spend
   */
  getMonthlyTotal(): number {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.records
      .filter((r) => r.timestamp >= monthStart)
      .reduce((sum, r) => sum + r.costCents, 0);
  }

  /**
   * Get cost breakdown by task
   */
  getCostBreakdown(startDate: Date, endDate: Date): Record<AITask, number> {
    const breakdown: Record<string, number> = {};

    this.records
      .filter((r) => r.timestamp >= startDate && r.timestamp <= endDate)
      .forEach((r) => {
        breakdown[r.task] = (breakdown[r.task] || 0) + r.costCents;
      });

    return breakdown as Record<AITask, number>;
  }

  /**
   * Get analytics report
   */
  getAnalyticsReport(): {
    totalCost: number;
    totalCalls: number;
    averageCost: number;
    byTask: Record<AITask, { calls: number; cost: number; avgLatency: number }>;
    byModel: Record<string, { calls: number; cost: number }>;
    errorRate: number;
    cacheHitRate: number;
  } {
    const totalCost = this.records.reduce((sum, r) => sum + r.costCents, 0);
    const totalCalls = this.records.length;
    const errorCount = this.records.filter((r) => r.error).length;
    const cacheHits = this.records.filter((r) => r.cacheHit).length;

    // Group by task
    const byTask: Record<string, any> = {};
    this.records.forEach((r) => {
      if (!byTask[r.task]) {
        byTask[r.task] = { calls: 0, cost: 0, latencies: [] };
      }
      byTask[r.task].calls++;
      byTask[r.task].cost += r.costCents;
      byTask[r.task].latencies.push(r.latencyMs);
    });

    // Calculate averages
    Object.keys(byTask).forEach((task) => {
      const latencies = byTask[task].latencies;
      byTask[task].avgLatency =
        latencies.reduce((sum: number, l: number) => sum + l, 0) / latencies.length;
      delete byTask[task].latencies;
    });

    // Group by model
    const byModel: Record<string, any> = {};
    this.records.forEach((r) => {
      if (!byModel[r.model]) {
        byModel[r.model] = { calls: 0, cost: 0 };
      }
      byModel[r.model].calls++;
      byModel[r.model].cost += r.costCents;
    });

    return {
      totalCost: totalCost / 100, // Convert to dollars
      totalCalls,
      averageCost: totalCost / totalCalls / 100,
      byTask: byTask as any,
      byModel: byModel as any,
      errorRate: errorCount / totalCalls,
      cacheHitRate: cacheHits / totalCalls,
    };
  }

  /**
   * Export cost records for analysis
   */
  exportToCSV(startDate: Date, endDate: Date): string {
    const filtered = this.records.filter(
      (r) => r.timestamp >= startDate && r.timestamp <= endDate
    );

    const headers = [
      'Timestamp',
      'Analysis ID',
      'Task',
      'Provider',
      'Model',
      'Input Tokens',
      'Output Tokens',
      'Cost (cents)',
      'Latency (ms)',
      'Cache Hit',
      'Error',
    ];

    const rows = filtered.map((r) => [
      r.timestamp.toISOString(),
      r.analysisId,
      r.task,
      r.provider,
      r.model,
      r.inputTokens,
      r.outputTokens,
      r.costCents,
      r.latencyMs,
      r.cacheHit,
      r.error || '',
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }
}
```

---

## Cost Analytics CLI

```bash
# View current month AI costs
npm run ai-costs

# Output:
╔═══════════════════════════════════════════════════════════╗
║             PhishLogic AI Cost Analytics                  ║
╠═══════════════════════════════════════════════════════════╣
║ Current Month: March 2024                                 ║
║ Total Spend: $12.34 / $100.00 (12.3%)                    ║
║ Total API Calls: 1,247                                    ║
║ Average Cost per Call: $0.0099                           ║
╠═══════════════════════════════════════════════════════════╣
║ Cost Breakdown by Task:                                   ║
║  • emailSemanticAnalysis:    $2.45  (247 calls, 1.2s avg)║
║  • urlSemanticAnalysis:      $3.21  (189 calls, 1.5s avg)║
║  • visualPhishingDetection:  $5.67  (82 calls, 2.8s avg) ║
║  • verdictReasoning:         $1.01  (729 calls, 0.3s avg)║
╠═══════════════════════════════════════════════════════════╣
║ Cost Breakdown by Model:                                  ║
║  • claude-3-5-sonnet:        $7.89  (456 calls)          ║
║  • claude-3-5-haiku:         $1.12  (729 calls)          ║
║  • gpt-4o-mini:              $3.33  (247 calls)          ║
╠═══════════════════════════════════════════════════════════╣
║ Performance Metrics:                                       ║
║  • Error Rate: 2.1% (26 failures)                        ║
║  • Cache Hit Rate: 15.3% (191 cached responses)          ║
║  • Average Latency: 1.4s                                  ║
╠═══════════════════════════════════════════════════════════╣
║ Budget Projection:                                         ║
║  • On track for: $38.45 this month                       ║
║  • Alert threshold: $80.00 (80%)                         ║
║  • Status: ✅ Within budget                              ║
╚═══════════════════════════════════════════════════════════╝

# Export detailed CSV
npm run ai-costs export --start=2024-03-01 --end=2024-03-31 --output=costs.csv

# View specific task costs
npm run ai-costs --task=visualPhishingDetection

# View error analysis
npm run ai-costs errors
```

---

## Hybrid Executor Service

```typescript
// New: src/core/services/ai/hybrid-executor.service.ts
export class HybridExecutorService {
  constructor(
    private modelSelector: ModelSelectorService,
    private costTracker: CostTrackerService,
    private config: AppConfig
  ) {}

  /**
   * Execute task with AI or fallback to native
   */
  async execute<T>(
    task: AITask,
    nativeImpl: () => Promise<T>,
    aiImpl: (client: AIClient) => Promise<T>,
    context: { analysisId: string }
  ): Promise<{ result: T; usedAI: boolean; metrics?: AIMetrics }> {
    // Check if native-only mode
    if (this.modelSelector.shouldUseNative(task)) {
      logger.debug({ msg: 'Using native implementation', task });
      const result = await nativeImpl();
      return { result, usedAI: false };
    }

    // Try AI with fallback
    try {
      const startTime = Date.now();
      const client = await this.modelSelector.getClient(task);

      // Execute AI with timeout
      const aiResult = await this.executeWithTimeout(
        () => aiImpl(client),
        this.config.ai.fallback.timeoutMs
      );

      const latencyMs = Date.now() - startTime;

      // Calculate cost and track
      const metrics: AIMetrics = {
        inputTokens: aiResult.usage.input_tokens,
        outputTokens: aiResult.usage.output_tokens,
        latencyMs,
        costCents: this.calculateCost(task, aiResult.usage),
      };

      this.costTracker.recordCost({
        timestamp: new Date(),
        analysisId: context.analysisId,
        task,
        provider: client.provider,
        model: client.model,
        ...metrics,
        cacheHit: false,
        error: undefined,
      });

      // Check cost limit
      if (metrics.costCents > this.config.ai.costLimits.maxCostPerAnalysisCents) {
        logger.warn({
          msg: 'AI cost exceeded per-analysis limit',
          task,
          cost: metrics.costCents,
          limit: this.config.ai.costLimits.maxCostPerAnalysisCents,
        });
      }

      return { result: aiResult.content, usedAI: true, metrics };
    } catch (error) {
      logger.error({
        msg: 'AI execution failed',
        task,
        error: error instanceof Error ? error.message : String(error),
      });

      // Record error
      this.costTracker.recordCost({
        timestamp: new Date(),
        analysisId: context.analysisId,
        task,
        provider: 'unknown',
        model: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        latencyMs: 0,
        cacheHit: false,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to native if enabled
      if (this.config.ai.fallback.useNativeOnAIFailure) {
        logger.info({ msg: 'Falling back to native implementation', task });
        const result = await nativeImpl();
        return { result, usedAI: false };
      }

      throw error;
    }
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('AI timeout')), timeoutMs)
      ),
    ]);
  }

  private calculateCost(task: AITask, usage: { input_tokens: number; output_tokens: number }): number {
    // Pricing per million tokens (as of 2024)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
      'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
    };

    const model = this.modelSelector.getModelForTask(task).model;
    const prices = pricing[model] || { input: 3, output: 15 };

    const inputCost = (usage.input_tokens / 1_000_000) * prices.input;
    const outputCost = (usage.output_tokens / 1_000_000) * prices.output;

    return (inputCost + outputCost) * 100; // Convert to cents
  }
}
```

---

## Developer Tools Cost Analysis

### Debug Assistant

**Use Case**: Investigate why PhishLogic gave a specific verdict

**Cost Breakdown** (Using Claude Sonnet):

| Operation | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| Initial explanation | 2,800 | 600 | $0.0174 |
| Follow-up 1 | 1,100 | 300 | $0.0078 |
| Follow-up 2 | 1,100 | 300 | $0.0078 |
| Follow-up 3 | 1,100 | 300 | $0.0078 |
| **Total per session** | **6,100** | **1,500** | **$0.0408** |

**Monthly Estimate** (20 debug sessions): **$0.80/month**

**Alternative with Claude Haiku**: **$0.12/month** (7x cheaper)

### Code Generator

**Use Case**: Generate new analyzer or adapter from prompt

**Cost Breakdown** (Using Claude Sonnet):

| Operation | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| Pattern analysis | 3,600 | 800 | $0.0228 |
| Adapter code | 1,500 | 600 | $0.0135 |
| Controller code | 1,500 | 600 | $0.0135 |
| Routes update | 1,500 | 400 | $0.0105 |
| Config update | 1,500 | 300 | $0.009 |
| Test generation | 1,800 | 800 | $0.0174 |
| **Total per integration** | **11,400** | **3,500** | **$0.0867** |

**Monthly Estimate** (5 integrations): **$0.44/month**

### Combined Tools Cost

| Tool | Usage/Month | Cost/Month | Annual Cost |
|------|-------------|------------|-------------|
| Debug Assistant (Sonnet) | 20 sessions | $0.80 | $9.60 |
| Debug Assistant (Haiku) | 20 sessions | $0.12 | $1.44 |
| Code Generator (Sonnet) | 5 integrations | $0.44 | $5.28 |
| **Total (Sonnet)** | | **$1.24** | **$14.88** |
| **Total (Haiku for debug)** | | **$0.56** | **$6.72** |

**Conclusion**: Developer tools are extremely cheap (<$15/year)

---

## Configuration Hierarchy

```
Global Default → Task-Specific Override → Runtime Fallback

Example:
- Default: claude-3-5-sonnet (general purpose)
- Email analysis: gpt-4o-mini (fast, cheap)
- Visual analysis: claude-3-5-sonnet (vision required)
- Debug: claude-3-5-sonnet (reasoning quality)
- On error: Fallback to native (rule-based)
```

---

## New Files to Create

```
src/core/services/ai/
├── model-selector.service.ts       # Per-task model selection
├── cost-tracker.service.ts         # Cost tracking and analytics
├── hybrid-executor.service.ts      # AI with native fallback
└── cost-analytics-cli.ts           # CLI tool for cost reports

src/infrastructure/database/
└── cost-records.repository.ts      # Persist cost records

scripts/
└── ai-costs.ts                     # CLI entry point
```

---

## Success Criteria

**Cost Tracking**:
✅ Real-time budget monitoring
✅ Per-task cost breakdown
✅ Monthly projections and alerts
✅ CSV export for analysis

**Model Selection**:
✅ Different models per task
✅ Cost optimization
✅ Configuration via env vars or Admin UI

**Hybrid Execution**:
✅ Graceful degradation on AI failures
✅ Timeout handling
✅ Native-only mode for compliance

**Developer Tools**:
✅ Debug Assistant functional
✅ Code Generator works
✅ Costs are tracked and negligible

---

See also:
- [AI Enhancement Plan](./AI_ENHANCEMENT_PLAN.md)
- [Admin UI Plan](./ADMIN_UI_PLAN.md)
- [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md)
