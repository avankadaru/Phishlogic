# Security Guidelines

## Security Principles

1. **Defense in Depth**: Multiple layers of security
2. **Least Privilege**: Minimal permissions required
3. **Input Validation**: Never trust external data
4. **Secure by Default**: Security enabled out of the box

## Sandboxing

### Browser Isolation

Playwright runs in isolated context:

```typescript
async function analyzeDynamic(url: string): Promise<AnalysisSignal[]> {
  const browser = await playwright.chromium.launch({
    headless: true,
    // Security options
    args: [
      '--no-sandbox', // Required for Docker
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    // Isolated context
    ignoreHTTPSErrors: false, // Enforce HTTPS validation
    javaScriptEnabled: true, // Need JS for form detection
    acceptDownloads: false, // Don't download files
  });

  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Analyze without executing malicious content
    const signals = await detectForms(page);

    return signals;
  } finally {
    await context.close();
    await browser.close();
  }
}
```

### No JavaScript Execution from Content

Never eval or execute analyzed content:

❌ **Dangerous**:
```typescript
// NEVER DO THIS!
eval(emailContent);
new Function(pageContent)();
vm.runInNewContext(suspiciousCode);
```

✅ **Safe**:
```typescript
// Parse and analyze, don't execute
const parsedEmail = mailparser(emailContent);
const forms = await page.$$('form'); // Query DOM, don't execute
```

### Network Isolation

Dynamic analysis should be network-isolated:

```typescript
const context = await browser.newContext({
  // Block external resources
  blockMedia: true,
  blockFonts: true,
  // Limit network access
  serviceWorkers: 'block',
  offline: false, // Set to true for full isolation
});
```

### Resource Limits

CPU, memory, and time limits on all operations:

```typescript
const config = {
  analysis: {
    maxDuration: 30000, // 30 seconds max
    maxMemory: 512, // 512 MB max
    maxConcurrent: 5, // 5 concurrent analyses
  },
  browser: {
    timeout: 10000, // 10 second page load
    maxPages: 3, // Max 3 pages per analysis
  },
};
```

## Input Validation

### Strict Schema Validation

Use Zod for all input validation:

```typescript
import { z } from 'zod';

const UrlAnalysisSchema = z.object({
  url: z.string().url().min(1).max(2048),
  context: z
    .object({
      referrer: z.string().url().optional(),
      userAgent: z.string().max(500).optional(),
    })
    .optional(),
});

// Validate before processing
const validated = UrlAnalysisSchema.parse(request.body);
```

### URL Parsing with Validation

Validate URLs before processing:

```typescript
function validateUrl(url: string): URL {
  try {
    const parsed = new URL(url);

    // Block dangerous protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ValidationError('Invalid protocol', url);
    }

    // Block local/private IPs
    if (isPrivateIP(parsed.hostname)) {
      throw new ValidationError('Private IP not allowed', url);
    }

    return parsed;
  } catch (error) {
    throw new ValidationError('Invalid URL format', url, error);
  }
}
```

### Email Size Limits

Limit email size to prevent DoS:

```typescript
const EmailSchema = z.object({
  rawEmail: z
    .string()
    .min(1)
    .max(10 * 1024 * 1024), // 10 MB max
});

// In controller
if (request.body.rawEmail.length > MAX_EMAIL_SIZE) {
  reply.code(413).send({ error: 'Email too large' });
  return;
}
```

### Sanitize Input

Sanitize inputs before logging or display:

```typescript
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove query parameters (may contain tokens)
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

logger.info({ msg: 'Analyzing URL', url: sanitizeUrl(input.url) });
```

## Rate Limiting

### Per-IP Rate Limits

Prevent abuse from single source:

```typescript
// src/api/server.ts
import rateLimit from '@fastify/rate-limit';

server.register(rateLimit, {
  max: 100, // 100 requests
  timeWindow: '1 minute', // per minute
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded, retry in ${context.after}`,
  }),
});
```

### API Key Requirements

Consider API keys for production:

```typescript
// Future: API key authentication
server.addHook('preHandler', async (request, reply) => {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || !validateApiKey(apiKey)) {
    reply.code(401).send({ error: 'Invalid API key' });
  }
});
```

### Queue-Based Processing

Handle bursts gracefully:

```typescript
import Bull from 'bull';

const analysisQueue = new Bull('analysis', {
  redis: { host: 'localhost', port: 6379 },
  limiter: {
    max: 10, // Max 10 jobs
    duration: 1000, // per second
  },
});

analysisQueue.process(async (job) => {
  return await engine.analyze(job.data);
});
```

## Data Privacy

### No Storage of Analyzed Content

Don't persist emails or URLs:

```typescript
// DON'T store analyzed content
// ❌ await db.save({ email: input.rawEmail });

// DO store only metadata
✅ await db.save({
  analysisId: result.id,
  verdict: result.verdict,
  score: result.score,
  timestamp: new Date(),
  // NO email content, NO URLs with tokens
});
```

### Anonymized Logging

Don't log full emails or sensitive URLs:

❌ **Bad**:
```typescript
logger.info({
  msg: 'Email analyzed',
  email: input.rawEmail, // Contains PII!
  url: 'https://api.example.com/reset?token=secret123', // Contains token!
});
```

✅ **Good**:
```typescript
logger.info({
  msg: 'Email analyzed',
  from: sanitizeEmail(input.from), // sender@[domain]
  subject: '[redacted]',
  url: sanitizeUrl(input.url), // https://api.example.com/reset
});
```

### Optional Detailed Logging

Detailed logs only in development:

```typescript
if (config.env === 'development') {
  logger.debug({
    msg: 'Full analysis details',
    input: input, // OK in development
  });
} else {
  logger.info({
    msg: 'Analysis completed',
    analysisId: result.id,
    verdict: result.verdict,
  });
}
```

## Secure Headers

### Use Helmet Middleware

```typescript
import helmet from '@fastify/helmet';

server.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
```

### CORS Restrictions

Limit CORS to known origins:

```typescript
import cors from '@fastify/cors';

server.register(cors, {
  origin: (origin, cb) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://app.phishlogic.com',
      'chrome-extension://your-extension-id',
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
});
```

## Logging Best Practices

**For complete logging standards, see [Logging Standards](LOGGING.md)**

Key security considerations for logging:
- ❌ **Never log sensitive data**: Full email content, URLs with tokens, passwords, API keys, PII
- ✅ **Always sanitize**: Use sanitizeUrl() and sanitizeEmail() before logging
- ✅ **Use Pino redaction**: Configure redaction paths for automatic sensitive data removal
- ✅ **Log errors with context**: Include operation name and relevant IDs, but exclude sensitive values

## Common Security Pitfalls

1. ❌ **Don't log sensitive data**: Never log passwords, tokens, PII
2. ❌ **Don't trust external data**: Always validate inputs
3. ❌ **Don't execute untrusted code**: Never eval or run analyzed content
4. ❌ **Don't expose internal errors**: Return generic errors to clients
5. ❌ **Don't skip authentication**: Even for "internal" endpoints
6. ❌ **Don't use weak randomness**: Use crypto.randomBytes, not Math.random
7. ❌ **Don't hardcode secrets**: Use environment variables
8. ❌ **Don't ignore security updates**: Audit and update dependencies regularly

---

**See Also**:
- [Logging Standards](LOGGING.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Error Handling](ERROR_HANDLING.md)
- [Testing Guide](TESTING_GUIDE.md)
