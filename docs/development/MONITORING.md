# Production Monitoring & Observability

## Philosophy

Effective monitoring is essential for maintaining production reliability, diagnosing issues, and understanding system behavior. PhishLogic monitoring focuses on four key areas: request metrics, analysis performance, system health, and business outcomes.

**Key Principles**:
- **Proactive Monitoring**: Detect issues before users report them
- **Actionable Alerts**: Only alert on conditions requiring human intervention
- **Business Metrics**: Track what matters to users (detections, false positives)
- **Performance Tracking**: Monitor latency percentiles (p50, p95, p99)

---

## Metrics to Track

### 1. Request Metrics

Track HTTP request performance and reliability:

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Request Rate** | Requests per second | N/A (baseline) |
| **Response Time (p50)** | Median response time | > 1s |
| **Response Time (p95)** | 95th percentile latency | > 5s |
| **Response Time (p99)** | 99th percentile latency | > 30s |
| **Error Rate** | 4xx + 5xx responses | > 5% |
| **4xx Rate** | Client errors (validation, auth) | > 10% |
| **5xx Rate** | Server errors (crashes, bugs) | > 1% |

### 2. Analysis Metrics

Track phishing analysis performance:

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Analysis Duration** | Time to complete analysis | p99 > 30s |
| **Verdict Distribution** | Safe vs Suspicious vs Malicious | N/A (baseline) |
| **Analyzers Run** | Number of analyzers per analysis | < 4 (degraded) |
| **Analyzer Failure Rate** | % of analyzer failures | > 5% |
| **Dynamic Analysis Rate** | % using browser analysis | N/A (baseline) |
| **Whitelist Hit Rate** | % bypassing analysis | N/A (baseline) |

### 3. System Metrics

Track infrastructure health:

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **CPU Usage** | % CPU utilization | > 80% |
| **Memory Usage** | % RAM utilization | > 90% |
| **Heap Usage** | Node.js heap size | > 1.5 GB |
| **Browser Pool Size** | Active Playwright browsers | > 10 |
| **Queue Depth** | Pending analysis requests | > 100 |
| **Event Loop Lag** | Node.js event loop delay | > 100ms |

### 4. Business Metrics

Track security outcomes:

| Metric | Description | Purpose |
|--------|-------------|---------|
| **Malicious Detections/Hour** | Phishing detected | Security posture |
| **Email Alerts Sent** | Critical alerts to security team | Incident tracking |
| **False Positive Rate** | Incorrect Malicious verdicts | Model accuracy |
| **Whitelist Effectiveness** | % legitimate bypasses | Efficiency |
| **Analysis Success Rate** | % completed without errors | Reliability |

---

## Prometheus Metrics Implementation

### Setup

```bash
npm install prom-client
```

### Counter Metrics

Track cumulative counts:

```typescript
import promClient from 'prom-client';

// Total analyses performed
const analysisCounter = new promClient.Counter({
  name: 'phishlogic_analyses_total',
  help: 'Total number of analyses performed',
  labelNames: ['verdict', 'type'], // Safe/Suspicious/Malicious, url/email
});

// Increment on analysis completion
analysisCounter.inc({
  verdict: result.verdict,
  type: input.type,
});

// Analyzer failures
const analyzerFailureCounter = new promClient.Counter({
  name: 'phishlogic_analyzer_failures_total',
  help: 'Total analyzer failures',
  labelNames: ['analyzer'],
});

analyzerFailureCounter.inc({ analyzer: 'SpfAnalyzer' });
```

### Histogram Metrics

Track distributions (latency, duration):

```typescript
// Analysis duration distribution
const analysisDuration = new promClient.Histogram({
  name: 'phishlogic_analysis_duration_seconds',
  help: 'Analysis duration in seconds',
  labelNames: ['type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // Seconds
});

const startTime = Date.now();
// ... perform analysis ...
const duration = (Date.now() - startTime) / 1000;

analysisDuration.observe({ type: input.type }, duration);

// HTTP request duration
const httpDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});
```

### Gauge Metrics

Track current values (queue depth, active connections):

```typescript
// Current queue depth
const queueDepth = new promClient.Gauge({
  name: 'phishlogic_queue_depth',
  help: 'Current number of queued analyses',
});

// Update on queue changes
queueDepth.set(queue.length);

// Active browser instances
const activeBrowsers = new promClient.Gauge({
  name: 'phishlogic_active_browsers',
  help: 'Number of active Playwright browsers',
});

activeBrowsers.inc(); // Browser launched
activeBrowsers.dec(); // Browser closed
```

### Expose Metrics Endpoint

```typescript
// src/api/routes/index.ts
import promClient from 'prom-client';

// Enable default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ prefix: 'phishlogic_' });

// Metrics endpoint
server.get('/metrics', async (request, reply) => {
  reply.type('text/plain');
  reply.send(await promClient.register.metrics());
});
```

---

## Health Checks

### Liveness vs Readiness

- **Liveness**: Is the application running? (container restart if fails)
- **Readiness**: Is the application ready to serve traffic? (remove from load balancer if fails)

### Liveness Endpoint

```typescript
// src/api/routes/health.ts
export async function livenessCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Simple check: is process alive?
  reply.send({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

// Register route
server.get('/health/live', livenessCheck);
```

### Readiness Endpoint

```typescript
export async function readinessCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const checks = {
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {},
  };

  try {
    // Check critical dependencies
    checks.checks.browserPool = await checkBrowserPool();
    checks.checks.memoryUsage = checkMemoryUsage();

    // All checks passed
    reply.send(checks);
  } catch (error) {
    reply.code(503).send({
      status: 'not ready',
      error: error instanceof Error ? error.message : 'Unknown error',
      checks,
    });
  }
}

async function checkBrowserPool(): Promise<string> {
  // Verify at least one browser is available
  try {
    const browser = await playwright.chromium.launch({ timeout: 5000 });
    await browser.close();
    return 'ok';
  } catch {
    throw new Error('Browser pool unavailable');
  }
}

function checkMemoryUsage(): string {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;

  if (heapUsedMB > 1500) {
    // 1.5 GB threshold
    throw new Error('High memory usage');
  }

  return 'ok';
}
```

### Health Check Configuration

```yaml
# Kubernetes example
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
  timeoutSeconds: 3
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 2
```

---

## Alerting Rules

### Critical Alerts (Page on-call)

Conditions requiring immediate human intervention:

```yaml
# Prometheus alerting rules
groups:
  - name: phishlogic_critical
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}% over last 5 minutes"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 30
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High p99 latency"
          description: "p99 latency is {{ $value }}s"

      - alert: MemoryExhaustion
        expr: process_resident_memory_bytes / 1024 / 1024 / 1024 > 1.8
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Memory usage critical"
          description: "Memory usage is {{ $value }}GB"

      - alert: HealthCheckFailing
        expr: up{job="phishlogic"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Health check failing"
          description: "PhishLogic instance is down"
```

### Warning Alerts (Review during business hours)

Conditions requiring investigation but not immediate action:

```yaml
  - name: phishlogic_warnings
    interval: 1m
    rules:
      - alert: ElevatedErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[10m]) > 0.01
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Elevated error rate"

      - alert: SlowAnalysis
        expr: histogram_quantile(0.95, rate(phishlogic_analysis_duration_seconds_bucket[10m])) > 10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Slow analysis performance"

      - alert: HighQueueDepth
        expr: phishlogic_queue_depth > 50
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Analysis queue backing up"
```

### Alert Destinations

Configure alert routing:

```yaml
# Alertmanager configuration
route:
  group_by: ['alertname']
  receiver: 'security-team'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<key>'

  - name: 'slack'
    slack_configs:
      - api_url: '<webhook>'
        channel: '#phishlogic-alerts'

  - name: 'security-team'
    email_configs:
      - to: 'security@company.com'
```

---

## Dashboard Examples

### Grafana Dashboard

Key panels to include:

#### Request Performance
- Request rate (requests/sec)
- Response time (p50, p95, p99)
- Error rate (4xx, 5xx)
- HTTP status code distribution

#### Analysis Performance
- Analysis duration (p50, p95, p99)
- Verdict distribution (pie chart)
- Analyzers run per analysis (avg)
- Whitelist hit rate (%)

#### System Health
- CPU usage (%)
- Memory usage (MB)
- Heap usage (MB)
- Browser pool size
- Queue depth

#### Business Metrics
- Malicious detections/hour
- Email alerts sent/hour
- Analysis success rate (%)

### Sample Prometheus Queries

```promql
# Request rate
rate(http_requests_total[5m])

# p99 latency
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m])

# Verdict distribution
sum by(verdict) (rate(phishlogic_analyses_total[1h]))

# Average analyzers per analysis
rate(phishlogic_analyzers_run_total[5m]) / rate(phishlogic_analyses_total[5m])

# Memory usage
process_resident_memory_bytes / 1024 / 1024 / 1024

# Malicious detections per hour
rate(phishlogic_analyses_total{verdict="Malicious"}[1h]) * 3600
```

---

## Best Practices

1. **✅ Monitor user experience**: Focus on p95/p99 latency, not just averages
2. **✅ Alert on actionable conditions**: Only alert when human intervention is needed
3. **✅ Use appropriate thresholds**: Set thresholds based on SLOs, not arbitrary values
4. **✅ Include runbooks**: Document what to do when each alert fires
5. **✅ Test alerts regularly**: Trigger test alerts to verify routing works
6. **❌ Don't alert on every spike**: Allow temporary fluctuations (use `for: 2m`)
7. **❌ Don't ignore alert fatigue**: Tune alerts if team ignores them
8. **❌ Don't only monitor infrastructure**: Track business metrics too

---

**See Also**:
- [Logging Standards](LOGGING.md) - Structured logging configuration
- [Deployment Guide](DEPLOYMENT.md) - Production deployment checklist
- [Security Guidelines](SECURITY.md) - Security best practices
- [Architecture](ARCHITECTURE.md) - System architecture overview
