# Error Handling & Async Patterns

## Error Handling

### Custom Error Classes

Extend `Error` for domain-specific errors with context:

```typescript
class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly analyzer: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

// Usage
throw new AnalysisError(
  'SPF check failed',
  'SpfAnalyzer',
  originalError
);
```

**Benefits**:
- Type-safe error handling
- Rich context for debugging
- Stack trace preservation

### Always Include Context

Errors should include relevant context data:

```typescript
// Good
class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    public readonly constraint: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

throw new ValidationError(
  'Invalid email format',
  'from',
  input.from,
  'email'
);
```

### Never Swallow Errors

Always log or re-throw errors:

❌ **Bad**:
```typescript
try {
  await analyzer.analyze(input);
} catch (error) {
  // Silently ignored - bad!
}
```

✅ **Good**:
```typescript
try {
  await analyzer.analyze(input);
} catch (error) {
  logger.error({
    msg: 'Analyzer failed',
    analyzer: analyzer.getName(),
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  throw error; // Re-throw if can't recover
}
```

### Result Pattern for Expected Failures

For expected failures, consider `Result<T, E>` pattern:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

async function validateUrl(url: string): Promise<Result<URL, ValidationError>> {
  try {
    const parsed = new URL(url);
    return { ok: true, value: parsed };
  } catch (error) {
    return {
      ok: false,
      error: new ValidationError('Invalid URL format', url),
    };
  }
}

// Usage
const result = await validateUrl(input.url);
if (!result.ok) {
  logger.warn({ msg: 'URL validation failed', error: result.error });
  return [];
}
const url = result.value;
```

## Async Patterns

### Always Use Async/Await

Avoid callbacks and raw promises:

❌ **Bad**:
```typescript
function analyzeEmail(input: EmailInput): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    engine.analyze(input)
      .then(result => resolve(result))
      .catch(error => reject(error));
  });
}
```

✅ **Good**:
```typescript
async function analyzeEmail(input: EmailInput): Promise<AnalysisResult> {
  try {
    const result = await engine.analyze(input);
    return result;
  } catch (error) {
    logger.error({ msg: 'Analysis failed', error });
    throw error;
  }
}
```

### Handle Promise Rejections

Every async operation should be wrapped in try/catch:

```typescript
async function analyzeWithTimeout(
  input: NormalizedInput,
  timeout: number
): Promise<AnalysisResult> {
  try {
    const result = await Promise.race([
      engine.analyze(input),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);
    return result as AnalysisResult;
  } catch (error) {
    logger.error({
      msg: 'Analysis failed or timed out',
      timeout,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
```

### Use Promise.allSettled() for Parallel Operations

For operations that can fail independently:

❌ **Bad** (Promise.all):
```typescript
// One failure stops all
const results = await Promise.all([
  analyzer1.analyze(input),
  analyzer2.analyze(input),
  analyzer3.analyze(input),
]);
```

✅ **Good** (Promise.allSettled):
```typescript
// All complete, handle failures individually
const results = await Promise.allSettled([
  analyzer1.analyze(input),
  analyzer2.analyze(input),
  analyzer3.analyze(input),
]);

const signals = results
  .filter((r) => r.status === 'fulfilled')
  .flatMap((r) => r.value);

// Log failures
results
  .filter((r) => r.status === 'rejected')
  .forEach((r, index) => {
    logger.error({
      msg: 'Analyzer failed',
      analyzer: analyzers[index]?.getName(),
      error: r.reason,
    });
  });
```

### Timeout All External Operations

Never trust external systems to respond:

```typescript
async function fetchWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  operation: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`${operation} timed out after ${timeout}ms`)),
      timeout
    )
  );

  return Promise.race([promise, timeoutPromise]);
}

// Usage
const result = await fetchWithTimeout(
  fetch('https://api.example.com'),
  5000,
  'API fetch'
);
```

### Graceful Degradation

If an analyzer times out, continue with others:

```typescript
async function runAnalyzers(
  input: NormalizedInput,
  analyzers: IAnalyzer[]
): Promise<AnalysisSignal[]> {
  const results = await Promise.allSettled(
    analyzers.map(async (analyzer) => {
      try {
        return await fetchWithTimeout(
          analyzer.analyze(input),
          analyzer.getTimeout(),
          analyzer.getName()
        );
      } catch (error) {
        logger.warn({
          msg: 'Analyzer failed, continuing with others',
          analyzer: analyzer.getName(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return [];
      }
    })
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);
}
```

## Best Practices

### Error Boundaries

Implement error boundaries at different layers:

```typescript
// Controller layer - catch and return HTTP errors
async function analyzeUrlController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const result = await analyzeUrlService(request.body);
    reply.send(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      reply.code(400).send({ error: error.message });
    } else {
      logger.error({ msg: 'Unexpected error', error });
      reply.code(500).send({ error: 'Internal server error' });
    }
  }
}

// Service layer - catch and transform errors
async function analyzeUrlService(input: unknown): Promise<AnalysisResult> {
  try {
    const validated = validateInput(input);
    return await engine.analyze(validated);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // Let controller handle
    }
    throw new AnalysisError('Analysis failed', 'AnalysisService', error);
  }
}
```

### Resource Cleanup

Always clean up resources with try/finally:

```typescript
async function analyzeDynamic(url: string): Promise<AnalysisSignal[]> {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { timeout: 30000 });
    const signals = await detectForms(page);
    return signals;
  } catch (error) {
    logger.error({ msg: 'Dynamic analysis failed', url, error });
    throw error;
  } finally {
    // Always cleanup, even if error occurred
    await page.close();
    await context.close();
    await browser.close();
  }
}
```

### Avoid Swallowing Async Errors

Don't create fire-and-forget promises:

❌ **Bad**:
```typescript
// Error silently ignored
doSomethingAsync(); // Unhandled promise rejection
```

✅ **Good**:
```typescript
// Explicitly handle
doSomethingAsync().catch((error) => {
  logger.error({ msg: 'Background task failed', error });
});

// Or await it
await doSomethingAsync();
```

## Error Logging

**For complete logging standards, see [Logging Standards](LOGGING.md)**

When logging errors, always include context:
- Operation or analyzer name
- Error message and stack trace (development only for stack traces)
- Input type and ID (never the full content)
- Relevant context (attempt number, timestamp, etc.)

Never log sensitive data like full email content, URLs with tokens, or credentials.

---

**See Also**:
- [Logging Standards](LOGGING.md)
- [Coding Standards](CODING_STANDARDS.md)
- [Security Guidelines](SECURITY.md)
- [Testing Guide](TESTING_GUIDE.md)
