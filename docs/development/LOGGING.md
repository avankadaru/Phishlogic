# Logging Standards

## Philosophy

Logging is critical for production observability, debugging, and security auditing. PhishLogic uses structured JSON logging with Pino for performance and machine-readability.

**Key Principles**:
- **Structured Logging**: Use JSON format for machine parsing
- **Context Preservation**: Include request IDs and relevant context
- **Security First**: Never log sensitive data (PII, tokens, credentials)
- **Environment-Aware**: Verbose in development, concise in production

---

## Log Levels

Choose the appropriate log level for each message:

| Level | When to Use | Examples |
|-------|-------------|----------|
| **debug** | Verbose info for debugging (development only) | Variable values, detailed flow, internal state |
| **info** | General informational messages | Server startup, request received, analysis completed |
| **warn** | Warning conditions (degraded but functional) | Retries, fallbacks, deprecated features, high latency |
| **error** | Error conditions requiring attention | Failed operations, exceptions, unhandled cases |

**Production Default**: Set `LOG_LEVEL=info` in production to avoid noise.

---

## Structured Logging with Pino

### Configuration

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',

  // Redact sensitive fields automatically
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.body.rawEmail',
      '*.password',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    remove: true,
  },

  // Production formatting (JSON)
  ...(process.env.NODE_ENV === 'production' && {
    formatters: {
      level: (label) => ({ level: label }),
    },
  }),

  // Development formatting (pretty-printed)
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});
```

### Child Loggers for Context

Use child loggers to add persistent context:

```typescript
// Create child logger with request context
const requestLogger = logger.child({
  requestId: uuid(),
  userId: request.user?.id,
});

requestLogger.info('Processing analysis request');
// Output: { level: 'info', requestId: '...', userId: '...', msg: 'Processing analysis request' }
```

---

## What to Log

### Request Logging

Log all incoming API requests with relevant context:

```typescript
logger.info({
  msg: 'Analysis request received',
  type: input.type, // 'url' or 'email'
  analysisId: input.id,
  requestId: request.id,
  userAgent: request.headers['user-agent'],
});
```

### Performance Metrics

Log analysis duration and metadata:

```typescript
logger.info({
  msg: 'Analysis completed',
  analysisId: input.id,
  duration: metadata.duration, // milliseconds
  verdict: result.verdict, // 'Safe', 'Suspicious', 'Malicious'
  score: result.score, // 0-10
  analyzersRun: metadata.analyzersRun.length,
  signalsDetected: result.redFlags.length,
});
```

### Errors with Context

Always include context when logging errors:

```typescript
logger.error({
  msg: 'Analyzer failed',
  analyzer: 'SpfAnalyzer',
  error: error.message,
  stack: config.env === 'development' ? error.stack : undefined,
  input: {
    type: input.type,
    id: input.id,
  },
});
```

### Analyzer Execution

Log individual analyzer results:

```typescript
logger.debug({
  msg: 'Analyzer completed',
  analyzer: analyzer.getName(),
  duration: analyzerDuration,
  signalsFound: signals.length,
  signalTypes: signals.map(s => s.signalType),
});
```

### Whitelist Hits

Log when whitelist bypasses analysis:

```typescript
logger.info({
  msg: 'Whitelist match found',
  whitelistId: entry.id,
  matchType: entry.type, // 'email', 'domain', 'url'
  matchValue: sanitizeValue(entry.value),
  analysisSkipped: true,
});
```

---

## What NOT to Log (Security Critical)

### ❌ Never Log These

Logging sensitive data can expose PII, credentials, and security vulnerabilities:

| Never Log | Why | Alternative |
|-----------|-----|-------------|
| **Full email content** | Contains personal information, PII | Log from/to domains only |
| **Full URLs** | May contain tokens, API keys in query params | Sanitize: remove query params and fragments |
| **Passwords** | Obvious security risk | Never log, even in debug mode |
| **API keys / tokens** | Credentials exposure | Redact with Pino redaction |
| **OAuth tokens** | Access to user accounts | Redact completely |
| **Personal information** | GDPR/privacy violations | Anonymize or exclude |
| **Credit card numbers** | PCI compliance | Never collect or log |
| **Authentication headers** | Bearer tokens, API keys | Use Pino redaction |

### ✅ Safe to Log

- **Sanitized emails**: `sender@[example.com]` instead of `sender@example.com`
- **Sanitized URLs**: `https://example.com/path` without query params or fragments
- **Verdict and score**: Safe to log (e.g., "Malicious", score: 8)
- **Analysis metadata**: Duration, analyzers run, signal types
- **Performance metrics**: Request rate, memory usage, response times
- **Error messages**: Exception messages (not full stack traces in production)

### Sanitization Functions

Always sanitize sensitive data before logging:

```typescript
// Sanitize email addresses
function sanitizeEmail(email: string): string {
  try {
    const parts = email.split('@');
    if (parts.length === 2) {
      return `${parts[0]}@[${parts[1]}]`;
    }
    return '[invalid-email]';
  } catch {
    return '[invalid-email]';
  }
}

// Sanitize URLs (remove query params and fragments)
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = ''; // Remove query params
    parsed.hash = ''; // Remove fragment
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

// Example usage
logger.info({
  msg: 'Analyzing URL',
  url: sanitizeUrl(input.url), // https://example.com/path (no ?token=secret)
  from: sanitizeEmail(input.from), // sender@[example.com]
});
```

---

## Production Configuration

### Environment-Based Log Levels

```bash
# Development
LOG_LEVEL=debug

# Staging
LOG_LEVEL=info

# Production
LOG_LEVEL=info
```

### Redaction Paths

Configure Pino to automatically redact sensitive fields:

```typescript
redact: {
  paths: [
    // HTTP headers
    'req.headers.authorization',
    'req.headers["x-api-key"]',
    'req.headers.cookie',

    // Request body
    'req.body.rawEmail',
    'req.body.password',
    'req.body.token',

    // Response data
    'res.body.token',
    'res.body.accessToken',

    // Wildcards for nested fields
    '*.password',
    '*.token',
    '*.apiKey',
    '*.secret',
  ],
  remove: true, // Remove instead of replacing with [Redacted]
},
```

### Log Aggregation

Send logs to centralized logging service in production:

```typescript
// Send to Datadog
import { createStream } from 'pino-datadog';

const stream = createStream({
  apiKey: process.env.DATADOG_API_KEY,
  service: 'phishlogic',
  env: process.env.NODE_ENV,
  tags: ['team:security', 'app:phishlogic'],
});

export const logger = pino(stream);
```

**Alternatives**:
- **Loggly**: Use `pino-loggly` transport
- **CloudWatch**: Use `pino-cloudwatch` transport
- **Elasticsearch**: Use `pino-elasticsearch` transport
- **File-based**: Use `pino-roll` for log rotation

### Log Rotation

For file-based logging, implement rotation:

```bash
# Use pino-roll for automatic log rotation
npm install pino-roll

# Configure in package.json scripts
node src/index.js | pino-roll -f logs/phishlogic.log -s 10m -n 5
# Rotates logs every 10 minutes, keeps 5 files
```

---

## Code Examples

### Request Logging Middleware

```typescript
// src/api/server.ts
server.addHook('onRequest', async (request, reply) => {
  request.log.info({
    msg: 'Incoming request',
    method: request.method,
    url: request.url,
    requestId: request.id,
  });
});

server.addHook('onResponse', async (request, reply) => {
  request.log.info({
    msg: 'Request completed',
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime: reply.getResponseTime(),
  });
});
```

### Analyzer Logging Pattern

```typescript
// src/core/analyzers/static/spf-analyzer.ts
export class SpfAnalyzer extends BaseAnalyzer {
  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const startTime = Date.now();

    logger.debug({
      msg: 'SPF analysis started',
      analyzer: this.getName(),
      analysisId: input.id,
    });

    try {
      const signals = await this.checkSpf(input);

      logger.info({
        msg: 'SPF analysis completed',
        analyzer: this.getName(),
        duration: Date.now() - startTime,
        signalsFound: signals.length,
      });

      return signals;
    } catch (error) {
      logger.error({
        msg: 'SPF analysis failed',
        analyzer: this.getName(),
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
```

### Controller Error Handling

```typescript
// src/api/controllers/analysis.controller.ts
export async function analyzeUrl(
  request: FastifyRequest<{ Body: UrlAnalysisRequest }>,
  reply: FastifyReply
): Promise<void> {
  const requestLogger = logger.child({ requestId: request.id });

  try {
    requestLogger.info({
      msg: 'URL analysis requested',
      url: sanitizeUrl(request.body.url),
    });

    const result = await engine.analyze(request.body);

    requestLogger.info({
      msg: 'URL analysis completed',
      verdict: result.verdict,
      score: result.score,
      duration: result.metadata.duration,
    });

    reply.send(result);
  } catch (error) {
    requestLogger.error({
      msg: 'URL analysis failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      url: sanitizeUrl(request.body.url),
    });

    if (error instanceof ValidationError) {
      reply.code(400).send({ error: error.message });
    } else {
      reply.code(500).send({ error: 'Internal server error' });
    }
  }
}
```

---

## Common Patterns

### Conditional Detailed Logging

Use debug level for detailed logging in development:

```typescript
if (logger.isLevelEnabled('debug')) {
  logger.debug({
    msg: 'Detailed signal analysis',
    signals: signals.map(s => ({
      type: s.signalType,
      severity: s.severity,
      confidence: s.confidence,
      description: s.description,
    })),
  });
}
```

### Graceful Error Logging

Always log context with errors:

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error({
    msg: 'Operation failed',
    operation: 'riskyOperation',
    error: error instanceof Error ? error.message : 'Unknown error',
    // Include context that helps debugging
    context: {
      inputId: input.id,
      attemptNumber: retryCount,
      timestamp: new Date().toISOString(),
    },
  });
  // Re-throw if can't recover
  throw error;
}
```

### Startup/Shutdown Logging

Log important lifecycle events:

```typescript
// Startup
logger.info({
  msg: 'PhishLogic API server starting',
  version: process.env.npm_package_version,
  nodeVersion: process.version,
  env: config.env,
  port: config.port,
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info({ msg: 'SIGTERM received, starting graceful shutdown' });

  await server.close();
  logger.info({ msg: 'Graceful shutdown completed' });

  process.exit(0);
});
```

---

## Best Practices

1. **✅ Use structured logging**: Always use JSON format with fields, not string concatenation
2. **✅ Include request IDs**: Use child loggers to add request context automatically
3. **✅ Log errors with context**: Include operation name, input IDs, and relevant state
4. **✅ Sanitize before logging**: Always sanitize URLs, emails, and user data
5. **✅ Use appropriate log levels**: Don't use `info` for debug messages or `error` for warnings
6. **❌ Don't log in loops**: Avoid logging inside loops (use aggregated metrics instead)
7. **❌ Don't log performance-critical paths**: Avoid excessive logging in hot code paths
8. **❌ Don't rely on console.log**: Always use the logger instance (enforced by linting)

---

**See Also**:
- [Security Guidelines](SECURITY.md) - Security best practices
- [Monitoring Guide](MONITORING.md) - Production observability and metrics
- [Error Handling](ERROR_HANDLING.md) - Error handling patterns
- [Deployment Guide](DEPLOYMENT.md) - Production deployment checklist
