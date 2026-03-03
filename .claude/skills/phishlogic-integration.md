---
name: phishlogic-integration
description: Add new integration (browser extension, email platform, etc.) to PhishLogic
version: 1.0.0
---

# PhishLogic Integration Pattern

## When to Use

Adding a new platform integration to PhishLogic:
- Email platforms (Gmail, Outlook, ProtonMail)
- Browser extensions (Chrome, Firefox, Edge)
- Social media platforms (LinkedIn, WhatsApp, Instagram, X/Twitter)
- Mobile apps (iOS, Android)
- Messaging platforms (Slack, Teams, Discord)

## Integration Types

### Type A: Direct API Integration

**Characteristics**:
- Calls existing `/api/v1/analyze/url` or `/api/v1/analyze/email` endpoint
- No backend changes required
- Client-side implementation only

**Examples**:
- Browser Extension (context menu → API call)
- Gmail Add-on (Apps Script → API call)
- Mobile app (native code → API call)

**Implementation Steps**:
1. ✅ Create client-side code (extension, Apps Script, mobile app)
2. ✅ Call existing PhishLogic API endpoint
3. ✅ Display result in platform UI
4. ✅ Write user documentation

**No backend files to create** ✅

---

### Type B: Adapter Pattern Integration

**Characteristics**:
- Requires authentication (OAuth, API keys)
- Fetches data from external API
- Transforms to PhishLogic format

**Examples**:
- Outlook Integration (Microsoft Graph API)
- LinkedIn Integration (LinkedIn API)
- Social media platforms

**Implementation Steps**:

#### 1. Configuration
**File**: `src/config/app.config.ts`

Add platform configuration:
```typescript
const [Platform]ConfigSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
});

// Add to main config
[platform]: [Platform]ConfigSchema.parse({
  enabled: process.env.[PLATFORM]_ENABLED,
  clientId: process.env.[PLATFORM]_CLIENT_ID,
  clientSecret: process.env.[PLATFORM]_CLIENT_SECRET,
  redirectUri: process.env.[PLATFORM]_REDIRECT_URI,
}),
```

**File**: `.env.example`
```bash
# [Platform] Integration
[PLATFORM]_ENABLED=false
[PLATFORM]_CLIENT_ID=your-client-id
[PLATFORM]_CLIENT_SECRET=your-client-secret
[PLATFORM]_REDIRECT_URI=http://localhost:3000/auth/[platform]/callback
```

#### 2. Adapter
**File**: `src/adapters/input/[platform].adapter.ts`

```typescript
interface [Platform]Request {
  accessToken: string;
  messageId?: string;
  // Platform-specific fields
}

export class [Platform]Adapter implements InputAdapter<[Platform]Request> {
  async validate(input: [Platform]Request): Promise<ValidationResult> {
    // Validate OAuth token, messageId, etc.
  }

  async adapt(input: [Platform]Request): Promise<NormalizedInput> {
    // Fetch data from platform API
    // Transform to PhishLogic format
  }

  getType(): InputType {
    return 'email'; // or 'url'
  }

  private async fetchData(accessToken: string, id: string): Promise<any> {
    // Call platform API
  }

  private transformToPlatformFormat(data: any): EmailInput | UrlInput {
    // Transform platform data to PhishLogic format
  }
}
```

#### 3. Controller
**File**: `src/api/controllers/[platform].controller.ts`

```typescript
export async function analyze[Platform]Message(
  request: FastifyRequest<{ Body: [Platform]Request }>,
  reply: FastifyReply
): Promise<void> {
  const adapter = new [Platform]Adapter();
  const validation = await adapter.validate(request.body);

  if (!validation.isValid) {
    reply.code(400).send({ error: validation.error });
    return;
  }

  const input = await adapter.adapt(request.body);
  const engine = getAnalysisEngine();
  const result = await engine.analyze(input);

  reply.send(result);
}

export async function [platform]OAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // OAuth authorization flow
}

export async function [platform]Callback(
  request: FastifyRequest<{ Querystring: { code: string } }>,
  reply: FastifyReply
): Promise<void> {
  // Exchange code for tokens
  // Store tokens
}
```

#### 4. Routes
**File**: `src/api/routes/index.ts`

```typescript
import {
  analyze[Platform]Message,
  [platform]OAuth,
  [platform]Callback,
} from '../controllers/[platform].controller.js';

// Analysis endpoint
server.post('/api/v1/analyze/[platform]', analyze[Platform]Message);

// OAuth endpoints
server.get('/auth/[platform]/authorize', [platform]OAuth);
server.get('/auth/[platform]/callback', [platform]Callback);
```

#### 5. Tests
**File**: `tests/integration/api/[platform].test.ts`

```typescript
describe('[Platform] Integration', () => {
  it('should successfully complete OAuth flow', async () => {
    // Test OAuth
  });

  it('should analyze [platform] message', async () => {
    // Test analysis
  });

  it('should handle invalid token', async () => {
    // Test error handling
  });
});
```

#### 6. Documentation
**File**: `docs/[PLATFORM]_SETUP.md`

```markdown
# [Platform] Integration Setup

## Prerequisites
- [Platform] account
- OAuth credentials

## Setup Steps
1. Create [Platform] OAuth app
2. Configure redirect URI
3. Add credentials to .env
4. Start PhishLogic server
5. Authorize via /auth/[platform]/authorize

## Usage
POST /api/v1/analyze/[platform]
{
  "accessToken": "...",
  "messageId": "..."
}
```

## Implementation Checklist

### For Direct API Integrations (Type A)
- [ ] Create client-side code (extension, script, app)
- [ ] Implement API call to PhishLogic
- [ ] Parse and display result in UI
- [ ] Handle errors gracefully
- [ ] Write user documentation
- [ ] Test with real data

### For Adapter Pattern Integrations (Type B)
- [ ] Add configuration to `src/config/app.config.ts`
- [ ] Add environment variables to `.env.example`
- [ ] Create adapter in `src/adapters/input/[platform].adapter.ts`
- [ ] Implement `InputAdapter<T>` interface
- [ ] Create controller in `src/api/controllers/[platform].controller.ts`
- [ ] Add routes in `src/api/routes/index.ts`
- [ ] Implement OAuth flow (if needed)
- [ ] Write integration tests
- [ ] Write setup documentation
- [ ] Update README.md with integration section

## Verification

- [ ] Integration calls PhishLogic API successfully
- [ ] Results displayed in platform UI
- [ ] Error handling works (401, 403, 404, 429)
- [ ] OAuth flow completes (if applicable)
- [ ] Token refresh works (if applicable)
- [ ] Rate limiting respected
- [ ] Documentation complete
- [ ] Tests passing (if applicable)

## Examples

### Direct API Integrations (Type A)
✅ **Browser Extension**:
- **Files**: `browser-extension/manifest.json`, `background.js`, `popup/`
- **API Call**: `fetch('/api/v1/analyze/url', { method: 'POST', body: JSON.stringify({ url }) })`
- **Display**: Chrome notification

✅ **Gmail Add-on**:
- **Files**: `gmail-addon/Code.gs`, `appsscript.json`
- **API Call**: `UrlFetchApp.fetch(PHISHLOGIC_API, { method: 'post', payload: JSON.stringify({ rawEmail }) })`
- **Display**: Gmail sidebar card

### Adapter Pattern Integrations (Type B)
✅ **Outlook Integration**:
- **Files**: Adapter, Controller, Routes, Tests, Docs
- **OAuth**: Microsoft Graph API
- **Endpoint**: `POST /api/v1/analyze/outlook`

✅ **LinkedIn Integration**:
- **Files**: Adapter, Controller, Routes, Tests, Docs
- **OAuth**: LinkedIn API
- **Endpoint**: `POST /api/v1/analyze/linkedin`

## Dependencies

### Direct API Integrations
- **None** - uses existing PhishLogic API

### Adapter Pattern Integrations
```json
{
  "dependencies": {
    "@microsoft/microsoft-graph-client": "^3.0.7", // For Outlook
    "twitter-api-v2": "^1.15.0", // For X/Twitter
    // Platform-specific SDK
  }
}
```

## Common Pitfalls

1. ❌ **Forgetting CORS configuration**: Add platform origin to CORS allowlist
2. ❌ **Not handling token expiration**: Implement token refresh logic
3. ❌ **Missing error handling**: Handle 401, 403, 429 responses
4. ❌ **Logging sensitive data**: Don't log OAuth tokens or user data
5. ❌ **Skipping rate limiting**: Respect platform API rate limits
6. ❌ **Incomplete documentation**: Document OAuth setup steps

---

**See Also**:
- [Architecture Principles](../../docs/development/ARCHITECTURE.md)
- [Browser Extension + Gmail Integration Plan](../../docs/plans/BROWSER_GMAIL_INTEGRATION_PLAN.md)
