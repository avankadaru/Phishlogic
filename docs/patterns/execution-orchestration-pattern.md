# Execution Orchestration Pattern

## Overview

**Abstract, Task-Independent, Extensible orchestration** for Native/Hybrid/AI execution modes.

Built on **Strategy Pattern** with **Decorator support** for timing and tracking.

## Design Principles

### 1. **Abstract** ✅
- Strategy interface, not concrete implementations
- Depend on abstractions, not concretions
- Easy to mock/test

### 2. **Task Independent** ✅
- Works with any analyzer/task
- No hardcoded logic for specific analyzers
- Composable with any AI service

### 3. **Simple to Extend** ✅
- Add new strategies without modifying existing code
- Add new decorators without changing strategies
- Open/Closed principle (SOLID)

### 4. **Decorated** ✅
- Timing via decorator
- Logging via decorator
- Stack decorators for combined behavior

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ExecutionStrategy                          │
│                     (Interface)                              │
│  + execute(context): Promise<ExecutionResult>               │
│  + getName(): string                                         │
│  + canExecute(context): boolean                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Native     │ │   Hybrid     │ │     AI       │
│  Strategy    │ │  Strategy    │ │  Strategy    │
└──────────────┘ └──────────────┘ └──────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   Decorators    │
              │  (Timing, Log)  │
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │     Factory     │
              │  Creates + Wraps │
              └─────────────────┘
```

## Usage

### Basic Usage

```typescript
import { ExecutionStrategyFactory } from './core/execution/execution-strategy.js';
import { NativeExecutionStrategy } from './core/execution/strategies/native.strategy.js';
import { HybridExecutionStrategy } from './core/execution/strategies/hybrid.strategy.js';
import { AIExecutionStrategy } from './core/execution/strategies/ai.strategy.js';

// 1. Create factory
const factory = new ExecutionStrategyFactory();

// 2. Register strategies
factory.register('native', new NativeExecutionStrategy());
factory.register('hybrid', new HybridExecutionStrategy(aiService));
factory.register('ai', new AIExecutionStrategy(aiService));

// 3. Get strategy (automatically wrapped with timing decorator)
const strategy = factory.getStrategy('hybrid', {
  enableTiming: true,
  enableLogging: true,
  logger: getLogger(),
});

// 4. Execute
const context = {
  analysisId: 'abc-123',
  input: normalizedInput,
  config: {
    executionMode: 'hybrid',
    aiProvider: 'anthropic',
    aiModel: 'claude-3-5-sonnet',
    aiTimeout: 30000,
    fallbackToNative: true,
  },
  integrationName: 'gmail',
  executionSteps: [],
};

const result = await strategy.execute(context);

// Result contains:
// - result.result: AnalysisResult
// - result.aiMetadata: AIMetadata (if AI was used)
// - result.actualMode: 'native' | 'hybrid' | 'ai'
```

### In Analysis Engine

```typescript
async analyze(input: NormalizedInput): Promise<AnalysisResult> {
  const analysisId = input.analysisId || randomUUID();
  const persistenceService = getAnalysisPersistenceService();

  // Initialize tracking
  persistenceService.initializeTracking(
    analysisId,
    input,
    executionMode,
    integrationName,
    timingData
  );

  let executionResult: ExecutionResult;

  try {
    // 1. Build execution context
    const context: ExecutionContext = {
      analysisId,
      input,
      config: await this.loadIntegrationConfig(integrationName),
      integrationName,
      executionSteps: [],
    };

    // 2. Get strategy from factory (with decorators)
    const strategy = this.strategyFactory.getStrategy(context.config.executionMode, {
      enableTiming: true,
      enableLogging: true,
      logger: getLogger(),
    });

    // 3. Execute (timing and logging automatic via decorators)
    executionResult = await strategy.execute(context);

    // 4. Update tracking with results
    persistenceService.updateResult(analysisId, executionResult.result);

    if (executionResult.aiMetadata) {
      persistenceService.updateAIMetadata(analysisId, executionResult.aiMetadata);
    }
  } catch (error) {
    // Capture error
    persistenceService.updateErrorDetails(analysisId, {
      message: 'Analysis failed',
      stackTrace: error.stack,
      context: { file: 'analysis.engine.ts' },
    });

    throw error;
  } finally {
    // Always flush
    await persistenceService.flushToDatabase(analysisId);
  }

  return {
    ...executionResult.result,
    analysisId,
  };
}
```

## Extending with New Strategies

### Example: Add "FastNative" Strategy (Cached Results)

```typescript
import { BaseExecutionStrategy, ExecutionContext, ExecutionResult } from '../execution-strategy.js';

export class FastNativeStrategy extends BaseExecutionStrategy {
  private cache = new Map<string, ExecutionResult>();

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.addExecutionStep(context, 'fast_native_cache_check', 'started');

    // Check cache
    const cacheKey = this.generateCacheKey(context.input);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      this.addExecutionStep(context, 'fast_native_cache_hit', 'completed');
      return cached;
    }

    // Cache miss - run normal native analysis
    this.addExecutionStep(context, 'fast_native_cache_miss', 'completed');
    const nativeStrategy = new NativeExecutionStrategy();
    const result = await nativeStrategy.execute(context);

    // Store in cache
    this.cache.set(cacheKey, result);

    return result;
  }

  getName(): string {
    return 'FastNativeStrategy';
  }

  private generateCacheKey(input: any): string {
    return JSON.stringify(input.data);
  }
}

// Register with factory
factory.register('fast-native', new FastNativeStrategy());
```

**No changes needed in:**
- Analysis Engine
- Persistence Service
- Decorators
- Other strategies

### Example: Add "MultiAI" Strategy (Try Multiple AI Providers)

```typescript
export class MultiAIStrategy extends BaseExecutionStrategy {
  constructor(private aiServices: AIService[]) {
    super();
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.addExecutionStep(context, 'multi_ai_execution_started', 'started');

    // Try each AI provider in order
    for (const [index, aiService] of this.aiServices.entries()) {
      try {
        this.addExecutionStep(context, `ai_provider_${index}_attempt`, 'started');

        const result = await aiService.executeWithAI(context.input, {
          provider: context.config.aiProvider,
          model: context.config.aiModel,
          timeout: 10000, // Shorter timeout for multi-try
        });

        this.addExecutionStep(context, `ai_provider_${index}_success`, 'completed');

        // Success - use this result
        const verdict = await this.calculateVerdict(result.signals);

        return {
          result: verdict,
          aiMetadata: result.metadata,
          actualMode: 'ai',
        };
      } catch (error) {
        this.addExecutionStep(context, `ai_provider_${index}_failed`, 'failed', {
          error: error.message,
        });

        // Try next provider
        continue;
      }
    }

    // All providers failed - throw
    throw new Error('All AI providers failed');
  }

  getName(): string {
    return 'MultiAIStrategy';
  }
}

// Register with factory
factory.register('multi-ai', new MultiAIStrategy([anthropicService, openaiService, googleService]));
```

## Extending with New Decorators

### Example: Add "Retry" Decorator

```typescript
export class RetryExecutionStrategy implements ExecutionStrategy {
  constructor(
    private strategy: ExecutionStrategy,
    private maxRetries: number = 3,
    private backoffMs: number = 1000
  ) {}

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        context.executionSteps.push({
          step: `retry_attempt_${attempt}`,
          startedAt: new Date(),
          status: 'started',
        });

        const result = await this.strategy.execute(context);

        context.executionSteps.push({
          step: `retry_attempt_${attempt}_success`,
          completedAt: new Date(),
          status: 'completed',
        });

        return result;
      } catch (error) {
        lastError = error as Error;

        context.executionSteps.push({
          step: `retry_attempt_${attempt}_failed`,
          completedAt: new Date(),
          status: 'failed',
          error: lastError.message,
        });

        if (attempt < this.maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, this.backoffMs * Math.pow(2, attempt - 1))
          );
        }
      }
    }

    throw lastError!;
  }

  getName(): string {
    return `Retry(${this.strategy.getName()})`;
  }
}

// Usage: Stack decorators
let strategy: ExecutionStrategy = new AIExecutionStrategy(aiService);
strategy = new RetryExecutionStrategy(strategy, 3); // Retry up to 3 times
strategy = new TimedExecutionStrategy(strategy); // Add timing
strategy = new LoggedExecutionStrategy(strategy, logger); // Add logging
```

### Example: Add "CircuitBreaker" Decorator

```typescript
export class CircuitBreakerStrategy implements ExecutionStrategy {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private strategy: ExecutionStrategy,
    private failureThreshold: number = 5,
    private resetTimeoutMs: number = 60000
  ) {}

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    // Check circuit state
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        // Try half-open
        this.state = 'half-open';
      } else {
        // Circuit still open - fail fast
        throw new Error('Circuit breaker is open - too many recent failures');
      }
    }

    try {
      const result = await this.strategy.execute(context);

      // Success - reset circuit
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      // Failure - increment counter
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        // Trip circuit breaker
        this.state = 'open';
      }

      throw error;
    }
  }

  getName(): string {
    return `CircuitBreaker(${this.strategy.getName()})`;
  }
}
```

## Benefits

### ✅ Abstract
```typescript
// Depend on interface, not concrete class
function analyze(strategy: ExecutionStrategy, context: ExecutionContext) {
  return strategy.execute(context);
}

// Easy to mock for testing
const mockStrategy: ExecutionStrategy = {
  execute: jest.fn().mockResolvedValue({ result: mockResult }),
  getName: () => 'MockStrategy',
};
```

### ✅ Task Independent
```typescript
// Same strategy works for ANY analyzer set
factory.register('native', new NativeExecutionStrategy());

// Works with 4 analyzers
const result1 = await strategy.execute(contextWithFourAnalyzers);

// Works with 10 analyzers (no changes needed)
const result2 = await strategy.execute(contextWithTenAnalyzers);

// Works with different AI providers (no changes needed)
const result3 = await strategy.execute(contextWithAnthropicAI);
const result4 = await strategy.execute(contextWithOpenAI);
```

### ✅ Simple to Extend
```typescript
// Add new strategy: 0 lines changed in existing code
class NewStrategy extends BaseExecutionStrategy {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    // Your logic here
  }
  getName() { return 'NewStrategy'; }
}

factory.register('new-mode', new NewStrategy());

// Add new decorator: 0 lines changed in existing code
class NewDecorator implements ExecutionStrategy {
  constructor(private strategy: ExecutionStrategy) {}
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    // Pre-processing
    const result = await this.strategy.execute(context);
    // Post-processing
    return result;
  }
  getName() { return `NewDecorator(${this.strategy.getName()})`; }
}
```

### ✅ Decorated
```typescript
// Stack multiple decorators
let strategy: ExecutionStrategy = new NativeExecutionStrategy();
strategy = new RetryExecutionStrategy(strategy, 3);
strategy = new CircuitBreakerStrategy(strategy, 5, 60000);
strategy = new TimedExecutionStrategy(strategy);
strategy = new LoggedExecutionStrategy(strategy, logger);

// Order of execution:
// 1. Logged (outermost)
// 2. Timed
// 3. CircuitBreaker
// 4. Retry
// 5. Native (innermost)
```

## Testing

### Test Strategy Independently

```typescript
describe('NativeExecutionStrategy', () => {
  it('should execute all analyzers in parallel', async () => {
    const strategy = new NativeExecutionStrategy();
    const context = createTestContext();

    const result = await strategy.execute(context);

    expect(result.actualMode).toBe('native');
    expect(result.result.analyzersRun).toHaveLength(4);
  });
});
```

### Test with Mocked Dependencies

```typescript
describe('HybridExecutionStrategy', () => {
  it('should fall back to native when AI fails', async () => {
    const mockAIService = {
      executeWithAI: jest.fn().mockRejectedValue(new Error('AI timeout')),
    };

    const strategy = new HybridExecutionStrategy(mockAIService);
    const context = createTestContext({ fallbackToNative: true });

    const result = await strategy.execute(context);

    expect(result.actualMode).toBe('native'); // Fell back
    expect(context.executionSteps).toContainEqual(
      expect.objectContaining({ step: 'fallback_to_native_started' })
    );
  });
});
```

### Test Decorators

```typescript
describe('TimedExecutionStrategy', () => {
  it('should add timing steps', async () => {
    const mockStrategy = { execute: jest.fn(), getName: () => 'Mock' };
    const timedStrategy = new TimedExecutionStrategy(mockStrategy);
    const context = createTestContext();

    await timedStrategy.execute(context);

    expect(context.executionSteps).toContainEqual(
      expect.objectContaining({ step: 'Mock_execution_started' })
    );
    expect(context.executionSteps).toContainEqual(
      expect.objectContaining({
        step: 'Mock_execution_completed',
        duration: expect.any(Number),
      })
    );
  });
});
```

## Comparison: Before vs After

### Before (Tightly Coupled)

```typescript
async analyze(input: NormalizedInput): Promise<AnalysisResult> {
  const mode = config.executionMode;

  if (mode === 'native') {
    // Hardcoded native logic
    const analyzers = [new SPFAnalyzer(), new DKIMAnalyzer()];
    const signals = [];
    for (const analyzer of analyzers) {
      signals.push(...await analyzer.analyze(input));
    }
    return calculateVerdict(signals);

  } else if (mode === 'hybrid') {
    // Hardcoded hybrid logic
    try {
      const aiResult = await callAI(input);
      return aiResult;
    } catch (error) {
      // Duplicate native logic!
      const analyzers = [new SPFAnalyzer(), new DKIMAnalyzer()];
      const signals = [];
      for (const analyzer of analyzers) {
        signals.push(...await analyzer.analyze(input));
      }
      return calculateVerdict(signals);
    }

  } else if (mode === 'ai') {
    // Hardcoded AI logic
    const aiResult = await callAI(input);
    return aiResult;
  }
}
```

**Problems:**
- ❌ Tightly coupled to specific analyzers
- ❌ Duplicate code (native logic repeated)
- ❌ Hard to test
- ❌ Hard to extend (need to modify existing code)
- ❌ No timing/tracking separation

### After (Strategy Pattern)

```typescript
async analyze(input: NormalizedInput): Promise<AnalysisResult> {
  // 1. Build context
  const context = { analysisId, input, config, executionSteps: [] };

  // 2. Get strategy (with decorators)
  const strategy = factory.getStrategy(config.executionMode, {
    enableTiming: true,
    enableLogging: true,
  });

  // 3. Execute
  const result = await strategy.execute(context);

  return result.result;
}
```

**Benefits:**
- ✅ Abstract (strategy interface)
- ✅ Task independent (works with any analyzers)
- ✅ No duplicate code
- ✅ Easy to test (mock strategies)
- ✅ Easy to extend (add new strategies)
- ✅ Timing/logging via decorators
