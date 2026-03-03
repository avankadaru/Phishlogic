# Deployment Guide

## Production Readiness Checklist

### Before Deploying

- [ ] All tests passing (`npm test`)
- [ ] No `console.log` statements (use logger)
- [ ] Environment variables documented
- [ ] Error handling comprehensive
- [ ] Logging appropriate for production
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Documentation up to date
- [ ] Health check endpoint working
- [ ] Graceful shutdown implemented

## Environment Configuration

### Required Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Analysis Thresholds
MALICIOUS_THRESHOLD=0.7
SUSPICIOUS_THRESHOLD=0.4

# Email Alerts (optional)
EMAIL_ENABLED=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@company.com
SMTP_PASSWORD=app-password-here
EMAIL_ALERT_RECIPIENTS=security@company.com
EMAIL_ALERT_THRESHOLD=7

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Security
CORS_ORIGIN=https://app.phishlogic.com
API_KEYS_ENABLED=false

# Playwright
PLAYWRIGHT_BROWSERS_PATH=/app/browsers
```

### Configuration Validation

Validate config on startup:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  env: z.enum(['development', 'production', 'test']),
  port: z.coerce.number().min(1).max(65535),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  // ... other config
});

export function getConfig() {
  try {
    return ConfigSchema.parse({
      env: process.env.NODE_ENV,
      port: process.env.PORT,
      logLevel: process.env.LOG_LEVEL,
      // ...
    });
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
}
```

## Deployment Strategies

### Docker Deployment

**Dockerfile**:
```dockerfile
FROM node:22-alpine

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Playwright to use system chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Build TypeScript
RUN npm run build

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  phishlogic:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
      - LOG_LEVEL=info
    env_file:
      - .env.production
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 3s
      retries: 3
    mem_limit: 1g
    cpus: 2
```

### Cloud Deployment

#### Vercel/Netlify

- Best for: Serverless API deployment
- Pros: Auto-scaling, zero config
- Cons: Limited long-running processes (Playwright might timeout)

#### Heroku

```bash
# Deploy to Heroku
heroku create phishlogic-api
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add https://github.com/jontewks/puppeteer-heroku-buildpack
git push heroku main
```

#### AWS EC2/ECS

- Best for: Full control, long-running processes
- Use: t3.medium or larger for Playwright
- Setup: Auto-scaling group + load balancer

#### Google Cloud Run

```yaml
# cloudrun.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: phishlogic
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: '10'
    spec:
      containers:
        - image: gcr.io/project/phishlogic:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
          resources:
            limits:
              memory: 1Gi
              cpu: 1000m
```

## Health Checks

### Health Check Endpoint

```typescript
// src/api/routes/health.ts
export async function healthCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  // Optional: Check dependencies
  try {
    // Check database connection
    // Check browser availability
    // Check external APIs

    reply.send(health);
  } catch (error) {
    reply.code(503).send({
      status: 'unhealthy',
      error: error.message,
    });
  }
}
```

### Liveness vs Readiness

```typescript
// Liveness: Is the app running?
app.get('/health/live', (req, res) => {
  res.send({ status: 'alive' });
});

// Readiness: Is the app ready to serve requests?
app.get('/health/ready', async (req, res) => {
  try {
    await checkDependencies();
    res.send({ status: 'ready' });
  } catch (error) {
    res.status(503).send({ status: 'not ready', error });
  }
});
```

## Graceful Shutdown

Handle SIGTERM/SIGINT for graceful shutdown:

```typescript
// src/index.ts
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ msg: 'Graceful shutdown initiated', signal });

  // Stop accepting new requests
  await server.close();

  // Wait for ongoing requests to complete (max 30s)
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Close browser instances
  await closeBrowserPool();

  // Close database connections
  // Close Redis connections

  logger.info('Graceful shutdown completed');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

## Monitoring

**For complete monitoring configuration, see [Monitoring Guide](MONITORING.md)**

Key deployment considerations:
- Expose `/metrics` endpoint for Prometheus scraping
- Configure health check endpoints (`/health/live`, `/health/ready`)
- Set up alerting rules for critical conditions (error rate, latency, memory)
- Create Grafana dashboards for request, analysis, system, and business metrics

## Logging

**For complete logging configuration, see [Logging Standards](LOGGING.md)**

Key deployment considerations:
- Set `LOG_LEVEL=info` in production
- Configure log aggregation (Datadog, Loggly, CloudWatch)
- Enable Pino redaction for sensitive fields
- Use structured JSON logging for machine parsing

## Performance Optimization

### Caching Strategy

```typescript
import NodeCache from 'node-cache';

const domainCache = new NodeCache({
  stdTTL: 3600, // 1 hour
  checkperiod: 600, // Check every 10 minutes
  maxKeys: 10000,
});

// Cache DNS lookups
async function getSpfRecord(domain: string): Promise<string[]> {
  const cached = domainCache.get<string[]>(domain);
  if (cached) return cached;

  const records = await dns.resolveTxt(domain);
  domainCache.set(domain, records);
  return records;
}
```

### Browser Pool Management

```typescript
class BrowserPool {
  private pool: Browser[] = [];
  private maxSize = 5;

  async get(): Promise<Browser> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return await playwright.chromium.launch();
  }

  async release(browser: Browser): Promise<void> {
    if (this.pool.length < this.maxSize) {
      this.pool.push(browser);
    } else {
      await browser.close();
    }
  }
}
```

## Security Hardening

### HTTPS Only

```typescript
if (process.env.NODE_ENV === 'production') {
  server.addHook('onRequest', async (request, reply) => {
    if (!request.headers['x-forwarded-proto']?.includes('https')) {
      reply.redirect(301, `https://${request.hostname}${request.url}`);
    }
  });
}
```

### Security Headers

```typescript
server.register(helmet, {
  contentSecurityPolicy: false, // Configure as needed
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
```

## Backup & Recovery

### Database Backups

```bash
# Automated daily backups
0 2 * * * pg_dump phishlogic_db > backup_$(date +\%Y\%m\%d).sql
```

### Configuration Backups

- Store `.env` templates in version control
- Use secrets management (AWS Secrets Manager, Vault)
- Document all environment variables

## Rollback Strategy

1. **Blue-Green Deployment**: Run new version alongside old
2. **Canary Deployment**: Gradually route traffic to new version
3. **Feature Flags**: Disable problematic features without redeployment

```typescript
if (config.features.newAnalyzer && isCanaryUser(userId)) {
  // Use new analyzer
} else {
  // Use stable analyzer
}
```

---

**See Also**:
- [Logging Standards](LOGGING.md)
- [Monitoring Guide](MONITORING.md)
- [Security Guidelines](SECURITY.md)
- [Architecture](ARCHITECTURE.md)
- [Performance Considerations](ARCHITECTURE.md#performance)
