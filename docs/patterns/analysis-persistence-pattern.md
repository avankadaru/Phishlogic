# Analysis Persistence Pattern

## Problem
Original design had persistence at the END of analysis, which meant:
- ❌ If exception occurs, analysis is never saved
- ❌ Failed analyses are lost (no debugging data)
- ❌ No visibility into what went wrong

## Solution
**In-Memory Tracking + Finally Block Pattern**

Ensures EVERY analysis is saved, regardless of success or failure.

## Usage Pattern

```typescript
// In Analysis Engine
async analyze(input: NormalizedInput): Promise<AnalysisResult> {
  // 1. Generate analysis ID (UI-provided or fallback)
  const analysisId = input.analysisId || randomUUID();
  const backendStartTime = Date.now();
  const networkLatency = input.uiTimestamp
    ? backendStartTime - input.uiTimestamp
    : null;

  const timingData = {
    analysisId,
    uiTimestamp: input.uiTimestamp,
    backendStartTime,
    networkLatency,
  };

  // 2. Determine integration and execution mode
  const integrationName = this.getIntegrationName(input);
  const config = await this.loadIntegrationConfig(integrationName);
  const executionMode = config?.executionMode || 'native';

  // 3. INITIALIZE TRACKING (before any exceptions can occur)
  const persistenceService = getAnalysisPersistenceService();
  persistenceService.initializeTracking(
    analysisId,
    input,
    executionMode,
    integrationName,
    timingData
  );

  // 4. Execute analysis with try-catch-finally
  let result: AnalysisResult;

  try {
    // Route to execution mode
    switch (executionMode) {
      case 'native':
        result = await this.runNativeMode(input, analysisId);
        break;

      case 'hybrid':
        const hybridResult = await this.runHybridMode(input, analysisId, config);
        result = hybridResult.result;

        // Update AI metadata if AI was used
        if (hybridResult.aiMetadata) {
          persistenceService.updateAIMetadata(analysisId, hybridResult.aiMetadata);
        }
        break;

      case 'ai':
        const aiResult = await this.runAIMode(input, analysisId, config);
        result = aiResult.result;

        // Update AI metadata
        persistenceService.updateAIMetadata(analysisId, aiResult.aiMetadata);
        break;
    }

    // Update result in tracking
    persistenceService.updateResult(analysisId, result);

  } catch (error) {
    // 5. Capture error details (will be saved in finally)
    const errorDetails: ErrorDetails = {
      message: 'Analysis failed. Please contact support.',
      stackTrace: error instanceof Error ? error.stack || '' : String(error),
      context: {
        file: 'analysis.engine.ts',
        function: 'analyze',
        line: this.extractLineNumber(error instanceof Error ? error.stack : undefined),
      },
    };

    persistenceService.updateErrorDetails(analysisId, errorDetails);

    // Create error result
    result = this.createErrorResult(analysisId, error);
    persistenceService.updateResult(analysisId, result);

    logger.error({
      analysisId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

  } finally {
    // 6. ALWAYS FLUSH TO DATABASE (success or failure)
    // This runs even if there was an exception
    await persistenceService.flushToDatabase(analysisId);
  }

  // 7. Return result with analysis ID
  return {
    ...result,
    analysisId,
  };
}
```

## Key Benefits

### ✅ Always Saved
- **Success**: Full analysis data saved
- **Partial Failure**: Saves whatever data was collected
- **Complete Failure**: Saves minimal error record
- **Finally Block**: Guarantees execution

### ✅ Progressive Updates
```typescript
// Can update metadata as analysis progresses
persistenceService.initializeTracking(...);      // Start
persistenceService.updateAIMetadata(...);        // After AI call
persistenceService.updateResult(...);            // After success
persistenceService.updateErrorDetails(...);      // On error
persistenceService.flushToDatabase(...);         // Always at end
```

### ✅ Lightweight In-Memory
- No immediate database writes during analysis
- Fast in-memory updates (Map structure)
- Single database write in finally block
- Auto-cleanup after successful save

### ✅ Exception Safe
```typescript
try {
  // Complex analysis logic that might fail
} catch (error) {
  // Capture error metadata
  persistenceService.updateErrorDetails(analysisId, errorDetails);
} finally {
  // ALWAYS saves - even if catch block throws!
  await persistenceService.flushToDatabase(analysisId);
}
```

## Comparison: Before vs After

### Before (Risky)
```typescript
async analyze(input: NormalizedInput): Promise<AnalysisResult> {
  try {
    result = await this.runAnalysis(...);
  } catch (error) {
    result = this.createErrorResult(...);
  }

  // ❌ PROBLEM: If exception occurs above, we never reach here
  await persistenceService.saveAnalysis(...);

  return result;
}
```

**Issues**:
- No save if catch block throws
- No save if runAnalysis throws unexpected error
- No save if createErrorResult fails
- Lost debugging data

### After (Safe)
```typescript
async analyze(input: NormalizedInput): Promise<AnalysisResult> {
  // Initialize tracking FIRST
  persistenceService.initializeTracking(...);

  try {
    result = await this.runAnalysis(...);
    persistenceService.updateResult(analysisId, result);
  } catch (error) {
    persistenceService.updateErrorDetails(analysisId, errorDetails);
    result = this.createErrorResult(...);
  } finally {
    // ✅ ALWAYS runs, even if exception occurred
    await persistenceService.flushToDatabase(analysisId);
  }

  return result;
}
```

**Benefits**:
- Saves on success
- Saves on failure
- Saves even if catch block throws
- Never loses data

## Error Scenarios Handled

### Scenario 1: Analysis Throws Exception
```typescript
try {
  result = await this.runNativeMode(...);  // ❌ Throws error
} catch (error) {
  persistenceService.updateErrorDetails(...);  // ✅ Captured
} finally {
  await persistenceService.flushToDatabase(...);  // ✅ Saved with error
}
```
**Result**: Saved with error details ✅

### Scenario 2: Catch Block Throws
```typescript
try {
  result = await this.runNativeMode(...);  // ❌ Throws error
} catch (error) {
  throw new Error('Unexpected');  // ❌ Throws again
} finally {
  await persistenceService.flushToDatabase(...);  // ✅ Still runs!
}
```
**Result**: Saved with partial data ✅

### Scenario 3: Network Failure Mid-Analysis
```typescript
try {
  const aiResult = await this.aiService.execute(...);  // ❌ Network timeout
} catch (error) {
  persistenceService.updateErrorDetails(...);
} finally {
  await persistenceService.flushToDatabase(...);  // ✅ Saved
}
```
**Result**: Saved with timeout error ✅

### Scenario 4: Database Down (Flush Fails)
```typescript
finally {
  try {
    await persistenceService.flushToDatabase(...);  // ❌ DB connection fails
  } catch (dbError) {
    // Logged but not thrown (in finally block)
    // Data remains in memory for potential retry
  }
}
```
**Result**: Logged error, data kept in memory for retry ⚠️

## Monitoring

```typescript
// Check for stale tracking data (should auto-cleanup)
const stats = persistenceService.getTrackingStats();
console.log(`Active: ${stats.activeCount}, Oldest: ${stats.oldestTimestamp}`);

// In production, alert if:
// - activeCount > 1000 (possible memory leak)
// - oldestTimestamp > 5 minutes ago (stuck analyses)
```

## Best Practices

1. **Initialize Early**: Call `initializeTracking()` BEFORE any code that can throw
2. **Update Progressively**: Update metadata as it becomes available
3. **Always Finally**: Use finally block for `flushToDatabase()`
4. **Don't Throw in Finally**: Persistence errors should be logged, not thrown
5. **Monitor Memory**: Track `getTrackingStats()` for memory leaks

## Testing

```typescript
describe('Analysis Persistence', () => {
  it('should save analysis even when execution fails', async () => {
    const service = getAnalysisPersistenceService();
    const analysisId = 'test-123';

    // Initialize
    service.initializeTracking(analysisId, input, 'native', 'gmail', timingData);

    try {
      throw new Error('Simulated failure');
    } catch (error) {
      service.updateErrorDetails(analysisId, {
        message: 'Failed',
        stackTrace: error.stack,
        context: {},
      });
    } finally {
      await service.flushToDatabase(analysisId);
    }

    // Verify saved to database
    const result = await query('SELECT * FROM analyses WHERE id = $1', [analysisId]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].error_details).toBeTruthy();
  });
});
```
