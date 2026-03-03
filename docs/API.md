# PhishLogic API Documentation

## Base URL

```
http://localhost:3000
```

## Endpoints

### Health Check

**GET** `/health`

Check if the API is running.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-27T08:00:00.000Z",
  "version": "1.0.0"
}
```

---

### Analyze URL

**POST** `/api/v1/analyze/url`

Analyze a URL for phishing indicators.

**Request Body:**
```json
{
  "url": "https://example.com/page",
  "context": {
    "referrer": "https://google.com",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Response:**
```json
{
  "verdict": "Safe|Suspicious|Malicious",
  "confidence": 0.15,
  "score": 1.5,
  "alertLevel": "none|low|medium|high",
  "redFlags": [
    {
      "category": "url",
      "message": "URL uses a link shortening service",
      "severity": "low"
    }
  ],
  "reasoning": "No significant security concerns were detected.",
  "signals": [...],
  "metadata": {
    "duration": 5450,
    "timestamp": "2026-02-27T08:00:00.000Z",
    "analyzersRun": ["UrlEntropyAnalyzer", "RedirectAnalyzer", "FormAnalyzer"],
    "analysisId": "550e8400-e29b-41d4-a716-446655440000",
    "executionSteps": [...]
  }
}
```

**Status Codes:**
- `200 OK` - Analysis completed successfully
- `400 Bad Request` - Invalid URL format
- `500 Internal Server Error` - Analysis failed

---

### Analyze Email

**POST** `/api/v1/analyze/email`

Analyze an email for phishing indicators.

**Request Body:**
```json
{
  "rawEmail": "From: sender@example.com\nTo: recipient@example.com\nSubject: Test\n\nEmail body..."
}
```

**Response:** Same structure as URL analysis

**Status Codes:**
- `200 OK` - Analysis completed successfully
- `400 Bad Request` - Invalid email format
- `500 Internal Server Error` - Analysis failed

---

### List Whitelist Entries

**GET** `/api/v1/whitelist`

Get all whitelist entries.

**Response:**
```json
{
  "entries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "email|domain|url",
      "value": "safe@example.com",
      "description": "Trusted sender",
      "addedAt": "2026-02-27T08:00:00.000Z",
      "expiresAt": null,
      "active": true
    }
  ],
  "count": 1
}
```

---

### Get Whitelist Entry

**GET** `/api/v1/whitelist/:id`

Get a specific whitelist entry.

**Response:** Single entry object

**Status Codes:**
- `200 OK` - Entry found
- `404 Not Found` - Entry does not exist

---

### Add Whitelist Entry

**POST** `/api/v1/whitelist`

Add a new whitelist entry.

**Request Body:**
```json
{
  "type": "email|domain|url",
  "value": "safe@example.com",
  "description": "Trusted sender",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

**Response:** Created entry object

**Status Codes:**
- `201 Created` - Entry added successfully
- `400 Bad Request` - Invalid input
- `500 Internal Server Error` - Failed to add entry

---

### Delete Whitelist Entry

**DELETE** `/api/v1/whitelist/:id`

Delete a whitelist entry.

**Status Codes:**
- `204 No Content` - Entry deleted successfully
- `404 Not Found` - Entry does not exist

---

### Get Whitelist Statistics

**GET** `/api/v1/whitelist/stats`

Get whitelist statistics.

**Response:**
```json
{
  "total": 10,
  "active": 9,
  "byType": {
    "email": 5,
    "domain": 3,
    "url": 2
  }
}
```

---

## Scoring System

### Score (0-10)
- **0-3**: Safe (Green) - No significant concerns
- **4-6**: Suspicious (Yellow) - Proceed with caution
- **7-10**: Malicious (Red) - High risk, triggers alert

### Alert Levels
- **none**: Score 0-1 - No concerns
- **low**: Score 2-3 - Minor concerns
- **medium**: Score 4-6 - Be cautious
- **high**: Score 7-10 - High priority, take action

---

## Red Flags

Red flags are plain English warnings categorized by:

### Categories
- **sender**: Issues with email sender authentication
- **url**: Suspicious URL patterns
- **content**: Phishing keywords or forms
- **authentication**: SPF/DKIM failures
- **suspicious_behavior**: Unusual patterns

### Example Red Flags
- "The email sender could not be verified - no SPF record found"
- "URL uses a link shortening service that hides the final destination"
- "Page contains a form requesting password and email"
- "Email uses urgent language to pressure quick action"

---

## Rate Limiting

- **Limit**: 100 requests per minute per IP
- **Window**: 60 seconds

**Response when rate limited:**
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded, retry in 60 seconds"
}
```

---

## Execution Tracking

Each analysis includes an `executionSteps` array tracking:

```json
{
  "step": "request_received",
  "startedAt": "2026-02-27T08:00:00.000Z",
  "completedAt": "2026-02-27T08:00:00.001Z",
  "duration": 1,
  "status": "completed",
  "context": {
    "inputType": "url",
    "inputId": "..."
  }
}
```

### Tracked Steps
1. `request_received` - Request received
2. `whitelist_check_started` - Whitelist check
3. `validation_started` - Input validation
4. `analysis_started` - Analyzer execution
5. `analyzer_*_started` - Individual analyzer runs
6. `verdict_calculation_started` - Verdict calculation
7. `email_alert_check` - Email alert (if needed)
8. `response_sent` - Response sent to client

---

## Email Alerts

When enabled, PhishLogic automatically sends email alerts for high-risk detections:

### Trigger Conditions
- Score ≥ 7.0 (configurable via `EMAIL_ALERT_THRESHOLD`)
- Verdict = "Malicious"

### Alert Modes
- **Immediate**: Send alert immediately upon detection
- **Batch**: Queue alerts and send periodic summary

Configure via environment variables (see Configuration documentation).

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "statusCode": 400,
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Common Errors
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## Examples

### cURL Examples

**Analyze URL:**
```bash
curl -X POST http://localhost:3000/api/v1/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

**Add Whitelist Entry:**
```bash
curl -X POST http://localhost:3000/api/v1/whitelist \
  -H "Content-Type: application/json" \
  -d '{
    "type": "domain",
    "value": "trusted.com",
    "description": "Company domain"
  }'
```

### JavaScript Example

```javascript
const response = await fetch('http://localhost:3000/api/v1/analyze/url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://example.com',
  }),
});

const result = await response.json();
console.log(`Verdict: ${result.verdict}, Score: ${result.score}/10`);
```

### Python Example

```python
import requests

response = requests.post(
    'http://localhost:3000/api/v1/analyze/url',
    json={'url': 'https://example.com'}
)

result = response.json()
print(f"Verdict: {result['verdict']}, Score: {result['score']}/10")
```
